/**
 * Issue write operations: create, update, delete.
 *
 * @module
 */
import type { Person } from "@hcengineering/contact"
import {
  type AttachedData,
  type Class,
  type Doc,
  type DocumentUpdate,
  generateId,
  type MarkupBlobRef,
  type Ref,
  SortingOrder,
  type Space,
  type Status
} from "@hcengineering/core"
import { makeRank } from "@hcengineering/rank"
import { type Issue as HulyIssue, type IssueParentInfo, type Project as HulyProject } from "@hcengineering/tracker"
import { Effect, Schema } from "effect"

import type { CreateIssueParams, DeleteIssueParams } from "../../domain/schemas.js"
import type { CreateIssueResult, DeleteIssueResult } from "../../domain/schemas/issues-results.js"
import { DEFAULT_ISSUE_PRIORITY } from "../../domain/schemas/issues.js"
import { IssueId, IssueIdentifier, type ProjectIdentifier } from "../../domain/schemas/shared.js"
import type { HulyClient, HulyClientError } from "../client.js"
import type { Diagnostics } from "../diagnostics.js"
import type { IssueNotFoundError, PersonNotFoundError, ProjectNotFoundError } from "../errors.js"
import { HulyError, InvalidStatusError } from "../errors.js"
import { tracker } from "../huly-plugins.js"
import {
  findIssueInProject,
  findProjectAndIssue,
  findProjectWithStatuses,
  resolveStatusByName,
  stringToPriority
} from "./issues-shared.js"
import { chooseStatusForTaskType, resolveAssignee, resolveTaskTypeWorkflow } from "./issues-write-shared.js"
import { hulyQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"

type CreateIssueError =
  | HulyClientError
  | ProjectNotFoundError
  | IssueNotFoundError
  | InvalidStatusError
  | HulyError
  | PersonNotFoundError

type DeleteIssueError =
  | HulyClientError
  | ProjectNotFoundError
  | IssueNotFoundError

// SDK: updateDoc with retrieve=true returns TxResult which doesn't type the embedded object.
// The runtime value includes { object: { sequence: number } } for $inc operations.
const TxIncResult = Schema.Struct({
  object: Schema.Struct({
    sequence: Schema.Number
  })
})

const extractUpdatedSequence = (txResult: unknown): number | undefined => {
  const decoded = Schema.decodeUnknownOption(TxIncResult)(txResult)
  return decoded._tag === "Some" ? decoded.value.object.sequence : undefined
}

const requireUpdatedSequence = (
  txResult: unknown,
  projectIdentifier: ProjectIdentifier
): Effect.Effect<number, HulyError> => {
  const sequence = extractUpdatedSequence(txResult)
  return sequence === undefined
    ? Effect.fail(
      new HulyError({
        message:
          `Project '${projectIdentifier}' sequence increment did not return the updated sequence; issue creation stopped to avoid a duplicate identifier.`
      })
    )
    : Effect.succeed(sequence)
}

/**
 * Create a new issue in a project.
 *
 * Creates issue with:
 * - Title (required)
 * - Description (optional, markdown supported)
 * - Priority (optional, uses DEFAULT_ISSUE_PRIORITY when omitted)
 * - Status (optional, uses project default)
 * - Assignee (optional, by email or name)
 */
export const createIssue = (
  params: CreateIssueParams
): Effect.Effect<CreateIssueResult, CreateIssueError, HulyClient | Diagnostics> =>
  Effect.gen(function*() {
    const { client, defaultStatusId, project, projectType, statuses } = yield* findProjectWithStatuses(params.project)

    const issueId: Ref<HulyIssue> = generateId()

    const taskTypeWorkflow = params.taskType === undefined
      ? undefined
      : yield* resolveTaskTypeWorkflow(client, project, projectType, statuses, params.taskType, params.project)
    const taskTypeStatusRef: Ref<Status> | undefined = taskTypeWorkflow === undefined
      ? undefined
      : yield* chooseStatusForTaskType(taskTypeWorkflow, params.status, undefined, params.project)
    const statusRef: Ref<Status> = taskTypeStatusRef !== undefined
      ? taskTypeStatusRef
      : params.status !== undefined
      ? yield* resolveStatusByName(statuses, params.status, params.project)
      : defaultStatusId !== undefined
      ? defaultStatusId
      : yield* Effect.fail(new InvalidStatusError({ status: "(default)", project: params.project }))

    const assigneeRef: Ref<Person> | null = params.assignee !== undefined
      ? (yield* resolveAssignee(client, params.assignee))._id
      : null

    type ParentData = {
      attachedTo: Ref<Doc>
      attachedToClass: Ref<Class<Doc>>
      collection: string
      parents: Array<IssueParentInfo>
    }
    const parentIssueParam = params.parentIssue
    const { attachedTo, attachedToClass, collection, parents }: ParentData = parentIssueParam !== undefined
      ? yield* Effect.gen(function*() {
        const parentIssue = yield* findIssueInProject(client, project, parentIssueParam)
        return {
          attachedTo: parentIssue._id,
          attachedToClass: tracker.class.Issue,
          collection: "subIssues",
          parents: [
            ...parentIssue.parents,
            {
              parentId: parentIssue._id,
              identifier: parentIssue.identifier,
              parentTitle: parentIssue.title,
              space: project._id
            }
          ]
        }
      })
      : {
        attachedTo: project._id,
        attachedToClass: tracker.class.Project,
        collection: "issues",
        parents: []
      }

    const incOps: DocumentUpdate<HulyProject> = { $inc: { sequence: 1 } }
    const incResult = yield* client.updateDoc(
      tracker.class.Project,
      toRef<Space>("core:space:Space"),
      project._id,
      incOps,
      true
    )
    const sequence = yield* requireUpdatedSequence(incResult, params.project)

    const lastIssue = yield* client.findOne<HulyIssue>(
      tracker.class.Issue,
      hulyQuery<HulyIssue>({ space: project._id }),
      { sort: { rank: SortingOrder.Descending } }
    )
    const rank = makeRank(lastIssue?.rank, undefined)

    const descriptionMarkupRef: MarkupBlobRef | null =
      params.description !== undefined && params.description.trim() !== ""
        ? yield* client.uploadMarkup(
          tracker.class.Issue,
          issueId,
          "description",
          params.description,
          "markdown"
        )
        : null

    const priority = stringToPriority(params.priority ?? DEFAULT_ISSUE_PRIORITY)
    const identifier = `${project.identifier}-${sequence}`

    const issueData: AttachedData<HulyIssue> = {
      title: params.title,
      description: descriptionMarkupRef,
      status: statusRef,
      number: sequence,
      kind: taskTypeWorkflow?.taskType._id ?? tracker.taskTypes.Issue,
      identifier,
      priority,
      assignee: assigneeRef,
      component: null,
      estimation: params.estimation ?? 0,
      remainingTime: 0,
      reportedTime: 0,
      reports: 0,
      subIssues: 0,
      parents,
      childInfo: [],
      dueDate: params.dueDate ?? null,
      rank
    }
    yield* client.addCollection(
      tracker.class.Issue,
      project._id,
      attachedTo,
      attachedToClass,
      collection,
      issueData,
      issueId
    )

    return { identifier: IssueIdentifier.make(identifier), issueId: IssueId.make(issueId) }
  })

/**
 * Delete an issue from a project.
 *
 * Permanently removes the issue. This operation cannot be undone.
 */
export const deleteIssue = (
  params: DeleteIssueParams
): Effect.Effect<DeleteIssueResult, DeleteIssueError, HulyClient> =>
  Effect.gen(function*() {
    const { client, issue, project } = yield* findProjectAndIssue(params)

    yield* client.removeDoc(
      tracker.class.Issue,
      project._id,
      issue._id
    )

    return { identifier: IssueIdentifier.make(issue.identifier), deleted: true }
  })
