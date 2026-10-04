import { UNKNOWN_TOTAL, type Doc, type DocumentQuery, type FindOptions } from "@hcengineering/core"
import { it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { expect } from "vitest"
import { parseMoveIssueParams } from "../../../src/domain/schemas/issue-movement.js"
import { IssueId } from "../../../src/domain/schemas/shared.js"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import { moveIssue } from "../../../src/huly/operations/issue-movement.js"
import { sdkFixture, findResultForTestClass } from "../../helpers/huly-sdk.js"
import { transferTreeFixture } from "../../helpers/transfer-tree.js"
import { assertExists } from "../../../src/utils/assertions.js"

const DescendantQuery = Schema.Struct({ attachedTo: Schema.Struct({ $in: Schema.Array(IssueId) }) })
const parseQuery = (input: unknown) => Schema.decodeUnknownOption(DescendantQuery)(input)

it.effect("a legacy leaf adapter cannot reserve a number without the guarded tree port", () =>
  Effect.gen(function* () {
    const f = transferTreeFixture()
    const { commitTransferTree: _treePort, ...operations } = f.operations
    const result = yield* parseMoveIssueParams(f.input).pipe(
      Effect.flatMap(moveIssue),
      Effect.provide(HulyClient.testLayer(operations))
    )
    expect(result).toMatchObject({ outcome: "blocked", changed: false })
    expect(f.state.allocated).toBe(0)
    expect(f.state.sent).toBe(0)
  })
)

it.effect("invalid attached rows retain usable sibling workflow, attribute and stale consent conflicts", () =>
  Effect.gen(function* () {
    const f = transferTreeFixture()
    f.child.status = sdkFixture("unsupported-status")
    f.child.component = sdkFixture("missing-component")
    f.grandchild.milestone = sdkFixture("missing-milestone")
    const original = assertExists(f.operations.findAll)
    const findAll: HulyClientOperations["findAll"] = <T extends Doc>(
      cls: unknown,
      query: DocumentQuery<T>,
      options?: FindOptions<T>
    ) => {
      const parsed = parseQuery(query)
      if (parsed._tag !== "Some" || !parsed.value.attachedTo.$in.includes(IssueId.make(f.root._id)))
        return original<T>(sdkFixture(cls), query, options)
      return original<T>(sdkFixture(cls), query, options).pipe(
        Effect.map((rows) => findResultForTestClass<T>([...rows, sdkFixture({ _id: "invalid-child" })]))
      )
    }
    const result = yield* parseMoveIssueParams({
      ...f.input,
      resolutions: [{ issueId: f.child._id, field: "component", from: "obsolete-component", to: null }]
    }).pipe(Effect.flatMap(moveIssue), Effect.provide(HulyClient.testLayer({ ...f.operations, findAll })))
    expect(result).toMatchObject({ outcome: "blocked", changed: false, discovery: "incomplete" })
    if (result.outcome !== "blocked") return
    expect(result.issueIds).toEqual([f.root._id, f.child._id, f.grandchild._id])
    expect(result.conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "workflow", issueId: f.child._id }),
        expect.objectContaining({ code: "attribute", issueId: f.grandchild._id }),
        expect.objectContaining({ code: "stale-resolution", issueId: f.child._id })
      ])
    )
    expect(f.state.allocated).toBe(0)
    expect(f.state.sent).toBe(0)
  })
)

it.effect("post-write unknown closure size remains indeterminate rather than confirmed inconsistent", () =>
  Effect.gen(function* () {
    const f = transferTreeFixture()
    const original = assertExists(f.operations.findAll)
    const findAll: HulyClientOperations["findAll"] = <T extends Doc>(
      cls: unknown,
      query: DocumentQuery<T>,
      options?: FindOptions<T>
    ) =>
      original<T>(sdkFixture(cls), query, options).pipe(
        Effect.map((rows) => {
          if (f.state.sent > 0 && parseQuery(query)._tag === "Some") rows.total = rows.length + 1
          return rows
        })
      )
    const result = yield* parseMoveIssueParams(f.input).pipe(
      Effect.flatMap(moveIssue),
      Effect.provide(HulyClient.testLayer({ ...f.operations, findAll }))
    )
    expect(result).toMatchObject({ outcome: "indeterminate", issueIds: [f.root._id, f.child._id, f.grandchild._id] })
    expect(f.state.allocated).toBe(3)
    expect(f.state.sent).toBe(1)
  })
)

it.effect("unknown descendant totals preserve independently discovered attribute conflicts", () =>
  Effect.gen(function* () {
    const f = transferTreeFixture()
    f.child.component = sdkFixture("missing-component")
    const original = assertExists(f.operations.findAll)
    const findAll: HulyClientOperations["findAll"] = <T extends Doc>(
      cls: unknown,
      query: DocumentQuery<T>,
      options?: FindOptions<T>
    ) =>
      original<T>(sdkFixture(cls), query, options).pipe(
        Effect.map((rows) => {
          if (parseQuery(query)._tag === "Some") rows.total = UNKNOWN_TOTAL
          return rows
        })
      )
    const result = yield* parseMoveIssueParams(f.input).pipe(
      Effect.flatMap(moveIssue),
      Effect.provide(HulyClient.testLayer({ ...f.operations, findAll }))
    )
    expect(result).toMatchObject({ outcome: "blocked", changed: false, discovery: "incomplete" })
    if (result.outcome !== "blocked") return
    expect(result.issueIds).toEqual([f.root._id, f.child._id, f.grandchild._id])
    expect(result.conflicts).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "attribute", issueId: f.child._id })])
    )
    expect(f.state.allocated).toBe(0)
    expect(f.state.sent).toBe(0)
  })
)
