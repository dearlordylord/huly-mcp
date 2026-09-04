import { createHash } from "node:crypto"

import type { AnyAttribute, Class, Doc, DocumentQuery, Ref, TxOperations } from "@hcengineering/core"
import { updateAttribute } from "@hcengineering/core"
import { Effect, Option, Schema } from "effect"

import {
  type PersonMergeReferenceCategory,
  type PersonMergeReferenceImpact,
  type PersonMergeReferenceKind,
  PersonMergeSnapshotDigest
} from "../domain/schemas/person-merge.js"
import {
  DocId,
  NonEmptyString,
  ObjectClassName,
  type PersonId,
  PositiveInteger,
  SpaceId
} from "../domain/schemas/shared.js"
import {
  type HulyConnectionError,
  HulyDataInvalidError,
  PersonMergeSnapshotStaleError,
  makeOperationConnectionError
} from "./errors.js"
import { attachment, chunter, contact, core } from "./huly-plugins.js"
import { toClassRef, toRef } from "./operations/sdk-boundary.js"

const ReferenceTypeSchema = Schema.Struct({
  _class: ObjectClassName,
  to: Schema.optionalKey(Schema.Unknown),
  of: Schema.optionalKey(Schema.Unknown)
})

const PersonReferenceTargetSchema = Schema.Struct({ _class: ObjectClassName, to: ObjectClassName })

const ReferenceAttributeSchema = Schema.Struct({
  _id: DocId,
  attributeOf: ObjectClassName,
  name: NonEmptyString,
  type: ReferenceTypeSchema
})
type ReferenceAttribute = Schema.Schema.Type<typeof ReferenceAttributeSchema>

const ReferenceDocumentSchema = Schema.Struct({
  _id: DocId,
  _class: ObjectClassName,
  space: SpaceId,
  attachedTo: Schema.optionalKey(NonEmptyString),
  attachedToClass: Schema.optionalKey(ObjectClassName),
  collection: Schema.optionalKey(NonEmptyString)
})
type ReferenceDocument = Schema.Schema.Type<typeof ReferenceDocumentSchema>

interface ParsedAttribute {
  // The raw SDK document is retained only for Huly's native updateAttribute API;
  // ReferenceAttribute is the schema-owned shape used for every decision.
  readonly raw: AnyAttribute
  readonly parsed: ReferenceAttribute
}

type ReferenceOperation = "inspectPersonReferences" | "migratePersonReferences"
const DOCUMENT_ID_BEFORE = -1
type PreparedReferenceDocument =
  | { readonly raw: Doc; readonly parsed: ReferenceDocument; readonly kind: "single"; readonly value: NonEmptyString }
  | {
      readonly raw: Doc
      readonly parsed: ReferenceDocument
      readonly kind: "array"
      readonly value: ReadonlyArray<NonEmptyString>
    }

interface ReferenceSnapshot {
  readonly documents: ReadonlyArray<PreparedReferenceDocument>
  readonly digest: PersonMergeSnapshotDigest
}

const invalidData = (operation: string, entity: string, cause?: unknown): HulyDataInvalidError =>
  new HulyDataInvalidError({ operation, entity, ...(cause === undefined ? {} : { cause }) })

const sdkEffect = <A>(operation: ReferenceOperation, run: () => Promise<A>) =>
  Effect.tryPromise({ try: run, catch: (cause) => makeOperationConnectionError(operation, cause) })

const decodeReferenceAttribute = Schema.decodeUnknownEffect(ReferenceAttributeSchema)

const parseReferenceAttribute = (
  input: unknown,
  operation: ReferenceOperation,
  entity: string
): Effect.Effect<ReferenceAttribute, HulyDataInvalidError> =>
  decodeReferenceAttribute(input).pipe(Effect.mapError((cause) => invalidData(operation, entity, cause)))

const parseAttributes = (
  attributes: ReadonlyArray<AnyAttribute>
): Effect.Effect<ReadonlyArray<ParsedAttribute>, HulyDataInvalidError> =>
  Effect.forEach(attributes, (raw) =>
    parseReferenceAttribute(raw, "inspectPersonReferences", "model Attribute").pipe(
      Effect.map((parsed) => ({ raw, parsed }))
    )
  )

interface ReferenceDescriptor {
  readonly kind: PersonMergeReferenceKind
  readonly target: ObjectClassName
}

const decodeReferenceTarget = Schema.decodeUnknownOption(PersonReferenceTargetSchema)

const referenceDescriptor = (attribute: ReferenceAttribute): ReferenceDescriptor | undefined => {
  const candidate =
    attribute.type._class === String(core.class.RefTo)
      ? decodeReferenceTarget(attribute.type)
      : attribute.type._class === String(core.class.ArrOf)
        ? decodeReferenceTarget(attribute.type.of)
        : Option.none()
  return Option.isNone(candidate)
    ? undefined
    : { kind: attribute.type._class === String(core.class.RefTo) ? "single" : "array", target: candidate.value.to }
}

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

const parseReferenceDocument = (
  input: unknown,
  concreteClass: ObjectClassName,
  field: NonEmptyString,
  operation: ReferenceOperation
): Effect.Effect<ReferenceDocument, HulyDataInvalidError> =>
  Schema.decodeUnknownEffect(ReferenceDocumentSchema)(input).pipe(
    Effect.mapError((cause) => invalidData(operation, `${concreteClass}.${field} document`, cause))
  )

const prepareReferenceDocument = Effect.fn("PersonReferenceMigration.prepareDocument")(function* (
  raw: Doc,
  kind: PersonMergeReferenceKind,
  concreteClass: ObjectClassName,
  field: NonEmptyString,
  operation: ReferenceOperation
): Effect.fn.Return<PreparedReferenceDocument, HulyDataInvalidError> {
  const parsed = yield* parseReferenceDocument(raw, concreteClass, field, operation)
  const valueInput = Reflect.get(raw, field)
  if (kind === "single") {
    const value = yield* Schema.decodeUnknownEffect(NonEmptyString)(valueInput).pipe(
      Effect.mapError((cause) => invalidData(operation, `${concreteClass}.${field} reference value`, cause))
    )
    return { raw, parsed, kind, value }
  }
  const value = yield* Schema.decodeUnknownEffect(Schema.Array(NonEmptyString))(valueInput).pipe(
    Effect.mapError((cause) => invalidData(operation, `${concreteClass}.${field} reference value`, cause))
  )
  return { raw, parsed, kind, value }
})

const snapshotDigest = (
  metadata: Readonly<Record<string, unknown>>,
  documents: ReadonlyArray<PreparedReferenceDocument>
): PersonMergeSnapshotDigest => {
  const entries = documents
    .map(({ parsed, value }) => ({ document: parsed, value }))
    // Duplicates are rejected before hashing, so a locale-independent binary
    // comparison is sufficient and stable across Node/ICU installations.
    .sort((left, right) => (left.document._id < right.document._id ? DOCUMENT_ID_BEFORE : 1))
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
  concreteClass: ObjectClassName,
  field: NonEmptyString,
  operation: ReferenceOperation
): Effect.fn.Return<ReferenceSnapshot, HulyDataInvalidError> {
  const documents = yield* Effect.forEach(rawDocuments, (raw) =>
    prepareReferenceDocument(raw, kind, concreteClass, field, operation)
  )
  if (new Set(documents.map(({ parsed }) => parsed._id)).size !== documents.length) {
    return yield* invalidData(operation, `${concreteClass}.${field} duplicate document`)
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
  source: PersonId,
  count: number,
  operation: ReferenceOperation
): Effect.fn.Return<ReferenceSnapshot, HulyConnectionError | HulyDataInvalidError> {
  const classRef = toClassRef<Doc>(concreteClass)
  const rawDocuments = yield* sdkEffect(operation, () =>
    client.findAll(classRef, exactPersonReferenceQuery(classRef, field, source), { limit: count, total: true })
  )
  if (rawDocuments.total !== count || rawDocuments.length !== count) {
    return yield* invalidData(operation, `${concreteClass}.${field} cardinality changed during snapshot`)
  }
  return yield* prepareReferenceSnapshot(rawDocuments, metadata, kind, concreteClass, field, operation)
})

const inspectAttribute = Effect.fn("PersonReferenceMigration.inspectAttribute")(function* (
  client: TxOperations,
  attribute: ParsedAttribute,
  source: PersonId
): Effect.fn.Return<ReadonlyArray<PersonMergeReferenceImpact>, HulyConnectionError | HulyDataInvalidError> {
  const descriptor = referenceDescriptor(attribute.parsed)
  if (attribute.parsed.name === "_id" || descriptor === undefined || !targetsPerson(client, descriptor.target)) {
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
        return yield* invalidData("inspectPersonReferences", `${String(concreteClass)}.${attribute.parsed.name} total`)
      }
      if (documents.total === 0) return undefined
      const concreteClassName = ObjectClassName.make(String(concreteClass))
      const metadata = referenceMetadata(attribute.parsed, concreteClassName, descriptor)
      const snapshot = yield* fetchReferenceSnapshot(
        client,
        metadata,
        concreteClassName,
        attribute.parsed.name,
        descriptor.kind,
        source,
        documents.total,
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
        count: PositiveInteger.make(documents.total),
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
  const parsed = yield* parseAttributes(attributes)
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
    const key = `${impact.concreteClass}\u0000${impact.field}\u0000${impact.kind}`
    const current = deduplicated.get(key)
    if (current === undefined || specificity(impact) > specificity(current)) deduplicated.set(key, impact)
  }
  return [...deduplicated.values()]
})

const replacementArray = (
  values: ReadonlyArray<NonEmptyString>,
  source: PersonId,
  survivor: PersonId
): ReadonlyArray<string> => [...new Set(values.map((value) => (value === source ? survivor : value)))]

interface PreparedReferenceMigration {
  readonly impact: PersonMergeReferenceImpact
  readonly attribute: AnyAttribute
  readonly documents: ReadonlyArray<PreparedReferenceDocument>
}

const loadImpactDocuments = Effect.fn("PersonReferenceMigration.loadImpactDocuments")(function* (
  client: TxOperations,
  attributes: ReadonlyMap<string, AnyAttribute>,
  impact: PersonMergeReferenceImpact,
  source: PersonId
): Effect.fn.Return<
  PreparedReferenceMigration,
  HulyConnectionError | HulyDataInvalidError | PersonMergeSnapshotStaleError
> {
  const rawAttribute = attributes.get(impact.attributeId)
  if (rawAttribute === undefined) {
    return yield* invalidData("migratePersonReferences", `Attribute '${impact.attributeId}'`)
  }
  const parsedAttribute = yield* parseReferenceAttribute(
    rawAttribute,
    "migratePersonReferences",
    `Attribute '${impact.attributeId}'`
  )
  const descriptor = referenceDescriptor(parsedAttribute)
  const metadata = referenceMetadata(parsedAttribute, impact.concreteClass, descriptor)
  const snapshot = yield* fetchReferenceSnapshot(
    client,
    metadata,
    impact.concreteClass,
    impact.field,
    impact.kind,
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
  return { impact, attribute: rawAttribute, documents: snapshot.documents }
})

const applyPreparedMigration = Effect.fn("PersonReferenceMigration.applyPrepared")(function* (
  client: TxOperations,
  prepared: PreparedReferenceMigration,
  source: PersonId,
  survivor: PersonId
): Effect.fn.Return<void, HulyConnectionError | HulyDataInvalidError> {
  const concreteClass = toClassRef<Doc>(prepared.impact.concreteClass)
  for (const document of prepared.documents) {
    const replacement =
      document.kind === "single" ? toRef<Doc>(survivor) : replacementArray(document.value, source, survivor)
    yield* sdkEffect("migratePersonReferences", () =>
      updateAttribute(
        client,
        document.raw,
        concreteClass,
        { key: prepared.impact.field, attr: prepared.attribute },
        replacement
      )
    )
  }
})

export const migrateNativePersonReferences = Effect.fn("PersonReferenceMigration.migrate")(function* (
  client: TxOperations,
  impacts: ReadonlyArray<PersonMergeReferenceImpact>,
  source: PersonId,
  survivor: PersonId
): Effect.fn.Return<void, HulyConnectionError | HulyDataInvalidError | PersonMergeSnapshotStaleError> {
  const rawAttributes = client.getModel().findAllSync<AnyAttribute>(core.class.Attribute, {})
  const attributes = new Map(rawAttributes.map((attribute) => [String(attribute._id), attribute]))
  // Resolve and parse the entire preflight snapshot before the first write. This
  // avoids relying on read-your-writes and prevents known cardinality drift from
  // producing a partial merge.
  const prepared = yield* Effect.forEach(impacts, (impact) => loadImpactDocuments(client, attributes, impact, source), {
    concurrency: 1
  })
  yield* Effect.forEach(prepared, (migration) => applyPreparedMigration(client, migration, source, survivor), {
    concurrency: 1,
    discard: true
  })
})
