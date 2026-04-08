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
  ObjectClassName,
  TeamspaceIdentifier
} from "../../domain/schemas/shared.js"
import type { HulyClient, HulyClientError } from "../client.js"
import type { IssueNotFoundError, ProjectNotFoundError } from "../errors.js"
import { documentPlugin, tracker } from "../huly-plugins.js"
import { findIssueInProject, findProject, findProjectAndIssue, parseIssueIdentifier, toRef } from "./shared.js"

type RelationError =
  | HulyClientError
  | ProjectNotFoundError
  | IssueNotFoundError

const toIssueIdentifier = (value: string): IssueIdentifier => IssueIdentifier.make(value)
const toIssueId = (value: string): IssueId => IssueId.make(value)
const toObjectClassName = (value: string): ObjectClassName => ObjectClassName.make(value)
const toTeamspaceIdentifier = (value: string): TeamspaceIdentifier => TeamspaceIdentifier.make(value)
const toDocumentId = (value: string): DocumentId => DocumentId.make(value)

const resolveTargetIssue = (
  client: HulyClient["Type"],
  sourceProject: HulyProject,
  targetIssueStr: string
): Effect.Effect<
  { issue: HulyIssue; project: HulyProject },
  ProjectNotFoundError | IssueNotFoundError | HulyClientError,
  HulyClient
> =>
  Effect.gen(function*() {
    const { fullIdentifier } = parseIssueIdentifier(targetIssueStr, sourceProject.identifier)
    const match = fullIdentifier.match(/^([A-Z]+)-\d+$/i)
    const prefix = match ? match[1].toUpperCase() : null

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
  arr?.some(r => r._id === toRef<Doc>(id)) ?? false

const makeRelatedDoc = (issue: HulyIssue): RelatedDocument => makeRelatedDocEntry(issue._id, tracker.class.Issue)

export const addIssueRelation = (
  params: AddIssueRelationParams
): Effect.Effect<AddIssueRelationResult, RelationError, HulyClient> =>
  Effect.gen(function*() {
    const { client, issue: source, project } = yield* findProjectAndIssue({
      project: params.project,
      identifier: params.issueIdentifier
    })
    const { issue: target, project: targetProject } = yield* resolveTargetIssue(
      client,
      project,
      params.targetIssue
    )

    const result = {
      sourceIssue: toIssueIdentifier(source.identifier),
      targetIssue: toIssueIdentifier(target.identifier),
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
        yield* client.updateDoc(
          tracker.class.Issue,
          targetProject._id,
          target._id,
          { $push: { blockedBy: makeRelatedDoc(source) } } as DocumentUpdate<HulyIssue>
        )
        return { ...result, added: true }
      }
      case "is-blocked-by": {
        if (hasRelationById(source.blockedBy, target._id)) {
          return { ...result, added: false }
        }
        yield* client.updateDoc(
          tracker.class.Issue,
          project._id,
          source._id,
          { $push: { blockedBy: makeRelatedDoc(target) } } as DocumentUpdate<HulyIssue>
        )
        return { ...result, added: true }
      }
      case "relates-to": {
        if (hasRelationById(source.relations, target._id)) {
          return { ...result, added: false }
        }
        // Bidirectional: push to both sides. Partial failure accepted — matches Huly UI behavior.
        yield* client.updateDoc(
          tracker.class.Issue,
          project._id,
          source._id,
          { $push: { relations: makeRelatedDoc(target) } } as DocumentUpdate<HulyIssue>
        )
        yield* client.updateDoc(
          tracker.class.Issue,
          targetProject._id,
          target._id,
          { $push: { relations: makeRelatedDoc(source) } } as DocumentUpdate<HulyIssue>
        )
        return { ...result, added: true }
      }
    }
    /* eslint-enable no-restricted-syntax */
  })

export const removeIssueRelation = (
  params: RemoveIssueRelationParams
): Effect.Effect<RemoveIssueRelationResult, RelationError, HulyClient> =>
  Effect.gen(function*() {
    const { client, issue: source, project } = yield* findProjectAndIssue({
      project: params.project,
      identifier: params.issueIdentifier
    })
    const { issue: target, project: targetProject } = yield* resolveTargetIssue(
      client,
      project,
      params.targetIssue
    )

    const result = {
      sourceIssue: toIssueIdentifier(source.identifier),
      targetIssue: toIssueIdentifier(target.identifier),
      relationType: params.relationType
    }

    /* eslint-disable no-restricted-syntax -- see above */
    switch (params.relationType) {
      case "blocks": {
        if (!hasRelationById(target.blockedBy, source._id)) {
          return { ...result, removed: false }
        }
        yield* client.updateDoc(
          tracker.class.Issue,
          targetProject._id,
          target._id,
          { $pull: { blockedBy: { _id: toRef<Doc>(source._id) } } } as DocumentUpdate<HulyIssue>
        )
        return { ...result, removed: true }
      }
      case "is-blocked-by": {
        if (!hasRelationById(source.blockedBy, target._id)) {
          return { ...result, removed: false }
        }
        yield* client.updateDoc(
          tracker.class.Issue,
          project._id,
          source._id,
          { $pull: { blockedBy: { _id: toRef<Doc>(target._id) } } } as DocumentUpdate<HulyIssue>
        )
        return { ...result, removed: true }
      }
      case "relates-to": {
        if (!hasRelationById(source.relations, target._id)) {
          return { ...result, removed: false }
        }
        // Bidirectional: pull from both sides. Partial failure accepted — matches Huly UI behavior.
        yield* client.updateDoc(
          tracker.class.Issue,
          project._id,
          source._id,
          { $pull: { relations: { _id: toRef<Doc>(target._id) } } } as DocumentUpdate<HulyIssue>
        )
        yield* client.updateDoc(
          tracker.class.Issue,
          targetProject._id,
          target._id,
          { $pull: { relations: { _id: toRef<Doc>(source._id) } } } as DocumentUpdate<HulyIssue>
        )
        return { ...result, removed: true }
      }
    }
    /* eslint-enable no-restricted-syntax */
  })

export const listIssueRelations = (
  params: ListIssueRelationsParams
): Effect.Effect<ListIssueRelationsResult, RelationError, HulyClient> =>
  Effect.gen(function*() {
    const { client, issue } = yield* findProjectAndIssue({
      project: params.project,
      identifier: params.issueIdentifier
    })

    const blockedByRefs = issue.blockedBy ?? []
    const relationsRefs = issue.relations ?? []

    if (blockedByRefs.length === 0 && relationsRefs.length === 0) {
      return { blockedBy: [], relations: [], documents: [] }
    }

    // Single-pass partition of relations refs by _class
    const docClass = String(documentPlugin.class.Document)
    const issueRelationsRefs: Array<RelatedDocument> = []
    const docRelationsRefs: Array<RelatedDocument> = []
    for (const r of relationsRefs) {
      ;(String(r._class) === docClass ? docRelationsRefs : issueRelationsRefs).push(r)
    }

    // Resolve issue refs (blockedBy are always issues; issueRelationsRefs are issue relations)
    const allIssueIds = [...blockedByRefs, ...issueRelationsRefs].map(r => r._id)
    const idToIdentifier = new Map<string, string>()

    if (allIssueIds.length > 0) {
      const toIssueRef = toRef<HulyIssue>
      const issues = yield* client.findAll<HulyIssue>(
        tracker.class.Issue,
        { _id: { $in: allIssueIds.map(toIssueRef) } }
      )
      for (const i of issues) {
        idToIdentifier.set(String(i._id), i.identifier)
      }
    }

    const toEntry = (r: RelatedDocument): RelationEntry => ({
      identifier: toIssueIdentifier(idToIdentifier.get(String(r._id)) ?? String(r._id)),
      _id: toIssueId(String(r._id)),
      _class: toObjectClassName(String(r._class))
    })

    // Resolve document refs
    const documents: Array<DocumentRelationEntry> = []
    if (docRelationsRefs.length > 0) {
      const toDocRef = toRef<HulyDocument>
      const docs = yield* client.findAll<HulyDocument>(
        documentPlugin.class.Document,
        { _id: { $in: docRelationsRefs.map(r => toDocRef(r._id)) } }
      )
      const docMap = new Map(docs.map(d => [String(d._id), d]))

      // Resolve teamspace names for the documents
      const spaceIds = [...new Set(docs.map(d => d.space))]
      const tsNameMap = new Map<string, string>()
      if (spaceIds.length > 0) {
        const teamspaces = yield* client.findAll<HulyTeamspace>(
          documentPlugin.class.Teamspace,
          { _id: { $in: spaceIds.map(toRef<HulyTeamspace>) } }
        )
        for (const ts of teamspaces) {
          tsNameMap.set(String(ts._id), ts.name)
        }
      }

      for (const r of docRelationsRefs) {
        const doc = docMap.get(String(r._id))
        documents.push({
          title: doc?.title ?? String(r._id),
          teamspace: toTeamspaceIdentifier(
            doc ? (tsNameMap.get(String(doc.space)) ?? String(doc.space)) : String(r._id)
          ),
          _id: toDocumentId(String(r._id)),
          _class: toObjectClassName(String(r._class))
        })
      }
    }

    return {
      blockedBy: blockedByRefs.map(toEntry),
      relations: issueRelationsRefs.map(toEntry),
      documents
    }
  })
