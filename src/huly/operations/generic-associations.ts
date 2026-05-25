/* eslint-disable max-lines -- generic association discovery, relation lookup, and guarded mutation entrypoints are kept together to preserve one feature boundary */
import type { Association as HulyAssociation, Class, Doc, Ref, Relation as HulyRelation } from "@hcengineering/core"
import { SortingOrder } from "@hcengineering/core"
import type { Document as HulyDocument } from "@hcengineering/document"
import { Effect } from "effect"

import type {
  AssociationSummary,
  Cardinality,
  CreateRelationParams,
  CreateRelationResult,
  DeleteRelationParams,
  DeleteRelationResult,
  GenericObjectLocator,
  ListAssociationsParams,
  ListAssociationsResult,
  ListRelationsParams,
  ListRelationsResult,
  ListRelationsWarning as ListRelationsWarningType,
  RelationDirection,
  RelationSummary,
  ResolvedObjectSummary
} from "../../domain/schemas/generic-associations.js"
import { DefaultRelationDirection, ListRelationsWarning } from "../../domain/schemas/generic-associations.js"
import {
  AssociationId,
  DocId,
  MAX_LIMIT,
  NonEmptyString,
  ObjectClassName,
  RelationId
} from "../../domain/schemas/shared.js"
import { HulyClient, type HulyClientError, type HulyClientOperations } from "../client.js"
import type {
  DocumentNotFoundError,
  IssueNotFoundError,
  ProjectNotFoundError,
  TeamspaceNotFoundError
} from "../errors.js"
import {
  AssociationIdentifierAmbiguousError,
  AssociationNotFoundError,
  GenericObjectIdentifierAmbiguousError,
  GenericObjectLocatorInvalidError,
  GenericObjectNotFoundError,
  RelationEndpointClassMismatchError,
  RelationMutationUnsupportedError
} from "../errors.js"
import { core, documentPlugin, tracker } from "../huly-plugins.js"
import { findTeamspaceAndDocument } from "./documents.js"
import { findIssueInProject, findProject, findProjectAndIssue } from "./issues-shared.js"
import { clampLimit, hulyQuery, type StrictDocumentQuery } from "./query-helpers.js"
import { toClassRef, toRef } from "./sdk-boundary.js"

type GenericAssociationsError =
  | HulyClientError
  | AssociationNotFoundError
  | AssociationIdentifierAmbiguousError
  | ProjectNotFoundError
  | TeamspaceNotFoundError
  | DocumentNotFoundError
  | RelationMutationUnsupportedError
  | RelationEndpointClassMismatchError
  | GenericObjectIdentifierAmbiguousError
  | GenericObjectLocatorInvalidError
  | GenericObjectNotFoundError
  | IssueNotFoundError

type AssociationCandidate = {
  readonly id: AssociationId
  readonly name?: string | undefined
  readonly sourceClass?: string | undefined
  readonly targetClass?: string | undefined
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

type AssociationDiscoveryResult = {
  readonly associations: Array<HulyAssociation>
  readonly limitReached: boolean
}

type ListRelationsWarnings = readonly [ListRelationsWarningType, ...Array<ListRelationsWarningType>]

const WRITE_UNSUPPORTED_REASON = "no generic association relation write path has been live-validated for this workspace"
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

const associationName = (association: HulyAssociation): string | undefined =>
  association.nameA === association.nameB
    ? association.nameA
    : `${association.nameA} -> ${association.nameB}`

const optionalNonEmpty = (value: string | undefined): NonEmptyString | undefined =>
  value === undefined ? undefined : NonEmptyString.make(value)

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

const isSystemAssociation = (association: HulyAssociation): boolean =>
  String(association.classA).startsWith("core:class:") || String(association.classB).startsWith("core:class:")

const isSymmetric = (association: HulyAssociation): boolean =>
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

const toAssociationSummary = (association: HulyAssociation): AssociationSummary => {
  const sourceClass = ObjectClassName.make(association.classA)
  const targetClass = ObjectClassName.make(association.classB)

  return {
    associationId: AssociationId.make(association._id),
    name: optionalNonEmpty(associationName(association)),
    sourceClass,
    sourceClassLabel: classLabel(sourceClass),
    targetClass,
    targetClassLabel: classLabel(targetClass),
    sourceRole: NonEmptyString.make(association.nameA),
    targetRole: NonEmptyString.make(association.nameB),
    relationClass: ObjectClassName.make(core.class.Relation),
    cardinality: cardinality(association.type),
    symmetric: isSymmetric(association),
    system: isSystemAssociation(association),
    canListRelations: true,
    canCreateRelation: false,
    canDeleteRelation: false,
    unsupportedReason: WRITE_UNSUPPORTED_REASON
  }
}

const toCandidate = (association: HulyAssociation): AssociationCandidate => ({
  id: AssociationId.make(association._id),
  name: associationName(association),
  sourceClass: association.classA,
  targetClass: association.classB
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
    && !filters.writableOnly
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
        total: params.writableOnly === true && !summary.canCreateRelation ? 0 : 1
      }
    }

    const associations = filterVisible(
      yield* listAssociationDocs(client, { ...params, limit: ASSOCIATION_DISCOVERY_LIMIT }),
      associationListFiltersFromParams(params)
    ).slice(0, clampLimit(params.limit))
    const summaries = associations.map(toAssociationSummary)

    return {
      associations: summaries,
      total: summaries.length
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
): Effect.Effect<Map<Ref<Doc>, Doc>, HulyClientError> =>
  ids.length === 0
    ? Effect.succeed(new Map())
    : Effect.gen(function*() {
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

const validateExpectedClass = (
  summary: ResolvedObjectSummary,
  expectedClass: string | undefined,
  field: string
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

  return Effect.fail(
    new RelationEndpointClassMismatchError({
      field: "target",
      expectedClass: source?.class === sourceClass ? targetClass : sourceClass,
      actualClass: target?.class ?? "missing"
    })
  )
}

const resolveIssueLocator = (
  locator: Extract<GenericObjectLocator, { kind: "issue" }>,
  field: string
): Effect.Effect<ResolvedObjectSummary, GenericAssociationsError, HulyClient> =>
  Effect.gen(function*() {
    if (locator.project !== undefined) {
      const { issue } = yield* findProjectAndIssue({ project: locator.project, identifier: locator.issue })
      return resolvedSummary(issue, "issue")
    }

    const match = String(locator.issue).match(/^([A-Z]+)-\d+$/i)
    if (match !== null) {
      const { client, project } = yield* findProject(match[1].toUpperCase())
      const issue = yield* findIssueInProject(client, project, locator.issue)
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
  field: string
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

const resolveGenericObject = (
  client: HulyClientOperations,
  locator: GenericObjectLocator,
  expectedClass: string | undefined,
  field: string
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
  associationName: optionalNonEmpty(associationName(association)),
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
      if (!associationMatchesEndpoints(association, source, target, direction)) {
        continue
      }

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
      if (association === undefined) {
        return []
      }
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
        total: summaries.length,
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
      total: summaries.length
    }
  })

export const createRelation = (
  params: CreateRelationParams
): Effect.Effect<CreateRelationResult, GenericAssociationsError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const association = yield* resolveAssociation(client, params.association, MUTATION_ASSOCIATION_FILTERS)

    return yield* new RelationMutationUnsupportedError({
      associationId: AssociationId.make(association._id),
      reason: WRITE_UNSUPPORTED_REASON
    })
  })

export const deleteRelation = (
  params: DeleteRelationParams
): Effect.Effect<DeleteRelationResult, GenericAssociationsError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const association = "association" in params
      ? yield* resolveAssociation(client, params.association, MUTATION_ASSOCIATION_FILTERS)
      : undefined

    return yield* new RelationMutationUnsupportedError({
      associationId: association === undefined ? undefined : AssociationId.make(association._id),
      reason: WRITE_UNSUPPORTED_REASON
    })
  })
