import { it } from "@effect/vitest"
import { Effect, Fiber } from "effect"
import { TestClock } from "effect/testing"
import { expect } from "vitest"
import { IssueId, IssueIdentifier } from "../../../src/domain/schemas/shared.js"
import { parseMoveIssueParams } from "../../../src/domain/schemas/issue-movement.js"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import { moveIssue } from "../../../src/huly/operations/issue-movement.js"
import { assertExists } from "../../../src/utils/assertions.js"
import { initializeHierarchy } from "../../helpers/movement.js"
import { transferTreeFixture } from "../../helpers/transfer-tree.js"

const FRESH_ROOT_INSPECTION = 2
const run = Effect.fn("test.sameProjectAdmission")(function* (
  input: unknown,
  operations: Partial<HulyClientOperations>
) {
  const params = yield* parseMoveIssueParams(input)
  const fiber = yield* moveIssue(params).pipe(Effect.provide(HulyClient.testLayer(operations)), Effect.forkChild)
  yield* TestClock.adjust("2 seconds")
  return yield* Fiber.join(fiber)
})

it.effect("same-project movement preserves stable identifiers, numbers and ranks without allocations", () =>
  Effect.gen(function* () {
    const f = transferTreeFixture()
    const before = [f.root, f.child, f.grandchild].map((issue) => ({
      issueId: issue._id,
      identifier: issue.identifier,
      number: issue.number,
      rank: issue.rank
    }))
    const result = yield* run({ issue: IssueId.make(f.root._id), destination: { parent: null } }, f.operations)
    expect(result.outcome).toBe("completed")
    expect(
      [f.root, f.child, f.grandchild].map((issue) => ({
        issueId: issue._id,
        identifier: issue.identifier,
        number: issue.number,
        rank: issue.rank
      }))
    ).toEqual(before)
    expect(f.state.allocated).toBe(0)
    expect(f.state.sent).toBe(1)
  })
)

for (const destination of ["top-level", "already-satisfied"] as const) {
  it.effect(`fresh admission refuses changed owned history for ${destination} same-project movement`, () =>
    Effect.gen(function* () {
      const f = transferTreeFixture()
      if (destination === "already-satisfied") {
        for (const issue of [f.root, f.child, f.grandchild])
          issue.identifier = IssueIdentifier.make(`${f.source.identifier}-${issue.number}`)
        initializeHierarchy(f.issues)
      }
      const inspect = assertExists(f.operations.inspectTransferRecords)
      let rootInspections = 0
      const result = yield* run(
        {
          issue: IssueId.make(f.root._id),
          destination: { parent: destination === "top-level" ? null : IssueId.make(f.old._id) }
        },
        {
          ...f.operations,
          inspectTransferRecords: (ownerId, tree) => {
            if (ownerId === IssueId.make(f.root._id) && ++rootInspections === FRESH_ROOT_INSPECTION)
              assertExists(f.records[0]).snapshot = "Subsequent writer changed history"
            return inspect(ownerId, tree)
          }
        }
      )
      expect(result.outcome).toBe("blocked")
      expect(assertExists(f.records[0]).snapshot).toBe("Subsequent writer changed history")
      expect(f.state.allocated).toBe(0)
      expect(f.state.sent).toBe(0)
    })
  )
}

it.effect("a later scoped-condition refusal preserves the intervening writer's edit", () =>
  Effect.gen(function* () {
    const f = transferTreeFixture()
    const commit = assertExists(f.operations.commitTransferTree)
    const result = yield* run(
      { issue: IssueId.make(f.root._id), destination: { parent: null } },
      {
        ...f.operations,
        commitTransferTree: (write, publish) => {
          f.child.title = "Intervening writer's title"
          f.state.refuseCommit = true
          return commit(write, publish)
        }
      }
    )
    expect(result.outcome).toBe("incomplete")
    if (result.outcome !== "incomplete") throw new Error("Expected scoped refusal")
    expect(result.execution).toMatchObject({ phase: "commit", commit: "refused", reservations: [] })
    expect(f.child.title).toBe("Intervening writer's title")
    expect(f.state.allocated).toBe(0)
    expect(f.state.sent).toBe(1)
  })
)

it.effect("cross-project reinspection still refuses a task changed during sequence allocation", () =>
  Effect.gen(function* () {
    const f = transferTreeFixture()
    const allocate = assertExists(f.operations.allocateMovementNumber)
    const result = yield* run(f.input, {
      ...f.operations,
      allocateMovementNumber: (destinationId) =>
        allocate(destinationId).pipe(
          Effect.tap(() =>
            Effect.sync(() => {
              f.root.title = "Changed during sequence allocation"
            })
          )
        )
    })
    expect(result.outcome).toBe("incomplete")
    if (result.outcome !== "incomplete") throw new Error("Expected changed snapshot refusal")
    expect(result.execution).toMatchObject({ phase: "allocation", commit: "not-sent" })
    expect(result.execution.reservations.map((reservation) => reservation.status)).toEqual([
      "confirmed",
      "confirmed",
      "confirmed"
    ])
    expect(f.root.title).toBe("Changed during sequence allocation")
    expect(f.state.allocated).toBe(3)
    expect(f.state.sent).toBe(0)
  })
)
