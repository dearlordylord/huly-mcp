import { it } from "@effect/vitest"
import { Effect, Deferred, Fiber, Schema } from "effect"
import { TestClock } from "effect/testing"
import { expect } from "vitest"
import { PositiveInteger, UNKNOWN_TOTAL } from "../../../src/domain/schemas/shared.js"
import { MovementUncertaintyEvidenceSchema } from "../../../src/domain/schemas/issue-movement-uncertainty.js"
import { MoveIssueResultSchema } from "../../../src/domain/schemas/issues-results.js"
import { parseMoveIssueParams } from "../../../src/domain/schemas/issue-movement.js"
import { parseGetIssueParams } from "../../../src/domain/schemas/issues.js"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import { movementFailureResult } from "../../../src/huly/operations/issue-movement-recovery.js"
import { moveIssue } from "../../../src/huly/operations/issue-movement.js"
import { getIssue } from "../../../src/huly/operations/issues-read.js"
import { TRANSFER_DISCOVERY_BUDGET } from "../../../src/huly/operations/issue-transfer-tree.js"
import { assertExists } from "../../../src/utils/assertions.js"
import { treePlanFixture } from "../../helpers/tree-plan.js"
import { transferTreeFixture } from "../../helpers/transfer-tree.js"
import { withDiagnostics } from "../../helpers/diagnostics.js"

const parseEvidence = (input: unknown) => Schema.decodeUnknownSync(MovementUncertaintyEvidenceSchema)(input)
const parseResult = (input: unknown) => Schema.decodeUnknownSync(MoveIssueResultSchema)(input)

it.effect(
  "pure failure projection with confirmed reservations preserves executable stable-ID reads across projects",
  () =>
    Effect.gen(function* () {
      const { destination, fixture, prepared } = treePlanFixture()
      // Synthetic projection input; the fixture performs only the published recovery reads.
      const initialSequence = fixture.state.sequence
      const evidence = parseEvidence({
        destination: { projectId: destination._id, parentId: prepared.plan.parent?._id ?? null },
        discovery: { status: "complete" },
        execution: {
          phase: "verification",
          commit: "acknowledged",
          reservations: prepared.plan.tree.map((issue, index) => ({
            status: "confirmed",
            issueId: issue._id,
            number: PositiveInteger.make(initialSequence + index + 1)
          }))
        },
        verification: {
          status: "observed",
          completeness: "complete",
          consistency: "inconsistent",
          reason: "Tasks are still in their source project after acknowledgement.",
          tasks: prepared.tasks.map(({ issue, protectedIssue }) => ({
            issueId: issue._id,
            projectId: issue.space,
            parentId: issue.attachedTo,
            identifier: issue.identifier,
            number: protectedIssue.number
          })),
          records: []
        }
      })
      const result = parseResult(
        movementFailureResult("incomplete", "Observed destination contradiction.", prepared.plan, destination, evidence)
      )
      expect(result).toMatchObject({ outcome: "incomplete", issueIds: prepared.plan.tree.map((issue) => issue._id) })
      if (result.outcome !== "incomplete" && result.outcome !== "indeterminate") return
      const calls = [...result.inspection.matchAll(/MCP get_issue (\{[^}]+\})/g)]
      expect(calls).toHaveLength(prepared.plan.tree.length)
      for (const call of calls) {
        const input: unknown = JSON.parse(assertExists(call[1]))
        const params = yield* parseGetIssueParams(input)
        const current = yield* getIssue(params).pipe(Effect.provide(fixture.layer), withDiagnostics)
        expect(current.issueId).toBe(params.identifier)
        expect(current.project).toBe(fixture.source.identifier)
      }
      expect(fixture.state.allocated).toBe(0)
      expect(fixture.state.sent).toBe(0)
    })
)

it.effect(
  "a lost commit reply followed by a project inventory outage remains indeterminate with all known task IDs",
  () =>
    Effect.gen(function* () {
      const f = transferTreeFixture()
      f.state.failCommit = true
      const original = assertExists(f.operations.findAll)
      const findAll: HulyClientOperations["findAll"] = (cls, query, options) =>
        original(cls, query, options).pipe(
          Effect.map((rows) => {
            if (f.state.sent > 0 && query.space !== undefined) rows.total = UNKNOWN_TOTAL
            return rows
          })
        )
      const result = yield* parseMoveIssueParams(f.input).pipe(
        Effect.flatMap(moveIssue),
        Effect.provide(HulyClient.testLayer({ ...f.operations, findAll }))
      )
      expect(result).toMatchObject({
        outcome: "indeterminate",
        issueIds: [f.root._id, f.child._id, f.grandchild._id],
        verification: { status: "unavailable" },
        execution: { phase: "commit", commit: "reply-lost" }
      })
      expect(f.state.allocated).toBe(3)
      expect(f.state.sent).toBe(1)
    })
)

it.effect("a lost commit reply and stalled verification reach the bounded recovery deadline without resending", () =>
  Effect.gen(function* () {
    const f = transferTreeFixture()
    f.state.failCommit = true
    const reached = yield* Deferred.make<void>()
    const original = assertExists(f.operations.findAll)
    const findAll: HulyClientOperations["findAll"] = (cls, query, options) =>
      f.state.sent > 0
        ? Deferred.succeed(reached, undefined).pipe(Effect.andThen(Effect.never))
        : original(cls, query, options)
    const fiber = yield* parseMoveIssueParams(f.input).pipe(
      Effect.flatMap(moveIssue),
      Effect.provide(HulyClient.testLayer({ ...f.operations, findAll })),
      Effect.forkChild
    )
    yield* Deferred.await(reached)
    yield* TestClock.adjust(TRANSFER_DISCOVERY_BUDGET)
    expect(yield* Fiber.join(fiber)).toMatchObject({
      outcome: "indeterminate",
      verification: { status: "unavailable" },
      execution: { phase: "commit", commit: "reply-lost" }
    })
    expect(f.state.allocated).toBe(3)
    expect(f.state.sent).toBe(1)
  })
)
