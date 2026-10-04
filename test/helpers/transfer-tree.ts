import { Effect, Schema } from "effect"
import { TransferInspectionSchema } from "../../src/domain/schemas/issue-transfer.js"
import { HulyClient, type HulyClientOperations } from "../../src/huly/client.js"
import { HulyAuthError } from "../../src/huly/errors-base.js"
import { initializeHierarchy, movementIssue } from "./movement.js"
import { transferFixture } from "./transfer.js"

const parseInspection = (input: unknown) => Schema.decodeUnknownSync(TransferInspectionSchema)(input)

export const transferTreeFixture = () => {
  const f = transferFixture()
  const child = movementIssue("tree-child", {
    ...f.root,
    _id: movementIssue("tree-child")._id,
    identifier: movementIssue("tree-child").identifier,
    attachedTo: f.root._id,
    number: 3
  })
  const grandchild = movementIssue("tree-grandchild", {
    ...f.root,
    _id: movementIssue("tree-grandchild")._id,
    identifier: movementIssue("tree-grandchild").identifier,
    attachedTo: child._id,
    number: 4
  })
  f.issues.push(child, grandchild)
  initializeHierarchy(f.issues)
  const operations: Partial<HulyClientOperations> = {
    ...f.operations,
    inspectTransferRecords: (issueId) => {
      f.state.inspected++
      if (f.state.failPostRead && f.state.sent > 0)
        return Effect.fail(new HulyAuthError({ message: "Record read unavailable" }))
      return Effect.succeed(
        parseInspection({
          discovery: "complete",
          classes: [...new Set(f.records.map((record) => record._class))],
          records: f.records.filter((record) => record.attachedTo === issueId),
          blockers: f.state.recordsBlockers,
          limitation: "Deterministic independently owned task record closure."
        })
      )
    },
    commitTransferTree: (write) => {
      f.state.sent++
      if (f.state.refuseCommit) return Effect.succeed("condition-not-met")
      if (!f.state.ignoreCommit) {
        for (const task of write.tasks) {
          const issue = f.issues.find((candidate) => String(candidate._id) === task.issueId)
          if (issue === undefined) return Effect.succeed("condition-not-met")
          Object.assign(issue, {
            space: task.destinationId,
            attachedTo: task.parentId,
            identifier: task.identifier,
            number: task.number,
            rank: task.rank
          })
          for (const change of task.attributeChanges ?? []) Reflect.set(issue, change.field, change.to)
          for (const record of f.records.filter((candidate) => candidate.attachedTo === task.issueId))
            record.space = task.destinationId
        }
        initializeHierarchy(f.issues)
      }
      return f.state.failCommit
        ? Effect.fail(new HulyAuthError({ message: "Commit reply unavailable" }))
        : Effect.succeed("applied")
    }
  }
  return { ...f, child, grandchild, operations, layer: HulyClient.testLayer(operations) }
}
