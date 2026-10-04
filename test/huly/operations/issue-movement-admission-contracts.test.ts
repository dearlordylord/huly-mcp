import { it } from "@effect/vitest"
import { Effect, Fiber, Schema } from "effect"
import { TestClock } from "effect/testing"
import { expect } from "vitest"
import { parseMoveIssueParams } from "../../../src/domain/schemas/issue-movement.js"
import { MovementIssueSchema, MovementProjectSchema } from "../../../src/domain/schemas/issue-movement-state.js"
import { MAX_SUPPORTED_ATTRIBUTE_VALUES } from "../../../src/domain/schemas/issue-transfer-attributes.js"
import { MAX_TRANSFER_CONFLICT_ENTRIES } from "../../../src/huly/operations/issue-transfer-tree.js"
import { MoveIssueResultSchema } from "../../../src/domain/schemas/issues-results.js"
import { DocId, UNKNOWN_TOTAL } from "../../../src/domain/schemas/shared.js"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import { HulyAuthError } from "../../../src/huly/errors-base.js"
import { tracker } from "../../../src/huly/huly-plugins.js"
import { moveIssue } from "../../../src/huly/operations/issue-movement.js"
import { inspectTransferPlan } from "../../../src/huly/operations/issue-transfer-preflight.js"
import { executeTransferTree } from "../../../src/huly/operations/issue-transfer-tree-execution.js"
import { assertExists } from "../../../src/utils/assertions.js"
import { initializeHierarchy, movementIssue } from "../../helpers/movement.js"
import { sdkFixture } from "../../helpers/huly-sdk.js"
import { transferTreeFixture } from "../../helpers/transfer-tree.js"

const parseIssue = (input: unknown) => Schema.decodeUnknownSync(MovementIssueSchema)(input)
const parseProject = (input: unknown) => Schema.decodeUnknownSync(MovementProjectSchema)(input)
const parseResult = (input: unknown) => Schema.decodeUnknownSync(MoveIssueResultSchema)(input)
const scalarMatches = (input: unknown, value: DocId) => {
  const parsed = Schema.decodeUnknownOption(DocId)(input)
  return parsed._tag === "Some" && parsed.value === value
}
const run = Effect.fn("test.admissionContract")(function* (
  f: ReturnType<typeof transferTreeFixture>,
  operations: Partial<HulyClientOperations>,
  input: unknown = f.input
) {
  const params = yield* parseMoveIssueParams(input)
  const fiber = yield* moveIssue(params).pipe(Effect.provide(HulyClient.testLayer(operations)), Effect.forkChild)
  yield* TestClock.adjust("2 seconds")
  return parseResult(yield* Fiber.join(fiber))
})

it.effect("consent on an already satisfied same-project parent is refused before discovery or writes", () =>
  Effect.gen(function* () {
    const f = transferTreeFixture()
    expect(
      yield* run(f, f.operations, { issue: f.root._id, destination: { parent: f.old._id }, resolutions: [] })
    ).toMatchObject({
      outcome: "blocked",
      changed: false,
      reason: expect.stringContaining("Omit resolutions for same-project movement")
    })
    expect(f.state.inspected).toBe(0)
    expect(f.state.allocated).toBe(0)
    expect(f.state.sent).toBe(0)
  })
)

it.effect("a selected parent's unavailable project metadata refuses without trusting the issue's space alone", () =>
  Effect.gen(function* () {
    const f = transferTreeFixture()
    const findAll = assertExists(f.operations.findAll)
    const result = yield* run(
      f,
      {
        ...f.operations,
        findAll: (cls, query, options) =>
          findAll(cls, query, options).pipe(
            Effect.map((rows) => {
              if (cls === tracker.class.Project && scalarMatches(query._id, DocId.make(f.destination._id)))
                rows.total = UNKNOWN_TOTAL
              return rows
            })
          )
      },
      { issue: f.root._id, destination: { parent: f.parent._id } }
    )
    expect(result).toMatchObject({
      outcome: "blocked",
      changed: false,
      reason: "Destination project metadata is unavailable."
    })
    expect(f.state.allocated).toBe(0)
    expect(f.state.sent).toBe(0)
  })
)

for (const change of ["missing-port", "snapshot-drift", "read-outage"]) {
  it.effect(`an admitted execution refuses ${change} before any reservation`, () =>
    Effect.gen(function* () {
      const f = transferTreeFixture()
      const client = yield* HulyClient.pipe(Effect.provide(f.layer))
      const destination = parseProject(f.destination)
      const params = yield* parseMoveIssueParams(f.input)
      const prepared = yield* inspectTransferPlan(
        client,
        parseIssue(f.root),
        parseIssue(f.parent),
        parseProject(f.source),
        destination,
        params
      )
      if ("conflicts" in prepared) throw new Error("Expected admitted fixture")
      const { commitTransferTree: _commit, ...withoutCommit } = f.operations
      const findAll = assertExists(f.operations.findAll)
      const operations =
        change === "missing-port"
          ? withoutCommit
          : {
              ...f.operations,
              findAll: (cls, query, options) =>
                change === "read-outage"
                  ? Effect.fail(new HulyAuthError({ message: "Admission inventory unavailable" }))
                  : findAll(cls, query, options)
            }
      if (change === "snapshot-drift") f.root.description = sdkFixture("Concurrent edit before execution")
      const executor = yield* HulyClient.pipe(Effect.provide(HulyClient.testLayer(operations)))
      const result = yield* executeTransferTree(executor, prepared, destination, params)
      expect(result).toMatchObject({ outcome: "blocked", changed: false })
      expect(f.state.allocated).toBe(0)
      expect(f.state.sent).toBe(0)
      if (change === "snapshot-drift") expect(f.root.description).toBe("Concurrent edit before execution")
    })
  )
}

it.effect("a known contradiction remains incomplete when a subsequent verification pass fails", () =>
  Effect.gen(function* () {
    const f = transferTreeFixture()
    const commit = assertExists(f.operations.commitTransferTree)
    const findAll = assertExists(f.operations.findAll)
    const state = { verificationPasses: 0 }
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
      findAll: (cls, query, options) => {
        if (f.state.sent > 0 && scalarMatches(query.space, DocId.make(f.source._id))) state.verificationPasses++
        return state.verificationPasses > 1
          ? Effect.fail(new HulyAuthError({ message: "Later verification inventory unavailable" }))
          : findAll(cls, query, options)
      }
    })
    expect(result).toMatchObject({
      outcome: "incomplete",
      verification: { consistency: "inconsistent", completeness: "incomplete" }
    })
    expect(result).toHaveProperty("verification.reason", expect.stringContaining("child count"))
    expect(result).toHaveProperty("verification.reason", expect.stringContaining("failed"))
    expect(f.state.sent).toBe(1)
    expect(f.state.allocated).toBe(3)
  })
)

it.effect("a complete candidate inventory exceeding the response cap refuses the entire tree", () =>
  Effect.gen(function* () {
    const f = transferTreeFixture()
    for (let index = 0; index < 3; index++) {
      f.issues.push(
        movementIssue(`candidate-child-${index}`, {
          ...f.child,
          _id: sdkFixture(`candidate-child-${index}`),
          identifier: sdkFixture(`TEST-${index + 10}`),
          attachedTo: f.root._id
        })
      )
    }
    initializeHierarchy(f.issues)
    const movingIssues = f.issues.filter((issue) => issue.space === f.source._id && issue._id !== f.old._id)
    const fields = ["component", "milestone"]
    const candidatesPerAttribute = MAX_SUPPORTED_ATTRIBUTE_VALUES
    expect(candidatesPerAttribute).toBeLessThanOrEqual(MAX_SUPPORTED_ATTRIBUTE_VALUES)
    expect(movingIssues.length * fields.length * candidatesPerAttribute).toBeGreaterThan(MAX_TRANSFER_CONFLICT_ENTRIES)
    for (const issue of movingIssues) {
      issue.component = sdkFixture("dangling-component")
      issue.milestone = sdkFixture("dangling-milestone")
    }
    for (const field of fields) {
      for (let index = 0; index < candidatesPerAttribute; index++) {
        f.attributeRows.push(
          sdkFixture({
            _id: `${field}-candidate-${index}`,
            _class: field === "component" ? tracker.class.Component : tracker.class.Milestone,
            space: f.destination._id,
            label: `Candidate ${index}`,
            lead: null,
            status: 0,
            targetDate: 0
          })
        )
      }
    }
    const result = yield* run(f, f.operations)
    expect(result).toMatchObject({ outcome: "blocked", changed: false, discovery: "incomplete" })
    expect(result).toHaveProperty("conflicts", [
      expect.objectContaining({ reason: expect.stringContaining("conflicts/candidates exceed") })
    ])
    expect(f.state.allocated).toBe(0)
    expect(f.state.sent).toBe(0)
  })
)
