import type { AttachedDoc } from "@hcengineering/core"
import { Effect, Schema } from "effect"
import {
  AutomaticHistoryClass,
  TransferHistorySchema,
  TransferRecordSchema,
  type TransferRecord
} from "../domain/schemas/issue-transfer.js"
import { DocId, ObjectClassName, Timestamp } from "../domain/schemas/shared.js"
import { HulyDataInvalidError } from "./errors-base.js"
import { activity, attachment, chunter, tags, tracker } from "./huly-plugins.js"

export const parseTransferBoundary = <A, R>(
  schema: Schema.ConstraintDecoder<A, R>,
  input: unknown
): Effect.Effect<A, HulyDataInvalidError, R> =>
  Schema.decodeUnknownEffect(schema)(input).pipe(Effect.mapError(recordInvalid))
const recordInvalid = (cause: unknown) =>
  new HulyDataInvalidError({ operation: "move_issue", entity: "owned collection", cause })
export const OwnershipSchema = Schema.Struct({
  _id: DocId,
  _class: ObjectClassName,
  attachedTo: DocId,
  attachedToClass: ObjectClassName,
  collection: Schema.String
})
export type RecordOwner = Pick<Schema.Schema.Type<typeof OwnershipSchema>, "_id" | "_class">
const ReferenceSchema = Schema.Struct({ srcDocId: DocId, srcDocClass: ObjectClassName, message: Schema.String })
const AttachmentPayload = Schema.Struct({
  name: Schema.String,
  file: DocId,
  size: Schema.Number,
  type: Schema.String,
  lastModified: Schema.Number
})
const TagPayload = Schema.Struct({ tag: DocId, title: Schema.String, color: Schema.Number })
const ReportPayload = Schema.Struct({
  employee: Schema.NullOr(DocId),
  date: Schema.NullOr(Timestamp),
  value: Schema.Number,
  description: Schema.String
})
const ThreadPayload = Schema.Struct({ message: Schema.String, objectId: DocId, objectClass: ObjectClassName })
const { attributeUpdates: _encodedUpdates, ...historyFields } = TransferHistorySchema.fields
const RawHistorySchema = Schema.Struct(historyFields)

// Audited exact runtime classes. A new subclass does not inherit an ownership promise.
const payloads = new Map<string, Schema.ConstraintDecoder<unknown>>([
  [String(attachment.class.Attachment), AttachmentPayload],
  [String(attachment.class.Embedding), AttachmentPayload],
  [String(attachment.class.Photo), AttachmentPayload],
  [String(tags.class.TagReference), TagPayload],
  [String(tracker.class.TimeSpendReport), ReportPayload],
  [String(chunter.class.ChatMessage), Schema.Struct({ message: Schema.String })],
  [String(chunter.class.ThreadMessage), ThreadPayload],
  [String(activity.class.Reaction), Schema.Struct({ emoji: Schema.String, createBy: Schema.String })],
  [String(activity.class.ActivityMessage), Schema.Struct({})],
  [String(activity.class.ActivityInfoMessage), Schema.Struct({ message: Schema.String, props: Schema.JsonObject })],
  [String(activity.class.ActivityReference), ReferenceSchema]
])
const encodeSnapshot = (input: unknown) =>
  Schema.encodeUnknownEffect(Schema.fromJsonString(Schema.Json))(input).pipe(Effect.mapError(recordInvalid))

export const parseTransferRecord = Effect.fn("transfer.parseRecord")(function* (
  row: AttachedDoc,
  owner: RecordOwner
): Effect.fn.Return<TransferRecord, HulyDataInvalidError> {
  const ownership = yield* parseTransferBoundary(OwnershipSchema, row)
  const { space: _space, ...content } = row
  const snapshot = yield* encodeSnapshot(content)
  const common = { ...row, snapshot }
  if (ownership._class === AutomaticHistoryClass) {
    const raw = yield* parseTransferBoundary(RawHistorySchema, row)
    const updates = Reflect.get(row, "attributeUpdates")
    const attributeUpdates = updates === undefined ? undefined : yield* encodeSnapshot(updates)
    const history = { ...raw, ...(attributeUpdates === undefined ? {} : { attributeUpdates }) }
    return yield* parseTransferBoundary(TransferRecordSchema, { ...common, kind: "history", history })
  }
  const payload = payloads.get(ownership._class)
  if (payload === undefined)
    return yield* parseTransferBoundary(TransferRecordSchema, { ...common, kind: "unsupported" })
  yield* parseTransferBoundary(payload, row)
  return yield* parseTransferBoundary(TransferRecordSchema, {
    ...common,
    kind: "owned",
    ownerId: owner._id,
    ownerClass: owner._class
  })
})

export const referenceOwner = Effect.fn("transfer.referenceOwner")(function* (
  row: AttachedDoc
): Effect.fn.Return<RecordOwner, HulyDataInvalidError> {
  const source = yield* parseTransferBoundary(ReferenceSchema, row)
  return { _id: source.srcDocId, _class: source.srcDocClass }
})
