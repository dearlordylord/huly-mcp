import type { AttachedDoc } from "@hcengineering/core"
import { Effect, Schema } from "effect"
import {
  AutomaticHistoryClass,
  TransferHistorySchema,
  TransferRecordSchema,
  TransferOwnedClasses,
  type TransferRecord
} from "../domain/schemas/issue-transfer.js"
import { DocId, ObjectClassName, Timestamp } from "../domain/schemas/shared.js"
import { HulyDataInvalidError } from "./errors-base.js"

export const parseTransferBoundary = <A, R>(
  schema: Schema.ConstraintDecoder<A, R>,
  input: unknown
): Effect.Effect<A, HulyDataInvalidError, R> =>
  Schema.decodeUnknownEffect(schema)(input).pipe(Effect.mapError(recordInvalid))
const recordInvalid = (cause: unknown) =>
  new HulyDataInvalidError({ operation: "move_issue", entity: "owned collection", cause })
export const RecordOwnerSchema = Schema.Struct({ _id: DocId, _class: ObjectClassName })
export type RecordOwner = Schema.Schema.Type<typeof RecordOwnerSchema>
export const OwnershipSchema = Schema.Struct({
  ...RecordOwnerSchema.fields,
  attachedTo: DocId,
  attachedToClass: ObjectClassName,
  collection: Schema.String
})
const ReferenceSchema = Schema.Struct({ srcDocId: DocId, srcDocClass: ObjectClassName, message: Schema.String })
const AttachmentPayload = Schema.Struct({
  name: Schema.String,
  file: DocId,
  size: Schema.Number,
  type: Schema.String,
  lastModified: Timestamp
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
const SupportedPayloadSchema = Schema.Union([
  Schema.Struct({ _class: Schema.Literal(TransferOwnedClasses.Attachment), ...AttachmentPayload.fields }),
  Schema.Struct({ _class: Schema.Literal(TransferOwnedClasses.Embedding), ...AttachmentPayload.fields }),
  Schema.Struct({ _class: Schema.Literal(TransferOwnedClasses.Photo), ...AttachmentPayload.fields }),
  Schema.Struct({ _class: Schema.Literal(TransferOwnedClasses.TagReference), ...TagPayload.fields }),
  Schema.Struct({ _class: Schema.Literal(TransferOwnedClasses.TimeSpendReport), ...ReportPayload.fields }),
  Schema.Struct({ _class: Schema.Literal(TransferOwnedClasses.ChatMessage), message: Schema.String }),
  Schema.Struct({ _class: Schema.Literal(TransferOwnedClasses.ThreadMessage), ...ThreadPayload.fields }),
  Schema.Struct({
    _class: Schema.Literal(TransferOwnedClasses.Reaction),
    emoji: Schema.String,
    createBy: Schema.String
  }),
  Schema.Struct({ _class: Schema.Literal(TransferOwnedClasses.ActivityMessage) }),
  Schema.Struct({
    _class: Schema.Literal(TransferOwnedClasses.ActivityInfoMessage),
    message: Schema.String,
    props: Schema.JsonObject
  }),
  Schema.Struct({ _class: Schema.Literal(TransferOwnedClasses.ActivityReference), ...ReferenceSchema.fields })
])
const supportedClasses = new Set(SupportedPayloadSchema.members.map((payload) => payload.fields._class.literal))
const encodeSnapshot = (input: unknown) =>
  Schema.encodeUnknownEffect(Schema.fromJsonString(Schema.Json))(input).pipe(Effect.mapError(recordInvalid))

export const parseTransferRecord = Effect.fn("transfer.parseRecord")(function* (
  row: AttachedDoc,
  owner: RecordOwner
): Effect.fn.Return<TransferRecord, HulyDataInvalidError> {
  const document = yield* parseTransferBoundary(Schema.JsonObject, row)
  const ownership = yield* parseTransferBoundary(OwnershipSchema, document)
  const { space: _space, ...content } = document
  const common = { ...document, ...ownership }
  if (ownership._class === AutomaticHistoryClass) {
    const raw = yield* parseTransferBoundary(RawHistorySchema, document)
    const updates = document["attributeUpdates"]
    const attributeUpdates = updates === undefined ? undefined : yield* encodeSnapshot(updates)
    const history = { ...raw, ...(attributeUpdates === undefined ? {} : { attributeUpdates }) }
    const snapshot = yield* encodeSnapshot({ ...content, ...raw })
    return yield* parseTransferBoundary(TransferRecordSchema, { ...common, snapshot, kind: "history", history })
  }
  if (!supportedClasses.has(ownership._class))
    return yield* parseTransferBoundary(TransferRecordSchema, {
      ...common,
      snapshot: yield* encodeSnapshot(content),
      kind: "unsupported"
    })
  const parsedPayload = yield* parseTransferBoundary(SupportedPayloadSchema, document)
  return yield* parseTransferBoundary(TransferRecordSchema, {
    ...common,
    snapshot: yield* encodeSnapshot({ ...content, ...parsedPayload }),
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
