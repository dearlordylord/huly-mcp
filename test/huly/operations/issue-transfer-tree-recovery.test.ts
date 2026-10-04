import { it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { expect } from "vitest"
import { MovementIssueSchema, MovementProjectSchema } from "../../../src/domain/schemas/issue-movement-state.js"
import {
  MovementExecutionEvidenceSchema,
  MovementVerificationEvidenceSchema
} from "../../../src/domain/schemas/issue-movement-uncertainty.js"
import { MoveIssueResultSchema } from "../../../src/domain/schemas/issues-results.js"
import { parseMoveIssueParams } from "../../../src/domain/schemas/issue-movement.js"
import { ListActivityParamsSchema } from "../../../src/domain/schemas/activity.js"
import { ListCommentsParamsSchema } from "../../../src/domain/schemas/comments.js"
import { ListAttachmentsParamsSchema } from "../../../src/domain/schemas/attachments.js"
import { GetTimeReportParamsSchema } from "../../../src/domain/schemas/time.js"
import { DocId } from "../../../src/domain/schemas/shared.js"
import { HulyClient } from "../../../src/huly/client.js"
import { inspectTransferPlan } from "../../../src/huly/operations/issue-transfer-preflight.js"
import { transferTreeFailure } from "../../../src/huly/operations/issue-transfer-tree-results.js"
import { transferTreeFixture } from "../../helpers/transfer-tree.js"
import { assertExists } from "../../../src/utils/assertions.js"

const parseIssue = (input: unknown) => Schema.decodeUnknownSync(MovementIssueSchema)(input)
const parseProject = (input: unknown) => Schema.decodeUnknownSync(MovementProjectSchema)(input)
const FailureEvidenceSchema = Schema.Struct({
  execution: MovementExecutionEvidenceSchema,
  verification: MovementVerificationEvidenceSchema
})
const parseEvidence = (input: unknown) => Schema.decodeUnknownSync(FailureEvidenceSchema)(input)
const parseResult = (input: unknown) => Schema.decodeUnknownSync(MoveIssueResultSchema)(input)

it.effect(
  "pure tree failure projections retain descendant record IDs, explicit evidence and published recovery calls",
  () =>
    Effect.gen(function* () {
      const f = transferTreeFixture()
      const history = assertExists(f.records[0])
      f.records.push({
        ...history,
        _id: DocId.make("child-history"),
        attachedTo: DocId.make(f.child._id),
        history: { ...history.history, objectId: DocId.make(f.child._id) }
      })
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
      expect("conflicts" in prepared).toBe(false)
      if ("conflicts" in prepared) return
      // Synthetic projection inputs only: no reservation, commit or verification is executed by this test.
      const refused = parseEvidence({
        execution: {
          phase: "commit",
          commit: "refused",
          reservations: [{ status: "confirmed", issueId: prepared.plan.root._id, number: 4 }]
        },
        verification: { status: "not-attempted" }
      })
      const uncertain = parseEvidence({
        execution: {
          phase: "allocation",
          commit: "not-sent",
          reservations: [{ status: "uncertain", issueId: prepared.plan.root._id }]
        },
        verification: { status: "not-attempted" }
      })
      const results = [
        transferTreeFailure(
          "incomplete",
          "Synthetic conditional refusal after reservation.",
          prepared,
          destination,
          refused
        ),
        transferTreeFailure(
          "indeterminate",
          "Synthetic uncertain allocation response.",
          prepared,
          destination,
          uncertain
        )
      ]
      for (const raw of results) {
        const result = parseResult(raw)
        expect(result).toMatchObject({ recordIds: [history._id, "child-history"] })
        expect(["incomplete", "indeterminate"]).toContain(result.outcome)
        if (result.outcome !== "incomplete" && result.outcome !== "indeterminate") return
        expect(result.execution).toEqual(result.outcome === "incomplete" ? refused.execution : uncertain.execution)
        expect(result.verification).toEqual({ status: "not-attempted" })
        const calls = [
          ...result.inspection.matchAll(
            /MCP (list_activity|list_comments|list_attachments|get_time_report) (\{[^}]+\})/g
          )
        ]
        expect(calls).toHaveLength(18)
        for (const call of calls) {
          const input: unknown = JSON.parse(assertExists(call[2]))
          switch (call[1]) {
            case "list_activity":
              Schema.decodeUnknownSync(ListActivityParamsSchema)(input)
              break
            case "list_comments":
              Schema.decodeUnknownSync(ListCommentsParamsSchema)(input)
              break
            case "list_attachments":
              Schema.decodeUnknownSync(ListAttachmentsParamsSchema)(input)
              break
            case "get_time_report":
              Schema.decodeUnknownSync(GetTimeReportParamsSchema)(input)
              break
          }
        }
      }
      expect(f.state.allocated).toBe(0)
      expect(f.state.sent).toBe(0)
    })
)
