import type { Doc, DocumentQuery } from "@hcengineering/core"
import { IssuePriority, type Issue } from "@hcengineering/tracker"
import { Effect, Schema } from "effect"
import { TransferInspectionSchema, type TransferWrite } from "../../src/domain/schemas/issue-transfer.js"
import { DocId, IssueId, ObjectClassName, Timestamp, NonEmptyString } from "../../src/domain/schemas/shared.js"
import { HulyClient, type HulyClientOperations } from "../../src/huly/client.js"
import { HulyAuthError } from "../../src/huly/errors-base.js"
import { activity, task, tracker } from "../../src/huly/huly-plugins.js"
import { sdkFixture, documentForTestClass } from "./huly-sdk.js"
import { initializeHierarchy, movementFixture, movementIssue, movementProject } from "./movement.js"

const CORRUPTED_HISTORY_TIMESTAMP = Timestamp.make(2)

export const transferFixture = () => {
  const source = { ...movementProject(), type: "type-1", private: false, archived: false, members: [] }
  const destination = {
    ...movementProject("project-2", "OTHER"),
    type: "type-1",
    private: false,
    archived: false,
    members: [],
    restricted: false
  }
  const workflow = { _id: "type-1", tasks: ["kind-1"], statuses: [{ _id: "status-1", taskType: "kind-1" }] }
  const kind = { _id: "kind-1", parent: "type-1", statuses: ["status-1"], kind: "both", allowedAsChildOf: ["kind-1"] }
  const old = movementIssue("old", { number: 1, rank: "0|hzzzzz:" })
  const root = movementIssue("root", {
    attachedTo: old._id,
    component: null,
    milestone: null,
    number: 2,
    rank: "0|hzzzzz:",
    relations: [{ _id: old._id, _class: tracker.class.Issue }],
    priority: IssuePriority.NoPriority,
    assignee: null,
    remainingTime: 0,
    reports: 0,
    createdOn: sdkFixture(0)
  })
  const parent = movementIssue("parent", {
    space: destination._id,
    identifier: "OTHER-parent",
    component: null,
    milestone: null,
    number: 1,
    rank: "0|hzzzzz:"
  })
  const existing = movementIssue("existing", {
    space: destination._id,
    identifier: "OTHER-existing",
    attachedTo: parent._id,
    number: 3,
    rank: "0|hzzzzz:"
  })
  const issues = [old, root, parent, existing]
  initializeHierarchy(issues)
  const fixture = movementFixture(issues, { projects: [sdkFixture(source), sdkFixture(destination)] })
  const records = [
    {
      _id: DocId.make("history-1"),
      _class: ObjectClassName.make(String(activity.class.DocUpdateMessage)),
      space: DocId.make(source._id),
      attachedTo: DocId.make(root._id),
      modifiedOn: Timestamp.make(0),
      modifiedBy: NonEmptyString.make("author"),
      history: {
        objectId: DocId.make(root._id),
        objectClass: ObjectClassName.make(String(tracker.class.Issue)),
        action: "create"
      },
      kind: "history"
    }
  ]
  const state = {
    sequence: 3,
    allocated: 0,
    sent: 0,
    failAllocation: false,
    invalidAllocation: false,
    refuseCommit: false,
    failCommit: false,
    failPostRead: false,
    ignoreCommit: false,
    corruptHistory: false,
    corruptHistoryPayload: false,
    corruptHistoryAuthor: false,
    corruptHistoryTime: false,
    corruptNumber: false,
    corruptContent: false,
    failOrdering: false,
    recordsBlockers: Array<string>(),
    inspected: 0
  }
  const unavailable = () => Effect.fail(new HulyAuthError({ message: "Injected authorization refusal" }))
  const findOne: HulyClientOperations["findOne"] = <T extends Doc>(cls: unknown, query: DocumentQuery<T>) => {
    if (state.failPostRead && state.sent > 0) return unavailable()
    const q = sdkFixture<Record<string, unknown>>(query)
    if (q.space !== undefined && state.failOrdering) return unavailable()
    const candidates: ReadonlyArray<Doc> =
      cls === task.class.TaskType
        ? [sdkFixture(kind)]
        : cls === task.class.ProjectType
          ? [sdkFixture(workflow)]
          : cls === tracker.class.Project
            ? [sdkFixture(source), sdkFixture(destination)]
            : issues
    const found = candidates.find((record) =>
      Object.entries(q).every(([key, value]) => Reflect.get(record, key) === value)
    )
    return Effect.succeed(documentForTestClass<T>(found))
  }
  const operations: Partial<HulyClientOperations> = {
    ...fixture.operations,
    findOne,
    inspectTransferRecords: () => {
      state.inspected++
      if (state.failPostRead && state.sent > 0) return unavailable()
      return Effect.succeed(
        Schema.decodeUnknownSync(TransferInspectionSchema)({
          discovery: "complete",
          records: records.map((record) => ({ ...record })),
          blockers: state.recordsBlockers,
          limitation: "Fixture inspects model-owned records; unsupported structure is not a complete inventory."
        })
      )
    },
    updateDoc: (_class, _space, _id, _ops, _retrieve) => {
      state.allocated++
      state.sequence++
      if (state.failAllocation) return unavailable()
      return Effect.succeed(state.invalidAllocation ? {} : { object: { sequence: state.sequence } })
    },
    commitTransfer: (write: TransferWrite) => {
      state.sent++
      if (state.refuseCommit) return Effect.succeed("condition-not-met")
      if (!state.ignoreCommit) {
        Object.assign(root, {
          space: write.destinationId,
          attachedTo: write.parentId,
          identifier: write.identifier,
          rank: write.rank,
          number: write.number
        })
        if (state.corruptNumber) root.number++
        if (state.corruptContent) root.description = sdkFixture("Changed content")
        if (!state.corruptHistory) for (const record of records) record.space = write.destinationId
        if (state.corruptHistoryPayload) for (const record of records) record.history.action = "remove"
        if (state.corruptHistoryAuthor)
          for (const record of records) record.modifiedBy = NonEmptyString.make("changed author")
        if (state.corruptHistoryTime) for (const record of records) record.modifiedOn = CORRUPTED_HISTORY_TIMESTAMP
        initializeHierarchy(issues)
      }
      if (state.failCommit) return unavailable()
      return Effect.succeed("applied")
    }
  }
  return {
    ...fixture,
    root,
    old,
    parent,
    source,
    destination,
    workflow,
    kind,
    records,
    state,
    operations,
    layer: HulyClient.testLayer(operations),
    input: { issue: IssueId.make(root._id), destination: { project: "OTHER", parent: parent._id } }
  }
}
export const appendTransferChild = (fixture: ReturnType<typeof transferFixture>, child: Issue) => {
  fixture.issues.push(child)
  initializeHierarchy(fixture.issues)
}
