/**
 * Issue move and label operations.
 *
 * @module
 */
import { type Ref } from "@hcengineering/core"
import { type Issue as HulyIssue, type IssueParentInfo, type Project as HulyProject } from "@hcengineering/tracker"
import { Effect } from "effect"

import type { AddLabelParams, MoveIssueParams } from "../../domain/schemas.js"
import type { AddLabelResult, MoveIssueResult } from "../../domain/schemas/issues-results.js"
import { IssueIdentifier, TagIdentifier } from "../../domain/schemas/shared.js"
import { TagTargetClass } from "../../domain/schemas/tags.js"
import type { HulyClient, HulyClientError } from "../client.js"
import type {
  IssueNotFoundError,
  ProjectNotFoundError,
  TagCategoryNotFoundError,
  TagIdentifierAmbiguousError
} from "../errors.js"
import { tracker } from "../huly-plugins.js"
import { attachIssueChild, childIssueParent, hasConcreteIssueParent, topLevelIssueParent } from "./issues-parent.js"
import { findIssueInProject, findProjectAndIssue } from "./issues-shared.js"
import { hulyQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"
import { attachTagReference, ensureTagElement } from "./tags-shared.js"

type AddLabelError =
  | HulyClientError
  | TagCategoryNotFoundError
  | TagIdentifierAmbiguousError
  | ProjectNotFoundError
  | IssueNotFoundError

type MoveIssueError = HulyClientError | ProjectNotFoundError | IssueNotFoundError

const issueTargetClass = TagTargetClass.make(String(tracker.class.Issue))

/**
 * Add a label/tag to an issue.
 *
 * Creates the tag in the project if it doesn't exist,
 * then attaches it to the issue via TagReference.
 *
 * Idempotent: adding the same label twice is a no-op.
 */
export const addLabel = (params: AddLabelParams): Effect.Effect<AddLabelResult, AddLabelError, HulyClient> =>
  Effect.gen(function* () {
    const { issue, project } = yield* findProjectAndIssue(params)
    const labelTitle = TagIdentifier.make(params.label.trim())
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

export const moveIssue = (params: MoveIssueParams): Effect.Effect<MoveIssueResult, MoveIssueError, HulyClient> =>
  Effect.gen(function* () {
    const { client, issue, project } = yield* findProjectAndIssue(params)

    const oldParentIsIssue = hasConcreteIssueParent(issue)

    type MoveTarget =
      | { readonly _tag: "TopLevel"; readonly parent: ReturnType<typeof topLevelIssueParent> }
      | {
          readonly _tag: "Child"
          readonly identifier: IssueIdentifier
          readonly issue: HulyIssue
          readonly parent: ReturnType<typeof topLevelIssueParent>
        }
    const newParentParam = params.newParent
    const target: MoveTarget =
      newParentParam !== null
        ? yield* Effect.gen(function* () {
            const parentIssue = yield* findIssueInProject(client, project, newParentParam)
            return {
              _tag: "Child" as const,
              identifier: IssueIdentifier.make(parentIssue.identifier),
              issue: parentIssue,
              parent: childIssueParent(parentIssue, project._id)
            }
          })
        : { _tag: "TopLevel", parent: topLevelIssueParent() }

    if (target._tag === "Child") {
      yield* attachIssueChild(client, project._id, issue._id, target.issue, {})
    } else {
      yield* client.updateDoc(tracker.class.Issue, project._id, issue._id, {
        attachedTo: toRef<HulyIssue>(target.parent.attachedTo),
        attachedToClass: target.parent.attachedToClass,
        collection: target.parent.collection,
        parents: target.parent.parents
      })
    }

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

    // Update parents arrays on all descendant issues
    if (issue.subIssues > 0) {
      yield* updateDescendantParents(client, project._id, issue, target.parent.parents)
    }

    const result: MoveIssueResult = { identifier: IssueIdentifier.make(issue.identifier), moved: true }
    if (target._tag === "Child") {
      return { ...result, newParent: target.identifier }
    }
    return result
  })

const updateDescendantParents = (
  client: HulyClient["Type"],
  spaceId: Ref<HulyProject>,
  parentIssue: HulyIssue,
  parentNewParents: Array<IssueParentInfo>
): Effect.Effect<void, HulyClientError> =>
  Effect.gen(function* () {
    const thisParentInfo: IssueParentInfo = {
      parentId: parentIssue._id,
      identifier: parentIssue.identifier,
      parentTitle: parentIssue.title,
      space: spaceId
    }
    const children = yield* client.findAll<HulyIssue>(
      tracker.class.Issue,
      hulyQuery<HulyIssue>({ attachedTo: parentIssue._id, space: spaceId })
    )
    for (const child of children) {
      const childNewParents = [...parentNewParents, thisParentInfo]
      yield* client.updateDoc(tracker.class.Issue, spaceId, child._id, { parents: childNewParents })
      if (child.subIssues > 0) {
        yield* updateDescendantParents(client, spaceId, child, childNewParents)
      }
    }
  })
