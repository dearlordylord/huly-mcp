import type { AnyAttribute, Class, Doc, DocumentQuery, Ref, TxOperations } from "@hcengineering/core"
import { updateAttribute } from "@hcengineering/core"
import { Effect, Option, Schema } from "effect"

import {
  type PersonMergeReferenceCategory,
  type PersonMergeReferenceImpact,
  type PersonMergeReferenceKind,
  PersonMergeReferenceImpactSchema
} from "../domain/schemas/person-merge.js"
import { DocId, NonEmptyString, ObjectClassName, type PersonId, SpaceId } from "../domain/schemas/shared.js"
import { type HulyConnectionError, HulyDataInvalidError, makeOperationConnectionError } from "./errors.js"
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

const ReferenceDocumentSchema = Schema.Struct({ _id: DocId, _class: ObjectClassName, space: SpaceId })
type ReferenceDocument = Schema.Schema.Type<typeof ReferenceDocumentSchema>

interface ParsedAttribute {
  // The raw SDK document is retained only for Huly's native updateAttribute API;
  // ReferenceAttribute is the schema-owned shape used for every decision.
  readonly raw: AnyAttribute
  readonly parsed: ReferenceAttribute
}

const invalidData = (operation: string, entity: string, cause?: unknown): HulyDataInvalidError =>
  new HulyDataInvalidError({ operation, entity, ...(cause === undefined ? {} : { cause }) })

const sdkEffect = <A>(operation: "inspectPersonReferences" | "migratePersonReferences", run: () => Promise<A>) =>
  Effect.tryPromise({ try: run, catch: (cause) => makeOperationConnectionError(operation, cause) })

const parseAttributes = (
  attributes: ReadonlyArray<AnyAttribute>
): Effect.Effect<ReadonlyArray<ParsedAttribute>, HulyDataInvalidError> =>
  Effect.forEach(attributes, (raw) =>
    Schema.decodeUnknownEffect(ReferenceAttributeSchema)(raw).pipe(
      Effect.map((parsed) => ({ raw, parsed })),
      Effect.mapError((cause) => invalidData("inspectPersonReferences", "model Attribute", cause))
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
    sdkEffect("inspectPersonReferences", () =>
      client.findAll(concreteClass, exactPersonReferenceQuery(concreteClass, attribute.parsed.name, source), {
        limit: 1,
        total: true
      })
    ).pipe(
      Effect.flatMap((documents) => {
        if (documents.total < 0) {
          return Effect.fail(
            invalidData("inspectPersonReferences", `${String(concreteClass)}.${attribute.parsed.name} total`)
          )
        }
        if (documents.total === 0) return Effect.succeed(undefined)
        return Schema.decodeUnknownEffect(PersonMergeReferenceImpactSchema)({
          attributeId: attribute.parsed._id,
          ownerClass: attribute.parsed.attributeOf,
          concreteClass: String(concreteClass),
          field: attribute.parsed.name,
          kind: descriptor.kind,
          category: referenceCategory(client, concreteClass),
          count: documents.total
        }).pipe(Effect.mapError((cause) => invalidData("inspectPersonReferences", "reference impact", cause)))
      })
    )
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

const parseReferenceDocument = (
  input: unknown,
  impact: PersonMergeReferenceImpact
): Effect.Effect<ReferenceDocument, HulyDataInvalidError> =>
  Schema.decodeUnknownEffect(ReferenceDocumentSchema)(input).pipe(
    Effect.mapError((cause) =>
      invalidData("migratePersonReferences", `${impact.concreteClass}.${impact.field} document`, cause)
    )
  )

const replacementArray = (
  input: unknown,
  source: PersonId,
  survivor: PersonId
): Effect.Effect<ReadonlyArray<string>, HulyDataInvalidError> =>
  Schema.decodeUnknownEffect(Schema.Array(NonEmptyString))(input).pipe(
    Effect.map((values) => [...new Set(values.map((value) => (value === source ? survivor : value)))]),
    Effect.mapError((cause) => invalidData("migratePersonReferences", "array person reference", cause))
  )

interface PreparedReferenceDocument {
  readonly raw: Doc
  readonly parsed: ReferenceDocument
}

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
): Effect.fn.Return<PreparedReferenceMigration, HulyConnectionError | HulyDataInvalidError> {
  const rawAttribute = attributes.get(impact.attributeId)
  if (rawAttribute === undefined) {
    return yield* invalidData("migratePersonReferences", `Attribute '${impact.attributeId}'`)
  }
  const concreteClass = toClassRef<Doc>(impact.concreteClass)
  const rawDocuments =
    impact.count === 0
      ? []
      : yield* sdkEffect("migratePersonReferences", () =>
          client.findAll(concreteClass, exactPersonReferenceQuery(concreteClass, impact.field, source), {
            limit: impact.count
          })
        )
  if (rawDocuments.length !== impact.count) {
    return yield* invalidData(
      "migratePersonReferences",
      `${impact.concreteClass}.${impact.field} cardinality changed after preflight`
    )
  }
  const documents = yield* Effect.forEach(rawDocuments, (raw) =>
    parseReferenceDocument(raw, impact).pipe(Effect.map((parsed) => ({ raw, parsed })))
  )
  if (new Set(documents.map(({ parsed }) => parsed._id)).size !== documents.length) {
    return yield* invalidData("migratePersonReferences", `${impact.concreteClass}.${impact.field} duplicate document`)
  }
  return { impact, attribute: rawAttribute, documents }
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
      prepared.impact.kind === "single"
        ? toRef<Doc>(survivor)
        : yield* replacementArray(Reflect.get(document.raw, prepared.impact.field), source, survivor)
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
): Effect.fn.Return<void, HulyConnectionError | HulyDataInvalidError> {
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
