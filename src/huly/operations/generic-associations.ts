/* eslint-disable max-lines -- generic association discovery, relation lookup, and guarded mutation entrypoints are kept together to preserve one feature boundary */
import type { Card as HulyCard, CardSpace as HulyCardSpace } from "@hcengineering/card"
import type {
  Association as HulyAssociation,
  Class,
  Doc,
  Ref,
  Relation as HulyRelation,
  Space
} from "@hcengineering/core"
import { SortingOrder } from "@hcengineering/core"
import type { Document as HulyDocument } from "@hcengineering/document"
import { Effect } from "effect"

import type {
  AssociationSummary,
  Cardinality,
  CreateAssociationParams,
  CreateAssociationResult,
  CreateRelationParams,
  CreateRelationResult,
  DeleteAssociationParams,
  DeleteAssociationResult,
  DeleteRelationParams,
  DeleteRelationResult,
  GenericObjectLocator,
  ListAssociationsParams,
  ListAssociationsResult,
  ListRelationsParams,
  ListRelationsResult,
  ListRelationsWarning as ListRelationsWarningType,
  RelationDirection,
  RelationEndpointField,
  RelationSummary,
  ResolvedObjectSummary
} from "../../domain/schemas/generic-associations.js"
import {
  AssociationName,
  DEFAULT_ASSOCIATION_AUTOMATION_ONLY,
  DEFAULT_INCLUDE_SYSTEM_ASSOCIATIONS,
  DefaultRelationDirection,
  ListRelationsWarning
} from "../../domain/schemas/generic-associations.js"
import {
  type AssociationId,
  type CardIdentifier,
  type CardSpaceIdentifier,
  Count,
  DocId,
  type ListTotal,
  MAX_LIMIT,
  NonEmptyString,
  ObjectClassName,
  RelationId,
  Timestamp,
  UNKNOWN_TOTAL
} from "../../domain/schemas/shared.js"
import { assertAt, isPair, isSingle } from "../../utils/assertions.js"
import { HulyClient, type HulyClientError, type HulyClientOperations } from "../client.js"
import type {
  DocumentNotFoundError,
  HulyDataInvalidError,
  IssueNotFoundError,
  ProjectNotFoundError,
  RelationNotFoundError,
  TeamspaceNotFoundError
} from "../errors.js"
import type { FunnelIdentifierAmbiguousError, FunnelNotFoundError, LeadNotFoundError } from "../errors-leads.js"
import type { HulyModelMetadataError } from "../errors-base.js"
import {
  AssociationConflictError,
  AssociationIdentifierAmbiguousError,
  AssociationInUseError,
  AssociationNotFoundError,
  AssociationSystemClassUnsupportedError,
  GenericObjectIdentifierAmbiguousError,
  GenericObjectLocatorInvalidError,
  GenericObjectNotFoundError,
  RelationCardinalityViolationError,
  RelationDirectionAmbiguousError,
  RelationEndpointClassMismatchError,
  RelationIdentifierAmbiguousError,
  RelationMutationUnsupportedError
} from "../errors.js"
import { cardPlugin, core, documentPlugin, tracker } from "../huly-plugins.js"
import {
  type HulyAssociationMetadata,
  type HulyRelationMetadata,
  parseHulyAssociation,
  parseHulyAssociationMetadata,
  parseHulyCreatedRelationId,
  parseHulyObjectMetadata,
  type ParsedHulyMetadata,
  parseHulyRelation,
  parseHulyRelationMetadata
} from "../model-metadata.js"
import { listTotal } from "./counts.js"
import { findTeamspaceAndDocument } from "./documents.js"
import { findIssueInProject, findProject, findProjectAndIssue } from "./issues-shared.js"
import { resolveFunnel } from "./funnels-shared.js"
import { findLead } from "./leads-mutations-shared.js"
import { clampLimit, hulyQuery, type StrictDocumentQuery } from "./query-helpers.js"
import { toClassRef, toRef } from "./sdk-boundary.js"

const EXACT_RELATION_MATCH_LIMIT = 2

type GenericAssociationsError =
  | HulyClientError
  | AssociationNotFoundError
  | AssociationIdentifierAmbiguousError
  | AssociationSystemClassUnsupportedError
  | AssociationConflictError
  | AssociationInUseError
  | ProjectNotFoundError
  | TeamspaceNotFoundError
  | DocumentNotFoundError
  | RelationMutationUnsupportedError
  | RelationCardinalityViolationError
  | RelationDirectionAmbiguousError
  | RelationIdentifierAmbiguousError
  | RelationNotFoundError
  | RelationEndpointClassMismatchError
  | GenericObjectIdentifierAmbiguousError
  | GenericObjectLocatorInvalidError
  | GenericObjectNotFoundError
  | IssueNotFoundError
  | FunnelNotFoundError
  | FunnelIdentifierAmbiguousError
  | LeadNotFoundError
  | HulyDataInvalidError
  | HulyModelMetadataError

type AssociationCandidate = {
  readonly id: AssociationId
  readonly name?: AssociationName | undefined
  readonly sourceClass?: ObjectClassName | undefined
  readonly targetClass?: ObjectClassName | undefined
}

type AssociationFilters = {
  readonly includeSystem: boolean
  readonly sourceClass: ObjectClassName | undefined
  readonly targetClass: ObjectClassName | undefined
}

type AssociationListFilters = AssociationFilters & { readonly writableOnly: boolean }

type ParsedAssociation = ParsedHulyMetadata<HulyAssociation, HulyAssociationMetadata>
type ParsedRelation = ParsedHulyMetadata<HulyRelation, HulyRelationMetadata>

type RelationAssociationPair = { readonly relation: ParsedRelation; readonly association: ParsedAssociation }

type AssociationForSummary = Pick<HulyAssociation, "_id" | "classA" | "classB" | "nameA" | "nameB" | "type"> & {
  readonly automationOnly?: boolean
}

type AssociationDataWithAutomation = {
  readonly classA: Ref<Class<Doc>>
  readonly classB: Ref<Class<Doc>>
  readonly nameA: string
  readonly nameB: string
  readonly type: HulyAssociation["type"]
  readonly automationOnly: boolean
}

type ResolvedRelationWriteEndpoints = {
  readonly docA: ResolvedObjectSummary
  readonly docB: ResolvedObjectSummary
  readonly source: ResolvedObjectSummary
  readonly target: ResolvedObjectSummary
}

type AssociationDiscoveryResult = { readonly associations: Array<ParsedAssociation>; readonly limitReached: boolean }

type ListRelationsWarnings = readonly [ListRelationsWarningType, ...Array<ListRelationsWarningType>]

// Broad association scans use this local guardrail, not an SDK page size. Keep it at the public max result cap.
const ASSOCIATION_DISCOVERY_LIMIT = 200
const ASSOCIATION_DISCOVERY_LIMIT_WARNING: ListRelationsWarningType = ListRelationsWarning.make(
  `Association discovery reached the local ${ASSOCIATION_DISCOVERY_LIMIT}-association cap for at least one endpoint orientation. Huly did not indicate whether more matching associations exist, so list_relations may omit older matching associations; pass a specific association from list_associations to avoid this discovery cap.`
)
const ASSOCIATION_LOOKUP_AMBIGUITY_LIMIT = 2

const MUTATION_ASSOCIATION_FILTERS: AssociationFilters = {
  includeSystem: true,
  sourceClass: undefined,
  targetClass: undefined
}

const VISIBLE_ASSOCIATION_FILTERS: AssociationFilters = {
  includeSystem: false,
  sourceClass: undefined,
  targetClass: undefined
}

const associationName = (metadata: HulyAssociationMetadata): AssociationName | undefined =>
  metadata.sourceRole === metadata.targetRole
    ? AssociationName.make(metadata.sourceRole)
    : AssociationName.make(`${metadata.sourceRole} -> ${metadata.targetRole}`)

const classLabelEntry = (classRef: Ref<Class<Doc>>, label: string): readonly [ObjectClassName, NonEmptyString] => [
  ObjectClassName.make(classRef),
  NonEmptyString.make(label)
]

const KNOWN_CLASS_LABELS: ReadonlyMap<ObjectClassName, NonEmptyString> = new Map([
  classLabelEntry(core.class.Doc, "Huly document"),
  classLabelEntry(core.class.AttachedDoc, "Huly attached document"),
  classLabelEntry(core.class.Relation, "Relation"),
  classLabelEntry(documentPlugin.class.Document, "Document"),
  classLabelEntry(documentPlugin.class.Teamspace, "Teamspace"),
  classLabelEntry(tracker.class.Project, "Project"),
  classLabelEntry(tracker.class.Issue, "Issue"),
  classLabelEntry(tracker.class.IssueTemplate, "Issue template"),
  classLabelEntry(tracker.class.Component, "Component"),
  classLabelEntry(tracker.class.Milestone, "Milestone")
])

const classLabel = (classRef: ObjectClassName): NonEmptyString | undefined => KNOWN_CLASS_LABELS.get(classRef)

const isSystemClassName = (className: string): boolean => className.startsWith("core:class:")

const isSystemAssociation = (metadata: HulyAssociationMetadata): boolean =>
  isSystemClassName(metadata.sourceClass) || isSystemClassName(metadata.targetClass)

const associationAutomationOnly = (metadata: HulyAssociationMetadata): boolean => metadata.automationOnly === true

const relationWriteUnsupportedReason = (metadata: HulyAssociationMetadata): string | undefined => {
  if (isSystemAssociation(metadata)) {
    return "association uses a core:class:* system class"
  }
  if (associationAutomationOnly(metadata)) {
    return "association is automation-only"
  }
  return undefined
}

const isRelationWritableAssociation = (metadata: HulyAssociationMetadata): boolean =>
  relationWriteUnsupportedReason(metadata) === undefined

const isSymmetric = (metadata: HulyAssociationMetadata): boolean =>
  metadata.sourceClass === metadata.targetClass && metadata.sourceRole === metadata.targetRole

const ASSOCIATION_CARDINALITY = { "1:1": "one-to-one", "1:N": "one-to-many", "N:N": "many-to-many" } satisfies Record<
  HulyAssociation["type"],
  Cardinality
>

type MappedCardinality = (typeof ASSOCIATION_CARDINALITY)[keyof typeof ASSOCIATION_CARDINALITY]
type ExactCardinalityMapping = [Cardinality] extends [MappedCardinality]
  ? [MappedCardinality] extends [Cardinality]
    ? true
    : never
  : never

const exactCardinalityMapping = <T extends true>(value: T): T => value
exactCardinalityMapping<ExactCardinalityMapping>(true)

const cardinality = (type: HulyAssociation["type"]): Cardinality => ASSOCIATION_CARDINALITY[type]

const SDK_CARDINALITY = { "one-to-one": "1:1", "one-to-many": "1:N", "many-to-many": "N:N" } satisfies Record<
  Cardinality,
  HulyAssociation["type"]
>

const associationSummary = (metadata: HulyAssociationMetadata): AssociationSummary => {
  const unsupportedReason = relationWriteUnsupportedReason(metadata)
  return {
    associationId: metadata.id,
    name: associationName(metadata),
    sourceClass: metadata.sourceClass,
    sourceClassLabel: classLabel(metadata.sourceClass),
    targetClass: metadata.targetClass,
    targetClassLabel: classLabel(metadata.targetClass),
    sourceRole: metadata.sourceRole,
    targetRole: metadata.targetRole,
    relationClass: ObjectClassName.make(core.class.Relation),
    cardinality: cardinality(metadata.cardinality),
    symmetric: isSymmetric(metadata),
    system: isSystemAssociation(metadata),
    canListRelations: true,
    canCreateRelation: unsupportedReason === undefined,
    canDeleteRelation: unsupportedReason === undefined,
    ...(unsupportedReason === undefined ? {} : { unsupportedReason })
  }
}

const toAssociationSummary = (
  association: AssociationForSummary
): Effect.Effect<AssociationSummary, HulyModelMetadataError> =>
  Effect.map(parseHulyAssociationMetadata(association), associationSummary)

const toCandidate = (association: ParsedAssociation): AssociationCandidate => {
  const { metadata } = association
  return {
    id: metadata.id,
    name: associationName(metadata),
    sourceClass: metadata.sourceClass,
    targetClass: metadata.targetClass
  }
}

const matchesAssociationIdentifier = (association: ParsedAssociation, identifier: string): boolean => {
  const normalized = identifier.trim().toLowerCase()
  const { metadata } = association
  return (
    metadata.id.toLowerCase() === normalized ||
    metadata.sourceRole.toLowerCase() === normalized ||
    metadata.targetRole.toLowerCase() === normalized ||
    associationName(metadata)?.toLowerCase() === normalized
  )
}

const associationFiltersFromParams = (
  params: Pick<ListAssociationsParams, "sourceClass" | "targetClass" | "includeSystem">
): AssociationFilters => ({
  includeSystem: params.includeSystem ?? DEFAULT_INCLUDE_SYSTEM_ASSOCIATIONS,
  sourceClass: params.sourceClass,
  targetClass: params.targetClass
})

const associationListFiltersFromParams = (params: ListAssociationsParams): AssociationListFilters => ({
  ...associationFiltersFromParams(params),
  writableOnly: params.writableOnly === true
})

const associationMatchesFilters = (association: ParsedAssociation, filters: AssociationFilters): boolean =>
  (filters.includeSystem || !isSystemAssociation(association.metadata)) &&
  (filters.sourceClass === undefined || association.metadata.sourceClass === filters.sourceClass) &&
  (filters.targetClass === undefined || association.metadata.targetClass === filters.targetClass)

const filterVisible = (
  associations: ReadonlyArray<ParsedAssociation>,
  filters: AssociationListFilters
): Array<ParsedAssociation> =>
  associations.filter(
    (association) =>
      associationMatchesFilters(association, filters) &&
      (!filters.writableOnly || isRelationWritableAssociation(association.metadata))
  )

const listAssociationDocs = (
  client: HulyClientOperations,
  params: ListAssociationsParams
): Effect.Effect<Array<ParsedAssociation>, HulyClientError | HulyModelMetadataError> => {
  const query: StrictDocumentQuery<HulyAssociation> = {}

  if (params.sourceClass !== undefined) {
    query.classA = toClassRef(params.sourceClass)
  }
  if (params.targetClass !== undefined) {
    query.classB = toClassRef(params.targetClass)
  }

  return Effect.flatMap(
    client.findAll<HulyAssociation>(core.class.Association, hulyQuery(query), {
      limit: clampLimit(params.limit),
      sort: { modifiedOn: SortingOrder.Descending }
    }),
    (result) => Effect.forEach(result, parseHulyAssociation)
  )
}

const associationClassFilterQuery = (
  filters: Pick<AssociationFilters, "sourceClass" | "targetClass">
): StrictDocumentQuery<HulyAssociation> => {
  const query: StrictDocumentQuery<HulyAssociation> = {}

  if (filters.sourceClass !== undefined) {
    query.classA = toClassRef(filters.sourceClass)
  }
  if (filters.targetClass !== undefined) {
    query.classB = toClassRef(filters.targetClass)
  }

  return query
}

const resolveAssociation = (
  client: HulyClientOperations,
  identifier: string,
  filters: AssociationFilters
): Effect.Effect<ParsedAssociation, GenericAssociationsError> =>
  Effect.gen(function* () {
    const exactId = yield* client.findOne<HulyAssociation>(
      core.class.Association,
      hulyQuery<HulyAssociation>({ _id: toRef<HulyAssociation>(identifier) })
    )
    if (exactId !== undefined) {
      const parsed = yield* parseHulyAssociation(exactId)
      if (!associationMatchesFilters(parsed, filters)) {
        return yield* new AssociationNotFoundError({ identifier })
      }
      return parsed
    }

    const nameCandidates = new Map<AssociationId, ParsedAssociation>()
    const addCandidates = (associations: ReadonlyArray<ParsedAssociation>): void => {
      for (const association of associations) {
        if (matchesAssociationIdentifier(association, identifier) && associationMatchesFilters(association, filters)) {
          nameCandidates.set(association.metadata.id, association)
        }
      }
    }

    const sourceRoleMatches = yield* client.findAll<HulyAssociation>(
      core.class.Association,
      hulyQuery<HulyAssociation>({ ...associationClassFilterQuery(filters), nameA: identifier }),
      { limit: ASSOCIATION_LOOKUP_AMBIGUITY_LIMIT }
    )
    addCandidates(yield* Effect.forEach(sourceRoleMatches, parseHulyAssociation))
    const targetRoleMatches = yield* client.findAll<HulyAssociation>(
      core.class.Association,
      hulyQuery<HulyAssociation>({ ...associationClassFilterQuery(filters), nameB: identifier }),
      { limit: ASSOCIATION_LOOKUP_AMBIGUITY_LIMIT }
    )
    addCandidates(yield* Effect.forEach(targetRoleMatches, parseHulyAssociation))

    const rolePair = identifier.split(" -> ")
    if (isPair(rolePair)) {
      const [nameA, nameB] = rolePair
      const rolePairMatches = yield* client.findAll<HulyAssociation>(
        core.class.Association,
        hulyQuery<HulyAssociation>({ ...associationClassFilterQuery(filters), nameA, nameB }),
        { limit: ASSOCIATION_LOOKUP_AMBIGUITY_LIMIT }
      )
      addCandidates(yield* Effect.forEach(rolePairMatches, parseHulyAssociation))
    }

    const candidates = [...nameCandidates.values()]

    if (candidates.length === 0) {
      return yield* new AssociationNotFoundError({ identifier })
    }
    if (candidates.length > 1) {
      return yield* new AssociationIdentifierAmbiguousError({ identifier, candidates: candidates.map(toCandidate) })
    }
    return assertAt(candidates, 0)
  })

const rejectSystemClass = (
  className: ObjectClassName,
  operation: "create_association" | "create_relation" | "delete_relation"
): Effect.Effect<void, AssociationSystemClassUnsupportedError> =>
  isSystemClassName(String(className))
    ? Effect.fail(new AssociationSystemClassUnsupportedError({ className, operation }))
    : Effect.void

const systemClassInAssociation = (metadata: HulyAssociationMetadata): ObjectClassName | undefined => {
  if (isSystemClassName(metadata.sourceClass)) {
    return metadata.sourceClass
  }
  if (isSystemClassName(metadata.targetClass)) {
    return metadata.targetClass
  }
  return undefined
}

const ensureRelationMutationSupported = (
  association: ParsedAssociation,
  operation: "create_relation" | "delete_relation"
): Effect.Effect<void, AssociationSystemClassUnsupportedError | RelationMutationUnsupportedError> => {
  const systemClass = systemClassInAssociation(association.metadata)
  if (systemClass !== undefined) {
    return Effect.fail(new AssociationSystemClassUnsupportedError({ className: systemClass, operation }))
  }
  if (associationAutomationOnly(association.metadata)) {
    return Effect.fail(
      new RelationMutationUnsupportedError({
        associationId: association.metadata.id,
        reason: "association is automation-only"
      })
    )
  }
  return Effect.void
}

const exactAssociationQuery = (
  params: Pick<CreateAssociationParams, "sourceClass" | "targetClass" | "sourceRole" | "targetRole">
): StrictDocumentQuery<HulyAssociation> => ({
  classA: toClassRef(params.sourceClass),
  classB: toClassRef(params.targetClass),
  nameA: params.sourceRole,
  nameB: params.targetRole
})

const createdAssociationSummaryInput = (
  id: Ref<HulyAssociation>,
  params: CreateAssociationParams
): AssociationForSummary => ({
  _id: id,
  classA: toClassRef(params.sourceClass),
  classB: toClassRef(params.targetClass),
  nameA: params.sourceRole,
  nameB: params.targetRole,
  type: SDK_CARDINALITY[params.cardinality],
  automationOnly: params.automationOnly ?? DEFAULT_ASSOCIATION_AUTOMATION_ONLY
})

export const createAssociation = (
  params: CreateAssociationParams
): Effect.Effect<CreateAssociationResult, GenericAssociationsError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    yield* rejectSystemClass(params.sourceClass, "create_association")
    yield* rejectSystemClass(params.targetClass, "create_association")

    const existing = yield* client.findOne<HulyAssociation>(
      core.class.Association,
      hulyQuery(exactAssociationQuery(params))
    )
    if (existing !== undefined) {
      const existingMetadata = yield* parseHulyAssociationMetadata(existing)
      if (params.ifExists === "fail") {
        return yield* new AssociationConflictError({
          associationId: existingMetadata.id,
          reason: "ifExists=fail was requested"
        })
      }
      if (cardinality(existingMetadata.cardinality) !== params.cardinality) {
        return yield* new AssociationConflictError({
          associationId: existingMetadata.id,
          reason: `existing cardinality is ${cardinality(existingMetadata.cardinality)}, requested ${params.cardinality}`
        })
      }
      if (
        associationAutomationOnly(existingMetadata) !== (params.automationOnly ?? DEFAULT_ASSOCIATION_AUTOMATION_ONLY)
      ) {
        return yield* new AssociationConflictError({
          associationId: existingMetadata.id,
          reason: `existing automationOnly is ${associationAutomationOnly(existingMetadata)}, requested ${
            params.automationOnly ?? DEFAULT_ASSOCIATION_AUTOMATION_ONLY
          }`
        })
      }
      return { association: associationSummary(existingMetadata), created: false, existing: true }
    }

    const attributes: AssociationDataWithAutomation = {
      classA: toClassRef(params.sourceClass),
      classB: toClassRef(params.targetClass),
      nameA: params.sourceRole,
      nameB: params.targetRole,
      type: SDK_CARDINALITY[params.cardinality],
      automationOnly: params.automationOnly ?? DEFAULT_ASSOCIATION_AUTOMATION_ONLY
    }
    const associationId = yield* client.createDoc<HulyAssociation>(
      core.class.Association,
      toRef<Space>(core.space.Model),
      attributes
    )

    return {
      association: yield* toAssociationSummary(createdAssociationSummaryInput(associationId, params)),
      created: true,
      existing: false
    }
  })

const ensureAssociationDeletionSupported = (
  association: ParsedAssociation
): Effect.Effect<void, AssociationSystemClassUnsupportedError> => {
  const systemClass = systemClassInAssociation(association.metadata)
  return systemClass === undefined
    ? Effect.void
    : Effect.fail(
        new AssociationSystemClassUnsupportedError({ className: systemClass, operation: "delete_association" })
      )
}

const countAssociationRelations = (
  client: HulyClientOperations,
  association: ParsedAssociation
): Effect.Effect<
  Readonly<{ total: ListTotal; hasRelations: boolean; sampleRelationIds: Array<RelationId> }>,
  HulyClientError | HulyModelMetadataError
> =>
  Effect.flatMap(
    client.findAll<HulyRelation>(
      core.class.Relation,
      hulyQuery<HulyRelation>({ association: toRef<HulyAssociation>(association.metadata.id) }),
      { limit: 5 }
    ),
    (relations) =>
      Effect.gen(function* () {
        const metadata = yield* Effect.forEach(relations, parseHulyRelationMetadata)
        const sdkTotal = listTotal(relations.total)
        return {
          total: sdkTotal === UNKNOWN_TOTAL ? UNKNOWN_TOTAL : Count.make(Math.max(sdkTotal, relations.length)),
          hasRelations: relations.total > 0 || relations.length > 0,
          sampleRelationIds: metadata.map((relation) => relation.id)
        }
      })
  )

export const deleteAssociation = (
  params: DeleteAssociationParams
): Effect.Effect<DeleteAssociationResult, GenericAssociationsError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const association = yield* resolveAssociation(client, params.association, MUTATION_ASSOCIATION_FILTERS).pipe(
      Effect.catchTag("AssociationNotFoundError", () => Effect.succeed(undefined))
    )

    if (association === undefined) {
      return { association: params.association, deleted: false, relationCount: Count.make(0), reason: "not_found" }
    }

    yield* ensureAssociationDeletionSupported(association)
    const relationUsage = yield* countAssociationRelations(client, association)
    if (relationUsage.hasRelations) {
      return yield* new AssociationInUseError({
        associationId: association.metadata.id,
        relationCount: relationUsage.total,
        sampleRelationIds: relationUsage.sampleRelationIds
      })
    }

    yield* client.removeDoc<HulyAssociation>(core.class.Association, association.doc.space, association.doc._id)
    return {
      association: params.association,
      associationId: association.metadata.id,
      deleted: true,
      relationCount: Count.make(0),
      reason: "deleted"
    }
  })

export const listAssociations = (
  params: ListAssociationsParams
): Effect.Effect<ListAssociationsResult, GenericAssociationsError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient

    if (params.association !== undefined) {
      const association = yield* resolveAssociation(client, params.association, associationFiltersFromParams(params))
      const summary = associationSummary(association.metadata)
      return {
        associations: params.writableOnly === true && !summary.canCreateRelation ? [] : [summary],
        total: listTotal(params.writableOnly === true && !summary.canCreateRelation ? 0 : 1)
      }
    }

    const associations = filterVisible(
      yield* listAssociationDocs(client, { ...params, limit: ASSOCIATION_DISCOVERY_LIMIT }),
      associationListFiltersFromParams(params)
    ).slice(0, clampLimit(params.limit))
    const summaries = associations.map((association) => associationSummary(association.metadata))

    return { associations: summaries, total: listTotal(summaries.length) }
  })

const displayFromDoc = (doc: Doc, fallback: DocId): NonEmptyString => {
  for (const field of ["identifier", "title", "name"]) {
    const value = Reflect.get(doc, field)
    if (typeof value === "string" && value.trim() !== "") {
      return NonEmptyString.make(value)
    }
  }
  return NonEmptyString.make(fallback)
}

const resolvedSummary = (
  doc: Doc,
  locatorKind: ResolvedObjectSummary["locatorKind"],
  warning?: string
): Effect.Effect<ResolvedObjectSummary, HulyModelMetadataError> =>
  Effect.map(parseHulyObjectMetadata(doc), (metadata) => ({
    id: metadata.id,
    class: metadata.class,
    display: displayFromDoc(doc, metadata.id),
    locatorKind,
    warning
  }))

const findRawDoc = (
  client: HulyClientOperations,
  id: string,
  className: string
): Effect.Effect<Doc | undefined, HulyClientError> =>
  client.findOne<Doc>(toClassRef(className), hulyQuery<Doc>({ _id: toRef<Doc>(id) }))

const chunkValues = <T>(values: ReadonlyArray<T>, size: number): Array<ReadonlyArray<T>> => {
  const chunks: Array<ReadonlyArray<T>> = []
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size))
  }
  return chunks
}

const uniqueValues = <T>(values: Iterable<T>): Array<T> => [...new Set(values)]

const findDocsByClass = (
  client: HulyClientOperations,
  className: Ref<Class<Doc>>,
  ids: ReadonlyArray<Ref<Doc>>
): Effect.Effect<Map<Ref<Doc>, Doc>, HulyClientError> => {
  /* v8 ignore start -- unreachable: relationsToSummaries only requests non-empty id sets per class */
  if (ids.length === 0) {
    return Effect.succeed(new Map())
  }
  /* v8 ignore stop */
  return Effect.gen(function* () {
    const docsById = new Map<Ref<Doc>, Doc>()
    for (const chunk of chunkValues(ids, MAX_LIMIT)) {
      const docs = yield* client.findAll<Doc>(className, hulyQuery<Doc>({ _id: { $in: [...chunk] } }), {
        limit: chunk.length
      })
      for (const doc of docs) {
        docsById.set(doc._id, doc)
      }
    }
    return docsById
  })
}

const validateExpectedClass = (
  summary: ResolvedObjectSummary,
  expectedClass: ObjectClassName | undefined,
  field: RelationEndpointField
): Effect.Effect<void, RelationEndpointClassMismatchError> => {
  if (expectedClass !== undefined && summary.class !== expectedClass) {
    return Effect.fail(new RelationEndpointClassMismatchError({ field, expectedClass, actualClass: summary.class }))
  }
  return Effect.void
}

const endpointMatchesAssociationClass = (
  summary: ResolvedObjectSummary | undefined,
  className: ObjectClassName
): boolean => summary === undefined || summary.class === className

const endpointAssociationClassError = (
  summary: ResolvedObjectSummary | undefined,
  sourceClass: ObjectClassName,
  targetClass: ObjectClassName,
  field: RelationEndpointField
): RelationEndpointClassMismatchError | undefined =>
  summary !== undefined && summary.class !== sourceClass && summary.class !== targetClass
    ? new RelationEndpointClassMismatchError({
        field,
        expectedClass: `${sourceClass} or ${targetClass}`,
        actualClass: summary.class
      })
    : undefined

const eitherEndpointClassesMatch = (
  source: ResolvedObjectSummary | undefined,
  target: ResolvedObjectSummary | undefined,
  sourceClass: ObjectClassName,
  targetClass: ObjectClassName
): boolean =>
  (endpointMatchesAssociationClass(source, sourceClass) && endpointMatchesAssociationClass(target, targetClass)) ||
  (endpointMatchesAssociationClass(source, targetClass) && endpointMatchesAssociationClass(target, sourceClass))

const fallbackEndpointClassError = (
  source: ResolvedObjectSummary | undefined,
  target: ResolvedObjectSummary | undefined,
  sourceClass: ObjectClassName,
  targetClass: ObjectClassName
): RelationEndpointClassMismatchError =>
  new RelationEndpointClassMismatchError({
    field: "target",
    expectedClass: source?.class === sourceClass ? targetClass : sourceClass,
    /* v8 ignore next -- this fallback is only reached with both endpoints defined. */
    actualClass: target === undefined ? "missing" : target.class
  })

const validateEitherEndpointClasses = (
  association: ParsedAssociation,
  source: ResolvedObjectSummary | undefined,
  target: ResolvedObjectSummary | undefined
): Effect.Effect<void, RelationEndpointClassMismatchError> => {
  const sourceClass = association.metadata.sourceClass
  const targetClass = association.metadata.targetClass
  if (eitherEndpointClassesMatch(source, target, sourceClass, targetClass)) return Effect.void

  const sourceError = endpointAssociationClassError(source, sourceClass, targetClass, "source")
  if (sourceError !== undefined) return Effect.fail(sourceError)
  const targetError = endpointAssociationClassError(target, sourceClass, targetClass, "target")
  if (targetError !== undefined) return Effect.fail(targetError)
  return Effect.fail(fallbackEndpointClassError(source, target, sourceClass, targetClass))
}

const resolveIssueLocator = (
  locator: Extract<GenericObjectLocator, { kind: "issue" }>,
  field: RelationEndpointField
): Effect.Effect<ResolvedObjectSummary, GenericAssociationsError, HulyClient> =>
  Effect.gen(function* () {
    if (locator.project !== undefined) {
      const { issue } = yield* findProjectAndIssue({ project: locator.project, identifier: locator.issue })
      /* v8 ignore next -- success path delegates to issues-tested findProjectAndIssue; modeling projects here is integration overlap */
      return yield* resolvedSummary(issue, "issue")
    }

    const match = String(locator.issue).match(/^([A-Z]+)-\d+$/i)
    if (match !== null) {
      const projectIdentifier = assertAt(match, 1)
      const { client, project } = yield* findProject(projectIdentifier.toUpperCase())
      const issue = yield* findIssueInProject(client, project, locator.issue)
      /* v8 ignore next -- success path delegates to issues-tested findProject/findIssueInProject */
      return yield* resolvedSummary(issue, "issue")
    }

    return yield* new GenericObjectLocatorInvalidError({
      field,
      reason: "issue locator without project must use a full project-prefixed identifier like HULY-123"
    })
  })

const resolveDocumentWithoutTeamspace = (
  client: HulyClientOperations,
  identifier: string,
  field: RelationEndpointField
): Effect.Effect<ResolvedObjectSummary, GenericAssociationsError> =>
  Effect.gen(function* () {
    const byId = yield* client.findOne<HulyDocument>(
      documentPlugin.class.Document,
      hulyQuery<HulyDocument>({ _id: toRef<HulyDocument>(identifier) })
    )
    if (byId !== undefined) {
      return yield* resolvedSummary(byId, "document")
    }

    const byTitle = yield* client.findAll<HulyDocument>(
      documentPlugin.class.Document,
      hulyQuery<HulyDocument>({ title: identifier }),
      { limit: 2 }
    )

    if (byTitle.length === 0) {
      return yield* new GenericObjectNotFoundError({ field, identifier, class: documentPlugin.class.Document })
    }
    if (byTitle.length > 1) {
      const candidates = yield* Effect.forEach(byTitle, (doc) =>
        Effect.map(parseHulyObjectMetadata(doc), (metadata) => ({
          id: metadata.id,
          class: metadata.class,
          display: doc.title
        }))
      )
      return yield* new GenericObjectIdentifierAmbiguousError({ field, identifier, candidates })
    }
    return yield* resolvedSummary(assertAt(byTitle, 0), "document")
  })

const findCardById = (
  client: HulyClientOperations,
  identifier: CardIdentifier
): Effect.Effect<HulyCard | undefined, HulyClientError> =>
  client.findOne<HulyCard>(cardPlugin.class.Card, hulyQuery<HulyCard>({ _id: toRef<HulyCard>(identifier) }))

const findCardSpace = (
  client: HulyClientOperations,
  identifier: CardSpaceIdentifier,
  field: RelationEndpointField
): Effect.Effect<HulyCardSpace, GenericAssociationsError> =>
  Effect.gen(function* () {
    const byId = yield* client.findOne<HulyCardSpace>(
      cardPlugin.class.CardSpace,
      hulyQuery<HulyCardSpace>({ _id: toRef<HulyCardSpace>(identifier) })
    )
    if (byId !== undefined) {
      return byId
    }

    const byName = yield* client.findAll<HulyCardSpace>(
      cardPlugin.class.CardSpace,
      hulyQuery<HulyCardSpace>({ name: identifier, archived: false }),
      { limit: 2 }
    )
    if (byName.length === 0) {
      return yield* new GenericObjectNotFoundError({ field, identifier, class: cardPlugin.class.CardSpace })
    }
    if (byName.length > 1) {
      const candidates = yield* Effect.forEach(byName, (space) =>
        Effect.map(parseHulyObjectMetadata(space), (metadata) => ({
          id: metadata.id,
          class: metadata.class,
          display: space.name
        }))
      )
      return yield* new GenericObjectIdentifierAmbiguousError({ field, identifier, candidates })
    }
    return assertAt(byName, 0)
  })

const resolveCardInSpace = (
  client: HulyClientOperations,
  identifier: CardIdentifier,
  cardSpace: HulyCardSpace,
  field: RelationEndpointField
): Effect.Effect<ResolvedObjectSummary, GenericAssociationsError> =>
  Effect.gen(function* () {
    const byId = yield* client.findOne<HulyCard>(
      cardPlugin.class.Card,
      hulyQuery<HulyCard>({ _id: toRef<HulyCard>(identifier), space: cardSpace._id })
    )
    if (byId !== undefined) {
      return yield* resolvedSummary(byId, "card")
    }

    const byTitle = yield* client.findAll<HulyCard>(
      cardPlugin.class.Card,
      hulyQuery<HulyCard>({ title: identifier, space: cardSpace._id }),
      { limit: 2 }
    )
    if (byTitle.length === 0) {
      return yield* new GenericObjectNotFoundError({ field, identifier, class: cardPlugin.class.Card })
    }
    if (byTitle.length > 1) {
      const candidates = yield* Effect.forEach(byTitle, (card) =>
        Effect.map(parseHulyObjectMetadata(card), (metadata) => ({
          id: metadata.id,
          class: metadata.class,
          display: card.title
        }))
      )
      return yield* new GenericObjectIdentifierAmbiguousError({ field, identifier, candidates })
    }
    return yield* resolvedSummary(assertAt(byTitle, 0), "card")
  })

const resolveCardLocator = (
  client: HulyClientOperations,
  locator: Extract<GenericObjectLocator, { kind: "card" }>,
  field: RelationEndpointField
): Effect.Effect<ResolvedObjectSummary, GenericAssociationsError> =>
  Effect.gen(function* () {
    if (locator.cardSpace !== undefined) {
      const cardSpace = yield* findCardSpace(client, locator.cardSpace, field)
      return yield* resolveCardInSpace(client, locator.card, cardSpace, field)
    }

    const byId = yield* findCardById(client, locator.card)
    if (byId !== undefined) {
      return yield* resolvedSummary(byId, "card")
    }

    return yield* new GenericObjectLocatorInvalidError({
      field,
      reason: `card '${locator.card}' was not found by ID; exact card title lookup requires cardSpace`
    })
  })

const resolveRawObject = (
  client: HulyClientOperations,
  locator: Extract<GenericObjectLocator, { kind: "raw" }>,
  expectedClass: ObjectClassName | undefined,
  field: RelationEndpointField
): Effect.Effect<ResolvedObjectSummary, GenericAssociationsError> =>
  Effect.gen(function* () {
    const className = locator.class ?? expectedClass
    if (className === undefined) {
      return yield* new GenericObjectLocatorInvalidError({
        field,
        reason: "raw object locator requires class unless association side class is known"
      })
    }
    const doc = yield* findRawDoc(client, locator.id, className)
    if (doc === undefined) {
      return yield* new GenericObjectNotFoundError({ field, identifier: locator.id, class: className })
    }
    const summary = yield* resolvedSummary(doc, "raw")
    yield* validateExpectedClass(summary, expectedClass, field)
    return summary
  })

const resolveDocumentLocator = (
  client: HulyClientOperations,
  locator: Extract<GenericObjectLocator, { kind: "document" }>,
  expectedClass: ObjectClassName | undefined,
  field: RelationEndpointField
): Effect.Effect<ResolvedObjectSummary, GenericAssociationsError, HulyClient> =>
  Effect.gen(function* () {
    const summary =
      locator.teamspace === undefined
        ? yield* resolveDocumentWithoutTeamspace(client, locator.document, field)
        : yield* resolvedSummary(
            (yield* findTeamspaceAndDocument({ teamspace: locator.teamspace, document: locator.document })).doc,
            "document"
          )
    yield* validateExpectedClass(summary, expectedClass, field)
    return summary
  })

const resolveLeadLocator = (
  client: HulyClient["Service"],
  locator: Extract<GenericObjectLocator, { kind: "lead" }>,
  expectedClass: ObjectClassName | undefined,
  field: RelationEndpointField
): Effect.Effect<ResolvedObjectSummary, GenericAssociationsError> =>
  Effect.gen(function* () {
    const funnel = yield* resolveFunnel(client, locator.funnel)
    const lead = yield* findLead(client, funnel, locator.identifier)
    const summary: ResolvedObjectSummary = {
      id: DocId.make(lead._id),
      class: ObjectClassName.make(lead._class),
      display: NonEmptyString.make(lead.title),
      locatorKind: "lead"
    }
    yield* validateExpectedClass(summary, expectedClass, field)
    return summary
  })

const resolveGenericObject = (
  client: HulyClient["Service"],
  locator: GenericObjectLocator,
  expectedClass: ObjectClassName | undefined,
  field: RelationEndpointField
): Effect.Effect<ResolvedObjectSummary, GenericAssociationsError, HulyClient> =>
  Effect.gen(function* () {
    switch (locator.kind) {
      case "raw":
        return yield* resolveRawObject(client, locator, expectedClass, field)
      case "issue": {
        const summary = yield* resolveIssueLocator(locator, field)
        yield* validateExpectedClass(summary, expectedClass, field)
        return summary
      }
      case "document":
        return yield* resolveDocumentLocator(client, locator, expectedClass, field)
      case "card": {
        const summary = yield* resolveCardLocator(client, locator, field)
        yield* validateExpectedClass(summary, expectedClass, field)
        return summary
      }
      case "lead":
        return yield* resolveLeadLocator(client, locator, expectedClass, field)
    }
  })

const unresolvedRelationEndpoint = (id: DocId, className: ObjectClassName, warning: string): ResolvedObjectSummary => ({
  id,
  class: className,
  display: NonEmptyString.make(id),
  locatorKind: "raw",
  warning
})

const resolveRelationEndpointFromCache = (
  docsByClass: ReadonlyMap<Ref<Class<Doc>>, ReadonlyMap<Ref<Doc>, Doc>>,
  id: DocId,
  className: ObjectClassName
): Effect.Effect<ResolvedObjectSummary, HulyModelMetadataError> => {
  const doc = docsByClass.get(toClassRef(className))?.get(toRef<Doc>(id))
  return doc === undefined
    ? Effect.succeed(
        unresolvedRelationEndpoint(id, className, `Could not resolve related ${className} document for display.`)
      )
    : resolvedSummary(doc, "raw")
}

const relationToSummary = (
  association: ParsedAssociation,
  relation: ParsedRelation,
  docsByClass: ReadonlyMap<Ref<Class<Doc>>, ReadonlyMap<Ref<Doc>, Doc>>
): Effect.Effect<RelationSummary, HulyModelMetadataError> =>
  Effect.gen(function* () {
    const associationMetadata = association.metadata
    const relationMetadata = relation.metadata
    return {
      relationId: relationMetadata.id,
      associationId: associationMetadata.id,
      associationName: associationName(associationMetadata),
      source: yield* resolveRelationEndpointFromCache(
        docsByClass,
        relationMetadata.sourceId,
        associationMetadata.sourceClass
      ),
      target: yield* resolveRelationEndpointFromCache(
        docsByClass,
        relationMetadata.targetId,
        associationMetadata.targetClass
      ),
      createdOn: relation.doc.createdOn === undefined ? undefined : Timestamp.make(relation.doc.createdOn),
      modifiedOn: Timestamp.make(relation.doc.modifiedOn)
    }
  })

const relationsToSummaries = (
  client: HulyClientOperations,
  pairs: ReadonlyArray<RelationAssociationPair>
): Effect.Effect<Array<RelationSummary>, HulyClientError | HulyModelMetadataError> =>
  Effect.gen(function* () {
    const idsByClass = new Map<Ref<Class<Doc>>, Set<Ref<Doc>>>()
    const addEndpoint = (className: Ref<Class<Doc>>, id: Ref<Doc>): void => {
      const ids = idsByClass.get(className) ?? new Set<Ref<Doc>>()
      ids.add(id)
      idsByClass.set(className, ids)
    }

    for (const { association, relation } of pairs) {
      addEndpoint(toClassRef(association.metadata.sourceClass), toRef<Doc>(relation.metadata.sourceId))
      addEndpoint(toClassRef(association.metadata.targetClass), toRef<Doc>(relation.metadata.targetId))
    }

    const docsByClassEntries = yield* Effect.forEach([...idsByClass.entries()], ([className, ids]) =>
      Effect.map(
        findDocsByClass(client, className, [...ids]),
        (docs): readonly [Ref<Class<Doc>>, Map<Ref<Doc>, Doc>] => [className, docs]
      )
    )
    const docsByClass = new Map(docsByClassEntries)

    return yield* Effect.forEach(pairs, ({ association, relation }) =>
      relationToSummary(association, relation, docsByClass)
    )
  })

const directionQueries = (
  association: ParsedAssociation,
  source: ResolvedObjectSummary | undefined,
  target: ResolvedObjectSummary | undefined,
  direction: RelationDirection
): Array<StrictDocumentQuery<HulyRelation>> => {
  const makeQuery = (reversed: boolean): StrictDocumentQuery<HulyRelation> => {
    const query: StrictDocumentQuery<HulyRelation> = { association: toRef<HulyAssociation>(association.metadata.id) }
    if (source !== undefined) {
      if (reversed) query.docB = toRef<Doc>(source.id)
      else query.docA = toRef<Doc>(source.id)
    }
    if (target !== undefined) {
      if (reversed) query.docA = toRef<Doc>(target.id)
      else query.docB = toRef<Doc>(target.id)
    }
    return query
  }

  if (direction === "target-to-source") {
    return [makeQuery(true)]
  }
  if (direction === "either") {
    return source === undefined && target === undefined ? [makeQuery(false)] : [makeQuery(false), makeQuery(true)]
  }
  return [makeQuery(false)]
}

const relationDirectionQueries = (
  source: ResolvedObjectSummary | undefined,
  target: ResolvedObjectSummary | undefined,
  direction: RelationDirection
): Array<StrictDocumentQuery<HulyRelation>> => {
  const makeQuery = (reversed: boolean): StrictDocumentQuery<HulyRelation> => {
    const query: StrictDocumentQuery<HulyRelation> = {}
    if (source !== undefined) {
      if (reversed) query.docB = toRef<Doc>(source.id)
      else query.docA = toRef<Doc>(source.id)
    }
    if (target !== undefined) {
      if (reversed) query.docA = toRef<Doc>(target.id)
      else query.docB = toRef<Doc>(target.id)
    }
    return query
  }

  if (direction === "target-to-source") {
    return [makeQuery(true)]
  }
  if (direction === "either") {
    return [makeQuery(false), makeQuery(true)]
  }
  return [makeQuery(false)]
}

const associationEndpointQueries = (
  source: ResolvedObjectSummary | undefined,
  target: ResolvedObjectSummary | undefined,
  direction: RelationDirection
): Array<StrictDocumentQuery<HulyAssociation>> => {
  const makeQuery = (reversed: boolean): StrictDocumentQuery<HulyAssociation> => {
    const query: StrictDocumentQuery<HulyAssociation> = {}
    if (source !== undefined) {
      if (reversed) query.classB = toClassRef(source.class)
      else query.classA = toClassRef(source.class)
    }
    if (target !== undefined) {
      if (reversed) query.classA = toClassRef(target.class)
      else query.classB = toClassRef(target.class)
    }
    return query
  }

  const queries =
    direction === "target-to-source"
      ? [makeQuery(true)]
      : direction === "either"
        ? [makeQuery(false), makeQuery(true)]
        : [makeQuery(false)]
  const byKey = new Map<string, StrictDocumentQuery<HulyAssociation>>()
  for (const query of queries) {
    byKey.set(JSON.stringify([query.classA, query.classB]), query)
  }
  return [...byKey.values()]
}

const findVisibleAssociationsForEndpoints = (
  client: HulyClientOperations,
  source: ResolvedObjectSummary | undefined,
  target: ResolvedObjectSummary | undefined,
  direction: RelationDirection
): Effect.Effect<AssociationDiscoveryResult, HulyClientError | HulyModelMetadataError> =>
  Effect.gen(function* () {
    const discoveryResults = yield* Effect.forEach(
      associationEndpointQueries(source, target, direction),
      (query): Effect.Effect<AssociationDiscoveryResult, HulyClientError | HulyModelMetadataError> =>
        Effect.gen(function* () {
          const associationDocs = yield* client.findAll<HulyAssociation>(core.class.Association, hulyQuery(query), {
            limit: ASSOCIATION_DISCOVERY_LIMIT,
            sort: { modifiedOn: SortingOrder.Descending }
          })
          const associations = yield* Effect.forEach(associationDocs, parseHulyAssociation)
          return { associations, limitReached: associations.length >= ASSOCIATION_DISCOVERY_LIMIT }
        })
    )
    const byId = new Map<AssociationId, ParsedAssociation>()
    for (const { associations } of discoveryResults) {
      for (const association of associations) {
        if (
          associationMatchesFilters(association, VISIBLE_ASSOCIATION_FILTERS) &&
          associationMatchesEndpoints(association, source, target, direction)
        ) {
          byId.set(association.metadata.id, association)
        }
      }
    }
    return { associations: [...byId.values()], limitReached: discoveryResults.some((result) => result.limitReached) }
  })

const findRelationsForAssociation = (
  client: HulyClientOperations,
  association: ParsedAssociation,
  source: ResolvedObjectSummary | undefined,
  target: ResolvedObjectSummary | undefined,
  direction: RelationDirection,
  limit: number
): Effect.Effect<Array<ParsedRelation>, HulyClientError | HulyModelMetadataError> =>
  Effect.gen(function* () {
    const byId = new Map<RelationId, ParsedRelation>()
    for (const query of directionQueries(association, source, target, direction)) {
      const relations = yield* client.findAll<HulyRelation>(core.class.Relation, hulyQuery(query), { limit })
      const parsedRelations = yield* Effect.forEach(relations, parseHulyRelation)
      for (const relation of parsedRelations) {
        byId.set(relation.metadata.id, relation)
      }
    }
    return [...byId.values()].slice(0, limit)
  })

const associationEndpointClassesMatch = (
  source: ResolvedObjectSummary | undefined,
  target: ResolvedObjectSummary | undefined,
  sourceClass: ObjectClassName,
  targetClass: ObjectClassName
): boolean =>
  (source === undefined || String(source.class) === sourceClass) &&
  (target === undefined || String(target.class) === targetClass)

const associationMatchesEndpoints = (
  association: ParsedAssociation,
  source: ResolvedObjectSummary | undefined,
  target: ResolvedObjectSummary | undefined,
  direction: RelationDirection
): boolean => {
  const sourceClass = association.metadata.sourceClass
  const targetClass = association.metadata.targetClass
  if (direction === "target-to-source") {
    return associationEndpointClassesMatch(source, target, targetClass, sourceClass)
  }

  if (direction === "either") {
    const matchesForward = associationEndpointClassesMatch(source, target, sourceClass, targetClass)
    const matchesReverse = associationEndpointClassesMatch(source, target, targetClass, sourceClass)
    return matchesForward || matchesReverse
  }

  return associationEndpointClassesMatch(source, target, sourceClass, targetClass)
}

const listRelationsForResolvedEndpoints = (
  client: HulyClientOperations,
  associations: ReadonlyArray<ParsedAssociation>,
  source: ResolvedObjectSummary | undefined,
  target: ResolvedObjectSummary | undefined,
  direction: RelationDirection,
  limit: number
): Effect.Effect<Array<RelationSummary>, HulyClientError | HulyModelMetadataError> =>
  Effect.gen(function* () {
    const pairs: Array<RelationAssociationPair> = []
    for (const association of associations) {
      /* v8 ignore start -- unreachable: callers resolve endpoints against this association's classes, so it always matches */
      if (!associationMatchesEndpoints(association, source, target, direction)) {
        continue
      }
      /* v8 ignore stop */

      const relations = yield* findRelationsForAssociation(client, association, source, target, direction, limit)
      for (const relation of relations) {
        pairs.push({ relation, association })
        if (pairs.length >= limit) {
          break
        }
      }
      if (pairs.length >= limit) {
        break
      }
    }
    return yield* relationsToSummaries(client, pairs)
  })

const findRelationsForAssociationIdsAndEndpoints = (
  client: HulyClientOperations,
  associationIds: ReadonlyArray<AssociationId>,
  source: ResolvedObjectSummary | undefined,
  target: ResolvedObjectSummary | undefined,
  direction: RelationDirection,
  limit: number
): Effect.Effect<Array<ParsedRelation>, HulyClientError | HulyModelMetadataError> =>
  Effect.gen(function* () {
    if (associationIds.length === 0) {
      return []
    }
    const byId = new Map<RelationId, ParsedRelation>()
    for (const query of relationDirectionQueries(source, target, direction)) {
      const relations = yield* client.findAll<HulyRelation>(
        core.class.Relation,
        hulyQuery<HulyRelation>({ ...query, association: { $in: associationIds.map(toRef<HulyAssociation>) } }),
        { limit, sort: { modifiedOn: SortingOrder.Descending } }
      )
      const parsedRelations = yield* Effect.forEach(relations, parseHulyRelation)
      for (const relation of parsedRelations) {
        byId.set(relation.metadata.id, relation)
      }
    }
    return [...byId.values()].sort((left, right) => right.doc.modifiedOn - left.doc.modifiedOn).slice(0, limit)
  })

const listRelationsWithoutAssociation = (
  client: HulyClientOperations,
  source: ResolvedObjectSummary | undefined,
  target: ResolvedObjectSummary | undefined,
  direction: RelationDirection,
  limit: number
): Effect.Effect<
  { readonly summaries: Array<RelationSummary>; readonly warnings?: ListRelationsWarnings },
  HulyClientError | HulyModelMetadataError
> =>
  Effect.gen(function* () {
    const { associations, limitReached } = yield* findVisibleAssociationsForEndpoints(client, source, target, direction)
    const associationsById = new Map(associations.map((association) => [association.metadata.id, association]))
    const relations = yield* findRelationsForAssociationIdsAndEndpoints(
      client,
      uniqueValues(associations.map((association) => association.metadata.id)),
      source,
      target,
      direction,
      limit
    )
    const pairs = relations.flatMap((relation): Array<RelationAssociationPair> => {
      const association = associationsById.get(relation.metadata.associationId)
      /* v8 ignore start -- unreachable: relations were queried by these association ids, so the lookup never misses */
      if (association === undefined) {
        return []
      }
      /* v8 ignore stop */
      return [{ relation, association }]
    })

    const summaries = yield* relationsToSummaries(client, pairs.slice(0, limit))
    return limitReached ? { summaries, warnings: [ASSOCIATION_DISCOVERY_LIMIT_WARNING] } : { summaries }
  })

const listRelationsWithoutResolvedAssociation = (
  client: HulyClientOperations,
  params: ListRelationsParams,
  direction: RelationDirection,
  limit: number
): Effect.Effect<ListRelationsResult, GenericAssociationsError, HulyClient> =>
  Effect.gen(function* () {
    const source =
      params.source === undefined ? undefined : yield* resolveGenericObject(client, params.source, undefined, "source")
    const target =
      params.target === undefined ? undefined : yield* resolveGenericObject(client, params.target, undefined, "target")
    const { summaries, warnings } = yield* listRelationsWithoutAssociation(client, source, target, direction, limit)
    return { relations: summaries, total: listTotal(summaries.length), ...(warnings === undefined ? {} : { warnings }) }
  })

const associationClassesForDirection = (association: ParsedAssociation, direction: RelationDirection) => {
  const sourceClass = association.metadata.sourceClass
  const targetClass = association.metadata.targetClass
  return {
    sourceClass: direction === "either" ? undefined : direction === "target-to-source" ? targetClass : sourceClass,
    targetClass: direction === "either" ? undefined : direction === "target-to-source" ? sourceClass : targetClass
  }
}

const listRelationsWithResolvedAssociation = (
  client: HulyClientOperations,
  params: ListRelationsParams & { readonly association: NonNullable<ListRelationsParams["association"]> },
  direction: RelationDirection,
  limit: number
): Effect.Effect<ListRelationsResult, GenericAssociationsError, HulyClient> =>
  Effect.gen(function* () {
    const association = yield* resolveAssociation(client, params.association, MUTATION_ASSOCIATION_FILTERS)
    const { sourceClass, targetClass } = associationClassesForDirection(association, direction)
    const source =
      params.source === undefined
        ? undefined
        : yield* resolveGenericObject(client, params.source, sourceClass, "source")
    const target =
      params.target === undefined
        ? undefined
        : yield* resolveGenericObject(client, params.target, targetClass, "target")
    if (direction === "either") yield* validateEitherEndpointClasses(association, source, target)
    const summaries = yield* listRelationsForResolvedEndpoints(client, [association], source, target, direction, limit)
    return { relations: summaries, total: listTotal(summaries.length) }
  })

export const listRelations = (
  params: ListRelationsParams
): Effect.Effect<ListRelationsResult, GenericAssociationsError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const limit = clampLimit(params.limit)
    const direction = params.direction ?? DefaultRelationDirection

    if (params.association === undefined) {
      return yield* listRelationsWithoutResolvedAssociation(client, params, direction, limit)
    }
    return yield* listRelationsWithResolvedAssociation(
      client,
      { ...params, association: params.association },
      direction,
      limit
    )
  })

const resolveRelationWriteEndpoints = (
  client: HulyClientOperations,
  association: ParsedAssociation,
  params: Pick<CreateRelationParams, "source" | "target" | "direction">
): Effect.Effect<ResolvedRelationWriteEndpoints, GenericAssociationsError, HulyClient> =>
  Effect.gen(function* () {
    const direction = params.direction ?? DefaultRelationDirection

    if (direction === "source-to-target") {
      const source = yield* resolveGenericObject(client, params.source, association.metadata.sourceClass, "source")
      const target = yield* resolveGenericObject(client, params.target, association.metadata.targetClass, "target")
      return { docA: source, docB: target, source, target }
    }

    if (direction === "target-to-source") {
      const source = yield* resolveGenericObject(client, params.source, association.metadata.targetClass, "source")
      const target = yield* resolveGenericObject(client, params.target, association.metadata.sourceClass, "target")
      return { docA: target, docB: source, source, target }
    }

    return yield* resolveEitherWriteEndpoints(client, association, params)
  })

const resolveEitherWriteEndpoints = (
  client: HulyClientOperations,
  association: ParsedAssociation,
  params: Pick<CreateRelationParams, "source" | "target">
): Effect.Effect<ResolvedRelationWriteEndpoints, GenericAssociationsError, HulyClient> =>
  Effect.gen(function* () {
    const source = yield* resolveGenericObject(client, params.source, undefined, "source")
    const target = yield* resolveGenericObject(client, params.target, undefined, "target")
    const matchesForward =
      source.class === association.metadata.sourceClass && target.class === association.metadata.targetClass
    const matchesReverse =
      source.class === association.metadata.targetClass && target.class === association.metadata.sourceClass

    if (matchesForward && matchesReverse) {
      return yield* new RelationDirectionAmbiguousError({
        associationId: association.metadata.id,
        reason: "both endpoints match both sides of the association"
      })
    }
    if (matchesForward) {
      return { docA: source, docB: target, source, target }
    }
    if (matchesReverse) {
      return { docA: target, docB: source, source, target }
    }

    yield* validateEitherEndpointClasses(association, source, target)
    return yield* new RelationEndpointClassMismatchError({
      field: "source",
      expectedClass: `${association.metadata.sourceClass} or ${association.metadata.targetClass}`,
      actualClass: source.class
    })
  })

const exactRelationQuery = (
  association: ParsedAssociation,
  endpoints: Pick<ResolvedRelationWriteEndpoints, "docA" | "docB">
): StrictDocumentQuery<HulyRelation> => ({
  association: toRef<HulyAssociation>(association.metadata.id),
  docA: toRef<Doc>(endpoints.docA.id),
  docB: toRef<Doc>(endpoints.docB.id)
})

const findExactRelations = (
  client: HulyClientOperations,
  association: ParsedAssociation,
  endpoints: Pick<ResolvedRelationWriteEndpoints, "docA" | "docB">,
  limit: number
): Effect.Effect<Array<ParsedRelation>, HulyClientError | HulyModelMetadataError> =>
  Effect.flatMap(
    client.findAll<HulyRelation>(core.class.Relation, hulyQuery(exactRelationQuery(association, endpoints)), { limit }),
    (relations) => Effect.forEach(relations, parseHulyRelation)
  )

const findCardinalityConflict = (
  client: HulyClientOperations,
  association: ParsedAssociation,
  endpoints: Pick<ResolvedRelationWriteEndpoints, "docA" | "docB">
): Effect.Effect<ParsedRelation | undefined, HulyClientError | HulyModelMetadataError> =>
  Effect.gen(function* () {
    if (association.metadata.cardinality === "N:N") {
      return undefined
    }

    const docBConflict = yield* client.findOne<HulyRelation>(
      core.class.Relation,
      hulyQuery<HulyRelation>({
        association: toRef<HulyAssociation>(association.metadata.id),
        docB: toRef<Doc>(endpoints.docB.id)
      })
    )
    if (docBConflict !== undefined) {
      return yield* parseHulyRelation(docBConflict)
    }

    if (association.metadata.cardinality === "1:1") {
      const docAConflict = yield* client.findOne<HulyRelation>(
        core.class.Relation,
        hulyQuery<HulyRelation>({
          association: toRef<HulyAssociation>(association.metadata.id),
          docA: toRef<Doc>(endpoints.docA.id)
        })
      )
      return docAConflict === undefined ? undefined : yield* parseHulyRelation(docAConflict)
    }
    return undefined
  })

const enforceCardinality = (
  client: HulyClientOperations,
  association: ParsedAssociation,
  endpoints: Pick<ResolvedRelationWriteEndpoints, "docA" | "docB">
): Effect.Effect<void, HulyClientError | HulyModelMetadataError | RelationCardinalityViolationError> =>
  Effect.gen(function* () {
    const conflict = yield* findCardinalityConflict(client, association, endpoints)
    if (conflict === undefined) {
      return
    }

    const reason =
      association.metadata.cardinality === "1:1"
        ? "one-to-one associations allow each endpoint to appear in only one relation"
        : "one-to-many associations allow each target-side endpoint to appear in only one relation"
    return yield* new RelationCardinalityViolationError({
      associationId: association.metadata.id,
      cardinality: cardinality(association.metadata.cardinality),
      reason
    })
  })

export const createRelation = (
  params: CreateRelationParams
): Effect.Effect<CreateRelationResult, GenericAssociationsError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const association = yield* resolveAssociation(client, params.association, MUTATION_ASSOCIATION_FILTERS)
    yield* ensureRelationMutationSupported(association, "create_relation")
    const endpoints = yield* resolveRelationWriteEndpoints(client, association, params)

    const exact = yield* findExactRelations(client, association, endpoints, 1)
    const existing = exact.at(0)
    if (existing !== undefined) {
      if (params.ifExists === "fail") {
        return yield* new RelationCardinalityViolationError({
          associationId: association.metadata.id,
          cardinality: cardinality(association.metadata.cardinality),
          reason: `relation '${existing.metadata.id}' already exists`
        })
      }
      return {
        relationId: existing.metadata.id,
        associationId: association.metadata.id,
        source: endpoints.source,
        target: endpoints.target,
        created: false,
        existing: true
      }
    }

    yield* enforceCardinality(client, association, endpoints)
    const createdRelationId = yield* client.createDoc<HulyRelation>(
      core.class.Relation,
      toRef<Space>(core.space.Workspace),
      {
        association: toRef<HulyAssociation>(association.metadata.id),
        docA: toRef<Doc>(endpoints.docA.id),
        docB: toRef<Doc>(endpoints.docB.id)
      }
    )
    const relationId = yield* parseHulyCreatedRelationId(createdRelationId)

    return {
      relationId,
      associationId: association.metadata.id,
      source: endpoints.source,
      target: endpoints.target,
      created: true,
      existing: false
    }
  })

export const deleteRelation = (
  params: DeleteRelationParams
): Effect.Effect<DeleteRelationResult, GenericAssociationsError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient

    if ("relation" in params) {
      const existing = yield* client.findOne<HulyRelation>(
        core.class.Relation,
        hulyQuery<HulyRelation>({ _id: toRef<HulyRelation>(params.relation) })
      )
      if (existing === undefined) {
        return { relationId: RelationId.make(params.relation), deleted: false, reason: "not_found" }
      }
      const existingMetadata = yield* parseHulyRelationMetadata(existing)

      const association = yield* resolveAssociation(
        client,
        existingMetadata.associationId,
        MUTATION_ASSOCIATION_FILTERS
      )
      yield* ensureRelationMutationSupported(association, "delete_relation")
      yield* client.removeDoc<HulyRelation>(
        core.class.Relation,
        existing.space,
        toRef<HulyRelation>(existingMetadata.id)
      )
      return {
        relationId: existingMetadata.id,
        associationId: association.metadata.id,
        deleted: true,
        reason: "deleted"
      }
    }

    const association = yield* resolveAssociation(client, params.association, MUTATION_ASSOCIATION_FILTERS)
    yield* ensureRelationMutationSupported(association, "delete_relation")
    const endpoints = yield* resolveRelationWriteEndpoints(client, association, params)
    const matches = yield* findExactRelations(client, association, endpoints, EXACT_RELATION_MATCH_LIMIT)

    if (matches.length === 0) {
      return { associationId: association.metadata.id, deleted: false, reason: "not_found" }
    }
    if (matches.length > 1) {
      return yield* new RelationIdentifierAmbiguousError({
        identifier: `${params.association}/${endpoints.docA.id}/${endpoints.docB.id}`,
        relationIds: matches.map((relation) => relation.metadata.id)
      })
    }

    if (!isSingle(matches)) {
      return { associationId: association.metadata.id, deleted: false, reason: "not_found" }
    }
    const relation = matches[0]
    yield* client.removeDoc<HulyRelation>(core.class.Relation, relation.doc.space, relation.doc._id)
    return {
      relationId: relation.metadata.id,
      associationId: association.metadata.id,
      deleted: true,
      reason: "deleted"
    }
  })
