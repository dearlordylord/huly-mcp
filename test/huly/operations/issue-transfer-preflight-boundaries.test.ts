import { it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { expect } from "vitest"
import { MovementIssueSchema, MovementProjectSchema } from "../../../src/domain/schemas/issue-movement-state.js"
import { parseMoveIssueParams } from "../../../src/domain/schemas/issue-movement.js"
import { HulyClient } from "../../../src/huly/client.js"
import { inspectTransferPlan } from "../../../src/huly/operations/issue-transfer-preflight.js"
import { task } from "../../../src/huly/huly-plugins.js"
import { DocId } from "../../../src/domain/schemas/shared.js"
import { transferFixture } from "../../helpers/transfer.js"
import { sdkFixture } from "../../helpers/huly-sdk.js"
import { assertExists } from "../../../src/utils/assertions.js"

const issueSnapshot = (input: unknown) => Schema.decodeUnknownSync(MovementIssueSchema)(input)
const projectSnapshot = (input: unknown) => Schema.decodeUnknownSync(MovementProjectSchema)(input)

const modes = [
  "archivedRestricted",
  "subtaskWithoutParent",
  "taskUnderParent",
  "disallowedParentKind",
  "wrongKindOwner",
  "statusWorkflowMismatch",
  "missingWorkflow",
  "missingKind",
  "malformedIdentity",
  "foreignHistory",
  "changedRoot",
  "brokenSourceAncestry",
  "brokenParentAncestry",
  "missingAdapter"
]
for (const mode of modes) {
  it.effect(`preflight refuses ${mode} without reserving a number`, () =>
    Effect.gen(function* () {
      const f = transferFixture()
      const root = issueSnapshot(f.root)
      const parent = mode === "subtaskWithoutParent" ? undefined : issueSnapshot(f.parent)
      if (mode === "archivedRestricted") {
        f.destination.archived = true
        f.destination.restricted = true
      }
      if (mode === "subtaskWithoutParent") f.kind.kind = "subtask"
      if (mode === "taskUnderParent") f.kind.kind = "task"
      if (mode === "disallowedParentKind") f.kind.allowedAsChildOf = []
      if (mode === "wrongKindOwner") f.kind.parent = "different-type"
      if (mode === "statusWorkflowMismatch") f.workflow.statuses = []
      if (mode === "malformedIdentity") f.root.rank = sdkFixture(null)
      if (mode === "foreignHistory") {
        const record = f.records[0]
        if (record !== undefined) record.space = DocId.make("foreign-project")
      }
      if (mode === "changedRoot") f.root.modifiedOn++
      if (mode === "brokenSourceAncestry") f.root.attachedTo = sdkFixture("missing-source-parent")
      if (mode === "brokenParentAncestry") f.parent.attachedTo = sdkFixture("missing-destination-parent")
      const originalFindOne = f.operations.findOne
      assertExists(originalFindOne)
      const { inspectTransferRecords: _inspect, ...withoutInspector } = f.operations
      const layer = HulyClient.testLayer({
        ...(mode === "missingAdapter" ? withoutInspector : f.operations),
        findOne: (cls, query, options) =>
          (mode === "missingWorkflow" && cls === task.class.ProjectType) ||
          (mode === "missingKind" && cls === task.class.TaskType)
            ? Effect.succeed(undefined)
            : originalFindOne(cls, query, options)
      })
      const client = yield* HulyClient.pipe(Effect.provide(layer))
      const inspected = yield* Effect.result(
        inspectTransferPlan(
          client,
          mode === "brokenSourceAncestry" ? issueSnapshot(f.root) : root,
          mode === "brokenParentAncestry" ? issueSnapshot(f.parent) : parent,
          projectSnapshot(f.source),
          projectSnapshot(f.destination),
          yield* parseMoveIssueParams(f.input)
        )
      )
      if (mode === "malformedIdentity") expect(inspected._tag).toBe("Failure")
      else {
        expect(inspected._tag).toBe("Success")
        if (inspected._tag === "Success") {
          expect("conflicts" in inspected.success).toBe(true)
          if ("conflicts" in inspected.success) expect(inspected.success.conflicts.length).toBeGreaterThan(0)
        }
      }
      expect(f.state.allocated).toBe(0)
      expect(f.state.sent).toBe(0)
    })
  )
}
