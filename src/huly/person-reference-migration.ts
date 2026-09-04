import { createHash } from "node:crypto"

import type { AnyAttribute, Class, Doc, DocumentQuery, Ref, TxOperations } from "@hcengineering/core"
import { updateAttribute } from "@hcengineering/core"
import { Effect, Schema } from "effect"

import {
  type PersonMergeReferenceCategory,
  type PersonMergeReferenceImpact,
  type PersonMergeReferenceKind,
  PersonMergeSnapshotDigest
} from "../domain/schemas/person-merge.js"
import { DocId, NonEmptyString, ObjectClassName, PersonId, PositiveInteger, SpaceId } from "../domain/schemas/shared.js"
import {
  type HulyConnectionError,
  type HulyDataInvalidError,
  PersonMergeSnapshotStaleError,
  makeOperationConnectionError
} from "./errors.js"
import { attachment, chunter, contact, core } from "./huly-plugins.js"
import { toClassRef, toRef } from "./operations/sdk-boundary.js"
import {
  type ParsedReferenceAttribute,
  type ReferenceAttribute,
  type ReferenceDescriptor,
  type ReferenceOperation,
  invalidReferenceData,
  parseReferenceAttribute,
  parseReferenceAttributes,
  referenceDescriptor
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

const sdkEffect = <A>(operation: ReferenceOperation, run: () => Promise<A>) =>
  Effect.tryPromise({ try: run, catch: (cause) => makeOperationConnectionError(operation, cause) })

const decodePositiveInteger = Schema.decodeUnknownEffect(PositiveInteger)
const decodeDocId = Schema.decodeUnknownEffect(DocId)

const targetsPerson = (client: TxOperations, target: ObjectClassName): boolean => {
  const hierarchy = client.getHierarchy()
  const targetClass = toClassRef<Doc>(target)
  const personClass = toClassRef<Doc>(String(contact.class.Person))
  const targetBase = hierarchy.getBaseClass(targetClass)
  return targetBase === personClass || hierarchy.getAncestors(personClass).includes(targetClass)
}

const referenceCategory = (client: TxOperations, concreteClass: Ref<Class<Doc>>): PersonMergeReferenceCategory => {
  const hierarchy = client.getHierarchy()
  if (hierarchy.isDerived(concreteClass, toClassRef<Doc>(String(contact.class.SocialIdentity)))) return "identity"
  if (hierarchy.isDerived(concreteClass, toClassRef<Doc>(String(contact.class.Channel)))) return "channel"
  if (hierarchy.isDerived(concreteClass, toClassRef<Doc>(String(contact.class.Member)))) return "membership"
  if (hierarchy.isDerived(concreteClass, toClassRef<Doc>(String(chunter.class.ChatMessage)))) return "comment"
  if (hierarchy.isDerived(concreteClass, toClassRef<Doc>(String(attachment.class.Attachment)))) return "attachment"
  return "other"
}

const candidateClasses = (client: TxOperations, ownerClass: ObjectClassName) => {
  const hierarchy = client.getHierarchy()
  return hierarchy
    .getDescendants(toClassRef<Doc>(ownerClass))
    .map((candidate) => toClassRef<Doc>(String(candidate)))
    .filter(
      (candidate) =>
        !hierarchy.isDerived(candidate, toClassRef<Doc>(String(core.class.Tx))) &&
        !hierarchy.isDerived(candidate, toClassRef<Doc>(String(core.class.BenchmarkDoc))) &&
        hierarchy.findDomain(candidate) !== undefined
    )
}

const personReferenceQuery = (field: NonEmptyString, source: PersonId): DocumentQuery<Doc> => ({
  // This key is intentionally dynamic: model Attribute metadata is the authority
  // for Huly's native person-reference migration, matching the first-party merge flow.
  [field]: toRef<Doc>(source)
})

const exactPersonReferenceQuery = (
  concreteClass: Ref<Class<Doc>>,
  field: NonEmptyString,
  source: PersonId
): DocumentQuery<Doc> => ({ ...personReferenceQuery(field, source), _class: concreteClass })

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

const referenceDocumentRouteKind = (
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

const prepareReferenceDocument = Effect.fn("PersonReferenceMigration.prepareDocument")(function* (
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

const prepareReferenceSnapshot = Effect.fn("PersonReferenceMigration.prepareSnapshot")(function* (
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

const referenceMetadata = (
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

const fetchReferenceSnapshot = Effect.fn("PersonReferenceMigration.fetchSnapshot")(function* (
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

const inspectAttribute = Effect.fn("PersonReferenceMigration.inspectAttribute")(function* (
  client: TxOperations,
  attribute: ParsedReferenceAttribute,
  source: PersonId
): Effect.fn.Return<ReadonlyArray<PersonMergeReferenceImpact>, HulyConnectionError | HulyDataInvalidError> {
  if (attribute.parsed.name === "_id") return []
  const descriptor = yield* referenceDescriptor(attribute.parsed, "inspectPersonReferences")
  if (descriptor === undefined || !targetsPerson(client, descriptor.target)) {
    return []
  }

  const impacts = yield* Effect.forEach(candidateClasses(client, attribute.parsed.attributeOf), (concreteClass) =>
    Effect.gen(function* () {
      const documents = yield* sdkEffect("inspectPersonReferences", () =>
        client.findAll(concreteClass, exactPersonReferenceQuery(concreteClass, attribute.parsed.name, source), {
          limit: 1,
          total: true
        })
      )
      if (documents.total < 0) {
        return yield* invalidReferenceData(
          "inspectPersonReferences",
          `${String(concreteClass)}.${attribute.parsed.name} total`
        )
      }
      if (documents.total === 0) return undefined
      const concreteClassName = ObjectClassName.make(String(concreteClass))
      const count = yield* decodePositiveInteger(documents.total).pipe(
        Effect.mapError((cause) =>
          invalidReferenceData("inspectPersonReferences", `${concreteClassName}.${attribute.parsed.name} total`, cause)
        )
      )
      const metadata = referenceMetadata(attribute.parsed, concreteClassName, descriptor)
      const routeKind = referenceDocumentRouteKind(client, attribute.parsed, concreteClassName)
      const snapshot = yield* fetchReferenceSnapshot(
        client,
        metadata,
        concreteClassName,
        attribute.parsed.name,
        descriptor.kind,
        routeKind,
        source,
        count,
        "inspectPersonReferences"
      )
      const impact: PersonMergeReferenceImpact = {
        attributeId: attribute.parsed._id,
        ownerClass: attribute.parsed.attributeOf,
        concreteClass: concreteClassName,
        targetClass: descriptor.target,
        field: attribute.parsed.name,
        kind: descriptor.kind,
        category: referenceCategory(client, concreteClass),
        count,
        snapshotDigest: snapshot.digest
      }
      return impact
    })
  )
  return impacts.filter((impact) => impact !== undefined)
})

export const inspectNativePersonReferences = Effect.fn("PersonReferenceMigration.inspect")(function* (
  client: TxOperations,
  source: PersonId
): Effect.fn.Return<ReadonlyArray<PersonMergeReferenceImpact>, HulyConnectionError | HulyDataInvalidError> {
  const attributes = client.getModel().findAllSync<AnyAttribute>(core.class.Attribute, {})
  const parsed = yield* parseReferenceAttributes(attributes)
  const impacts = (yield* Effect.forEach(parsed, (attribute) => inspectAttribute(client, attribute, source))).flat()
  const hierarchy = client.getHierarchy()
  const exactOwnerSpecificity = 2
  const specificity = (impact: PersonMergeReferenceImpact) =>
    impact.ownerClass === impact.concreteClass
      ? exactOwnerSpecificity
      : hierarchy.isMixin(toClassRef<Doc>(impact.ownerClass))
        ? 1
        : 0
  const deduplicated = new Map<string, PersonMergeReferenceImpact>()
  for (const impact of impacts) {
    const key = JSON.stringify([impact.concreteClass, impact.field, impact.kind])
    const current = deduplicated.get(key)
    if (current === undefined || specificity(impact) > specificity(current)) deduplicated.set(key, impact)
  }
  return [...deduplicated.values()]
})

const replacementArray = (
  values: ReadonlyArray<PersonId>,
  source: PersonId,
  survivor: PersonId
): ReadonlyArray<PersonId> => [...new Set(values.map((value) => (value === source ? survivor : value)))]

interface PreparedReferenceWrite {
  readonly concreteClass: ObjectClassName
  readonly field: NonEmptyString
  readonly attribute: AnyAttribute
  // Huly's native updateAttribute selects updateDoc, updateMixin, or
  // updateCollection from the original SDK document. The immutable parsed
  // route was validated before this plan was constructed; the raw document is
  // retained only as the native adapter input.
  readonly document: Doc
  readonly replacement: PersonId | ReadonlyArray<PersonId>
}

const loadImpactDocuments = Effect.fn("PersonReferenceMigration.loadImpactDocuments")(function* (
  client: TxOperations,
  attributes: ReadonlyMap<DocId, AnyAttribute>,
  impact: PersonMergeReferenceImpact,
  source: PersonId,
  survivor: PersonId
): Effect.fn.Return<
  ReadonlyArray<PreparedReferenceWrite>,
  HulyConnectionError | HulyDataInvalidError | PersonMergeSnapshotStaleError
> {
  const rawAttribute = attributes.get(impact.attributeId)
  if (rawAttribute === undefined) {
    return yield* invalidReferenceData("migratePersonReferences", `Attribute '${impact.attributeId}'`)
  }
  const parsedAttribute = yield* parseReferenceAttribute(
    rawAttribute,
    "migratePersonReferences",
    `Attribute '${impact.attributeId}'`
  )
  const descriptor = yield* referenceDescriptor(parsedAttribute, "migratePersonReferences")
  const metadata = referenceMetadata(parsedAttribute, impact.concreteClass, descriptor)
  const routeKind = referenceDocumentRouteKind(client, parsedAttribute, impact.concreteClass)
  const snapshot = yield* fetchReferenceSnapshot(
    client,
    metadata,
    impact.concreteClass,
    impact.field,
    impact.kind,
    routeKind,
    source,
    impact.count,
    "migratePersonReferences"
  )
  if (snapshot.digest !== impact.snapshotDigest) {
    return yield* new PersonMergeSnapshotStaleError({
      concreteClass: impact.concreteClass,
      field: impact.field,
      expected: impact.snapshotDigest,
      actual: snapshot.digest
    })
  }
  return snapshot.documents.map((document) => ({
    concreteClass: impact.concreteClass,
    field: impact.field,
    attribute: rawAttribute,
    document: document.raw,
    replacement: document.kind === "single" ? survivor : replacementArray(document.value, source, survivor)
  }))
})

const applyPreparedWrite = Effect.fn("PersonReferenceMigration.applyPreparedWrite")(function* (
  client: TxOperations,
  prepared: PreparedReferenceWrite
): Effect.fn.Return<void, HulyConnectionError | HulyDataInvalidError> {
  yield* sdkEffect("migratePersonReferences", () =>
    updateAttribute(
      client,
      prepared.document,
      toClassRef<Doc>(prepared.concreteClass),
      { key: prepared.field, attr: prepared.attribute },
      prepared.replacement
    )
  )
})

export const migrateNativePersonReferences = Effect.fn("PersonReferenceMigration.migrate")(function* (
  client: TxOperations,
  impacts: ReadonlyArray<PersonMergeReferenceImpact>,
  source: PersonId,
  survivor: PersonId
): Effect.fn.Return<void, HulyConnectionError | HulyDataInvalidError | PersonMergeSnapshotStaleError> {
  const rawAttributes = client.getModel().findAllSync<AnyAttribute>(core.class.Attribute, {})
  const attributeEntries = yield* Effect.forEach(rawAttributes, (attribute) =>
    decodeDocId(attribute._id).pipe(
      Effect.map((id): readonly [DocId, AnyAttribute] => [id, attribute]),
      Effect.mapError((cause) => invalidReferenceData("migratePersonReferences", "Attribute identifier", cause))
    )
  )
  const attributes: ReadonlyMap<DocId, AnyAttribute> = new Map(attributeEntries)
  // Resolve and parse the entire preflight snapshot before the first write. This
  // avoids relying on read-your-writes and prevents known cardinality drift from
  // producing a partial merge.
  const prepared = (yield* Effect.forEach(
    impacts,
    (impact) => loadImpactDocuments(client, attributes, impact, source, survivor),
    { concurrency: 1 }
  )).flat()
  yield* Effect.forEach(prepared, (write) => applyPreparedWrite(client, write), { concurrency: 1, discard: true })
})
