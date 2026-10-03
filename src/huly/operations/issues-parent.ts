import { type Class, type DocumentUpdate, type Ref, type Space } from "@hcengineering/core"
import { type Issue as HulyIssue, type IssueParentInfo, type Project as HulyProject } from "@hcengineering/tracker"
import { Effect } from "effect"

import type { HulyClient, HulyClientError } from "../client.js"
import { tracker } from "../huly-plugins.js"
import { toRef } from "./sdk-boundary.js"

interface IssueParentData {
  readonly attachedTo: Ref<HulyIssue>
  readonly attachedToClass: Ref<Class<HulyIssue>>
  readonly collection: "subIssues"
  readonly parents: Array<IssueParentInfo>
}

/**
 * Huly models every issue through the Issue/subIssues collection. Top-level
 * issues use the tracker NoParent sentinel instead of attaching to the project.
 */
export const topLevelIssueParent = (): IssueParentData => ({
  attachedTo: toRef<HulyIssue>(tracker.ids.NoParent),
  attachedToClass: tracker.class.Issue,
  collection: "subIssues",
  parents: []
})

export const childIssueParent = (
  parentIssue: Pick<HulyIssue, "_id" | "identifier" | "parents" | "title">,
  project: Ref<Space>
): IssueParentData => ({
  attachedTo: parentIssue._id,
  attachedToClass: tracker.class.Issue,
  collection: "subIssues",
  parents: [
    { parentId: parentIssue._id, identifier: parentIssue.identifier, parentTitle: parentIssue.title, space: project },
    ...parentIssue.parents
  ]
})

export const hasConcreteIssueParent = (issue: Pick<HulyIssue, "attachedTo" | "attachedToClass">): boolean =>
  issue.attachedToClass === tracker.class.Issue && issue.attachedTo !== tracker.ids.NoParent

export const attachIssueChild = (
  client: HulyClient["Service"],
  project: Ref<HulyProject>,
  child: Ref<HulyIssue>,
  parentIssue: Pick<HulyIssue, "_id" | "identifier" | "parents" | "title">,
  additionalUpdate: DocumentUpdate<HulyIssue>
): Effect.Effect<void, HulyClientError> =>
  Effect.gen(function* () {
    const parent = childIssueParent(parentIssue, project)
    yield* client.updateDoc(tracker.class.Issue, project, child, {
      ...additionalUpdate,
      attachedTo: toRef<HulyIssue>(parent.attachedTo),
      attachedToClass: parent.attachedToClass,
      collection: parent.collection,
      parents: parent.parents
    })
    yield* client.updateDoc(tracker.class.Issue, project, parentIssue._id, { $inc: { subIssues: 1 } })
  })
