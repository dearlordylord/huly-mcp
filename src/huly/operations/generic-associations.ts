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
  AssociationRoleName,
  DefaultRelationDirection,
  ListRelationsWarning
} from "../../domain/schemas/generic-associations.js"
import {
  AssociationId,
  type CardIdentifier,
  type CardSpaceIdentifier,
  Count,
  DocId,
  type ListTotal,
  MAX_LIMIT,
  NonEmptyString,
  ObjectClassName,
  RelationId,
  UNKNOWN_TOTAL
} from "../../domain/schemas/shared.js"
import { HulyClient, type HulyClientError, type HulyClientOperations } from "../client.js"
import type {
  DocumentNotFoundError,
  IssueNotFoundError,
  ProjectNotFoundError,
  RelationNotFoundError,
  TeamspaceNotFoundError
} from "../errors.js"
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
import { listTotal } from "./counts.js"
import { findTeamspaceAndDocument } from "./documents.js"
import { findIssueInProject, findProject, findProjectAndIssue } from "./issues-shared.js"
import { clampLimit, hulyQuery, type StrictDocumentQuery } from "./query-helpers.js"
import { toClassRef, toRef } from "./sdk-boundary.js"

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

type AssociationListFilters = AssociationFilters & {
  readonly writableOnly: boolean
}

type RelationAssociationPair = {
  readonly relation: HulyRelation
  readonly association: HulyAssociation
}

type AssociationForSummary =
  & Pick<HulyAssociation, "_id" | "classA" | "classB" | "nameA" | "nameB" | "type">
  & {
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

type AssociationDiscoveryResult = {
  readonly associations: Array<HulyAssociation>
  readonly limitReached: boolean
}

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

const associationName = (association: AssociationForSummary): AssociationName | undefined =>
  association.nameA === association.nameB
    ? AssociationName.make(association.nameA)
    : AssociationName.make(`${association.nameA} -> ${association.nameB}`)

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

const isSystemAssociation = (association: AssociationForSummary): boolean =>
  isSystemClassName(String(association.classA)) || isSystemClassName(String(association.classB))

const associationAutomationOnly = (association: AssociationForSummary): boolean => association.automationOnly === true

const relationWriteUnsupportedReason = (association: AssociationForSummary): string | undefined => {
  if (isSystemAssociation(association)) {
    return "association uses a core:class:* system class"
  }
  if (associationAutomationOnly(association)) {
    return "association is automation-only"
  }
  return undefined
}

const isRelationWritableAssociation = (association: AssociationForSummary): boolean =>
  relationWriteUnsupportedReason(association) === undefined

const isSymmetric = (association: AssociationForSummary): boolean =>
  association.classA === association.classB && association.nameA === association.nameB

const ASSOCIATION_CARDINALITY = {
  "1:1": "one-to-one",
  "1:N": "one-to-many",
  "N:N": "many-to-many"
} satisfies Record<HulyAssociation["type"], Cardinality>

type MappedCardinality = typeof ASSOCIATION_CARDINALITY[keyof typeof ASSOCIATION_CARDINALITY]
type ExactCardinalityMapping = [Cardinality] extends [MappedCardinality]
  ? [MappedCardinality] extends [Cardinality] ? true : never
  : never

const exactCardinalityMapping = <T extends true>(value: T): T => value
exactCardinalityMapping<ExactCardinalityMapping>(true)

const cardinality = (type: HulyAssociation["type"]): Cardinality => ASSOCIATION_CARDINALITY[type]

const SDK_CARDINALITY = {
  "one-to-one": "1:1",
  "one-to-many": "1:N",
  "many-to-many": "N:N"
} satisfies Record<Cardinality, HulyAssociation["type"]>

const toAssociationSummary = (association: AssociationForSummary): AssociationSummary => {
  const sourceClass = ObjectClassName.make(association.classA)
  const targetClass = ObjectClassName.make(association.classB)
  const unsupportedReason = relationWriteUnsupportedReason(association)

  return {
    associationId: AssociationId.make(association._id),
    name: associationName(association),
    sourceClass,
    sourceClassLabel: classLabel(sourceClass),
    targetClass,
    targetClassLabel: classLabel(targetClass),
    sourceRole: AssociationRoleName.make(association.nameA),
    targetRole: AssociationRoleName.make(association.nameB),
    relationClass: ObjectClassName.make(core.class.Relation),
    cardinality: cardinality(association.type),
    symmetric: isSymmetric(association),
    system: isSystemAssociation(association),
    canListRelations: true,
    canCreateRelation: unsupportedReason === undefined,
    canDeleteRelation: unsupportedReason === undefined,
    ...(unsupportedReason === undefined ? {} : { unsupportedReason })
  }
}

const toCandidate = (association: HulyAssociation): AssociationCandidate => ({
  id: AssociationId.make(association._id),
  name: associationName(association),
  sourceClass: ObjectClassName.make(association.classA),
  targetClass: ObjectClassName.make(association.classB)
})

const matchesAssociationIdentifier = (association: HulyAssociation, identifier: string): boolean => {
  const normalized = identifier.trim().toLowerCase()
  return association._id.toLowerCase() === normalized
    || association.nameA.toLowerCase() === normalized
    || association.nameB.toLowerCase() === normalized
    || associationName(association)?.toLowerCase() === normalized
}

const associationFiltersFromParams = (
  params: Pick<ListAssociationsParams, "sourceClass" | "targetClass" | "includeSystem">
): AssociationFilters => ({
  includeSystem: params.includeSystem === true,
  sourceClass: params.sourceClass,
  targetClass: params.targetClass
})

const associationListFiltersFromParams = (params: ListAssociationsParams): AssociationListFilters => ({
  ...associationFiltersFromParams(params),
  writableOnly: params.writableOnly === true
})

const associationMatchesFilters = (
  association: HulyAssociation,
  filters: AssociationFilters
): boolean =>
  (filters.includeSystem || !isSystemAssociation(association))
  && (filters.sourceClass === undefined || association.classA === String(filters.sourceClass))
  && (filters.targetClass === undefined || association.classB === String(filters.targetClass))

const filterVisible = (
  associations: ReadonlyArray<HulyAssociation>,
  filters: AssociationListFilters
): Array<HulyAssociation> =>
  associations.filter((association) =>
    associationMatchesFilters(association, filters)
    && (!filters.writableOnly || isRelationWritableAssociation(association))
  )

const listAssociationDocs = (
  client: HulyClientOperations,
  params: ListAssociationsParams
): Effect.Effect<Array<HulyAssociation>, HulyClientError> => {
  const query: StrictDocumentQuery<HulyAssociation> = {}

  if (params.sourceClass !== undefined) {
    query.classA = toClassRef(params.sourceClass)
  }
  if (params.targetClass !== undefined) {
    query.classB = toClassRef(params.targetClass)
  }

  return Effect.map(
    client.findAll<HulyAssociation>(
      core.class.Association,
      hulyQuery(query),
      {
        limit: clampLimit(params.limit),
        sort: { modifiedOn: SortingOrder.Descending }
      }
    ),
    (result) => [...result]
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
): Effect.Effect<HulyAssociation, GenericAssociationsError> =>
  Effect.gen(function*() {
    const exactId = yield* client.findOne<HulyAssociation>(
      core.class.Association,
      hulyQuery<HulyAssociation>({ _id: toRef<HulyAssociation>(identifier) })
    )
    if (exactId !== undefined) {
      if (!associationMatchesFilters(exactId, filters)) {
        return yield* new AssociationNotFoundError({ identifier })
      }
      return exactId
    }

    const nameCandidates = new Map<string, HulyAssociation>()
    const addCandidates = (associations: ReadonlyArray<HulyAssociation>): void => {
      for (const association of associations) {
        if (matchesAssociationIdentifier(association, identifier) && associationMatchesFilters(association, filters)) {
          nameCandidates.set(association._id, association)
        }
      }
    }

    addCandidates(
      yield* client.findAll<HulyAssociation>(
        core.class.Association,
        hulyQuery<HulyAssociation>({
          ...associationClassFilterQuery(filters),
          nameA: identifier
        }),
        { limit: ASSOCIATION_LOOKUP_AMBIGUITY_LIMIT }
      )
    )
    addCandidates(
      yield* client.findAll<HulyAssociation>(
        core.class.Association,
        hulyQuery<HulyAssociation>({
          ...associationClassFilterQuery(filters),
          nameB: identifier
        }),
        { limit: ASSOCIATION_LOOKUP_AMBIGUITY_LIMIT }
      )
    )

    const rolePair = identifier.split(" -> ")
    if (rolePair.length === 2) {
      addCandidates(
        yield* client.findAll<HulyAssociation>(
          core.class.Association,
          hulyQuery<HulyAssociation>({
            ...associationClassFilterQuery(filters),
            nameA: rolePair[0],
            nameB: rolePair[1]
          }),
          { limit: ASSOCIATION_LOOKUP_AMBIGUITY_LIMIT }
        )
      )
    }

    const candidates = [...nameCandidates.values()]

    if (candidates.length === 0) {
      return yield* new AssociationNotFoundError({ identifier })
    }
    if (candidates.length > 1) {
      return yield* new AssociationIdentifierAmbiguousError({
        identifier,
        candidates: candidates.map(toCandidate)
      })
    }
    return candidates[0]
  })

const rejectSystemClass = (
  className: ObjectClassName,
  operation: "create_association" | "create_relation" | "delete_relation"
): Effect.Effect<void, AssociationSystemClassUnsupportedError> =>
  isSystemClassName(String(className))
    ? Effect.fail(new AssociationSystemClassUnsupportedError({ className, operation }))
    : Effect.void

const systemClassInAssociation = (association: HulyAssociation): ObjectClassName | undefined => {
  if (isSystemClassName(String(association.classA))) {
    return ObjectClassName.make(association.classA)
  }
  if (isSystemClassName(String(association.classB))) {
    return ObjectClassName.make(association.classB)
  }
  return undefined
}

const ensureRelationMutationSupported = (
  association: HulyAssociation,
  operation: "create_relation" | "delete_relation"
): Effect.Effect<void, AssociationSystemClassUnsupportedError | RelationMutationUnsupportedError> => {
  const systemClass = systemClassInAssociation(association)
  if (systemClass !== undefined) {
    return Effect.fail(new AssociationSystemClassUnsupportedError({ className: systemClass, operation }))
  }
  if (associationAutomationOnly(association)) {
    return Effect.fail(
      new RelationMutationUnsupportedError({
        associationId: AssociationId.make(association._id),
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
  automationOnly: params.automationOnly ?? false
})

export const createAssociation = (
  params: CreateAssociationParams
): Effect.Effect<CreateAssociationResult, GenericAssociationsError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    yield* rejectSystemClass(params.sourceClass, "create_association")
    yield* rejectSystemClass(params.targetClass, "create_association")

    const existing = yield* client.findOne<HulyAssociation>(
      core.class.Association,
      hulyQuery(exactAssociationQuery(params))
    )
    if (existing !== undefined) {
      if (params.ifExists === "fail") {
        return yield* new AssociationConflictError({
          associationId: AssociationId.make(existing._id),
          reason: "ifExists=fail was requested"
        })
      }
      if (cardinality(existing.type) !== params.cardinality) {
        return yield* new AssociationConflictError({
          associationId: AssociationId.make(existing._id),
          reason: `existing cardinality is ${cardinality(existing.type)}, requested ${params.cardinality}`
        })
      }
      if (associationAutomationOnly(existing) !== (params.automationOnly ?? false)) {
        return yield* new AssociationConflictError({
          associationId: AssociationId.make(existing._id),
          reason: `existing automationOnly is ${associationAutomationOnly(existing)}, requested ${
            params.automationOnly ?? false
          }`
        })
      }
      return {
        association: toAssociationSummary(existing),
        created: false,
        existing: true
      }
    }

    const attributes: AssociationDataWithAutomation = {
      classA: toClassRef(params.sourceClass),
      classB: toClassRef(params.targetClass),
      nameA: params.sourceRole,
      nameB: params.targetRole,
      type: SDK_CARDINALITY[params.cardinality],
      automationOnly: params.automationOnly ?? false
    }
    const associationId = yield* client.createDoc<HulyAssociation>(
      core.class.Association,
      toRef<Space>(core.space.Model),
      attributes
    )

    return {
      association: toAssociationSummary(createdAssociationSummaryInput(associationId, params)),
      created: true,
      existing: false
    }
  })

const ensureAssociationDeletionSupported = (
  association: HulyAssociation
): Effect.Effect<void, AssociationSystemClassUnsupportedError> => {
  const systemClass = systemClassInAssociation(association)
  return systemClass === undefined
    ? Effect.void
    : Effect.fail(
      new AssociationSystemClassUnsupportedError({
        className: systemClass,
        operation: "delete_association"
      })
    )
}

const countAssociationRelations = (
  client: HulyClientOperations,
  association: HulyAssociation
): Effect.Effect<
  Readonly<{ total: ListTotal; hasRelations: boolean; sampleRelationIds: Array<RelationId> }>,
  HulyClientError
> =>
  Effect.map(
    client.findAll<HulyRelation>(
      core.class.Relation,
      hulyQuery<HulyRelation>({
        association: toRef<HulyAssociation>(association._id)
      }),
      { limit: 5 }
    ),
    (relations) => {
      const sdkTotal = listTotal(relations.total)
      return {
        total: sdkTotal === UNKNOWN_TOTAL ? UNKNOWN_TOTAL : Count.make(Math.max(sdkTotal, relations.length)),
        hasRelations: relations.total > 0 || relations.length > 0,
        sampleRelationIds: relations.map((relation) => RelationId.make(relation._id))
      }
    }
  )

export const deleteAssociation = (
  params: DeleteAssociationParams
): Effect.Effect<DeleteAssociationResult, GenericAssociationsError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const association = yield* resolveAssociation(
      client,
      params.association,
      MUTATION_ASSOCIATION_FILTERS
    ).pipe(
      Effect.catchTag("AssociationNotFoundError", () => Effect.succeed(undefined))
    )

    if (association === undefined) {
      return {
        association: params.association,
        deleted: false,
        relationCount: Count.make(0),
        reason: "not_found"
      }
    }

    yield* ensureAssociationDeletionSupported(association)
    const relationUsage = yield* countAssociationRelations(client, association)
    if (relationUsage.hasRelations) {
      return yield* new AssociationInUseError({
        associationId: AssociationId.make(association._id),
        relationCount: relationUsage.total,
        sampleRelationIds: relationUsage.sampleRelationIds
      })
    }

    yield* client.removeDoc<HulyAssociation>(core.class.Association, association.space, association._id)
    return {
      association: params.association,
      associationId: AssociationId.make(association._id),
      deleted: true,
      relationCount: Count.make(0),
      reason: "deleted"
    }
  })

export const listAssociations = (
  params: ListAssociationsParams
): Effect.Effect<ListAssociationsResult, GenericAssociationsError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient

    if (params.association !== undefined) {
      const association = yield* resolveAssociation(client, params.association, associationFiltersFromParams(params))
      const summary = toAssociationSummary(association)
      return {
        associations: params.writableOnly === true && !summary.canCreateRelation ? [] : [summary],
        total: listTotal(params.writableOnly === true && !summary.canCreateRelation ? 0 : 1)
      }
    }

    const associations = filterVisible(
      yield* listAssociationDocs(client, { ...params, limit: ASSOCIATION_DISCOVERY_LIMIT }),
      associationListFiltersFromParams(params)
    ).slice(0, clampLimit(params.limit))
    const summaries = associations.map(toAssociationSummary)

    return {
      associations: summaries,
      total: listTotal(summaries.length)
    }
  })

const displayFromDoc = (doc: Doc): string => {
  for (const field of ["identifier", "title", "name"]) {
    const value = Reflect.get(doc, field)
    if (typeof value === "string" && value.trim() !== "") {
      return value
    }
  }
  return doc._id
}

const resolvedSummary = (
  doc: Doc,
  locatorKind: ResolvedObjectSummary["locatorKind"],
  warning?: string
): ResolvedObjectSummary => ({
  id: DocId.make(doc._id),
  class: ObjectClassName.make(doc._class),
  display: NonEmptyString.make(displayFromDoc(doc)),
  locatorKind,
  warning
})

const findRawDoc = (
  client: HulyClientOperations,
  id: string,
  className: string
): Effect.Effect<Doc | undefined, HulyClientError> =>
  client.findOne<Doc>(
    toClassRef(className),
    hulyQuery<Doc>({ _id: toRef<Doc>(id) })
  )

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
  return Effect.gen(function*() {
    const docsById = new Map<Ref<Doc>, Doc>()
    for (const chunk of chunkValues(ids, MAX_LIMIT)) {
      const docs = yield* client.findAll<Doc>(
        className,
        hulyQuery<Doc>({
          _id: { $in: [...chunk] }
        }),
        { limit: chunk.length }
      )
      for (const doc of docs) {
        docsById.set(doc._id, doc)
      }
    }
    return docsById
  })
}

const validateExpectedClass = (
  summary: ResolvedObjectSummary,
  expectedClass: string | undefined,
  field: RelationEndpointField
): Effect.Effect<void, RelationEndpointClassMismatchError> => {
  if (expectedClass !== undefined && summary.class !== expectedClass) {
    return Effect.fail(
      new RelationEndpointClassMismatchError({
        field,
        expectedClass,
        actualClass: summary.class
      })
    )
  }
  return Effect.void
}

const endpointMatchesAssociationClass = (summary: ResolvedObjectSummary | undefined, className: string): boolean =>
  summary === undefined || summary.class === className

const validateEitherEndpointClasses = (
  association: HulyAssociation,
  source: ResolvedObjectSummary | undefined,
  target: ResolvedObjectSummary | undefined
): Effect.Effect<void, RelationEndpointClassMismatchError> => {
  const sourceClass = String(association.classA)
  const targetClass = String(association.classB)
  const matchesForward = endpointMatchesAssociationClass(source, sourceClass)
    && endpointMatchesAssociationClass(target, targetClass)
  const matchesReverse = endpointMatchesAssociationClass(source, targetClass)
    && endpointMatchesAssociationClass(target, sourceClass)

  if (matchesForward || matchesReverse) {
    return Effect.void
  }

  if (source !== undefined && source.class !== sourceClass && source.class !== targetClass) {
    return Effect.fail(
      new RelationEndpointClassMismatchError({
        field: "source",
        expectedClass: `${sourceClass} or ${targetClass}`,
        actualClass: source.class
      })
    )
  }

  if (target !== undefined && target.class !== sourceClass && target.class !== targetClass) {
    return Effect.fail(
      new RelationEndpointClassMismatchError({
        field: "target",
        expectedClass: `${sourceClass} or ${targetClass}`,
        actualClass: target.class
      })
    )
  }

  /* v8 ignore start -- this fallback is only reached with both endpoints defined, so the "missing" default is unreachable */
  const actualTargetClass = target === undefined ? "missing" : target.class
  /* v8 ignore stop */
  return Effect.fail(
    new RelationEndpointClassMismatchError({
      field: "target",
      expectedClass: source?.class === sourceClass ? targetClass : sourceClass,
      actualClass: actualTargetClass
    })
  )
}

const resolveIssueLocator = (
  locator: Extract<GenericObjectLocator, { kind: "issue" }>,
  field: RelationEndpointField
): Effect.Effect<ResolvedObjectSummary, GenericAssociationsError, HulyClient> =>
  Effect.gen(function*() {
    if (locator.project !== undefined) {
      const { issue } = yield* findProjectAndIssue({ project: locator.project, identifier: locator.issue })
      /* v8 ignore next -- success path delegates to issues-tested findProjectAndIssue; modeling projects here is integration overlap */
      return resolvedSummary(issue, "issue")
    }

    const match = String(locator.issue).match(/^([A-Z]+)-\d+$/i)
    if (match !== null) {
      const { client, project } = yield* findProject(match[1].toUpperCase())
      const issue = yield* findIssueInProject(client, project, locator.issue)
      /* v8 ignore next -- success path delegates to issues-tested findProject/findIssueInProject */
      return resolvedSummary(issue, "issue")
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
  Effect.gen(function*() {
    const byId = yield* client.findOne<HulyDocument>(
      documentPlugin.class.Document,
      hulyQuery<HulyDocument>({ _id: toRef<HulyDocument>(identifier) })
    )
    if (byId !== undefined) {
      return resolvedSummary(byId, "document")
    }

    const byTitle = yield* client.findAll<HulyDocument>(
      documentPlugin.class.Document,
      hulyQuery<HulyDocument>({ title: identifier }),
      { limit: 2 }
    )

    if (byTitle.length === 0) {
      return yield* new GenericObjectNotFoundError({
        field,
        identifier,
        class: documentPlugin.class.Document
      })
    }
    if (byTitle.length > 1) {
      return yield* new GenericObjectIdentifierAmbiguousError({
        field,
        identifier,
        candidates: byTitle.map((doc) => ({
          id: DocId.make(doc._id),
          class: ObjectClassName.make(doc._class),
          display: doc.title
        }))
      })
    }
    return resolvedSummary(byTitle[0], "document")
  })

const findCardById = (
  client: HulyClientOperations,
  identifier: CardIdentifier
): Effect.Effect<HulyCard | undefined, HulyClientError> =>
  client.findOne<HulyCard>(
    cardPlugin.class.Card,
    hulyQuery<HulyCard>({ _id: toRef<HulyCard>(identifier) })
  )

const findCardSpace = (
  client: HulyClientOperations,
  identifier: CardSpaceIdentifier,
  field: RelationEndpointField
): Effect.Effect<HulyCardSpace, GenericAssociationsError> =>
  Effect.gen(function*() {
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
      return yield* new GenericObjectNotFoundError({
        field,
        identifier,
        class: cardPlugin.class.CardSpace
      })
    }
    if (byName.length > 1) {
      return yield* new GenericObjectIdentifierAmbiguousError({
        field,
        identifier,
        candidates: byName.map((space) => ({
          id: DocId.make(space._id),
          class: ObjectClassName.make(space._class),
          display: space.name
        }))
      })
    }
    return byName[0]
  })

const resolveCardInSpace = (
  client: HulyClientOperations,
  identifier: CardIdentifier,
  cardSpace: HulyCardSpace,
  field: RelationEndpointField
): Effect.Effect<ResolvedObjectSummary, GenericAssociationsError> =>
  Effect.gen(function*() {
    const byId = yield* client.findOne<HulyCard>(
      cardPlugin.class.Card,
      hulyQuery<HulyCard>({ _id: toRef<HulyCard>(identifier), space: cardSpace._id })
    )
    if (byId !== undefined) {
      return resolvedSummary(byId, "card")
    }

    const byTitle = yield* client.findAll<HulyCard>(
      cardPlugin.class.Card,
      hulyQuery<HulyCard>({ title: identifier, space: cardSpace._id }),
      { limit: 2 }
    )
    if (byTitle.length === 0) {
      return yield* new GenericObjectNotFoundError({
        field,
        identifier,
        class: cardPlugin.class.Card
      })
    }
    if (byTitle.length > 1) {
      return yield* new GenericObjectIdentifierAmbiguousError({
        field,
        identifier,
        candidates: byTitle.map((card) => ({
          id: DocId.make(card._id),
          class: ObjectClassName.make(card._class),
          display: card.title
        }))
      })
    }
    return resolvedSummary(byTitle[0], "card")
  })

const resolveCardLocator = (
  client: HulyClientOperations,
  locator: Extract<GenericObjectLocator, { kind: "card" }>,
  field: RelationEndpointField
): Effect.Effect<ResolvedObjectSummary, GenericAssociationsError> =>
  Effect.gen(function*() {
    if (locator.cardSpace !== undefined) {
      const cardSpace = yield* findCardSpace(client, locator.cardSpace, field)
      return yield* resolveCardInSpace(client, locator.card, cardSpace, field)
    }

    const byId = yield* findCardById(client, locator.card)
    if (byId !== undefined) {
      return resolvedSummary(byId, "card")
    }

    return yield* new GenericObjectLocatorInvalidError({
      field,
      reason: `card '${locator.card}' was not found by ID; exact card title lookup requires cardSpace`
    })
  })

const resolveGenericObject = (
  client: HulyClientOperations,
  locator: GenericObjectLocator,
  expectedClass: string | undefined,
  field: RelationEndpointField
): Effect.Effect<ResolvedObjectSummary, GenericAssociationsError, HulyClient> =>
  Effect.gen(function*() {
    switch (locator.kind) {
      case "raw": {
        const className = locator.class ?? expectedClass
        if (className === undefined) {
          return yield* new GenericObjectLocatorInvalidError({
            field,
            reason: "raw object locator requires class unless association side class is known"
          })
        }
        const doc = yield* findRawDoc(client, locator.id, className)
        if (doc === undefined) {
          return yield* new GenericObjectNotFoundError({
            field,
            identifier: locator.id,
            class: className
          })
        }
        const summary = resolvedSummary(doc, "raw")
        yield* validateExpectedClass(summary, expectedClass, field)
        return summary
      }
      case "issue": {
        const summary = yield* resolveIssueLocator(locator, field)
        yield* validateExpectedClass(summary, expectedClass, field)
        return summary
      }
      case "document": {
        const summary = locator.teamspace === undefined
          ? yield* resolveDocumentWithoutTeamspace(client, locator.document, field)
          : resolvedSummary(
            (yield* findTeamspaceAndDocument({
              teamspace: locator.teamspace,
              document: locator.document
            })).doc,
            "document"
          )
        yield* validateExpectedClass(summary, expectedClass, field)
        return summary
      }
      case "card": {
        const summary = yield* resolveCardLocator(client, locator, field)
        yield* validateExpectedClass(summary, expectedClass, field)
        return summary
      }
    }
  })

const unresolvedRelationEndpoint = (
  id: string,
  className: string,
  warning: string
): ResolvedObjectSummary => ({
  id: DocId.make(id),
  class: ObjectClassName.make(className),
  display: NonEmptyString.make(id),
  locatorKind: "raw",
  warning
})

const resolveRelationEndpointFromCache = (
  docsByClass: ReadonlyMap<Ref<Class<Doc>>, ReadonlyMap<Ref<Doc>, Doc>>,
  id: Ref<Doc>,
  className: Ref<Class<Doc>>
): ResolvedObjectSummary => {
  const doc = docsByClass.get(className)?.get(id)
  return doc === undefined
    ? unresolvedRelationEndpoint(id, className, `Could not resolve related ${className} document for display.`)
    : resolvedSummary(doc, "raw")
}

const relationToSummary = (
  association: HulyAssociation,
  relation: HulyRelation,
  docsByClass: ReadonlyMap<Ref<Class<Doc>>, ReadonlyMap<Ref<Doc>, Doc>>
): RelationSummary => ({
  relationId: RelationId.make(relation._id),
  associationId: AssociationId.make(association._id),
  associationName: associationName(association),
  source: resolveRelationEndpointFromCache(docsByClass, relation.docA, association.classA),
  target: resolveRelationEndpointFromCache(docsByClass, relation.docB, association.classB),
  createdOn: relation.createdOn,
  modifiedOn: relation.modifiedOn
})

const relationsToSummaries = (
  client: HulyClientOperations,
  pairs: ReadonlyArray<RelationAssociationPair>
): Effect.Effect<Array<RelationSummary>, HulyClientError> =>
  Effect.gen(function*() {
    const idsByClass = new Map<Ref<Class<Doc>>, Set<Ref<Doc>>>()
    const addEndpoint = (className: Ref<Class<Doc>>, id: Ref<Doc>): void => {
      const ids = idsByClass.get(className) ?? new Set<Ref<Doc>>()
      ids.add(id)
      idsByClass.set(className, ids)
    }

    for (const { association, relation } of pairs) {
      addEndpoint(association.classA, relation.docA)
      addEndpoint(association.classB, relation.docB)
    }

    const docsByClassEntries = yield* Effect.forEach(
      [...idsByClass.entries()],
      ([className, ids]) =>
        Effect.map(
          findDocsByClass(client, className, [...ids]),
          (docs): readonly [Ref<Class<Doc>>, Map<Ref<Doc>, Doc>] => [className, docs]
        )
    )
    const docsByClass = new Map(docsByClassEntries)

    return pairs.map(({ association, relation }) => relationToSummary(association, relation, docsByClass))
  })

const directionQueries = (
  association: HulyAssociation,
  source: ResolvedObjectSummary | undefined,
  target: ResolvedObjectSummary | undefined,
  direction: RelationDirection
): Array<StrictDocumentQuery<HulyRelation>> => {
  const makeQuery = (reversed: boolean): StrictDocumentQuery<HulyRelation> => {
    const query: StrictDocumentQuery<HulyRelation> = {
      association: toRef<HulyAssociation>(association._id)
    }
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
    return source === undefined && target === undefined
      ? [makeQuery(false)]
      : [makeQuery(false), makeQuery(true)]
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

  const queries = direction === "target-to-source"
    ? [makeQuery(true)]
    : direction === "either"
    ? [makeQuery(false), makeQuery(true)]
    : [makeQuery(false)]
  const byKey = new Map<string, StrictDocumentQuery<HulyAssociation>>()
  for (const query of queries) {
    byKey.set(`${String(query.classA)}\u0000${String(query.classB)}`, query)
  }
  return [...byKey.values()]
}

const findVisibleAssociationsForEndpoints = (
  client: HulyClientOperations,
  source: ResolvedObjectSummary | undefined,
  target: ResolvedObjectSummary | undefined,
  direction: RelationDirection
): Effect.Effect<AssociationDiscoveryResult, HulyClientError> =>
  Effect.gen(function*() {
    const discoveryResults = yield* Effect.forEach(
      associationEndpointQueries(source, target, direction),
      (query): Effect.Effect<AssociationDiscoveryResult, HulyClientError> =>
        Effect.gen(function*() {
          const associations = yield* client.findAll<HulyAssociation>(
            core.class.Association,
            hulyQuery(query),
            {
              limit: ASSOCIATION_DISCOVERY_LIMIT,
              sort: { modifiedOn: SortingOrder.Descending }
            }
          )
          return {
            associations,
            limitReached: associations.length >= ASSOCIATION_DISCOVERY_LIMIT
          }
        })
    )
    const byId = new Map<Ref<HulyAssociation>, HulyAssociation>()
    for (const { associations } of discoveryResults) {
      for (const association of associations) {
        if (
          associationMatchesFilters(association, VISIBLE_ASSOCIATION_FILTERS)
          && associationMatchesEndpoints(association, source, target, direction)
        ) {
          byId.set(association._id, association)
        }
      }
    }
    return {
      associations: [...byId.values()],
      limitReached: discoveryResults.some((result) => result.limitReached)
    }
  })

const findRelationsForAssociation = (
  client: HulyClientOperations,
  association: HulyAssociation,
  source: ResolvedObjectSummary | undefined,
  target: ResolvedObjectSummary | undefined,
  direction: RelationDirection,
  limit: number
): Effect.Effect<Array<HulyRelation>, HulyClientError> =>
  Effect.gen(function*() {
    const byId = new Map<string, HulyRelation>()
    for (const query of directionQueries(association, source, target, direction)) {
      const relations = yield* client.findAll<HulyRelation>(
        core.class.Relation,
        hulyQuery(query),
        { limit }
      )
      for (const relation of relations) {
        byId.set(relation._id, relation)
      }
    }
    return [...byId.values()].slice(0, limit)
  })

const associationMatchesEndpoints = (
  association: HulyAssociation,
  source: ResolvedObjectSummary | undefined,
  target: ResolvedObjectSummary | undefined,
  direction: RelationDirection
): boolean => {
  if (direction === "target-to-source") {
    return (source === undefined || String(source.class) === association.classB)
      && (target === undefined || String(target.class) === association.classA)
  }

  if (direction === "either") {
    const matchesForward = (source === undefined || String(source.class) === association.classA)
      && (target === undefined || String(target.class) === association.classB)
    const matchesReverse = (source === undefined || String(source.class) === association.classB)
      && (target === undefined || String(target.class) === association.classA)
    return matchesForward || matchesReverse
  }

  return (source === undefined || String(source.class) === association.classA)
    && (target === undefined || String(target.class) === association.classB)
}

const listRelationsForResolvedEndpoints = (
  client: HulyClientOperations,
  associations: ReadonlyArray<HulyAssociation>,
  source: ResolvedObjectSummary | undefined,
  target: ResolvedObjectSummary | undefined,
  direction: RelationDirection,
  limit: number
): Effect.Effect<Array<RelationSummary>, HulyClientError> =>
  Effect.gen(function*() {
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
  associationIds: ReadonlyArray<Ref<HulyAssociation>>,
  source: ResolvedObjectSummary | undefined,
  target: ResolvedObjectSummary | undefined,
  direction: RelationDirection,
  limit: number
): Effect.Effect<Array<HulyRelation>, HulyClientError> =>
  Effect.gen(function*() {
    if (associationIds.length === 0) {
      return []
    }
    const byId = new Map<string, HulyRelation>()
    for (const query of relationDirectionQueries(source, target, direction)) {
      const relations = yield* client.findAll<HulyRelation>(
        core.class.Relation,
        hulyQuery<HulyRelation>({
          ...query,
          association: { $in: [...associationIds] }
        }),
        {
          limit,
          sort: { modifiedOn: SortingOrder.Descending }
        }
      )
      for (const relation of relations) {
        byId.set(relation._id, relation)
      }
    }
    return [...byId.values()]
      .sort((left, right) => right.modifiedOn - left.modifiedOn)
      .slice(0, limit)
  })

const listRelationsWithoutAssociation = (
  client: HulyClientOperations,
  source: ResolvedObjectSummary | undefined,
  target: ResolvedObjectSummary | undefined,
  direction: RelationDirection,
  limit: number
): Effect.Effect<
  { readonly summaries: Array<RelationSummary>; readonly warnings?: ListRelationsWarnings },
  HulyClientError
> =>
  Effect.gen(function*() {
    const { associations, limitReached } = yield* findVisibleAssociationsForEndpoints(client, source, target, direction)
    const associationsById = new Map(associations.map((association) => [association._id, association]))
    const relations = yield* findRelationsForAssociationIdsAndEndpoints(
      client,
      uniqueValues(associations.map((association) => association._id)),
      source,
      target,
      direction,
      limit
    )
    const pairs = relations.flatMap((relation): Array<RelationAssociationPair> => {
      const association = associationsById.get(relation.association)
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

export const listRelations = (
  params: ListRelationsParams
): Effect.Effect<ListRelationsResult, GenericAssociationsError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const limit = clampLimit(params.limit)
    const direction = params.direction ?? DefaultRelationDirection

    if (params.association === undefined) {
      const source = params.source === undefined
        ? undefined
        : yield* resolveGenericObject(client, params.source, undefined, "source")
      const target = params.target === undefined
        ? undefined
        : yield* resolveGenericObject(client, params.target, undefined, "target")
      const { summaries, warnings } = yield* listRelationsWithoutAssociation(client, source, target, direction, limit)

      return {
        relations: summaries,
        total: listTotal(summaries.length),
        ...(warnings !== undefined ? { warnings } : {})
      }
    }

    const association = yield* resolveAssociation(client, params.association, MUTATION_ASSOCIATION_FILTERS)
    const sourceClass = direction === "either"
      ? undefined
      : direction === "target-to-source"
      ? association.classB
      : association.classA
    const targetClass = direction === "either"
      ? undefined
      : direction === "target-to-source"
      ? association.classA
      : association.classB
    const source = params.source === undefined
      ? undefined
      : yield* resolveGenericObject(client, params.source, sourceClass, "source")
    const target = params.target === undefined
      ? undefined
      : yield* resolveGenericObject(client, params.target, targetClass, "target")
    if (direction === "either") {
      yield* validateEitherEndpointClasses(association, source, target)
    }
    const summaries = yield* listRelationsForResolvedEndpoints(client, [association], source, target, direction, limit)

    return {
      relations: summaries,
      total: listTotal(summaries.length)
    }
  })

const resolveRelationWriteEndpoints = (
  client: HulyClientOperations,
  association: HulyAssociation,
  params: Pick<CreateRelationParams, "source" | "target" | "direction">
): Effect.Effect<ResolvedRelationWriteEndpoints, GenericAssociationsError, HulyClient> =>
  Effect.gen(function*() {
    const direction = params.direction ?? DefaultRelationDirection

    if (direction === "source-to-target") {
      const source = yield* resolveGenericObject(client, params.source, association.classA, "source")
      const target = yield* resolveGenericObject(client, params.target, association.classB, "target")
      return { docA: source, docB: target, source, target }
    }

    if (direction === "target-to-source") {
      const source = yield* resolveGenericObject(client, params.source, association.classB, "source")
      const target = yield* resolveGenericObject(client, params.target, association.classA, "target")
      return { docA: target, docB: source, source, target }
    }

    const source = yield* resolveGenericObject(client, params.source, undefined, "source")
    const target = yield* resolveGenericObject(client, params.target, undefined, "target")
    const matchesForward = String(source.class) === association.classA && String(target.class) === association.classB
    const matchesReverse = String(source.class) === association.classB && String(target.class) === association.classA

    if (matchesForward && matchesReverse) {
      return yield* new RelationDirectionAmbiguousError({
        associationId: AssociationId.make(association._id),
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
      expectedClass: `${association.classA} or ${association.classB}`,
      actualClass: source.class
    })
  })

const exactRelationQuery = (
  association: HulyAssociation,
  endpoints: Pick<ResolvedRelationWriteEndpoints, "docA" | "docB">
): StrictDocumentQuery<HulyRelation> => ({
  association: toRef<HulyAssociation>(association._id),
  docA: toRef<Doc>(endpoints.docA.id),
  docB: toRef<Doc>(endpoints.docB.id)
})

const findExactRelations = (
  client: HulyClientOperations,
  association: HulyAssociation,
  endpoints: Pick<ResolvedRelationWriteEndpoints, "docA" | "docB">,
  limit: number
): Effect.Effect<Array<HulyRelation>, HulyClientError> =>
  Effect.map(
    client.findAll<HulyRelation>(
      core.class.Relation,
      hulyQuery(exactRelationQuery(association, endpoints)),
      { limit }
    ),
    (relations) => [...relations]
  )

const findCardinalityConflict = (
  client: HulyClientOperations,
  association: HulyAssociation,
  endpoints: Pick<ResolvedRelationWriteEndpoints, "docA" | "docB">
): Effect.Effect<HulyRelation | undefined, HulyClientError> =>
  Effect.gen(function*() {
    if (association.type === "N:N") {
      return undefined
    }

    const docBConflict = yield* client.findOne<HulyRelation>(
      core.class.Relation,
      hulyQuery<HulyRelation>({
        association: toRef<HulyAssociation>(association._id),
        docB: toRef<Doc>(endpoints.docB.id)
      })
    )
    if (docBConflict !== undefined) {
      return docBConflict
    }

    if (association.type === "1:1") {
      return yield* client.findOne<HulyRelation>(
        core.class.Relation,
        hulyQuery<HulyRelation>({
          association: toRef<HulyAssociation>(association._id),
          docA: toRef<Doc>(endpoints.docA.id)
        })
      )
    }
    return undefined
  })

const enforceCardinality = (
  client: HulyClientOperations,
  association: HulyAssociation,
  endpoints: Pick<ResolvedRelationWriteEndpoints, "docA" | "docB">
): Effect.Effect<void, HulyClientError | RelationCardinalityViolationError> =>
  Effect.gen(function*() {
    const conflict = yield* findCardinalityConflict(client, association, endpoints)
    if (conflict === undefined) {
      return
    }

    const reason = association.type === "1:1"
      ? "one-to-one associations allow each endpoint to appear in only one relation"
      : "one-to-many associations allow each target-side endpoint to appear in only one relation"
    return yield* new RelationCardinalityViolationError({
      associationId: AssociationId.make(association._id),
      cardinality: cardinality(association.type),
      reason
    })
  })

export const createRelation = (
  params: CreateRelationParams
): Effect.Effect<CreateRelationResult, GenericAssociationsError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const association = yield* resolveAssociation(client, params.association, MUTATION_ASSOCIATION_FILTERS)
    yield* ensureRelationMutationSupported(association, "create_relation")
    const endpoints = yield* resolveRelationWriteEndpoints(client, association, params)

    const exact = yield* findExactRelations(client, association, endpoints, 1)
    const existing = exact.at(0)
    if (existing !== undefined) {
      if (params.ifExists === "fail") {
        return yield* new RelationCardinalityViolationError({
          associationId: AssociationId.make(association._id),
          cardinality: cardinality(association.type),
          reason: `relation '${existing._id}' already exists`
        })
      }
      return {
        relationId: RelationId.make(existing._id),
        associationId: AssociationId.make(association._id),
        source: endpoints.source,
        target: endpoints.target,
        created: false,
        existing: true
      }
    }

    yield* enforceCardinality(client, association, endpoints)
    const relationId = yield* client.createDoc<HulyRelation>(
      core.class.Relation,
      toRef<Space>(core.space.Workspace),
      {
        association: toRef<HulyAssociation>(association._id),
        docA: toRef<Doc>(endpoints.docA.id),
        docB: toRef<Doc>(endpoints.docB.id)
      }
    )

    return {
      relationId: RelationId.make(relationId),
      associationId: AssociationId.make(association._id),
      source: endpoints.source,
      target: endpoints.target,
      created: true,
      existing: false
    }
  })

export const deleteRelation = (
  params: DeleteRelationParams
): Effect.Effect<DeleteRelationResult, GenericAssociationsError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient

    if ("relation" in params) {
      const existing = yield* client.findOne<HulyRelation>(
        core.class.Relation,
        hulyQuery<HulyRelation>({ _id: toRef<HulyRelation>(params.relation) })
      )
      if (existing === undefined) {
        return {
          relationId: RelationId.make(params.relation),
          deleted: false,
          reason: "not_found"
        }
      }

      const association = yield* resolveAssociation(client, existing.association, MUTATION_ASSOCIATION_FILTERS)
      yield* ensureRelationMutationSupported(association, "delete_relation")
      yield* client.removeDoc<HulyRelation>(core.class.Relation, existing.space, existing._id)
      return {
        relationId: RelationId.make(existing._id),
        associationId: AssociationId.make(association._id),
        deleted: true,
        reason: "deleted"
      }
    }

    const association = yield* resolveAssociation(client, params.association, MUTATION_ASSOCIATION_FILTERS)
    yield* ensureRelationMutationSupported(association, "delete_relation")
    const endpoints = yield* resolveRelationWriteEndpoints(client, association, params)
    const matches = yield* findExactRelations(client, association, endpoints, 2)

    if (matches.length === 0) {
      return {
        associationId: AssociationId.make(association._id),
        deleted: false,
        reason: "not_found"
      }
    }
    if (matches.length > 1) {
      return yield* new RelationIdentifierAmbiguousError({
        identifier: `${params.association}/${endpoints.docA.id}/${endpoints.docB.id}`,
        relationIds: matches.map((relation) => RelationId.make(relation._id))
      })
    }

    yield* client.removeDoc<HulyRelation>(core.class.Relation, matches[0].space, matches[0]._id)
    return {
      relationId: RelationId.make(matches[0]._id),
      associationId: AssociationId.make(association._id),
      deleted: true,
      reason: "deleted"
    }
  })
