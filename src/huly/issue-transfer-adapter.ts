import type { ActivityReference } from "@hcengineering/activity"
import type { Issue } from "@hcengineering/tracker"
import type { AttachedDoc, Doc, TxOperations } from "@hcengineering/core"
import type { TransferWrite, TransferSupportedRecord } from "../domain/schemas/issue-transfer.js"
import { HulyTransactionScope, type HulyConditionalWriteResult } from "../domain/schemas/shared.js"
import { activity, tracker } from "./huly-plugins.js"
import { toClassRef, toCorePersonId, toRef } from "./operations/sdk-boundary.js"
import { hulyQuery } from "./operations/query-helpers.js"
export { inspectTransferRecords } from "./issue-transfer-discovery.js"

export const commitTransfer = async (
  client: TxOperations,
  write: TransferWrite
): Promise<HulyConditionalWriteResult> => {
  const apply = client.apply(HulyTransactionScope.make(`issue-transfer:${write.issueId}`))
  apply.match(
    tracker.class.Issue,
    hulyQuery<Issue>({
      _id: toRef(write.issueId),
      space: toRef(write.sourceId),
      attachedTo: toRef(write.previousParent),
      modifiedOn: write.modifiedOn
    })
  )
  guardRecordClosure(apply, write)
  for (const record of write.records) {
    matchRecord(apply, record)
    await apply.updateDoc(
      toClassRef<AttachedDoc>(record._class),
      toRef(record.space),
      toRef<AttachedDoc>(record._id),
      { space: toRef(write.destinationId) },
      false,
      record.modifiedOn,
      toCorePersonId(record.modifiedBy)
    )
  }
  await apply.updateDoc(tracker.class.Issue, toRef(write.sourceId), toRef(write.issueId), {
    space: toRef(write.destinationId),
    attachedTo: toRef(write.parentId),
    number: write.number,
    identifier: write.identifier,
    rank: write.rank
  })
  if (String(write.previousParent) !== String(tracker.ids.NoParent))
    await apply.updateDoc(tracker.class.Issue, toRef(write.sourceId), toRef(write.previousParent), {
      $inc: { subIssues: -1 }
    })
  if (String(write.parentId) !== String(tracker.ids.NoParent))
    await apply.updateDoc(tracker.class.Issue, toRef(write.destinationId), toRef(write.parentId), {
      $inc: { subIssues: 1 }
    })
  return (await apply.commit()).result ? "applied" : "condition-not-met"
}

// Cooperative SDK conditions guard new records even when parent modifiedOn did not change.
const guardRecordClosure = (apply: ReturnType<TxOperations["apply"]>, write: TransferWrite) => {
  if (write.recordClasses === undefined) return
  const owners = [write.issueId, ...write.records.map((record) => record._id)].map((id) => toRef<Doc>(id))
  const known = write.records.map((record) => toRef<AttachedDoc>(record._id))
  for (const cls of write.recordClasses)
    apply.notMatch(
      toClassRef<AttachedDoc>(cls),
      hulyQuery<AttachedDoc>({
        attachedTo: { $in: owners },
        _id: { $nin: known },
        _class: { $ne: toClassRef<AttachedDoc>(String(activity.class.ActivityReference)) }
      })
    )
  apply.notMatch(
    activity.class.ActivityReference,
    hulyQuery<ActivityReference>({
      srcDocId: { $in: owners },
      _id: { $nin: write.records.map((record) => toRef<ActivityReference>(record._id)) }
    })
  )
}

const matchRecord = (apply: ReturnType<TxOperations["apply"]>, record: TransferSupportedRecord) => {
  if (record.kind === "owned" && record._class === String(activity.class.ActivityReference))
    apply.match(
      activity.class.ActivityReference,
      hulyQuery<ActivityReference>({
        _id: toRef<ActivityReference>(record._id),
        srcDocId: toRef<Doc>(record.ownerId),
        srcDocClass: toClassRef<Doc>(record.ownerClass)
      })
    )
  apply.match(
    toClassRef<AttachedDoc>(record._class),
    hulyQuery<AttachedDoc>({
      _id: toRef<AttachedDoc>(record._id),
      space: toRef(record.space),
      modifiedOn: record.modifiedOn,
      attachedTo: toRef(record.attachedTo),
      ...(record.attachedToClass === undefined ? {} : { attachedToClass: toClassRef<Doc>(record.attachedToClass) }),
      ...(record.collection === undefined ? {} : { collection: record.collection })
    })
  )
}
