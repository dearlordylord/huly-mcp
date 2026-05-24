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
import type { ProjectType, TaskType } from "@hcengineering/task"
import { type Issue as HulyIssue, type IssueParentInfo, type Project as HulyProject } from "@hcengineering/tracker"
import { Effect, Schema } from "effect"

import type { CreateIssueParams, DeleteIssueParams, UpdateIssueParams } from "../../domain/schemas.js"
import type { CreateIssueResult, DeleteIssueResult, UpdateIssueResult } from "../../domain/schemas/issues.js"
import { IssueId, IssueIdentifier, type ProjectIdentifier, type StatusName } from "../../domain/schemas/shared.js"
import type { TaskTypeRef } from "../../domain/schemas/task-management.js"
import { normalizeForComparison } from "../../utils/normalize.js"
import type { HulyClient, HulyClientError } from "../client.js"
import type { IssueNotFoundError, ProjectNotFoundError } from "../errors.js"
import { HulyError, InvalidStatusError, PersonNotFoundError } from "../errors.js"
import { task, tracker } from "../huly-plugins.js"
import { findPersonByEmailOrName } from "./contacts-shared.js"
import {
  findIssueInProject,
  findProjectAndIssue,
  findProjectWithStatuses,
  resolveStatusByName,
  type StatusInfo,
  stringToPriority
} from "./issues-shared.js"
import { toRef } from "./sdk-boundary.js"

type CreateIssueError =
  | HulyClientError
  | ProjectNotFoundError
  | IssueNotFoundError
  | InvalidStatusError
  | HulyError
  | PersonNotFoundError

type UpdateIssueError =
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

const resolveAssignee = (
  client: HulyClient["Type"],
  assigneeIdentifier: string
): Effect.Effect<Person, PersonNotFoundError | HulyClientError> =>
  Effect.gen(function*() {
    const person = yield* findPersonByEmailOrName(client, assigneeIdentifier)
    if (person === undefined) {
      return yield* new PersonNotFoundError({ identifier: assigneeIdentifier })
    }
    return person
  })

interface TaskTypeWorkflow {
  readonly taskType: TaskType
  readonly statuses: ReadonlyArray<StatusInfo>
  readonly defaultStatusId: Ref<Status> | undefined
}

const TASK_TYPE_DISCOVERY_HINT = "Use list_task_types or get_project_type to discover valid task types and statuses."

const taskTypeMatches = (taskType: TaskType, taskTypeRef: TaskTypeRef): boolean =>
  String(taskType._id) === String(taskTypeRef)
  || normalizeForComparison(taskType.name) === normalizeForComparison(taskTypeRef)

const describeTaskTypeOptions = (taskTypes: ReadonlyArray<TaskType>): string =>
  taskTypes.length === 0
    ? "No task types are configured for this project type."
    : `Available task types: ${taskTypes.map((taskType) => `${taskType.name} (${taskType._id})`).join(", ")}.`

const mergeTaskTypes = (
  first: ReadonlyArray<TaskType>,
  second: ReadonlyArray<TaskType>
): ReadonlyArray<TaskType> => {
  const taskTypesById = new Map<string, TaskType>()
  for (const taskType of [...first, ...second]) {
    taskTypesById.set(String(taskType._id), taskType)
  }
  return [...taskTypesById.values()]
}

const resolveTaskTypeWorkflow = (
  client: HulyClient["Type"],
  project: HulyProject,
  projectType: ProjectType | undefined,
  projectStatuses: ReadonlyArray<StatusInfo>,
  taskTypeRef: TaskTypeRef,
  projectIdentifier: ProjectIdentifier
): Effect.Effect<TaskTypeWorkflow, HulyClientError | HulyError> =>
  Effect.gen(function*() {
    const workflowProjectType = projectType
      ?? (yield* client.findOne<ProjectType>(task.class.ProjectType, { _id: project.type }))
    if (workflowProjectType === undefined) {
      return yield* Effect.fail(
        new HulyError({
          message:
            `Project '${projectIdentifier}' does not expose a project type/workflow, so taskType cannot be resolved. ${TASK_TYPE_DISCOVERY_HINT}`
        })
      )
    }

    const taskTypesByProjectTypeList = yield* client.findAll<TaskType>(
      task.class.TaskType,
      { _id: { $in: [...workflowProjectType.tasks] } }
    )
    const taskTypesByParent = yield* client.findAll<TaskType>(
      task.class.TaskType,
      { parent: workflowProjectType._id }
    )
    const taskTypes = mergeTaskTypes([...taskTypesByProjectTypeList], [...taskTypesByParent])
    const matches = [...taskTypes].filter((candidate) => taskTypeMatches(candidate, taskTypeRef))
    const selectedTaskType = matches.length === 1 ? matches[0] : undefined

    if (selectedTaskType === undefined) {
      const reason = matches.length === 0 ? "was not found" : "matched more than one task type"
      return yield* Effect.fail(
        new HulyError({
          message: `Task type '${taskTypeRef}' ${reason} in project '${projectIdentifier}' workflow. `
            + `${describeTaskTypeOptions([...taskTypes])} ${TASK_TYPE_DISCOVERY_HINT}`
        })
      )
    }

    const scopedStatuses = selectedTaskType.statuses.flatMap((statusId) =>
      projectStatuses.filter((status) => status._id === statusId)
    )
    const defaultStatusId = selectedTaskType.statuses.includes(project.defaultIssueStatus)
      ? project.defaultIssueStatus
      : selectedTaskType.statuses.at(0)

    return { defaultStatusId, statuses: scopedStatuses, taskType: selectedTaskType }
  })

const validStatusNames = (workflow: TaskTypeWorkflow): string =>
  workflow.statuses.length === 0
    ? workflow.taskType.statuses.join(", ")
    : workflow.statuses.map((status) => status.name).join(", ")

const resolveStatusForTaskType = (
  workflow: TaskTypeWorkflow,
  statusName: StatusName,
  projectIdentifier: ProjectIdentifier
): Effect.Effect<Ref<Status>, HulyError> => {
  const normalizedStatusName = normalizeForComparison(statusName)
  const match = workflow.statuses.find((status) => normalizeForComparison(status.name) === normalizedStatusName)
  const statusNames = validStatusNames(workflow)

  return match !== undefined
    ? Effect.succeed(match._id)
    : Effect.fail(
      new HulyError({
        message:
          `Status '${statusName}' is not valid for task type '${workflow.taskType.name}' in project '${projectIdentifier}'. Valid statuses for this task type: ${statusNames}. ${TASK_TYPE_DISCOVERY_HINT}`
      })
    )
}

const chooseStatusForTaskType = (
  workflow: TaskTypeWorkflow,
  requestedStatus: StatusName | undefined,
  currentStatus: Ref<Status> | undefined,
  projectIdentifier: ProjectIdentifier
): Effect.Effect<Ref<Status>, HulyError> => {
  if (requestedStatus !== undefined) {
    return resolveStatusForTaskType(workflow, requestedStatus, projectIdentifier)
  }
  if (currentStatus !== undefined && workflow.taskType.statuses.includes(currentStatus)) {
    return Effect.succeed(currentStatus)
  }

  return workflow.defaultStatusId !== undefined
    ? Effect.succeed(workflow.defaultStatusId)
    : Effect.fail(
      new HulyError({
        message:
          `Task type '${workflow.taskType.name}' in project '${projectIdentifier}' has no valid status. ${TASK_TYPE_DISCOVERY_HINT}`
      })
    )
}

/**
 * Create a new issue in a project.
 *
 * Creates issue with:
 * - Title (required)
 * - Description (optional, markdown supported)
 * - Priority (optional, defaults to no-priority)
 * - Status (optional, uses project default)
 * - Assignee (optional, by email or name)
 */
export const createIssue = (
  params: CreateIssueParams
): Effect.Effect<CreateIssueResult, CreateIssueError, HulyClient> =>
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
      { space: project._id },
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

    const priority = stringToPriority(params.priority || "no-priority")
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
 * Update an existing issue in a project.
 *
 * Updates only provided fields:
 * - title: New title
 * - description: New markdown description (uploaded via uploadMarkup)
 * - status: New status (resolved by name)
 * - priority: New priority
 * - assignee: New assignee email/name, or null to unassign
 *
 * Note: Huly REST API is eventually consistent. Reads immediately after
 * updates may return stale data. Allow ~2 seconds for propagation.
 */
export const updateIssue = (
  params: UpdateIssueParams
): Effect.Effect<UpdateIssueResult, UpdateIssueError, HulyClient> =>
  Effect.gen(function*() {
    const { client, issue, project } = yield* findProjectAndIssue(params)

    const workflowData = params.status !== undefined || params.taskType !== undefined
      ? yield* findProjectWithStatuses(params.project)
      : { projectType: undefined, statuses: [] }
    const taskTypeWorkflow = params.taskType === undefined
      ? undefined
      : yield* resolveTaskTypeWorkflow(
        client,
        project,
        workflowData.projectType,
        workflowData.statuses,
        params.taskType,
        params.project
      )

    const updateOps: DocumentUpdate<HulyIssue> = {}
    let descriptionUpdatedInPlace = false

    if (params.title !== undefined) {
      updateOps.title = params.title
    }

    if (params.description !== undefined) {
      if (params.description.trim() === "") {
        updateOps.description = null
      } else if (issue.description) {
        // Issue already has description - update in place
        yield* client.updateMarkup(
          tracker.class.Issue,
          issue._id,
          "description",
          params.description,
          "markdown"
        )
        descriptionUpdatedInPlace = true
      } else {
        // Issue has no description yet - create new
        const descriptionMarkupRef = yield* client.uploadMarkup(
          tracker.class.Issue,
          issue._id,
          "description",
          params.description,
          "markdown"
        )
        updateOps.description = descriptionMarkupRef
      }
    }

    if (taskTypeWorkflow !== undefined) {
      const nextStatus = yield* chooseStatusForTaskType(taskTypeWorkflow, params.status, issue.status, params.project)
      if (taskTypeWorkflow.taskType._id !== issue.kind) {
        updateOps.kind = taskTypeWorkflow.taskType._id
      }
      if (nextStatus !== issue.status) {
        updateOps.status = nextStatus
      }
    } else if (params.status !== undefined) {
      updateOps.status = yield* resolveStatusByName(workflowData.statuses, params.status, params.project)
    }

    if (params.priority !== undefined) {
      updateOps.priority = stringToPriority(params.priority)
    }

    if (params.assignee !== undefined) {
      if (params.assignee === null) {
        updateOps.assignee = null
      } else {
        const person = yield* resolveAssignee(client, params.assignee)
        updateOps.assignee = person._id
      }
    }

    if (params.dueDate !== undefined) {
      updateOps.dueDate = params.dueDate
    }

    if (params.estimation !== undefined) {
      updateOps.estimation = params.estimation ?? 0
    }

    if (Object.keys(updateOps).length === 0 && !descriptionUpdatedInPlace) {
      return { identifier: IssueIdentifier.make(issue.identifier), updated: false }
    }

    if (Object.keys(updateOps).length > 0) {
      yield* client.updateDoc(
        tracker.class.Issue,
        project._id,
        issue._id,
        updateOps
      )
    }

    return { identifier: IssueIdentifier.make(issue.identifier), updated: true }
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
