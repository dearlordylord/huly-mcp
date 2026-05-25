/* eslint-disable max-lines -- generic association discovery, relation lookup, and guarded mutation entrypoints are kept together to preserve one feature boundary */
import type { Association as HulyAssociation, Doc, Relation as HulyRelation } from "@hcengineering/core"
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
  RelationDirection,
  RelationSummary,
  ResolvedObjectSummary
} from "../../domain/schemas/generic-associations.js"
import { DefaultRelationDirection } from "../../domain/schemas/generic-associations.js"
import { AssociationId, DocId, NonEmptyString, ObjectClassName, RelationId } from "../../domain/schemas/shared.js"
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
import { core, documentPlugin } from "../huly-plugins.js"
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

const WRITE_UNSUPPORTED_REASON = "no generic association relation write path has been live-validated for this workspace"
const ASSOCIATION_DISCOVERY_LIMIT = 200
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

const toAssociationSummary = (association: HulyAssociation): AssociationSummary => ({
  associationId: AssociationId.make(association._id),
  name: optionalNonEmpty(associationName(association)),
  sourceClass: ObjectClassName.make(association.classA),
  targetClass: ObjectClassName.make(association.classB),
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
})

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

const resolveRelationEndpoint = (
  client: HulyClientOperations,
  id: string,
  className: string
): Effect.Effect<ResolvedObjectSummary, HulyClientError> =>
  Effect.map(
    findRawDoc(client, id, className),
    (doc) =>
      doc === undefined
        ? unresolvedRelationEndpoint(id, className, `Could not resolve related ${className} document for display.`)
        : resolvedSummary(doc, "raw")
  )

const relationToSummary = (
  client: HulyClientOperations,
  association: HulyAssociation,
  relation: HulyRelation
): Effect.Effect<RelationSummary, HulyClientError> =>
  Effect.gen(function*() {
    const source = yield* resolveRelationEndpoint(client, relation.docA, association.classA)
    const target = yield* resolveRelationEndpoint(client, relation.docB, association.classB)
    return {
      relationId: RelationId.make(relation._id),
      associationId: AssociationId.make(association._id),
      associationName: optionalNonEmpty(associationName(association)),
      source,
      target,
      createdOn: relation.createdOn,
      modifiedOn: relation.modifiedOn
    }
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
    const summaries: Array<RelationSummary> = []
    for (const association of associations) {
      if (!associationMatchesEndpoints(association, source, target, direction)) {
        continue
      }

      const relations = yield* findRelationsForAssociation(client, association, source, target, direction, limit)
      for (const relation of relations) {
        summaries.push(yield* relationToSummary(client, association, relation))
        if (summaries.length >= limit) {
          break
        }
      }
      if (summaries.length >= limit) {
        break
      }
    }
    return summaries
  })

export const listRelations = (
  params: ListRelationsParams
): Effect.Effect<ListRelationsResult, GenericAssociationsError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const limit = clampLimit(params.limit)
    const direction = params.direction ?? DefaultRelationDirection

    if (params.association === undefined) {
      const associations = filterVisible(
        yield* listAssociationDocs(client, {
          includeSystem: false,
          limit: ASSOCIATION_DISCOVERY_LIMIT
        }),
        {
          ...VISIBLE_ASSOCIATION_FILTERS,
          writableOnly: false
        }
      )
      const source = params.source === undefined
        ? undefined
        : yield* resolveGenericObject(client, params.source, undefined, "source")
      const target = params.target === undefined
        ? undefined
        : yield* resolveGenericObject(client, params.target, undefined, "target")
      const summaries = yield* listRelationsForResolvedEndpoints(client, associations, source, target, direction, limit)

      return {
        relations: summaries,
        total: summaries.length
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
