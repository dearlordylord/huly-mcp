import type { AnyAttribute, Class, Doc, Ref, TxOperations } from "@hcengineering/core"
import { updateAttribute } from "@hcengineering/core"
import { Effect, Schema } from "effect"

import { type PersonMergeReferenceCategory, type PersonMergeReferenceImpact } from "../domain/schemas/person-merge.js"
import {
  DocId,
  type NonEmptyString,
  ObjectClassName,
  type PersonId,
  PositiveInteger
} from "../domain/schemas/shared.js"
import { type HulyConnectionError, type HulyDataInvalidError, PersonMergeSnapshotStaleError } from "./errors.js"
import { attachment, chunter, contact, core } from "./huly-plugins.js"
import { toClassRef } from "./operations/sdk-boundary.js"
import {
  type ParsedReferenceAttribute,
  type ReferenceDescriptor,
  invalidReferenceData,
  parseReferenceAttribute,
  parseReferenceAttributes,
  referenceDescriptor
} from "./person-reference-metadata.js"
import {
  exactPersonReferenceQuery,
  fetchReferenceSnapshot,
  prepareReferenceSnapshot,
  referenceDocumentRouteKind,
  referenceMetadata,
  sdkEffect
} from "./person-reference-snapshot.js"

const REFERENCE_DISCOVERY_CONCURRENCY = 8

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

interface ReferenceInspectionPlan {
  readonly attribute: ParsedReferenceAttribute
  readonly concreteClass: Ref<Class<Doc>>
  readonly descriptor: ReferenceDescriptor
}

const planAttributeInspection = Effect.fn("PersonReferenceMigration.planAttributeInspection")(function* (
  client: TxOperations,
  attribute: ParsedReferenceAttribute
): Effect.fn.Return<ReadonlyArray<ReferenceInspectionPlan>, HulyDataInvalidError> {
  if (attribute.parsed.name === "_id") return []
  const descriptor = yield* referenceDescriptor(attribute.parsed, "inspectPersonReferences")
  if (descriptor === undefined || !targetsPerson(client, descriptor.target)) return []
  return candidateClasses(client, attribute.parsed.attributeOf).map((concreteClass) => ({
    attribute,
    concreteClass,
    descriptor
  }))
})

const inspectReferencePlan = Effect.fn("PersonReferenceMigration.inspectReferencePlan")(function* (
  client: TxOperations,
  plan: ReferenceInspectionPlan,
  source: PersonId
): Effect.fn.Return<PersonMergeReferenceImpact | undefined, HulyConnectionError | HulyDataInvalidError> {
  const { attribute, concreteClass, descriptor } = plan
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
  const snapshot =
    documents.total === 1 && documents.length === 1
      ? yield* prepareReferenceSnapshot(
          documents,
          metadata,
          descriptor.kind,
          routeKind,
          concreteClassName,
          attribute.parsed.name,
          source,
          "inspectPersonReferences"
        )
      : yield* fetchReferenceSnapshot(
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
  return {
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
})

export const inspectNativePersonReferences = Effect.fn("PersonReferenceMigration.inspect")(function* (
  client: TxOperations,
  source: PersonId
): Effect.fn.Return<ReadonlyArray<PersonMergeReferenceImpact>, HulyConnectionError | HulyDataInvalidError> {
  const attributes = client.getModel().findAllSync<AnyAttribute>(core.class.Attribute, {})
  const parsed = yield* parseReferenceAttributes(attributes)
  const plans = (yield* Effect.forEach(parsed, (attribute) => planAttributeInspection(client, attribute))).flat()
  const impacts = (yield* Effect.forEach(plans, (plan) => inspectReferencePlan(client, plan, source), {
    concurrency: REFERENCE_DISCOVERY_CONCURRENCY
  })).filter((impact) => impact !== undefined)
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
