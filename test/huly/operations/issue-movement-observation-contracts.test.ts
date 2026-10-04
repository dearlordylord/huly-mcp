import { it } from "@effect/vitest"
import { Effect, Fiber, Schema } from "effect"
import { TestClock } from "effect/testing"
import { expect } from "vitest"
import { MovementIssueSchema, MovementProjectSchema } from "../../../src/domain/schemas/issue-movement-state.js"
import type { TransferTreeWrite } from "../../../src/domain/schemas/issue-transfer-tree.js"
import { inspectTransferPlan } from "../../../src/huly/operations/issue-transfer-preflight.js"
import { verifyTransferTree } from "../../../src/huly/operations/issue-transfer-tree-verification.js"
import { parseMoveIssueParams } from "../../../src/domain/schemas/issue-movement.js"
import { MoveIssueResultSchema } from "../../../src/domain/schemas/issues-results.js"
import { TransferInspectionSchema } from "../../../src/domain/schemas/issue-transfer.js"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import { MovementTransportError } from "../../../src/huly/movement-transaction-transport.js"
import { IssueId, NonEmptyString } from "../../../src/domain/schemas/shared.js"
import { HulyAuthError } from "../../../src/huly/errors-base.js"
import { moveIssue } from "../../../src/huly/operations/issue-movement.js"
import { assertExists } from "../../../src/utils/assertions.js"
import { transferTreeFixture } from "../../helpers/transfer-tree.js"

const parseIssue = (input: unknown) => Schema.decodeUnknownSync(MovementIssueSchema)(input)
const parseProject = (input: unknown) => Schema.decodeUnknownSync(MovementProjectSchema)(input)
const parseInspection = (input: unknown) => Schema.decodeUnknownSync(TransferInspectionSchema)(input)
const parseResult = (input: unknown) => Schema.decodeUnknownSync(MoveIssueResultSchema)(input)
const run = Effect.fn("test.observationContracts")(function* (
  f: ReturnType<typeof transferTreeFixture>,
  operations: Partial<HulyClientOperations>,
  input: unknown = f.input
) {
  const params = yield* parseMoveIssueParams(input)
  const fiber = yield* moveIssue(params).pipe(Effect.provide(HulyClient.testLayer(operations)), Effect.forkChild)
  yield* TestClock.adjust("2 seconds")
  return parseResult(yield* Fiber.join(fiber))
})

it.effect("missing batch capability refuses before reserving any destination numbers", () =>
  Effect.gen(function* () {
    const f = transferTreeFixture()
    const { commitTransferTree: _commit, ...operations } = f.operations
    expect(yield* run(f, operations)).toMatchObject({ outcome: "blocked", changed: false })
    expect(f.state.allocated).toBe(0)
    expect(f.state.sent).toBe(0)
  })
)

it.effect("an unavailable descendant query after acknowledgement retains observed task and record routes", () =>
  Effect.gen(function* () {
    const f = transferTreeFixture()
    const findAll = assertExists(f.operations.findAll)
    const result = yield* run(f, {
      ...f.operations,
      findAll: (cls, query, options) =>
        f.state.sent > 0 && query.attachedTo !== undefined
          ? Effect.fail(new HulyAuthError({ message: "Descendant query unavailable" }))
          : findAll(cls, query, options)
    })
    expect(result).toMatchObject({
      outcome: "indeterminate",
      verification: { completeness: "incomplete", consistency: "undetermined" }
    })
    expect(result).toHaveProperty(
      "verification.tasks",
      expect.arrayContaining([expect.objectContaining({ issueId: f.root._id, projectId: f.destination._id })])
    )
    expect(f.state.sent).toBe(1)
    expect(f.state.allocated).toBe(3)
  })
)

it.effect("a removed old ancestor is a confirmed hierarchy contradiction after an acknowledged move", () =>
  Effect.gen(function* () {
    const f = transferTreeFixture()
    const commit = assertExists(f.operations.commitTransferTree)
    const result = yield* run(f, {
      ...f.operations,
      commitTransferTree: (write) =>
        commit(write).pipe(
          Effect.tap(() =>
            Effect.sync(() => {
              const index = f.issues.findIndex((issue) => issue._id === f.old._id)
              f.issues.splice(index, 1)
            })
          )
        )
    })
    expect(result).toMatchObject({ outcome: "incomplete", verification: { consistency: "inconsistent" } })
    expect(result).toHaveProperty("verification.reason", expect.stringContaining("ancestor"))
    expect(f.state.sent).toBe(1)
  })
)

for (const route of ["available", "unavailable"]) {
  it.effect(`unsupported post-write record payload with ${route} route cannot establish preservation`, () =>
    Effect.gen(function* () {
      const f = transferTreeFixture()
      const inspect = assertExists(f.operations.inspectTransferRecords)
      const result = yield* run(f, {
        ...f.operations,
        inspectTransferRecords: (id, tree) =>
          inspect(id, tree).pipe(
            Effect.map((inspection) =>
              f.state.sent === 0
                ? inspection
                : parseInspection({
                    ...inspection,
                    records: inspection.records.map((record) => ({
                      kind: "unsupported",
                      _id: record._id,
                      _class: "chunter:class:ChatMessage",
                      attachedTo: record.attachedTo,
                      space: record.space,
                      modifiedOn: record.modifiedOn,
                      modifiedBy: record.modifiedBy,
                      ...(route === "available"
                        ? { attachedToClass: record.attachedToClass, collection: record.collection }
                        : {})
                    }))
                  })
            )
          )
      })
      expect(result).toHaveProperty("verification.completeness", "incomplete")
      expect(result).toHaveProperty("verification.reason", expect.stringContaining("Protected payload"))
      expect(f.state.sent).toBe(1)
      expect(f.state.allocated).toBe(3)
    })
  )
}

it.effect("a same-project batch rejected before send remains unchanged without reservation gaps", () =>
  Effect.gen(function* () {
    const f = transferTreeFixture()
    const result = yield* run(
      f,
      {
        ...f.operations,
        commitTransferTree: () =>
          Effect.fail(
            new MovementTransportError({
              phase: "before-send",
              reason: NonEmptyString.make("Request could not be prepared")
            })
          )
      },
      { issue: f.root._id, destination: { parent: null } }
    )
    expect(result).toMatchObject({ outcome: "blocked", changed: false })
    expect(f.root.attachedTo).toBe(f.old._id)
    expect(f.state.allocated).toBe(0)
    expect(f.state.sent).toBe(0)
  })
)

it.effect("duplicate record ownership across task closures refuses before allocation", () =>
  Effect.gen(function* () {
    const f = transferTreeFixture()
    const inspect = assertExists(f.operations.inspectTransferRecords)
    const record = assertExists(f.records[0])
    const result = yield* run(f, {
      ...f.operations,
      inspectTransferRecords: (id, tree) =>
        inspect(id, tree).pipe(
          Effect.map((inspection) =>
            id === IssueId.make(f.child._id)
              ? parseInspection({ ...inspection, records: [{ ...record, attachedTo: f.child._id }] })
              : inspection
          )
        )
    })
    expect(result).toMatchObject({ outcome: "blocked", changed: false })
    expect(result).toHaveProperty("reason", expect.stringContaining("record"))
    expect(f.state.allocated).toBe(0)
    expect(f.state.sent).toBe(0)
  })
)

it.effect("record discovery outage during initial preflight cannot admit a partial plan", () =>
  Effect.gen(function* () {
    const f = transferTreeFixture()
    const inspect = assertExists(f.operations.inspectTransferRecords)
    const result = yield* run(f, {
      ...f.operations,
      inspectTransferRecords: (id, tree) =>
        id === IssueId.make(f.child._id)
          ? Effect.fail(new HulyAuthError({ message: "Child ownership inventory unavailable" }))
          : inspect(id, tree)
    })
    expect(result).toMatchObject({ outcome: "blocked", changed: false })
    expect(f.state.allocated).toBe(0)
    expect(f.state.sent).toBe(0)
  })
)

it.effect("post-allocation project inventory outage retains confirmed reservations without sending the batch", () =>
  Effect.gen(function* () {
    const f = transferTreeFixture()
    const findAll = assertExists(f.operations.findAll)
    const result = yield* run(f, {
      ...f.operations,
      findAll: (cls, query, options) =>
        f.state.allocated > 0 && query.space !== undefined
          ? Effect.fail(new HulyAuthError({ message: "Project inventory unavailable after reservation" }))
          : findAll(cls, query, options)
    })
    expect(result).toMatchObject({
      outcome: "indeterminate",
      execution: {
        commit: "not-sent",
        reservations: [
          { status: "confirmed", issueId: f.root._id, number: 4 },
          { status: "confirmed", issueId: f.child._id, number: 5 },
          { status: "confirmed", issueId: f.grandchild._id, number: 6 }
        ]
      }
    })
    expect(f.state.allocated).toBe(3)
    expect(f.state.sent).toBe(0)
  })
)

for (const change of ["payload-unavailable", "wrong-project", "wrong-owner"]) {
  it.effect(`a previously supported comment becoming ${change} reports actual ownership and payload limits`, () =>
    Effect.gen(function* () {
      const f = transferTreeFixture()
      const inspect = assertExists(f.operations.inspectTransferRecords)
      const comment = {
        _id: "comment-1",
        _class: "chunter:class:ChatMessage",
        kind: "owned",
        space: f.source._id,
        attachedTo: f.root._id,
        attachedToClass: "tracker:class:Issue",
        collection: "comments",
        modifiedOn: 1,
        modifiedBy: "author",
        snapshot: JSON.stringify({ message: "Original comment" }),
        ownerId: f.root._id,
        ownerClass: "tracker:class:Issue"
      }
      const result = yield* run(f, {
        ...f.operations,
        inspectTransferRecords: (id, tree) =>
          inspect(id, tree).pipe(
            Effect.map((inspection) => {
              if (id !== IssueId.make(f.root._id)) return inspection
              const current =
                f.state.sent === 0
                  ? comment
                  : {
                      ...comment,
                      kind: "unsupported",
                      space: change === "wrong-project" ? f.source._id : f.destination._id,
                      attachedTo: change === "wrong-owner" ? f.child._id : f.root._id
                    }
              return parseInspection({
                ...inspection,
                classes: [...inspection.classes, comment._class],
                records: [...inspection.records, current]
              })
            })
          )
      })
      expect(result).toMatchObject({
        outcome: change === "payload-unavailable" ? "indeterminate" : "incomplete",
        verification: {
          completeness: "incomplete",
          consistency: change === "payload-unavailable" ? "undetermined" : "inconsistent"
        }
      })
      expect(result).toHaveProperty("verification.reason", expect.stringContaining("Protected payload"))
      expect(f.state.sent).toBe(1)
      expect(f.state.allocated).toBe(3)
    })
  )
}

for (const capability of ["available", "unavailable", "omitted-optional-changes"]) {
  it.effect(`read-only tree verification with ${capability} record inspection needs no progress publisher`, () =>
    Effect.gen(function* () {
      const f = transferTreeFixture()
      const client = yield* HulyClient.pipe(Effect.provide(f.layer))
      const destination = parseProject(f.destination)
      const prepared = yield* inspectTransferPlan(
        client,
        parseIssue(f.root),
        parseIssue(f.parent),
        parseProject(f.source),
        destination,
        yield* parseMoveIssueParams(f.input)
      )
      if ("conflicts" in prepared) throw new Error("Expected admitted fixture")
      const writes: Array<TransferTreeWrite> = []
      const commit = assertExists(f.operations.commitTransferTree)
      expect(
        (yield* run(f, {
          ...f.operations,
          commitTransferTree: (write) =>
            Effect.sync(() => {
              writes.push(write)
            }).pipe(Effect.andThen(commit(write)))
        })).outcome
      ).toBe("completed")
      const { inspectTransferRecords: _inspect, ...withoutInspection } = f.operations
      const reader = yield* HulyClient.pipe(
        Effect.provide(HulyClient.testLayer(capability !== "unavailable" ? f.operations : withoutInspection))
      )
      const captured = assertExists(writes[0])
      const write =
        capability === "omitted-optional-changes"
          ? { ...captured, tasks: captured.tasks.map(({ attributeChanges: _changes, ...task }) => task) }
          : captured
      const verification = yield* verifyTransferTree(reader, prepared, destination, write)
      expect(verification).toMatchObject({
        status: "observed",
        completeness: capability !== "unavailable" ? "complete" : "incomplete",
        consistency: capability !== "unavailable" ? "consistent" : "undetermined"
      })
      expect(f.state.sent).toBe(1)
      expect(f.state.allocated).toBe(3)
    })
  )
}
