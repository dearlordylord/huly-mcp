/**
 * Issue move and label operations.
 *
 * @module
 */
import { type Class, type Doc, type DocumentUpdate, type Ref } from "@hcengineering/core"
import { type Issue as HulyIssue, type IssueParentInfo, type Project as HulyProject } from "@hcengineering/tracker"
import { Effect } from "effect"

import type { AddLabelParams, MoveIssueParams } from "../../domain/schemas.js"
import type { AddLabelResult, MoveIssueResult } from "../../domain/schemas/issues-results.js"
import { IssueIdentifier } from "../../domain/schemas/shared.js"
import { TagTargetClass } from "../../domain/schemas/tags.js"
import type { HulyClient, HulyClientError } from "../client.js"
import type { IssueNotFoundError, ProjectNotFoundError, TagCategoryNotFoundError } from "../errors.js"
import { tracker } from "../huly-plugins.js"
import { findIssueInProject, findProjectAndIssue } from "./issues-shared.js"
import { toRef } from "./sdk-boundary.js"
import { attachTagReference, ensureTagElement } from "./tags-shared.js"

type AddLabelError =
  | HulyClientError
  | TagCategoryNotFoundError
  | ProjectNotFoundError
  | IssueNotFoundError

type MoveIssueError =
  | HulyClientError
  | ProjectNotFoundError
  | IssueNotFoundError

const issueTargetClass = TagTargetClass.make(String(tracker.class.Issue))

/**
 * Add a label/tag to an issue.
 *
 * Creates the tag in the project if it doesn't exist,
 * then attaches it to the issue via TagReference.
 *
 * Idempotent: adding the same label twice is a no-op.
 */
export const addLabel = (
  params: AddLabelParams
): Effect.Effect<AddLabelResult, AddLabelError, HulyClient> =>
  Effect.gen(function*() {
    const { issue, project } = yield* findProjectAndIssue(params)
    const labelTitle = params.label.trim()
    const tag = yield* ensureTagElement({
      targetClass: issueTargetClass,
      titleOrId: labelTitle,
      color: params.color,
      fallbackCategory: tracker.category.Other
    })

    const result = yield* attachTagReference({
      tag,
      objectId: issue._id,
      objectClass: tracker.class.Issue,
      space: project._id,
      collection: "labels",
      matchTitleCaseInsensitive: true
    })

    return { identifier: IssueIdentifier.make(issue.identifier), labelAdded: result.attached }
  })

export const moveIssue = (
  params: MoveIssueParams
): Effect.Effect<MoveIssueResult, MoveIssueError, HulyClient> =>
  Effect.gen(function*() {
    const { client, issue, project } = yield* findProjectAndIssue(params)

    const oldParentIsIssue = issue.attachedToClass === tracker.class.Issue

    type MoveParentData = {
      newAttachedTo: Ref<Doc>
      newAttachedToClass: Ref<Class<Doc>>
      newCollection: string
      newParents: Array<IssueParentInfo>
      newParentIdentifier: string | undefined
    }
    const newParentParam = params.newParent
    const { newAttachedTo, newAttachedToClass, newCollection, newParentIdentifier, newParents }: MoveParentData =
      newParentParam !== null
        ? yield* Effect.gen(function*() {
          const parentIssue = yield* findIssueInProject(client, project, newParentParam)
          return {
            newAttachedTo: parentIssue._id,
            newAttachedToClass: tracker.class.Issue,
            newCollection: "subIssues",
            newParents: [
              ...parentIssue.parents,
              {
                parentId: parentIssue._id,
                identifier: parentIssue.identifier,
                parentTitle: parentIssue.title,
                space: project._id
              }
            ],
            newParentIdentifier: parentIssue.identifier
          }
        })
        : {
          newAttachedTo: project._id,
          newAttachedToClass: tracker.class.Project,
          newCollection: "issues",
          newParents: [],
          newParentIdentifier: undefined
        }

    // attachedTo is typed as Ref<Issue> in DocumentUpdate<HulyIssue>, but for top-level issues
    // it points to the project (Ref<Project>). Both are branded strings at runtime.
    const updateOps: DocumentUpdate<HulyIssue> = {
      attachedTo: toRef<HulyIssue>(newAttachedTo),
      attachedToClass: newAttachedToClass,
      collection: newCollection,
      parents: newParents
    }

    yield* client.updateDoc(
      tracker.class.Issue,
      project._id,
      issue._id,
      updateOps
    )

    // Update subIssues count on old parent (decrement) if it was an issue
    if (oldParentIsIssue) {
      yield* client.updateDoc(
        tracker.class.Issue,
        project._id,
        // issue.attachedTo is Ref<Doc>; for sub-issues it points to the parent issue.
        // Cast needed because updateDoc expects Ref<HulyIssue> but attachedTo is Ref<Doc>.
        toRef<HulyIssue>(issue.attachedTo),
        { $inc: { subIssues: -1 } }
      )
    }

    // Update subIssues count on new parent (increment) if it's an issue
    if (params.newParent !== null) {
      yield* client.updateDoc(
        tracker.class.Issue,
        project._id,
        toRef<HulyIssue>(newAttachedTo),
        { $inc: { subIssues: 1 } }
      )
    }

    // Update parents arrays on all descendant issues
    if (issue.subIssues > 0) {
      yield* updateDescendantParents(client, project._id, issue, newParents)
    }

    const result: MoveIssueResult = {
      identifier: IssueIdentifier.make(issue.identifier),
      moved: true
    }
    if (newParentIdentifier !== undefined) {
      return { ...result, newParent: IssueIdentifier.make(newParentIdentifier) }
    }
    return result
  })

const updateDescendantParents = (
  client: HulyClient["Type"],
  spaceId: Ref<HulyProject>,
  parentIssue: HulyIssue,
  parentNewParents: Array<IssueParentInfo>
): Effect.Effect<void, HulyClientError> =>
  Effect.gen(function*() {
    const thisParentInfo: IssueParentInfo = {
      parentId: parentIssue._id,
      identifier: parentIssue.identifier,
      parentTitle: parentIssue.title,
      space: spaceId
    }
    const children = yield* client.findAll<HulyIssue>(
      tracker.class.Issue,
      { attachedTo: parentIssue._id, space: spaceId }
    )
    for (const child of children) {
      const childNewParents = [...parentNewParents, thisParentInfo]
      yield* client.updateDoc(
        tracker.class.Issue,
        spaceId,
        child._id,
        { parents: childNewParents }
      )
      if (child.subIssues > 0) {
        yield* updateDescendantParents(client, spaceId, child, childNewParents)
      }
    }
  })
