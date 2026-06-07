import type { Person } from "@hcengineering/contact"
import type { Ref, Status } from "@hcengineering/core"
import type { ProjectType, TaskType } from "@hcengineering/task"
import type { Project as HulyProject } from "@hcengineering/tracker"
import { Effect } from "effect"

import type { ProjectIdentifier, StatusName } from "../../domain/schemas/shared.js"
import type { TaskTypeRef } from "../../domain/schemas/task-management.js"
import { normalizeForComparison } from "../../utils/normalize.js"
import type { HulyClient, HulyClientError } from "../client.js"
import { HulyError, PersonNotFoundError } from "../errors.js"
import { task } from "../huly-plugins.js"
import { findPersonByEmailOrName } from "./contacts-shared.js"
import type { WorkflowStatus } from "./issues-shared.js"
import { hulyQuery } from "./query-helpers.js"

export const resolveAssignee = (
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
  readonly statuses: ReadonlyArray<WorkflowStatus>
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

export const resolveTaskTypeWorkflow = (
  client: HulyClient["Type"],
  project: HulyProject,
  projectType: ProjectType | undefined,
  projectStatuses: ReadonlyArray<WorkflowStatus>,
  taskTypeRef: TaskTypeRef,
  projectIdentifier: ProjectIdentifier
): Effect.Effect<TaskTypeWorkflow, HulyClientError | HulyError> =>
  Effect.gen(function*() {
    const workflowProjectType = projectType
      ?? (yield* client.findOne<ProjectType>(task.class.ProjectType, hulyQuery<ProjectType>({ _id: project.type })))
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
      hulyQuery<TaskType>({ _id: { $in: [...workflowProjectType.tasks] } })
    )
    const taskTypesByParent = yield* client.findAll<TaskType>(
      task.class.TaskType,
      hulyQuery<TaskType>({ parent: workflowProjectType._id })
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

export const chooseStatusForTaskType = (
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
