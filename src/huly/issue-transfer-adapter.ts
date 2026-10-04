import type { Issue } from "@hcengineering/tracker"
import type { AttachedDoc, Doc, TxOperations } from "@hcengineering/core"
import { Effect, Schema } from "effect"
import {
  AutomaticHistoryClass,
  TransferHistorySchema,
  TransferInspectionSchema,
  type TransferInspection,
  type TransferRecord,
  TransferRecordSchema,
  type TransferWrite
} from "../domain/schemas/issue-transfer.js"
import { ObjectClassName, HulyTransactionScope, type HulyConditionalWriteResult } from "../domain/schemas/shared.js"
import type { HulyClientError } from "./client.js"
import { HulyDataInvalidError, makeOperationConnectionError } from "./errors-base.js"
import { core, tracker } from "./huly-plugins.js"
import { toClassRef, toCorePersonId, toRef } from "./operations/sdk-boundary.js"
import { hulyQuery } from "./operations/query-helpers.js"

const LIMIT = 10_001
const invalid = (cause: unknown) =>
  new HulyDataInvalidError({ operation: "move_issue", entity: "owned collection", cause })
const parseBoundary = <A, R>(
  schema: Schema.ConstraintDecoder<A, R>,
  input: unknown
): Effect.Effect<A, HulyDataInvalidError, R> => Schema.decodeUnknownEffect(schema)(input).pipe(Effect.mapError(invalid))
const CollectionTypeSchema = Schema.Struct({ of: ObjectClassName })

export const inspectTransferRecords = Effect.fn("transfer.inspectRecords")(function* (
  client: TxOperations,
  issueId: TransferWrite["issueId"]
): Effect.fn.Return<TransferInspection, HulyClientError | HulyDataInvalidError> {
  const hierarchy = client.getHierarchy()
  const attributes = hierarchy.getAllAttributes(tracker.class.Issue)
  const declared = yield* Effect.forEach(
    [...attributes.values()].filter((attribute) => hierarchy.isDerived(attribute.type._class, core.class.Collection)),
    (attribute) => parseBoundary(CollectionTypeSchema, attribute.type)
  )
  const classes = new Set([
    ...declared.map((collection) => toClassRef<AttachedDoc>(collection.of)),
    ...hierarchy.getDescendants(core.class.AttachedDoc).filter((cls) => hierarchy.findDomain(cls) !== undefined)
  ])
  const records = new Map<TransferRecord["_id"], TransferRecord>()
  const blockers: Array<string> = []
  const discovery = { incomplete: false }
  for (const cls of classes) {
    const rows = yield* Effect.tryPromise({
      try: () =>
        client.findAll<AttachedDoc>(
          toClassRef<AttachedDoc>(cls),
          hulyQuery<AttachedDoc>({ attachedTo: toRef<Doc>(issueId) }),
          { limit: LIMIT, total: true }
        ),
      catch: (cause) => makeOperationConnectionError("findAll", cause)
    })
    if (rows.total !== rows.length || rows.length >= LIMIT) {
      discovery.incomplete = true
      blockers.push(`Incomplete collection discovery for ${cls}.`)
    }
    for (const row of rows) {
      const parsed = yield* parseOwnedRecord(row)
      records.set(parsed._id, parsed)
      if (parsed.kind === "unsupported")
        blockers.push(`Unsupported owned record ${parsed._id} (${parsed._class}); only automatic history is supported.`)
    }
  }
  blockers.push(...(yield* inspectNestedHistory(client, classes, [...records.values()])))
  const inspection: TransferInspection = {
    discovery: discovery.incomplete ? "incomplete" : "complete",
    records: [...records.values()],
    blockers: [...new Set(blockers)],
    limitation:
      "Discovery covers model-declared collections and loaded model AttachedDoc classes; independent references are not ownership. Unsupported structure is not a complete conflict inventory."
  }
  return yield* parseBoundary(TransferInspectionSchema, inspection)
})

const { attributeUpdates: _encodedUpdates, ...historyFields } = TransferHistorySchema.fields
const RawHistorySchema = Schema.Struct(historyFields)
const parseHistoricalUpdates = (input: unknown): Effect.Effect<string | undefined, HulyDataInvalidError> => {
  if (input === undefined) return Effect.succeed(undefined)
  return Schema.encodeUnknownEffect(Schema.fromJsonString(Schema.Json))(input).pipe(Effect.mapError(invalid))
}
const parseOwnedRecord = Effect.fn("transfer.parseOwnedRecord")(function* (
  row: AttachedDoc
): Effect.fn.Return<TransferRecord, HulyDataInvalidError> {
  if (String(row._class) !== AutomaticHistoryClass)
    return yield* parseBoundary(TransferRecordSchema, { ...row, kind: "unsupported" })
  const raw = yield* parseBoundary(RawHistorySchema, row)
  const attributeUpdates = yield* parseHistoricalUpdates(Reflect.get(row, "attributeUpdates"))
  const history = { ...raw, ...(attributeUpdates === undefined ? {} : { attributeUpdates }) }
  return yield* parseBoundary(TransferRecordSchema, { ...row, kind: "history", history })
})

const inspectNestedHistory = Effect.fn("transfer.inspectNestedHistory")(function* (
  client: TxOperations,
  classes: ReadonlySet<ReturnType<typeof toClassRef<AttachedDoc>>>,
  observed: TransferInspection["records"]
): Effect.fn.Return<ReadonlyArray<TransferInspection["blockers"][number]>, HulyClientError> {
  const records = new Map(observed.map((record) => [record._id, record]))
  const blockers: Array<string> = []
  for (const record of [...records.values()].filter((record) => record.kind === "history")) {
    for (const cls of classes) {
      const nested = yield* Effect.tryPromise({
        try: () =>
          client.findAll<AttachedDoc>(
            toClassRef<AttachedDoc>(cls),
            hulyQuery<AttachedDoc>({ attachedTo: toRef<Doc>(record._id) }),
            { limit: 1, total: true }
          ),
        catch: (cause) => makeOperationConnectionError("findAll", cause)
      })
      if (nested.total < 0) blockers.push(`Incomplete nested ownership discovery on history ${record._id}.`)
      if (nested.length > 0 || nested.total > 0) blockers.push(`Unsupported nested records on history ${record._id}.`)
    }
  }
  return blockers
})

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
  for (const record of write.records) {
    apply.match(
      toClassRef<AttachedDoc>(record._class),
      hulyQuery<AttachedDoc>({
        _id: toRef<AttachedDoc>(record._id),
        space: toRef(record.space),
        modifiedOn: record.modifiedOn,
        attachedTo: toRef(record.attachedTo)
      })
    )
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
