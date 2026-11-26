import type { Class, Doc, DocumentUpdate, Ref, RelatedDocument } from "@hcengineering/core"
import type { Document as HulyDocument, Teamspace as HulyTeamspace } from "@hcengineering/document"
import type { Issue as HulyIssue, Project as HulyProject } from "@hcengineering/tracker"
import { Effect } from "effect"

import type {
  AddIssueRelationParams,
  AddIssueRelationResult,
  DocumentRelationEntry,
  ListIssueRelationsParams,
  ListIssueRelationsResult,
  RelationEntry,
  RemoveIssueRelationParams,
  RemoveIssueRelationResult
} from "../../domain/schemas/relations.js"
import {
  DocumentId,
  IssueId,
  IssueIdentifier,
  type TeamspaceId,
  TeamspaceIdentifier
} from "../../domain/schemas/shared.js"
import { IssueRelationMetadataDegradedWarningCode } from "../../domain/schemas/tool-warnings.js"
import { assertAt } from "../../utils/assertions.js"
import type { HulyClient, HulyClientError, HulyClientOperations } from "../client.js"
import { Diagnostics } from "../diagnostics.js"
import type { HulyModelMetadataError, IssueNotFoundError, ProjectNotFoundError } from "../errors.js"
import { documentPlugin, tracker } from "../huly-plugins.js"
import {
  type HulyDocumentRelationMetadata,
  type HulyRelatedDocumentMetadata,
  parseHulyDocumentRelationMetadata,
  parseHulyIssueRelationMetadata,
  parseHulyRelatedDocumentMetadata,
  parseHulyTeamspaceMetadata
} from "../model-metadata.js"
import { findIssueInProject, findProject, findProjectAndIssue, parseIssueIdentifier } from "./issues-shared.js"
import { hulyQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"

type RelationError = HulyClientError | ProjectNotFoundError | IssueNotFoundError | HulyModelMetadataError

const toIssueIdentifier = (value: string): IssueIdentifier => IssueIdentifier.make(value)
const toIssueId = (value: string): IssueId => IssueId.make(value)
const toTeamspaceIdentifier = (value: string): TeamspaceIdentifier => TeamspaceIdentifier.make(value)

const resolveTargetIssue = (
  client: HulyClientOperations,
  sourceProject: HulyProject,
  targetIssueStr: string
): Effect.Effect<
  { issue: HulyIssue; project: HulyProject },
  ProjectNotFoundError | IssueNotFoundError | HulyClientError,
  HulyClient
> =>
  Effect.gen(function* () {
    const { fullIdentifier } = parseIssueIdentifier(targetIssueStr, sourceProject.identifier)
    const match = fullIdentifier.match(/^([A-Z]+)-\d+$/i)
    const prefix = match?.[1]?.toUpperCase() ?? null

    if (prefix !== null && prefix !== sourceProject.identifier.toUpperCase()) {
      const { client: c, project: targetProject } = yield* findProject(prefix)
      const issue = yield* findIssueInProject(c, targetProject, targetIssueStr)
      return { issue, project: targetProject }
    }

    const issue = yield* findIssueInProject(client, sourceProject, targetIssueStr)
    return { issue, project: sourceProject }
  })

// RelatedDocument = Pick<Doc, '_id' | '_class'>. Ref<T> → Ref<Doc> requires cast
// because Ref is invariant on its phantom type parameter. toRef bridges the branded string.
export const makeRelatedDocEntry = (id: string, _class: Ref<Class<Doc>>): RelatedDocument => ({
  _id: toRef<Doc>(id),
  _class: toRef<Class<Doc>>(_class)
})

export const hasRelationById = (arr: Array<RelatedDocument> | undefined, id: string): boolean =>
  arr?.some((r) => r._id === toRef<Doc>(id)) ?? false

const makeRelatedDoc = (issue: HulyIssue): RelatedDocument => makeRelatedDocEntry(issue._id, tracker.class.Issue)

export const addIssueRelation = (
  params: AddIssueRelationParams
): Effect.Effect<AddIssueRelationResult, RelationError, HulyClient> =>
  Effect.gen(function* () {
    const {
      client,
      issue: source,
      project
    } = yield* findProjectAndIssue({ project: params.project, identifier: params.issueIdentifier })
    const { issue: target, project: targetProject } = yield* resolveTargetIssue(client, project, params.targetIssue)
    const sourceMetadata = yield* parseHulyIssueRelationMetadata(source)
    const targetMetadata = yield* parseHulyIssueRelationMetadata(target)

    const result = {
      sourceIssue: sourceMetadata.identifier,
      targetIssue: targetMetadata.identifier,
      relationType: params.relationType
    }

    // DocumentUpdate<HulyIssue> cast needed on $push/$pull literals: TS cannot infer which arm
    // of the complex intersection type (Partial<Data<T>> & PushOptions<T> & ...) applies.
    /* eslint-disable no-restricted-syntax -- see above */
    switch (params.relationType) {
      case "blocks": {
        if (hasRelationById(target.blockedBy, source._id)) {
          return { ...result, added: false }
        }
        // "blocks": source blocks target. Huly stores this on the blocked issue's blockedBy array.
        yield* client.updateDoc(tracker.class.Issue, targetProject._id, target._id, {
          $push: { blockedBy: makeRelatedDoc(source) }
        } as DocumentUpdate<HulyIssue>)
        return { ...result, added: true }
      }
      case "is-blocked-by": {
        if (hasRelationById(source.blockedBy, target._id)) {
          return { ...result, added: false }
        }
        yield* client.updateDoc(tracker.class.Issue, project._id, source._id, {
          $push: { blockedBy: makeRelatedDoc(target) }
        } as DocumentUpdate<HulyIssue>)
        return { ...result, added: true }
      }
      case "relates-to": {
        if (hasRelationById(source.relations, target._id)) {
          return { ...result, added: false }
        }
        // Bidirectional: push to both sides. Partial failure accepted — matches Huly UI behavior.
        yield* client.updateDoc(tracker.class.Issue, project._id, source._id, {
          $push: { relations: makeRelatedDoc(target) }
        } as DocumentUpdate<HulyIssue>)
        yield* client.updateDoc(tracker.class.Issue, targetProject._id, target._id, {
          $push: { relations: makeRelatedDoc(source) }
        } as DocumentUpdate<HulyIssue>)
        return { ...result, added: true }
      }
    }
    /* eslint-enable no-restricted-syntax */
  })

export const removeIssueRelation = (
  params: RemoveIssueRelationParams
): Effect.Effect<RemoveIssueRelationResult, RelationError, HulyClient> =>
  Effect.gen(function* () {
    const {
      client,
      issue: source,
      project
    } = yield* findProjectAndIssue({ project: params.project, identifier: params.issueIdentifier })
    const { issue: target, project: targetProject } = yield* resolveTargetIssue(client, project, params.targetIssue)
    const sourceMetadata = yield* parseHulyIssueRelationMetadata(source)
    const targetMetadata = yield* parseHulyIssueRelationMetadata(target)

    const result = {
      sourceIssue: sourceMetadata.identifier,
      targetIssue: targetMetadata.identifier,
      relationType: params.relationType
    }

    /* eslint-disable no-restricted-syntax -- see above */
    switch (params.relationType) {
      case "blocks": {
        if (!hasRelationById(target.blockedBy, source._id)) {
          return { ...result, removed: false }
        }
        yield* client.updateDoc(tracker.class.Issue, targetProject._id, target._id, {
          $pull: { blockedBy: { _id: toRef<Doc>(source._id) } }
        } as DocumentUpdate<HulyIssue>)
        return { ...result, removed: true }
      }
      case "is-blocked-by": {
        if (!hasRelationById(source.blockedBy, target._id)) {
          return { ...result, removed: false }
        }
        yield* client.updateDoc(tracker.class.Issue, project._id, source._id, {
          $pull: { blockedBy: { _id: toRef<Doc>(target._id) } }
        } as DocumentUpdate<HulyIssue>)
        return { ...result, removed: true }
      }
      case "relates-to": {
        if (!hasRelationById(source.relations, target._id)) {
          return { ...result, removed: false }
        }
        // Bidirectional: pull from both sides. Partial failure accepted — matches Huly UI behavior.
        yield* client.updateDoc(tracker.class.Issue, project._id, source._id, {
          $pull: { relations: { _id: toRef<Doc>(target._id) } }
        } as DocumentUpdate<HulyIssue>)
        yield* client.updateDoc(tracker.class.Issue, targetProject._id, target._id, {
          $pull: { relations: { _id: toRef<Doc>(source._id) } }
        } as DocumentUpdate<HulyIssue>)
        return { ...result, removed: true }
      }
    }
    /* eslint-enable no-restricted-syntax */
  })

interface PartitionedIssueRelations {
  readonly documentRelations: Array<RelatedDocument>
  readonly issueRelations: Array<RelatedDocument>
}

interface DocumentRelationProjection {
  readonly entries: Array<DocumentRelationEntry>
  readonly degradedCount: number
}

interface ResolvedDocumentRelation {
  readonly document: HulyDocument
  readonly metadata: HulyDocumentRelationMetadata
}

const documentRelationEntryProjection = (
  relation: HulyRelatedDocumentMetadata,
  documentId: DocumentId,
  resolved: ResolvedDocumentRelation | undefined,
  teamspaceNames: ReadonlyMap<TeamspaceId, TeamspaceIdentifier>
) => {
  const teamspaceName = resolved === undefined ? undefined : teamspaceNames.get(resolved.metadata.teamspaceId)
  return {
    entry: {
      title: resolved?.document.title ?? String(relation.id),
      teamspace: toTeamspaceIdentifier(
        resolved === undefined ? String(relation.id) : (teamspaceName ?? String(resolved.metadata.teamspaceId))
      ),
      _id: documentId,
      _class: relation.class
    },
    degraded: resolved === undefined || teamspaceName === undefined
  }
}

const partitionIssueRelations = (relations: ReadonlyArray<RelatedDocument>): PartitionedIssueRelations => {
  const documentRelations: Array<RelatedDocument> = []
  const issueRelations: Array<RelatedDocument> = []
  const documentClass = String(documentPlugin.class.Document)
  for (const relation of relations) {
    ;(String(relation._class) === documentClass ? documentRelations : issueRelations).push(relation)
  }
  return { documentRelations, issueRelations }
}

const loadIssueIdentifiers = (
  client: HulyClientOperations,
  relations: ReadonlyArray<RelatedDocument>
): Effect.Effect<ReadonlyMap<IssueId, IssueIdentifier>, HulyClientError | HulyModelMetadataError> =>
  Effect.gen(function* () {
    if (relations.length === 0) return new Map<IssueId, IssueIdentifier>()
    const issues = yield* client.findAll<HulyIssue>(
      tracker.class.Issue,
      hulyQuery<HulyIssue>({ _id: { $in: relations.map((relation) => toRef<HulyIssue>(relation._id)) } })
    )
    const metadata = yield* Effect.forEach(issues, parseHulyIssueRelationMetadata)
    return new Map<IssueId, IssueIdentifier>(metadata.map((issue) => [issue.id, issue.identifier]))
  })

const loadTeamspaceNames = (
  client: HulyClientOperations,
  documents: ReadonlyArray<HulyDocument>
): Effect.Effect<ReadonlyMap<TeamspaceId, TeamspaceIdentifier>, HulyClientError | HulyModelMetadataError> =>
  Effect.gen(function* () {
    const spaceIds = [...new Set(documents.map((document) => document.space))]
    if (spaceIds.length === 0) return new Map<TeamspaceId, TeamspaceIdentifier>()
    const teamspaces = yield* client.findAll<HulyTeamspace>(
      documentPlugin.class.Teamspace,
      hulyQuery<HulyTeamspace>({ _id: { $in: spaceIds.map(toRef<HulyTeamspace>) } })
    )
    const metadata = yield* Effect.forEach(teamspaces, parseHulyTeamspaceMetadata)
    return new Map<TeamspaceId, TeamspaceIdentifier>(metadata.map((teamspace) => [teamspace.id, teamspace.name]))
  })

const loadDocumentRelationEntries = (
  client: HulyClientOperations,
  relations: ReadonlyArray<RelatedDocument>
): Effect.Effect<DocumentRelationProjection, HulyClientError | HulyModelMetadataError> =>
  Effect.gen(function* () {
    if (relations.length === 0) return { entries: [], degradedCount: 0 }
    const documents = yield* client.findAll<HulyDocument>(
      documentPlugin.class.Document,
      hulyQuery<HulyDocument>({ _id: { $in: relations.map((relation) => toRef<HulyDocument>(relation._id)) } })
    )
    const documentMetadata = yield* Effect.forEach(documents, parseHulyDocumentRelationMetadata)
    const resolvedDocumentsById = new Map(
      documentMetadata.map((metadata, index) => [
        String(metadata.id),
        { document: assertAt(documents, index), metadata }
      ])
    )
    const teamspaceNames = yield* loadTeamspaceNames(client, documents)
    const projections = yield* Effect.forEach(relations, (relation) =>
      Effect.gen(function* () {
        const relationMetadata = yield* parseHulyRelatedDocumentMetadata(relation)
        // DocId and DocumentId share the same non-empty runtime contract; the related-document parser proved it.
        const documentId = DocumentId.make(relationMetadata.id)
        return documentRelationEntryProjection(
          relationMetadata,
          documentId,
          resolvedDocumentsById.get(String(relationMetadata.id)),
          teamspaceNames
        )
      })
    )
    return {
      entries: projections.map((projection) => projection.entry),
      degradedCount: projections.filter((projection) => projection.degraded).length
    }
  })

export const listIssueRelations = (
  params: ListIssueRelationsParams
): Effect.Effect<ListIssueRelationsResult, RelationError, HulyClient | Diagnostics> =>
  Effect.gen(function* () {
    const { client, issue } = yield* findProjectAndIssue({
      project: params.project,
      identifier: params.issueIdentifier
    })
    const issueMetadata = yield* parseHulyIssueRelationMetadata(issue)

    const blockedByRefs = issue.blockedBy ?? []
    const relationsRefs = issue.relations ?? []
    const blockedByMetadata = yield* Effect.forEach(blockedByRefs, parseHulyRelatedDocumentMetadata)
    const relationsMetadata = yield* Effect.forEach(relationsRefs, parseHulyRelatedDocumentMetadata)

    const { documentRelations, issueRelations } = partitionIssueRelations(relationsRefs)

    // Resolve issue refs (blockedBy are always issues; issueRelationsRefs are issue relations)
    const idToIdentifier = yield* loadIssueIdentifiers(client, [...blockedByRefs, ...issueRelations])

    const toEntry = (metadata: (typeof blockedByMetadata)[number]) => {
      const id = toIssueId(metadata.id)
      const identifier = idToIdentifier.get(id)
      return {
        entry: { identifier: toIssueIdentifier(identifier ?? String(id)), _id: id, _class: metadata.class },
        degraded: identifier === undefined
      }
    }

    // Huly stores "source blocks target" on the target issue as a RelatedDocument
    // in `blockedBy`. Live local-Huly verification for PR #48 showed that querying
    // `{ "blockedBy._id": issue._id }` returns no rows, so the implementation uses
    // the stored shape directly and keeps the exact-id filter below as a guard.
    // The REST backend returns no matches when this RelatedDocument predicate has an inclusion projection.
    const blockingIssueCandidates = yield* client.findAll<HulyIssue>(
      tracker.class.Issue,
      hulyQuery<HulyIssue>({ blockedBy: makeRelatedDoc(issue) })
    )
    const blocks = yield* Effect.forEach(
      blockingIssueCandidates.filter(
        (candidate) =>
          String(candidate._id) !== issueMetadata.id && hasRelationById(candidate.blockedBy, issueMetadata.id)
      ),
      (candidate): Effect.Effect<RelationEntry, HulyModelMetadataError> =>
        Effect.map(parseHulyIssueRelationMetadata(candidate), (metadata) => ({
          identifier: metadata.identifier,
          _id: metadata.id,
          _class: metadata.class
        }))
    )

    const documentProjection = yield* loadDocumentRelationEntries(client, documentRelations)

    const blockedByProjections = blockedByMetadata.map(toEntry)
    const issueRelationIds = new Set(issueRelations.map((relation) => String(relation._id)))
    const relationProjections = relationsMetadata
      .filter((metadata) => issueRelationIds.has(String(metadata.id)))
      .map(toEntry)
    const degradedCount =
      documentProjection.degradedCount +
      blockedByProjections.filter((projection) => projection.degraded).length +
      relationProjections.filter((projection) => projection.degraded).length
    if (degradedCount > 0) {
      const diagnostics = yield* Diagnostics
      yield* diagnostics.warnAgent({
        code: IssueRelationMetadataDegradedWarningCode,
        message: `Issue relation metadata was degraded for ${degradedCount} relation(s); unresolved titles, identifiers, or teamspace names use backend IDs.`
      })
    }
    return {
      blockedBy: blockedByProjections.map((projection) => projection.entry),
      blocks,
      relations: relationProjections.map((projection) => projection.entry),
      documents: documentProjection.entries
    }
  })
