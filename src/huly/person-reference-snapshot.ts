import { createHash } from "node:crypto"

import type { Class, Doc, DocumentQuery, Ref, TxOperations } from "@hcengineering/core"
import { Effect, Schema } from "effect"

import { type PersonMergeReferenceKind, PersonMergeSnapshotDigest } from "../domain/schemas/person-merge.js"
import {
  DocId,
  NonEmptyString,
  ObjectClassName,
  PersonId,
  type PositiveInteger,
  SpaceId
} from "../domain/schemas/shared.js"
import { type HulyConnectionError, type HulyDataInvalidError, makeOperationConnectionError } from "./errors.js"
import { core } from "./huly-plugins.js"
import { toClassRef, toRef } from "./operations/sdk-boundary.js"
import {
  type ReferenceAttribute,
  type ReferenceDescriptor,
  type ReferenceOperation,
  invalidReferenceData
} from "./person-reference-metadata.js"

const ReferenceDocumentSchema = Schema.Struct({ _id: DocId, _class: ObjectClassName, space: SpaceId })
const AttachedReferenceDocumentSchema = Schema.Struct({
  _id: DocId,
  _class: ObjectClassName,
  space: SpaceId,
  attachedTo: DocId,
  attachedToClass: ObjectClassName,
  collection: NonEmptyString
})
const ReferenceDocumentRouteSchema = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("document"), document: ReferenceDocumentSchema }),
  Schema.Struct({ kind: Schema.Literal("attached"), document: AttachedReferenceDocumentSchema })
])
type ReferenceDocumentRoute = Schema.Schema.Type<typeof ReferenceDocumentRouteSchema>

const DOCUMENT_ID_BEFORE = -1
type PreparedReferenceDocument =
  | { readonly raw: Doc; readonly route: ReferenceDocumentRoute; readonly kind: "single"; readonly value: PersonId }
  | {
      readonly raw: Doc
      readonly route: ReferenceDocumentRoute
      readonly kind: "array"
      readonly value: ReadonlyArray<PersonId>
    }

interface ReferenceSnapshot {
  readonly documents: ReadonlyArray<PreparedReferenceDocument>
  readonly digest: PersonMergeSnapshotDigest
}

export const sdkEffect = <A>(operation: ReferenceOperation, run: () => Promise<A>) =>
  Effect.tryPromise({ try: run, catch: (cause) => makeOperationConnectionError(operation, cause) })

export const exactPersonReferenceQuery = (
  concreteClass: Ref<Class<Doc>>,
  field: NonEmptyString,
  source: PersonId
): DocumentQuery<Doc> => ({
  // The key comes from parsed model Attribute metadata, matching Huly's native
  // merge flow, so this dynamic query cannot use the static hulyQuery helper.
  [field]: toRef<Doc>(source),
  _class: concreteClass
})

const decodeReferenceDocumentRoute = Schema.decodeUnknownEffect(ReferenceDocumentRouteSchema)

const parseReferenceDocumentRoute = (
  input: unknown,
  kind: ReferenceDocumentRoute["kind"],
  concreteClass: ObjectClassName,
  field: NonEmptyString,
  operation: ReferenceOperation
): Effect.Effect<ReferenceDocumentRoute, HulyDataInvalidError> =>
  decodeReferenceDocumentRoute({ kind, document: input }).pipe(
    Effect.mapError((cause) => invalidReferenceData(operation, `${concreteClass}.${field} document`, cause))
  )

export const referenceDocumentRouteKind = (
  client: TxOperations,
  attribute: ReferenceAttribute,
  concreteClass: ObjectClassName
): ReferenceDocumentRoute["kind"] => {
  const hierarchy = client.getHierarchy()
  return !hierarchy.isMixin(toClassRef<Doc>(attribute.attributeOf)) &&
    hierarchy.isDerived(toClassRef<Doc>(concreteClass), toClassRef<Doc>(String(core.class.AttachedDoc)))
    ? "attached"
    : "document"
}

const prepareReferenceDocument = Effect.fn("PersonReferenceSnapshot.prepareDocument")(function* (
  raw: Doc,
  kind: PersonMergeReferenceKind,
  routeKind: ReferenceDocumentRoute["kind"],
  concreteClass: ObjectClassName,
  field: NonEmptyString,
  source: PersonId,
  operation: ReferenceOperation
): Effect.fn.Return<PreparedReferenceDocument, HulyDataInvalidError> {
  const route = yield* parseReferenceDocumentRoute(raw, routeKind, concreteClass, field, operation)
  if (route.document._class !== concreteClass) {
    return yield* invalidReferenceData(operation, `${concreteClass}.${field} document class correlation`)
  }
  const valueInput = Reflect.get(raw, field)
  if (kind === "single") {
    const value = yield* Schema.decodeUnknownEffect(PersonId)(valueInput).pipe(
      Effect.mapError((cause) => invalidReferenceData(operation, `${concreteClass}.${field} reference value`, cause))
    )
    if (value !== source) return yield* invalidReferenceData(operation, `${concreteClass}.${field} source correlation`)
    return { raw, route, kind, value }
  }
  const value = yield* Schema.decodeUnknownEffect(Schema.Array(PersonId))(valueInput).pipe(
    Effect.mapError((cause) => invalidReferenceData(operation, `${concreteClass}.${field} reference value`, cause))
  )
  if (!value.includes(source)) {
    return yield* invalidReferenceData(operation, `${concreteClass}.${field} source correlation`)
  }
  return { raw, route, kind, value }
})

const snapshotDigest = (
  metadata: Readonly<Record<string, unknown>>,
  documents: ReadonlyArray<PreparedReferenceDocument>
): PersonMergeSnapshotDigest => {
  const entries = documents
    .map(({ route, value }) => ({ route, value }))
    // Duplicates are rejected before hashing, so a locale-independent binary
    // comparison is sufficient and stable across Node/ICU installations.
    .sort((left, right) => (left.route.document._id < right.route.document._id ? DOCUMENT_ID_BEFORE : 1))
  return PersonMergeSnapshotDigest.make(
    createHash("sha256")
      .update(JSON.stringify({ metadata, documents: entries }))
      .digest("hex")
  )
}

export const prepareReferenceSnapshot = Effect.fn("PersonReferenceSnapshot.prepare")(function* (
  rawDocuments: ReadonlyArray<Doc>,
  metadata: Readonly<Record<string, unknown>>,
  kind: PersonMergeReferenceKind,
  routeKind: ReferenceDocumentRoute["kind"],
  concreteClass: ObjectClassName,
  field: NonEmptyString,
  source: PersonId,
  operation: ReferenceOperation
): Effect.fn.Return<ReferenceSnapshot, HulyDataInvalidError> {
  const documents = yield* Effect.forEach(rawDocuments, (raw) =>
    prepareReferenceDocument(raw, kind, routeKind, concreteClass, field, source, operation)
  )
  if (new Set(documents.map(({ route }) => route.document._id)).size !== documents.length) {
    return yield* invalidReferenceData(operation, `${concreteClass}.${field} duplicate document`)
  }
  return { documents, digest: snapshotDigest(metadata, documents) }
})

export const referenceMetadata = (
  attribute: ReferenceAttribute,
  concreteClass: ObjectClassName,
  descriptor: ReferenceDescriptor | undefined
): Readonly<Record<string, unknown>> => ({
  attributeId: attribute._id,
  ownerClass: attribute.attributeOf,
  concreteClass,
  field: attribute.name,
  kind: descriptor?.kind ?? null,
  targetClass: descriptor?.target ?? null
})

export const fetchReferenceSnapshot = Effect.fn("PersonReferenceSnapshot.fetch")(function* (
  client: TxOperations,
  metadata: Readonly<Record<string, unknown>>,
  concreteClass: ObjectClassName,
  field: NonEmptyString,
  kind: PersonMergeReferenceKind,
  routeKind: ReferenceDocumentRoute["kind"],
  source: PersonId,
  count: PositiveInteger,
  operation: ReferenceOperation
): Effect.fn.Return<ReferenceSnapshot, HulyConnectionError | HulyDataInvalidError> {
  const classRef = toClassRef<Doc>(concreteClass)
  const rawDocuments = yield* sdkEffect(operation, () =>
    client.findAll(classRef, exactPersonReferenceQuery(classRef, field, source), { limit: count, total: true })
  )
  if (rawDocuments.total !== count || rawDocuments.length !== count) {
    return yield* invalidReferenceData(operation, `${concreteClass}.${field} cardinality changed during snapshot`)
  }
  return yield* prepareReferenceSnapshot(
    rawDocuments,
    metadata,
    kind,
    routeKind,
    concreteClass,
    field,
    source,
    operation
  )
})
