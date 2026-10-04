import type { Doc, DocumentQuery, FindOptions, FindResult } from "@hcengineering/core"
import { it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { expect } from "vitest"
import { IssueId } from "../../../src/domain/schemas/shared.js"
import { MovementIssueSchema } from "../../../src/domain/schemas/issue-movement-state.js"
import { parseMoveIssueParams } from "../../../src/domain/schemas/issue-movement.js"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import { moveIssue } from "../../../src/huly/operations/issue-movement.js"
import { inspectTransferTree } from "../../../src/huly/operations/issue-transfer-tree-inspection.js"
import { MAX_TRANSFER_TASKS } from "../../../src/huly/operations/issue-transfer-tree.js"
import { transferTreeFixture } from "../../helpers/transfer-tree.js"
import { movementIssue } from "../../helpers/movement.js"
import { sdkFixture } from "../../helpers/huly-sdk.js"
import { assertExists } from "../../../src/utils/assertions.js"

const parseIssue = (input: unknown) => Schema.decodeUnknownSync(MovementIssueSchema)(input)
const DescendantQuery = Schema.Struct({ attachedTo: Schema.Struct({ $in: Schema.Array(IssueId) }) })
const parseQuery = (input: unknown) => Schema.decodeUnknownOption(DescendantQuery)(input)

it.effect("oversized actual child attachments return incomplete bounded evidence and allocate nothing", () =>
  Effect.gen(function* () {
    const f = transferTreeFixture()
    for (let index = 0; index < MAX_TRANSFER_TASKS; index++)
      f.issues.push(movementIssue(`bounded-child-${index}`, { attachedTo: f.root._id }))
    const client = yield* HulyClient.pipe(Effect.provide(f.layer))
    const discovered = yield* inspectTransferTree(client, parseIssue(f.root))
    expect(discovered.complete).toBe(false)
    expect(discovered.issues).toHaveLength(MAX_TRANSFER_TASKS)
    if (!discovered.complete) expect(discovered.reasons.join(" ")).toContain("no prefix can move")
    expect(f.state.allocated).toBe(0)
    expect(f.state.sent).toBe(0)
  })
)

it.effect("a malformed attachment response envelope is a typed pre-write refusal", () =>
  Effect.gen(function* () {
    const f = transferTreeFixture()
    const original = assertExists(f.operations.findAll)
    const findAll: HulyClientOperations["findAll"] = <T extends Doc>(
      cls: unknown,
      query: DocumentQuery<T>,
      options?: FindOptions<T>
    ) =>
      parseQuery(query)._tag === "Some"
        ? Effect.succeed(sdkFixture<FindResult<T>>({ total: 1 }))
        : original<T>(sdkFixture(cls), query, options)
    const result = yield* parseMoveIssueParams(f.input).pipe(
      Effect.flatMap(moveIssue),
      Effect.provide(HulyClient.testLayer({ ...f.operations, findAll }))
    )
    expect(result).toMatchObject({ outcome: "blocked", changed: false, discovery: "incomplete" })
    expect(f.state.allocated).toBe(0)
    expect(f.state.sent).toBe(0)
  })
)
