import type { ActivityReference } from "@hcengineering/activity"
import type { Component, Issue, Milestone, Project } from "@hcengineering/tracker"
import type { AttachedDoc, Doc, DocumentUpdate, TxOperations } from "@hcengineering/core"
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
  await queueTransferTask(apply, write)
  await queueTransferRootCounts(apply, write)
  return (await apply.commit()).result ? "applied" : "condition-not-met"
}

export const queueTransferTask = async (
  apply: ReturnType<TxOperations["apply"]>,
  write: TransferWrite
): Promise<void> => {
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
  matchTransferAttributes(apply, write)
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
    rank: write.rank,
    ...attributeUpdates(write)
  })
}

export const queueTransferRootCounts = async (
  apply: ReturnType<TxOperations["apply"]>,
  write: TransferWrite
): Promise<void> => {
  if (String(write.previousParent) !== String(tracker.ids.NoParent))
    await apply.updateDoc(tracker.class.Issue, toRef(write.sourceId), toRef(write.previousParent), {
      $inc: { subIssues: -1 }
    })
  if (String(write.parentId) !== String(tracker.ids.NoParent))
    await apply.updateDoc(tracker.class.Issue, toRef(write.destinationId), toRef(write.parentId), {
      $inc: { subIssues: 1 }
    })
}

// Cooperative SDK conditions guard new records even when parent modifiedOn did not change.
const guardRecordClosure = (apply: ReturnType<TxOperations["apply"]>, write: TransferWrite) => {
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
      attachedToClass: toClassRef<Doc>(record.attachedToClass),
      collection: record.collection
    })
  )
}

const attributeUpdates = (write: TransferWrite) => {
  const updates: DocumentUpdate<Issue> = {}
  for (const change of write.attributeChanges ?? []) {
    if (change.field === "component") updates.component = change.to === null ? null : toRef(change.to)
    else updates.milestone = change.to === null ? null : toRef(change.to)
  }
  return updates
}

const matchTransferAttributes = (apply: ReturnType<TxOperations["apply"]>, write: TransferWrite) => {
  for (const change of write.attributeChanges ?? []) {
    apply.match(
      tracker.class.Issue,
      hulyQuery<Issue>({ _id: toRef(write.issueId), [change.field]: toRef(change.from) })
    )
    if (change.to === null) continue
    if (change.field === "component")
      apply.match(
        tracker.class.Component,
        hulyQuery<Component>({ _id: toRef<Component>(change.to), space: toRef<Project>(write.destinationId) })
      )
    else
      apply.match(
        tracker.class.Milestone,
        hulyQuery<Milestone>({ _id: toRef<Milestone>(change.to), space: toRef<Project>(write.destinationId) })
      )
  }
}
