import { HulyAuthError } from "../../../src/huly/errors-base.js"
import { it } from "@effect/vitest"
import { Effect, Fiber, Schema } from "effect"
import { TestClock } from "effect/testing"
import { describe, expect } from "vitest"
import { parseMoveIssueParams } from "../../../src/domain/schemas/issue-movement.js"
import { MoveIssueResultSchema } from "../../../src/domain/schemas/issues-results.js"
import { TransferInspectionSchema } from "../../../src/domain/schemas/issue-transfer.js"
import { DocId, NonEmptyString, UNKNOWN_TOTAL } from "../../../src/domain/schemas/shared.js"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import { MovementTransportError } from "../../../src/huly/movement-transaction-transport.js"
import { core, tracker } from "../../../src/huly/huly-plugins.js"
import { moveIssue } from "../../../src/huly/operations/issue-movement.js"
import { toRef } from "../../../src/huly/operations/sdk-boundary.js"
import { assertExists } from "../../../src/utils/assertions.js"
import { initializeHierarchy, movementIssue } from "../../helpers/movement.js"
import { sdkFixture } from "../../helpers/huly-sdk.js"
import { transferTreeFixture } from "../../helpers/transfer-tree.js"

const parseResult = (input: unknown) => Schema.decodeUnknownSync(MoveIssueResultSchema)(input)
const parseInspection = (input: unknown) => Schema.decodeUnknownSync(TransferInspectionSchema)(input)
const queryScalarMatches = (input: unknown, expected: string) => {
  const scalar = Schema.decodeUnknownOption(Schema.String)(input)
  return scalar._tag === "Some" && scalar.value === expected
}
const unavailable = (phase: MovementTransportError["phase"]) =>
  new MovementTransportError({ phase, reason: NonEmptyString.make("Injected single-send transport failure.") })
const run = Effect.fn("test.movementFailure")(function* (
  f: ReturnType<typeof transferTreeFixture>,
  operations: Partial<HulyClientOperations> = f.operations,
  input: unknown = f.input,
  advance: Parameters<typeof TestClock.adjust>[0] = "2 seconds"
) {
  const params = yield* parseMoveIssueParams(input)
  const fiber = yield* moveIssue(params).pipe(Effect.provide(HulyClient.testLayer(operations)), Effect.forkChild)
  yield* TestClock.adjust(advance)
  return parseResult(yield* Fiber.join(fiber))
})
const reserve = (f: ReturnType<typeof transferTreeFixture>, id: DocId) =>
  assertExists(f.operations.updateDoc)(
    tracker.class.Project,
    core.space.Space,
    toRef(id),
    { $inc: { sequence: 1 } },
    true
  )

const assertRecovery = (result: ReturnType<typeof parseResult>, ids: ReadonlyArray<string>) => {
  if (result.outcome !== "incomplete" && result.outcome !== "indeterminate")
    throw new Error("Expected uncertain movement result")
  expect(result).not.toHaveProperty("changed")
  expect(result).not.toHaveProperty("tasks")
  for (const id of ids) {
    expect(result.inspection).toContain(`"identifier":"${id}"`)
    expect(result.inspection).toContain(` ${id} --json`)
  }
}

describe("public movement uncertainty and concurrent state", () => {
  it.effect("confirmed failure before the first sequence send is blocked and reserves nothing", () =>
    Effect.gen(function* () {
      const f = transferTreeFixture()
      const result = yield* run(f, {
        ...f.operations,
        allocateMovementNumber: () => Effect.fail(unavailable("before-send"))
      })
      expect(result).toMatchObject({ outcome: "blocked", changed: false })
      expect(f.state.allocated).toBe(0)
      expect(f.state.sent).toBe(0)
    })
  )

  it.effect("a second allocation's lost success reports the first confirmed number and one uncertain reservation", () =>
    Effect.gen(function* () {
      const f = transferTreeFixture()
      const result = yield* run(f, {
        ...f.operations,
        allocateMovementNumber: (id) =>
          reserve(f, id).pipe(
            Effect.flatMap((reply) =>
              f.state.allocated === 2 ? Effect.fail(unavailable("after-send")) : Effect.succeed(reply)
            )
          )
      })
      expect(result).toMatchObject({
        outcome: "indeterminate",
        destination: { projectId: f.destination._id, parentId: f.parent._id },
        discovery: { status: "complete" },
        execution: {
          phase: "allocation",
          commit: "not-sent",
          reservations: [
            { status: "confirmed", issueId: f.root._id, number: 4 },
            { status: "uncertain", issueId: f.child._id }
          ]
        },
        verification: { status: "not-attempted" }
      })
      assertRecovery(result, [f.root._id, f.child._id, f.grandchild._id])
      expect(result).toMatchObject({ recordIds: f.records.map((record) => record._id) })
      if (result.outcome === "indeterminate") {
        for (const issue of [f.root, f.child, f.grandchild]) {
          expect(result.inspection).toContain(
            `MCP list_activity ${JSON.stringify({ objectId: issue._id, objectClass: String(tracker.class.Issue) })}`
          )
          for (const project of [f.source.identifier, f.destination.identifier])
            expect(result.inspection).toContain(
              `MCP list_comments ${JSON.stringify({ project, issueIdentifier: issue._id })}`
            )
        }
      }
      expect(f.state.allocated).toBe(2)
      expect(f.state.sent).toBe(0)
    })
  )

  it.effect("confirmed second-request refusal retains earlier reservation effects without changed:false", () =>
    Effect.gen(function* () {
      const f = transferTreeFixture()
      const result = yield* run(f, {
        ...f.operations,
        allocateMovementNumber: (id) =>
          f.state.allocated === 1 ? Effect.fail(unavailable("before-send")) : reserve(f, id)
      })
      expect(result).toMatchObject({
        outcome: "incomplete",
        execution: { reservations: [{ status: "confirmed", issueId: f.root._id, number: 4 }] }
      })
      assertRecovery(result, [f.root._id])
      expect(f.state.allocated).toBe(1)
      expect(f.state.sent).toBe(0)
    })
  )

  it.effect("a new child after allocation is reported by stable ID and remains untouched", () =>
    Effect.gen(function* () {
      const f = transferTreeFixture()
      const added = movementIssue("concurrent-child", {
        ...f.child,
        _id: sdkFixture("concurrent-child"),
        attachedTo: f.root._id,
        identifier: sdkFixture("TEST-9"),
        number: 9
      })
      const result = yield* run(f, {
        ...f.operations,
        allocateMovementNumber: (id) =>
          reserve(f, id).pipe(
            Effect.tap(() =>
              Effect.sync(() => {
                if (f.state.allocated === 1) {
                  f.issues.push(added)
                  initializeHierarchy(f.issues)
                }
              })
            )
          )
      })
      expect(result).toMatchObject({
        outcome: "incomplete",
        execution: { commit: "not-sent" },
        verification: { status: "observed", consistency: "inconsistent" }
      })
      if (result.outcome === "incomplete" || result.outcome === "indeterminate")
        expect(result.issueIds).toContain(added._id)
      assertRecovery(result, [added._id])
      expect(added.space).toBe(f.source._id)
      expect(f.state.sent).toBe(0)
    })
  )

  for (const collection of ["comments", "reports"]) {
    it.effect(`a concurrent ${collection} record is detected without relying on issue modifiedOn`, () =>
      Effect.gen(function* () {
        const f = transferTreeFixture()
        const originalInspect = assertExists(f.operations.inspectTransferRecords)
        const modifiedOn = f.root.modifiedOn
        const added = {
          _id: `concurrent-${collection}`,
          _class: collection === "comments" ? "chunter:class:ChatMessage" : "tracker:class:TimeSpendReport",
          kind: "owned",
          space: f.source._id,
          attachedTo: f.root._id,
          attachedToClass: String(tracker.class.Issue),
          collection,
          snapshot: "{}",
          ownerId: f.root._id,
          ownerClass: String(tracker.class.Issue),
          modifiedOn: 1,
          modifiedBy: "author"
        }
        const result = yield* run(f, {
          ...f.operations,
          inspectTransferRecords: (id, tree) =>
            originalInspect(id, tree).pipe(
              Effect.map((inspection) =>
                parseInspection({
                  ...inspection,
                  records:
                    f.state.allocated > 0 && String(id) === String(f.root._id)
                      ? [...inspection.records, added]
                      : inspection.records
                })
              )
            )
        })
        expect(result).toMatchObject({
          outcome: "incomplete",
          verification: {
            status: "observed",
            consistency: "inconsistent",
            records: expect.arrayContaining([expect.objectContaining({ recordId: added._id, projectId: f.source._id })])
          }
        })
        expect(f.root.modifiedOn).toBe(modifiedOn)
        expect(f.state.sent).toBe(0)
      })
    )
  }

  for (const change of ["attribute", "ancestry"]) {
    it.effect(`a concurrent ${change} change after allocation refuses send and preserves the edit`, () =>
      Effect.gen(function* () {
        const f = transferTreeFixture()
        const result = yield* run(f, {
          ...f.operations,
          allocateMovementNumber: (id) =>
            reserve(f, id).pipe(
              Effect.tap(() =>
                Effect.sync(() => {
                  if (f.state.allocated !== 1) return
                  if (change === "attribute") f.child.component = sdkFixture("concurrent-component")
                  else {
                    f.child.attachedTo = f.old._id
                    initializeHierarchy(f.issues)
                  }
                })
              )
            )
        })
        expect(result).toMatchObject({ outcome: "incomplete", execution: { phase: "allocation", commit: "not-sent" } })
        expect(f.state.sent).toBe(0)
        expect(change === "attribute" ? f.child.component : f.child.attachedTo).toBe(
          change === "attribute" ? "concurrent-component" : f.old._id
        )
      })
    )
  }

  it.effect("failure before the allocated task batch sends reports confirmed numbers and no task mutation", () =>
    Effect.gen(function* () {
      const f = transferTreeFixture()
      const result = yield* run(f, {
        ...f.operations,
        commitTransferTree: () => Effect.fail(unavailable("before-send"))
      })
      expect(result).toMatchObject({
        outcome: "incomplete",
        execution: {
          phase: "allocation",
          commit: "not-sent",
          reservations: expect.arrayContaining([{ status: "confirmed", issueId: f.root._id, number: 4 }])
        }
      })
      assertRecovery(result, [f.root._id])
      expect(f.root.space).toBe(f.source._id)
      expect(f.state.allocated).toBe(3)
      expect(f.state.sent).toBe(0)
    })
  )

  it.effect("an interrupted batch reports partial observed state and never resumes remaining tasks", () =>
    Effect.gen(function* () {
      const f = transferTreeFixture()
      const result = yield* run(f, {
        ...f.operations,
        commitTransferTree: (write) =>
          Effect.sync(() => {
            f.state.sent++
            const root = assertExists(write.tasks.find((task) => String(task.issueId) === String(f.root._id)))
            Object.assign(f.root, {
              space: root.destinationId,
              identifier: root.identifier,
              number: root.number,
              rank: root.rank,
              attachedTo: root.parentId
            })
            initializeHierarchy(f.issues)
          }).pipe(Effect.andThen(Effect.fail(unavailable("after-send"))))
      })
      expect(result).toMatchObject({
        outcome: "indeterminate",
        execution: { commit: "reply-lost" },
        verification: { status: "observed", consistency: "inconsistent" }
      })
      expect(f.child.space).toBe(f.source._id)
      expect(f.root.space).toBe(f.destination._id)
      expect(f.state.allocated).toBe(3)
      expect(f.state.sent).toBe(1)
    })
  )

  it.effect("lost success remains indeterminate even when read-only observation sees a consistent destination", () =>
    Effect.gen(function* () {
      const f = transferTreeFixture()
      const original = assertExists(f.operations.commitTransferTree)
      const result = yield* run(f, {
        ...f.operations,
        commitTransferTree: (write) => original(write).pipe(Effect.andThen(Effect.fail(unavailable("after-send"))))
      })
      expect(result).toMatchObject({
        outcome: "indeterminate",
        execution: { phase: "commit", commit: "reply-lost" },
        verification: {
          status: "observed",
          completeness: "complete",
          consistency: "consistent",
          tasks: expect.arrayContaining([
            expect.objectContaining({ issueId: f.child._id, projectId: f.destination._id })
          ])
        }
      })
      assertRecovery(result, [f.root._id, f.child._id, f.grandchild._id])
      expect(f.state.sent).toBe(1)
      expect(f.state.allocated).toBe(3)
    })
  )

  it.effect("an acknowledged write followed by a verification outage cannot claim unchanged state", () =>
    Effect.gen(function* () {
      const f = transferTreeFixture()
      f.state.failPostRead = true
      const result = yield* run(f)
      expect(result).toMatchObject({
        outcome: "indeterminate",
        execution: { phase: "verification", commit: "acknowledged" }
      })
      assertRecovery(result, [f.root._id])
      expect(f.state.sent).toBe(1)
    })
  )

  for (const failure of ["read-outage", "malformed", "missing"]) {
    it.effect(`a parsed task contradiction survives a later ${failure} without inventing unread state`, () =>
      Effect.gen(function* () {
        const f = transferTreeFixture()
        const commit = assertExists(f.operations.commitTransferTree)
        const findOne = assertExists(f.operations.findOne)
        const result = yield* run(f, {
          ...f.operations,
          commitTransferTree: (write) =>
            commit(write).pipe(
              Effect.tap(() =>
                Effect.sync(() => {
                  f.root.title = "Concurrent root edit"
                })
              )
            ),
          findOne: (cls, query, options) =>
            findOne(cls, query, options).pipe(
              Effect.flatMap((row) => {
                if (f.state.sent > 0 && queryScalarMatches(query._id, f.child._id)) {
                  if (failure === "read-outage")
                    return Effect.fail(new HulyAuthError({ message: "Later task read unavailable" }))
                  if (failure === "missing") return Effect.succeed(undefined)
                  if (row !== undefined) Reflect.set(row, "description", 123)
                }
                return Effect.succeed(row)
              })
            )
        })
        expect(result.outcome).toBe("incomplete")
        expect(result).toHaveProperty("verification.consistency", "inconsistent")
        expect(result).toHaveProperty(
          "verification.tasks",
          expect.arrayContaining([expect.objectContaining({ issueId: f.root._id, projectId: f.destination._id })])
        )
        if (failure !== "missing") {
          expect(result).toHaveProperty("verification.completeness", "incomplete")
          expect(result).toHaveProperty(
            "verification.tasks",
            expect.not.arrayContaining([expect.objectContaining({ issueId: f.child._id })])
          )
          expect(result).toHaveProperty("verification.reason", expect.stringContaining("could not"))
        }
        expect(f.root.title).toBe("Concurrent root edit")
        expect(f.state.sent).toBe(1)
        expect(f.state.allocated).toBe(3)
      })
    )
  }

  for (const later of ["read-outage", "malformed"]) {
    it.effect(`confirmed absence survives a later ${later} without fabricating either task`, () =>
      Effect.gen(function* () {
        const f = transferTreeFixture()
        const findOne = assertExists(f.operations.findOne)
        const result = yield* run(f, {
          ...f.operations,
          findOne: (cls, query, options) =>
            findOne(cls, query, options).pipe(
              Effect.flatMap((row) => {
                if (f.state.sent === 0) return Effect.succeed(row)
                if (queryScalarMatches(query._id, f.root._id)) return Effect.succeed(undefined)
                if (queryScalarMatches(query._id, f.child._id)) {
                  if (later === "read-outage")
                    return Effect.fail(new HulyAuthError({ message: "Child read unavailable" }))
                  if (row !== undefined) Reflect.set(row, "description", 123)
                }
                return Effect.succeed(row)
              })
            )
        })
        expect(result).toMatchObject({
          outcome: "incomplete",
          verification: { completeness: "incomplete", consistency: "inconsistent", absentIssueIds: [f.root._id] }
        })
        expect(result).toHaveProperty(
          "verification.tasks",
          expect.not.arrayContaining([
            expect.objectContaining({ issueId: f.root._id }),
            expect.objectContaining({ issueId: f.child._id })
          ])
        )
        expect(result).toHaveProperty("verification.reason", expect.stringContaining("could not"))
        expect(f.state.sent).toBe(1)
      })
    )
  }

  it.effect("a complete hierarchy contradiction survives subsequent task read unavailability", () =>
    Effect.gen(function* () {
      const f = transferTreeFixture()
      const commit = assertExists(f.operations.commitTransferTree)
      const findOne = assertExists(f.operations.findOne)
      const result = yield* run(f, {
        ...f.operations,
        commitTransferTree: (write) =>
          commit(write).pipe(
            Effect.tap(() =>
              Effect.sync(() => {
                f.old.subIssues++
              })
            )
          ),
        findOne: (cls, query, options) =>
          f.state.sent > 0 && queryScalarMatches(query._id, f.root._id)
            ? Effect.fail(new HulyAuthError({ message: "Root read unavailable" }))
            : findOne(cls, query, options)
      })
      expect(result).toMatchObject({
        outcome: "incomplete",
        verification: { completeness: "incomplete", consistency: "inconsistent" }
      })
      expect(result).toHaveProperty("verification.reason", expect.stringContaining("could not"))
      expect(result).toHaveProperty("verification.reason", expect.stringContaining("child count"))
      expect(f.state.sent).toBe(1)
    })
  )

  for (const change of ["missing", "payload", "partial-project"]) {
    it.effect(`known ${change} record contradiction survives a later owner's outage`, () =>
      Effect.gen(function* () {
        const f = transferTreeFixture()
        const commit = assertExists(f.operations.commitTransferTree)
        const inspect = assertExists(f.operations.inspectTransferRecords)
        const result = yield* run(f, {
          ...f.operations,
          commitTransferTree: (write) =>
            commit(write).pipe(
              Effect.tap(() =>
                Effect.sync(() => {
                  if (change === "missing") f.records.splice(0)
                  else if (change === "payload") assertExists(f.records[0]).history.action = "remove"
                  else assertExists(f.records[0]).space = DocId.make(f.source._id)
                })
              )
            ),
          inspectTransferRecords: (id, tree) => {
            if (f.state.sent > 0 && String(id) === String(f.child._id))
              return Effect.fail(new HulyAuthError({ message: "Later owner read unavailable" }))
            return inspect(id, tree).pipe(
              Effect.map((inspection) =>
                change === "partial-project" && f.state.sent > 0
                  ? parseInspection({ ...inspection, discovery: "incomplete", blockers: [] })
                  : inspection
              )
            )
          }
        })
        expect(result).toMatchObject({
          outcome: "incomplete",
          verification: { completeness: "incomplete", consistency: "inconsistent" }
        })
        expect(result).toHaveProperty("verification.reason", expect.stringContaining("could not be read"))
        expect(f.state.sent).toBe(1)
        expect(f.state.allocated).toBe(3)
      })
    )
  }

  it.effect("known changed record payload survives unavailable descendant closure", () =>
    Effect.gen(function* () {
      const f = transferTreeFixture()
      const commit = assertExists(f.operations.commitTransferTree)
      const findAll = assertExists(f.operations.findAll)
      const result = yield* run(f, {
        ...f.operations,
        commitTransferTree: (write) =>
          commit(write).pipe(
            Effect.tap(() =>
              Effect.sync(() => {
                assertExists(f.records[0]).history.action = "remove"
              })
            )
          ),
        findAll: (cls, query, options) =>
          findAll(cls, query, options).pipe(
            Effect.map((rows) => {
              if (f.state.sent > 0 && query.attachedTo !== undefined) rows.total = UNKNOWN_TOTAL
              return rows
            })
          )
      })
      expect(result).toMatchObject({
        outcome: "incomplete",
        verification: { completeness: "incomplete", consistency: "inconsistent" }
      })
      expect(result).toHaveProperty("verification.reason", expect.stringContaining("incomplete"))
      expect(result).toHaveProperty("verification.reason", expect.stringContaining("record"))
      expect(f.state.sent).toBe(1)
    })
  )

  for (const fact of ["task", "absence", "record", "hierarchy"]) {
    it.effect(`known ${fact} evidence survives a later hanging read and the execution deadline`, () =>
      Effect.gen(function* () {
        const f = transferTreeFixture()
        const commit = assertExists(f.operations.commitTransferTree)
        const findOne = assertExists(f.operations.findOne)
        const inspect = assertExists(f.operations.inspectTransferRecords)
        const result = yield* run(
          f,
          {
            ...f.operations,
            commitTransferTree: (write) =>
              commit(write).pipe(
                Effect.tap(() =>
                  Effect.sync(() => {
                    if (fact === "task") f.root.title = "Known concurrent edit"
                    if (fact === "record") assertExists(f.records[0]).history.action = "remove"
                    if (fact === "hierarchy") f.old.subIssues++
                  })
                )
              ),
            findOne: (cls, query, options) => {
              if (f.state.sent > 0) {
                if (fact === "absence" && queryScalarMatches(query._id, f.root._id)) return Effect.succeed(undefined)
                if (fact === "hierarchy" && queryScalarMatches(query._id, f.root._id)) return Effect.never
                if ((fact === "task" || fact === "absence") && queryScalarMatches(query._id, f.child._id))
                  return Effect.never
              }
              return findOne(cls, query, options)
            },
            inspectTransferRecords: (id, tree) =>
              fact === "record" && f.state.sent > 0 && String(id) === String(f.child._id)
                ? Effect.never
                : inspect(id, tree)
          },
          f.input,
          "31 seconds"
        )
        expect(result).toMatchObject({
          outcome: "incomplete",
          verification: { completeness: "incomplete", consistency: "inconsistent" }
        })
        expect(result).toHaveProperty("verification.reason", expect.stringContaining("deadline"))
        if (fact === "absence") expect(result).toHaveProperty("verification.absentIssueIds", [f.root._id])
        expect(f.state.sent).toBe(1)
        expect(f.state.allocated).toBe(3)
      })
    )
  }

  it.effect("classifies retained known record evidence after a later partial verification returns successfully", () =>
    Effect.gen(function* () {
      const f = transferTreeFixture()
      const commit = assertExists(f.operations.commitTransferTree)
      const inspect = assertExists(f.operations.inspectTransferRecords)
      const state = { passes: 0 }
      const result = yield* run(f, {
        ...f.operations,
        commitTransferTree: (write) =>
          commit(write).pipe(
            Effect.tap(() =>
              Effect.sync(() => {
                f.records.splice(0)
              })
            )
          ),
        inspectTransferRecords: (id, tree) =>
          inspect(id, tree).pipe(
            Effect.map((inspection) => {
              if (f.state.sent > 0 && String(id) === String(f.root._id)) state.passes++
              return f.state.sent > 0 && state.passes > 1
                ? parseInspection({ ...inspection, discovery: "incomplete", blockers: [] })
                : inspection
            })
          )
      })
      expect(result).toMatchObject({
        outcome: "incomplete",
        verification: { completeness: "incomplete", consistency: "inconsistent" }
      })
      expect(result).toHaveProperty("verification.reason", expect.stringContaining("Earlier observed"))
      expect(state.passes).toBe(5)
      expect(f.state.sent).toBe(1)
    })
  )

  it.effect(
    "retains confirmed absence and observed records through a newer inventory contradiction followed by a hanging read",
    () =>
      Effect.gen(function* () {
        const f = transferTreeFixture()
        const findAll = assertExists(f.operations.findAll)
        const findOne = assertExists(f.operations.findOne)
        const state = { passes: 0 }
        const result = yield* run(
          f,
          {
            ...f.operations,
            findAll: (cls, query, options) =>
              findAll(cls, query, options).pipe(
                Effect.map((rows) => {
                  if (f.state.sent > 0 && queryScalarMatches(query.space, f.source._id)) {
                    state.passes++
                    if (state.passes === 2) f.old.subIssues++
                  }
                  return rows
                })
              ),
            findOne: (cls, query, options) => {
              if (f.state.sent > 0 && queryScalarMatches(query._id, f.root._id))
                return state.passes === 1 ? Effect.succeed(undefined) : Effect.never
              return findOne(cls, query, options)
            }
          },
          f.input,
          "31 seconds"
        )
        expect(result).toMatchObject({
          outcome: "incomplete",
          verification: {
            completeness: "incomplete",
            consistency: "inconsistent",
            absentIssueIds: [f.root._id],
            records: expect.arrayContaining([
              expect.objectContaining({ recordId: assertExists(f.records[0])._id, projectId: f.destination._id })
            ])
          }
        })
        expect(result).toHaveProperty(
          "verification.tasks",
          expect.not.arrayContaining([expect.objectContaining({ issueId: f.root._id })])
        )
        expect(result).toHaveProperty("verification.reason", expect.stringContaining("Earlier observed"))
        expect(f.state.sent).toBe(1)
      })
  )

  it.effect("a subsequent user edit survives verification failure without rollback or new reservations", () =>
    Effect.gen(function* () {
      const f = transferTreeFixture()
      const original = assertExists(f.operations.commitTransferTree)
      const result = yield* run(f, {
        ...f.operations,
        commitTransferTree: (write) =>
          original(write).pipe(
            Effect.tap(() =>
              Effect.sync(() => {
                f.child.description = sdkFixture("Subsequent user edit")
              })
            )
          )
      })
      expect(result).toMatchObject({
        outcome: "incomplete",
        verification: { status: "observed", consistency: "inconsistent" }
      })
      expect(f.child.description).toBe("Subsequent user edit")
      expect(f.state.sent).toBe(1)
      expect(f.state.allocated).toBe(3)
    })
  )

  it.effect("the verified successful destination repeats without reservations and rejects supplied empty consent", () =>
    Effect.gen(function* () {
      const f = transferTreeFixture()
      expect((yield* run(f)).outcome).toBe("completed")
      const allocated = f.state.allocated
      const repeated = { issue: f.root._id, destination: { project: f.destination._id, parent: f.parent._id } }
      expect((yield* run(f, f.operations, repeated)).outcome).toBe("no-op")
      expect(yield* run(f, f.operations, { ...repeated, resolutions: [] })).toMatchObject({
        outcome: "blocked",
        changed: false
      })
      expect(f.state.allocated).toBe(allocated)
      expect(f.state.sent).toBe(1)
    })
  )
})

it.effect("same-project scoped movement preserves all numbers, identifiers and ranks without a reservation", () =>
  Effect.gen(function* () {
    const f = transferTreeFixture()
    const identifiers = f.issues.map((issue) => ({
      id: issue._id,
      identifier: issue.identifier,
      number: issue.number,
      rank: issue.rank
    }))
    const original = assertExists(f.operations.commitTransferTree)
    const result = yield* run(
      f,
      {
        ...f.operations,
        allocateMovementNumber: () => Effect.die("Same-project movement must not reserve a number"),
        commitTransferTree: original
      },
      { issue: f.root._id, destination: { parent: null } }
    )
    expect(result).toMatchObject({ outcome: "completed", projectId: f.source._id, parentId: null })
    for (const expected of identifiers) {
      const current = assertExists(f.issues.find((issue) => issue._id === expected.id))
      expect({ identifier: current.identifier, number: current.number, rank: current.rank }).toEqual({
        identifier: expected.identifier,
        number: expected.number,
        rank: expected.rank
      })
    }
    expect(f.state.allocated).toBe(0)
    expect(f.state.sent).toBe(1)
    expect(f.child.attachedTo).toBe(f.root._id)
    expect(f.grandchild.attachedTo).toBe(f.child._id)
  })
)

it.effect("cross-project admission refuses a missing single-send sequence port before generic SDK writes", () =>
  Effect.gen(function* () {
    const f = transferTreeFixture()
    const { allocateMovementNumber: _allocation, ...operations } = f.operations
    const result = yield* run(f, operations)
    expect(result).toMatchObject({ outcome: "blocked", changed: false })
    expect(f.state.allocated).toBe(0)
    expect(f.state.sent).toBe(0)
  })
)
