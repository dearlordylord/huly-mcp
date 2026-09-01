/**
 * Issue write operations: create, update, delete.
 *
 * @module
 */
import type { Person } from "@hcengineering/contact"
import {
  type AttachedData,
  type DocumentUpdate,
  generateId,
  type MarkupBlobRef,
  type Ref,
  SortingOrder,
  type Space,
  type Status
} from "@hcengineering/core"
import { makeRank } from "@hcengineering/rank"
import { type Issue as HulyIssue, type Project as HulyProject } from "@hcengineering/tracker"
import { Effect, Schema } from "effect"

import type { CreateIssueParams, DeleteIssueParams } from "../../domain/schemas.js"
import type { CreateIssueResult, DeleteIssueResult } from "../../domain/schemas/issues-results.js"
import { DEFAULT_ISSUE_PRIORITY } from "../../domain/schemas/issues.js"
import { IssueId, IssueIdentifier, type ProjectIdentifier } from "../../domain/schemas/shared.js"
import type { HulyClient, HulyClientError } from "../client.js"
import type { Diagnostics } from "../diagnostics.js"
import type {
  IssueNotFoundError,
  IssueReferenceError,
  PersonIdentifierAmbiguousError,
  PersonNotFoundError,
  ProjectNotFoundError
} from "../errors.js"
import { HulyError, InvalidStatusError } from "../errors.js"
import { tracker } from "../huly-plugins.js"
import { renderIssueDescriptionForWrite } from "./issue-native-references.js"
import { childIssueParent, topLevelIssueParent } from "./issues-parent.js"
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
  | PersonIdentifierAmbiguousError
  | IssueReferenceError

type DeleteIssueError = HulyClientError | ProjectNotFoundError | IssueNotFoundError

export type CreateIssueWithResolvedAssigneeParams = Omit<CreateIssueParams, "assignee"> & {
  readonly assignee?: never
  readonly resolvedAssignee: Ref<Person> | null
}

// SDK: updateDoc with retrieve=true returns TxResult which doesn't type the embedded object.
// The runtime value includes { object: { sequence: number } } for $inc operations.
const TxIncResult = Schema.Struct({ object: Schema.Struct({ sequence: Schema.Number }) })

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
          message: `Project '${projectIdentifier}' sequence increment did not return the updated sequence; issue creation stopped to avoid a duplicate identifier.`
        })
      )
    : Effect.succeed(sequence)
}

type ProjectWorkflowData = Effect.Success<ReturnType<typeof findProjectWithStatuses>>
type CreateIssueTaskTypeWorkflow = Effect.Success<ReturnType<typeof resolveTaskTypeWorkflow>>

const resolveCreateIssueTaskType = (
  client: HulyClient["Service"],
  project: HulyProject,
  workflow: Pick<ProjectWorkflowData, "projectType" | "statuses">,
  params: CreateIssueParams
): Effect.Effect<CreateIssueTaskTypeWorkflow | undefined, HulyClientError | HulyError, Diagnostics> =>
  params.taskType === undefined
    ? Effect.succeed(undefined)
    : resolveTaskTypeWorkflow(client, project, workflow.projectType, workflow.statuses, params.taskType, params.project)

const resolveCreateIssueStatus = (
  workflow: Pick<ProjectWorkflowData, "defaultStatusId" | "statuses">,
  taskTypeWorkflow: CreateIssueTaskTypeWorkflow | undefined,
  params: CreateIssueParams
): Effect.Effect<Ref<Status>, InvalidStatusError | HulyError> => {
  if (taskTypeWorkflow !== undefined) {
    return chooseStatusForTaskType(taskTypeWorkflow, params.status, undefined, params.project)
  }
  if (params.status !== undefined) return resolveStatusByName(workflow.statuses, params.status, params.project)
  if (workflow.defaultStatusId !== undefined) return Effect.succeed(workflow.defaultStatusId)
  return Effect.fail(new InvalidStatusError({ status: "(default)", project: params.project }))
}

const resolveCreateIssueAssignee = (
  client: HulyClient["Service"],
  params: CreateIssueParams
): Effect.Effect<Ref<Person> | null, HulyClientError | PersonIdentifierAmbiguousError | PersonNotFoundError> =>
  params.assignee === undefined
    ? Effect.succeed(null)
    : Effect.map(resolveAssignee(client, params.assignee), (person) => person._id)

const renderCreateIssueDescription = (
  params: CreateIssueParams
): Effect.Effect<
  Effect.Success<ReturnType<typeof renderIssueDescriptionForWrite>> | undefined,
  IssueReferenceError,
  HulyClient
> =>
  params.description !== undefined && params.description.trim() !== ""
    ? renderIssueDescriptionForWrite(params.description)
    : Effect.succeed(undefined)

const resolveCreateIssueParent = (
  client: HulyClient["Service"],
  project: HulyProject,
  parentIssue: CreateIssueParams["parentIssue"]
): Effect.Effect<ReturnType<typeof topLevelIssueParent>, HulyClientError | IssueNotFoundError> =>
  parentIssue === undefined
    ? Effect.succeed(topLevelIssueParent())
    : Effect.map(findIssueInProject(client, project, parentIssue), (parent) => childIssueParent(parent, project._id))

const uploadCreateIssueDescription = (
  client: HulyClient["Service"],
  issueId: Ref<HulyIssue>,
  renderedDescription: Effect.Success<ReturnType<typeof renderIssueDescriptionForWrite>> | undefined
): Effect.Effect<MarkupBlobRef | null, HulyClientError> =>
  renderedDescription === undefined
    ? Effect.succeed(null)
    : client.uploadMarkup(
        tracker.class.Issue,
        issueId,
        "description",
        renderedDescription.markup,
        renderedDescription.format
      )

/**
 * Create a new issue in a project.
 *
 * Creates issue with:
 * - Title (required)
 * - Description (optional, markdown supported)
 * - Priority (optional, uses DEFAULT_ISSUE_PRIORITY when omitted)
 * - Status (optional, uses project default)
 * - Assignee (optional, by email, Person name, or exact agent UserProfile title)
 */
const createIssueWithAssignee = Effect.fn("Issues.createWithAssignee")(function* <AssigneeError>(
  params: CreateIssueParams,
  assigneeResolution: (
    client: HulyClient["Service"],
    params: CreateIssueParams
  ) => Effect.Effect<Ref<Person> | null, AssigneeError>
) {
  const { client, defaultStatusId, project, projectType, statuses } = yield* findProjectWithStatuses(params.project)

  const issueId: Ref<HulyIssue> = generateId()

  const workflow = { projectType, statuses, defaultStatusId }
  const taskTypeWorkflow = yield* resolveCreateIssueTaskType(client, project, workflow, params)
  const statusRef = yield* resolveCreateIssueStatus(workflow, taskTypeWorkflow, params)
  const assigneeRef = yield* assigneeResolution(client, params)
  const renderedDescription = yield* renderCreateIssueDescription(params)
  const { attachedTo, attachedToClass, collection, parents } = yield* resolveCreateIssueParent(
    client,
    project,
    params.parentIssue
  )

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

  const descriptionMarkupRef = yield* uploadCreateIssueDescription(client, issueId, renderedDescription)

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

export const createIssue = (
  params: CreateIssueParams
): Effect.Effect<CreateIssueResult, CreateIssueError, HulyClient | Diagnostics> =>
  createIssueWithAssignee(params, resolveCreateIssueAssignee)

type CreateIssueWithResolvedAssigneeError = Exclude<
  CreateIssueError,
  PersonIdentifierAmbiguousError | PersonNotFoundError
>

export const createIssueWithResolvedAssignee = (
  params: CreateIssueWithResolvedAssigneeParams
): Effect.Effect<CreateIssueResult, CreateIssueWithResolvedAssigneeError, HulyClient | Diagnostics> =>
  createIssueWithAssignee(params, () => Effect.succeed(params.resolvedAssignee))

/**
 * Delete an issue from a project.
 *
 * Permanently removes the issue. This operation cannot be undone.
 */
export const deleteIssue = (
  params: DeleteIssueParams
): Effect.Effect<DeleteIssueResult, DeleteIssueError, HulyClient> =>
  Effect.gen(function* () {
    const { client, issue, project } = yield* findProjectAndIssue(params)

    yield* client.removeDoc(tracker.class.Issue, project._id, issue._id)

    return { identifier: IssueIdentifier.make(issue.identifier), deleted: true }
  })
