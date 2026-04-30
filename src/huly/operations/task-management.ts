/* eslint-disable max-lines -- task-management workflow discovery and additive mutations share local invariants */
import type { Class, Data, Doc, DocumentUpdate, Mixin, Ref, Status, StatusCategory } from "@hcengineering/core"
import { ClassifierKind, generateId, SortingOrder } from "@hcengineering/core"
import { getEmbeddedLabel } from "@hcengineering/platform"
import type { ProjectStatus, ProjectType, Task, TaskType } from "@hcengineering/task"
import { Effect, Schema } from "effect"

import type {
  CreateIssueStatusParams,
  CreateIssueStatusResult,
  CreateStatusCategoryValue,
  CreateTaskTypeParams,
  CreateTaskTypeResult,
  GetProjectTypeParams,
  IssueStatusSummary,
  ListProjectTypesParams,
  ListProjectTypesResult,
  ListTaskTypesParams,
  ListTaskTypesResult,
  ProjectTypeDetail,
  ProjectTypeSummary,
  StatusCategorySummary,
  StatusCategoryValue,
  TaskTypeSummary
} from "../../domain/schemas.js"
import {
  CreateIssueStatusResultSchema,
  CreateTaskTypeResultSchema,
  IssueStatusId,
  ListProjectTypesResultSchema,
  ListTaskTypesResultSchema,
  ProjectTypeDetailSchema,
  ProjectTypeId,
  TaskTypeId
} from "../../domain/schemas.js"
import { normalizeForComparison } from "../../utils/normalize.js"
import { HulyClient, type HulyClientError, type HulyClientOperations } from "../client.js"
import { HulyConnectionError, HulyError } from "../errors.js"
import { core, task, tracker } from "../huly-plugins.js"
import { toRef } from "./sdk-boundary.js"

type TaskManagementError = HulyClientError | HulyConnectionError | HulyError

const CATEGORY_TO_REF = {
  backlog: task.statusCategory.UnStarted,
  todo: task.statusCategory.ToDo,
  active: task.statusCategory.Active,
  done: task.statusCategory.Won,
  canceled: task.statusCategory.Lost
} as const satisfies Record<CreateStatusCategoryValue, Ref<StatusCategory>>

const CATEGORY_ENTRIES: ReadonlyArray<readonly [StatusCategoryValue, Ref<StatusCategory>]> = [
  ["backlog", task.statusCategory.UnStarted],
  ["todo", task.statusCategory.ToDo],
  ["active", task.statusCategory.Active],
  ["done", task.statusCategory.Won],
  ["canceled", task.statusCategory.Lost]
]

const REF_TO_CATEGORY = new Map<Ref<StatusCategory>, StatusCategoryValue>(
  CATEGORY_ENTRIES.map(([value, ref]) => [ref, value])
)

const STATUS_CATEGORIES: ReadonlyArray<StatusCategorySummary> = [
  { value: "backlog", id: task.statusCategory.UnStarted, name: "Backlog" },
  { value: "todo", id: task.statusCategory.ToDo, name: "Todo" },
  { value: "active", id: task.statusCategory.Active, name: "Active" },
  { value: "done", id: task.statusCategory.Won, name: "Done" },
  { value: "canceled", id: task.statusCategory.Lost, name: "Canceled" }
]

const WORKFLOW_WARNING = "This changes workspace-level tracker configuration for every project using this project type."

const toCategoryValue = (category: Ref<StatusCategory> | undefined): StatusCategoryValue =>
  category === undefined ? "unknown" : REF_TO_CATEGORY.get(category) ?? "unknown"

const encodeOrConnectionError = <A, I, R>(
  schema: Schema.Schema<A, I, R>,
  value: A,
  operation: string
): Effect.Effect<A, HulyConnectionError, R> =>
  Schema.encode(schema)(value).pipe(
    Effect.as(value),
    Effect.mapError((parseError) =>
      new HulyConnectionError({
        message: `${operation} response failed schema validation: ${parseError.message}`,
        cause: parseError
      })
    )
  )

interface WorkflowData {
  readonly projectType: ProjectType
  readonly taskTypes: ReadonlyArray<TaskType>
  readonly statuses: ReadonlyArray<Status>
}

const uniqueStatusIds = (projectType: ProjectType): ReadonlyArray<Ref<Status>> =>
  Array.from(new Set(projectType.statuses.map((status) => status._id)))

const getStatusDocs = (
  client: HulyClientOperations,
  statusIds: ReadonlyArray<Ref<Status>>
): Effect.Effect<ReadonlyArray<Status>, HulyClientError> =>
  statusIds.length === 0
    ? Effect.succeed([])
    : client.findAll<Status>(core.class.Status, { _id: { $in: [...statusIds] } }).pipe(
      Effect.map((result) => [...result])
    )

const getTaskTypes = (
  client: HulyClientOperations,
  taskTypeIds: ReadonlyArray<Ref<TaskType>>
): Effect.Effect<ReadonlyArray<TaskType>, HulyClientError> =>
  taskTypeIds.length === 0
    ? Effect.succeed([])
    : client.findAll<TaskType>(task.class.TaskType, { _id: { $in: [...taskTypeIds] } }).pipe(
      Effect.map((result) => [...result])
    )

const getTaskTypesByProjectType = (
  client: HulyClientOperations,
  projectTypeId: Ref<ProjectType>
): Effect.Effect<ReadonlyArray<TaskType>, HulyClientError> =>
  client.findAll<TaskType>(task.class.TaskType, { parent: projectTypeId }).pipe(
    Effect.map((result) => [...result])
  )

const getRecoverableStatusesByName = (
  client: HulyClientOperations,
  name: string
): Effect.Effect<ReadonlyArray<Status>, never> =>
  client.findAll<Status>(core.class.Status, { ofAttribute: tracker.attribute.IssueStatus }).pipe(
    Effect.map((result) =>
      [...result].filter((status) => normalizeForComparison(status.name) === normalizeForComparison(name))
    ),
    // Compatibility fallback for https://github.com/dearlordylord/huly-mcp/issues/34:
    // this broad recovery query was reported to null-deref on an older self-hosted
    // Huly. The primary project-type status data is already loaded, so losing only
    // cross-project duplicate recovery is preferable to failing status creation.
    Effect.catchAll(() => Effect.succeed([]))
  )

const loadWorkflowData = (
  client: HulyClientOperations,
  projectType: ProjectType
): Effect.Effect<WorkflowData, HulyClientError> =>
  Effect.gen(function*() {
    const taskTypes = yield* getTaskTypes(client, projectType.tasks)
    const statuses = yield* getStatusDocs(client, uniqueStatusIds(projectType))
    return { projectType, taskTypes, statuses }
  })

const isDefaultClassicProjectType = (projectType: ProjectType): boolean =>
  projectType._id === tracker.ids.ClassingProjectType
  || projectType.classic
  || normalizeForComparison(projectType.name) === "classic"

const projectTypeSummary = (data: WorkflowData): ProjectTypeSummary => ({
  id: ProjectTypeId.make(data.projectType._id),
  name: data.projectType.name,
  descriptor: data.projectType.descriptor,
  taskTypeCount: data.taskTypes.length,
  statusCount: uniqueStatusIds(data.projectType).length,
  isDefaultClassic: isDefaultClassicProjectType(data.projectType)
})

const statusTaskTypeIds = (projectType: ProjectType, statusId: Ref<Status>): ReadonlyArray<Ref<TaskType>> =>
  projectType.statuses.filter((status) => status._id === statusId).map((status) => status.taskType)

const statusSummary = (projectType: ProjectType, status: Status): IssueStatusSummary => ({
  id: IssueStatusId.make(status._id),
  name: status.name,
  category: toCategoryValue(status.category),
  taskTypeIds: statusTaskTypeIds(projectType, status._id).map((taskTypeId) => TaskTypeId.make(taskTypeId))
})

const taskTypeSummary = (projectType: ProjectType, taskType: TaskType): TaskTypeSummary => ({
  id: TaskTypeId.make(taskType._id),
  name: taskType.name,
  projectTypeId: ProjectTypeId.make(projectType._id),
  projectTypeName: projectType.name,
  kind: taskType.kind,
  issueClass: taskType.ofClass,
  statusCount: taskType.statuses.length
})

const projectTypeDetail = (data: WorkflowData): ProjectTypeDetail => ({
  ...projectTypeSummary(data),
  description: data.projectType.description || undefined,
  classic: data.projectType.classic,
  taskTypes: data.taskTypes.map((taskType) => taskTypeSummary(data.projectType, taskType)),
  statuses: data.statuses.map((status) => statusSummary(data.projectType, status)),
  statusCategories: [...STATUS_CATEGORIES],
  taskTypeStatuses: data.taskTypes.map((taskType) => ({
    taskTypeId: TaskTypeId.make(taskType._id),
    taskTypeName: taskType.name,
    statusIds: taskType.statuses.map((statusId) => IssueStatusId.make(statusId))
  }))
})

const listAllProjectTypes = (
  client: HulyClientOperations
): Effect.Effect<ReadonlyArray<ProjectType>, HulyClientError> =>
  client.findAll<ProjectType>(
    task.class.ProjectType,
    {},
    { sort: { name: SortingOrder.Ascending } }
  ).pipe(Effect.map((result) => [...result]))

const resolveProjectType = (
  client: HulyClientOperations,
  projectTypeRef: string | undefined
): Effect.Effect<ProjectType, TaskManagementError> =>
  Effect.gen(function*() {
    const projectTypes = yield* listAllProjectTypes(client)
    const selected = projectTypeRef === undefined
      ? projectTypes.filter(isDefaultClassicProjectType)
      : projectTypes.filter((projectType) =>
        projectType._id === projectTypeRef
        || normalizeForComparison(projectType.name) === normalizeForComparison(projectTypeRef)
      )

    if (selected.length === 1) {
      return selected[0]
    }

    const message = projectTypeRef === undefined
      ? "Could not select a default Classic project type unambiguously; pass projectType by ID or name."
      : `Project type '${projectTypeRef}' did not resolve to exactly one project type.`
    return yield* Effect.fail(new HulyError({ message }))
  })

const resolveTaskType = (
  taskTypes: ReadonlyArray<TaskType>,
  taskTypeRef: string
): Effect.Effect<TaskType, HulyError> => {
  const selected = taskTypes.filter((taskType) =>
    taskType._id === taskTypeRef
    || normalizeForComparison(taskType.name) === normalizeForComparison(taskTypeRef)
  )

  return selected.length === 1
    ? Effect.succeed(selected[0])
    : Effect.fail(new HulyError({ message: `Task type '${taskTypeRef}' did not resolve to exactly one task type.` }))
}

const existingTaskTypeByName = (
  taskTypes: ReadonlyArray<TaskType>,
  name: string
): TaskType | undefined =>
  taskTypes.find((taskType) => normalizeForComparison(taskType.name) === normalizeForComparison(name))

const existingStatusByName = (
  statuses: ReadonlyArray<Status>,
  name: string
): Status | undefined => statuses.find((status) => normalizeForComparison(status.name) === normalizeForComparison(name))

const requireStatusCategoryMatch = (
  status: Status,
  requestedCategory: StatusCategoryValue
): Effect.Effect<void, HulyError> => {
  const actualCategory = toCategoryValue(status.category)
  return actualCategory === requestedCategory
    ? Effect.void
    : Effect.fail(
      new HulyError({
        message:
          `Status '${status.name}' already exists with category '${actualCategory}', not requested category '${requestedCategory}'.`
      })
    )
}

const resolveStatusClass = (
  taskTypes: ReadonlyArray<TaskType>
): Effect.Effect<Ref<Class<Status>>, HulyError> => {
  const statusClasses = Array.from(new Set(taskTypes.map((taskType) => taskType.statusClass)))
  const statusClass = statusClasses.at(0)
  return statusClasses.length === 1 && statusClass !== undefined
    ? Effect.succeed(statusClass)
    : Effect.fail(new HulyError({ message: "Target task types do not share one issue status class." }))
}

const replaceOrAppendProjectStatus = (
  statuses: Array<ProjectStatus>,
  statusId: Ref<Status>,
  taskTypeId: Ref<TaskType>
): Array<ProjectStatus> =>
  statuses.some((status) => status._id === statusId && status.taskType === taskTypeId)
    ? statuses
    : [...statuses, { _id: statusId, taskType: taskTypeId }]

export const listProjectTypes = (
  _params: ListProjectTypesParams
): Effect.Effect<ListProjectTypesResult, TaskManagementError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const projectTypes = yield* listAllProjectTypes(client)
    const workflowData = yield* Effect.all(projectTypes.map((projectType) => loadWorkflowData(client, projectType)))
    const result = {
      projectTypes: workflowData.map(projectTypeSummary),
      total: workflowData.length
    }
    return yield* encodeOrConnectionError(ListProjectTypesResultSchema, result, "listProjectTypes")
  })

export const getProjectType = (
  params: GetProjectTypeParams
): Effect.Effect<ProjectTypeDetail, TaskManagementError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const projectType = yield* resolveProjectType(client, params.projectType)
    const workflowData = yield* loadWorkflowData(client, projectType)
    return yield* encodeOrConnectionError(ProjectTypeDetailSchema, projectTypeDetail(workflowData), "getProjectType")
  })

export const listTaskTypes = (
  params: ListTaskTypesParams
): Effect.Effect<ListTaskTypesResult, TaskManagementError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const projectTypes = params.projectType === undefined
      ? yield* listAllProjectTypes(client)
      : [yield* resolveProjectType(client, params.projectType)]
    const workflowData = yield* Effect.all(projectTypes.map((projectType) => loadWorkflowData(client, projectType)))
    const taskTypes = workflowData.flatMap((data) =>
      data.taskTypes.map((taskType) => taskTypeSummary(data.projectType, taskType))
    )
    const result = { taskTypes, total: taskTypes.length }
    return yield* encodeOrConnectionError(ListTaskTypesResultSchema, result, "listTaskTypes")
  })

export const createTaskType = (
  params: CreateTaskTypeParams
): Effect.Effect<CreateTaskTypeResult, TaskManagementError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const projectType = yield* resolveProjectType(client, params.projectType)
    const workflowData = yield* loadWorkflowData(client, projectType)
    const allProjectTaskTypes = yield* getTaskTypesByProjectType(client, projectType._id)
    const existing = existingTaskTypeByName(allProjectTaskTypes, params.name)

    if (existing !== undefined) {
      const projectTypeTasks = projectType.tasks.includes(existing._id)
        ? projectType.tasks
        : [...projectType.tasks, existing._id]
      const existingProjectStatuses = existing.statuses.reduce<Array<ProjectStatus>>(
        (statuses, statusId) => replaceOrAppendProjectStatus(statuses, statusId, existing._id),
        [...projectType.statuses]
      )
      const projectTypeChanged = projectTypeTasks.length !== projectType.tasks.length
        || existingProjectStatuses.length !== projectType.statuses.length

      if (projectTypeChanged) {
        yield* client.updateDoc(
          task.class.ProjectType,
          core.space.Model,
          projectType._id,
          { tasks: projectTypeTasks, statuses: existingProjectStatuses } satisfies DocumentUpdate<ProjectType>
        )
      }

      const result = {
        created: projectTypeChanged,
        projectType: projectTypeSummary({
          projectType: { ...projectType, tasks: projectTypeTasks, statuses: existingProjectStatuses },
          taskTypes: workflowData.taskTypes.some((taskType) => taskType._id === existing._id)
            ? workflowData.taskTypes
            : [...workflowData.taskTypes, existing],
          statuses: workflowData.statuses
        }),
        taskType: taskTypeSummary(projectType, existing),
        affectedTaskTypeIds: [TaskTypeId.make(existing._id)],
        warning: WORKFLOW_WARNING
      }
      return yield* encodeOrConnectionError(CreateTaskTypeResultSchema, result, "createTaskType")
    }

    const template = params.templateTaskType === undefined
      ? workflowData.taskTypes.at(0)
      : yield* resolveTaskType(workflowData.taskTypes, params.templateTaskType)
    if (template === undefined) {
      return yield* Effect.fail(
        new HulyError({ message: `Project type '${projectType.name}' has no task type to copy.` })
      )
    }

    const taskTypeId = generateId<TaskType>()
    const targetClassId = `${taskTypeId}:type:mixin`
    const targetClassRef = toRef<Class<Task>>(targetClassId)

    yield* client.createDoc(
      core.class.Mixin,
      core.space.Model,
      {
        extends: template.ofClass,
        kind: ClassifierKind.MIXIN,
        label: getEmbeddedLabel(params.name),
        ...(template.icon === undefined ? {} : { icon: template.icon })
      },
      toRef<Mixin<Doc>>(targetClassId)
    )
    yield* client.createMixin(
      targetClassRef,
      core.class.Mixin,
      core.space.Model,
      task.mixin.TaskTypeClass,
      {
        taskType: taskTypeId,
        projectType: projectType._id
      }
    )

    const taskTypeData: Data<TaskType> = {
      parent: projectType._id,
      descriptor: template.descriptor,
      name: params.name,
      kind: template.kind,
      ofClass: template.ofClass,
      targetClass: targetClassRef,
      statuses: [...template.statuses],
      statusClass: template.statusClass,
      statusCategories: [...template.statusCategories],
      ...(template.allowedAsChildOf === undefined ? {} : { allowedAsChildOf: template.allowedAsChildOf }),
      ...(template.icon === undefined ? {} : { icon: template.icon }),
      ...(template.color === undefined ? {} : { color: template.color })
    }

    yield* client.createDoc(task.class.TaskType, core.space.Model, taskTypeData, taskTypeId)
    yield* client.updateDoc(
      task.class.ProjectType,
      core.space.Model,
      projectType._id,
      {
        tasks: [...projectType.tasks, taskTypeId],
        statuses: [
          ...projectType.statuses,
          ...template.statuses.map((statusId) => ({ _id: statusId, taskType: taskTypeId }))
        ]
      } satisfies DocumentUpdate<ProjectType>
    )

    const createdTaskType = {
      ...template,
      _id: taskTypeId,
      parent: projectType._id,
      name: params.name,
      kind: template.kind,
      targetClass: targetClassRef
    }
    const result = {
      created: true,
      projectType: projectTypeSummary({
        projectType: {
          ...projectType,
          tasks: [...projectType.tasks, taskTypeId],
          statuses: [
            ...projectType.statuses,
            ...template.statuses.map((statusId) => ({ _id: statusId, taskType: taskTypeId }))
          ]
        },
        taskTypes: [...workflowData.taskTypes, createdTaskType],
        statuses: workflowData.statuses
      }),
      taskType: taskTypeSummary(projectType, createdTaskType),
      affectedTaskTypeIds: [TaskTypeId.make(taskTypeId)],
      warning: WORKFLOW_WARNING
    }
    return yield* encodeOrConnectionError(CreateTaskTypeResultSchema, result, "createTaskType")
  })

export const createIssueStatus = (
  params: CreateIssueStatusParams
): Effect.Effect<CreateIssueStatusResult, TaskManagementError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const projectType = yield* resolveProjectType(client, params.projectType)
    const workflowData = yield* loadWorkflowData(client, projectType)
    const targetTaskTypes = params.taskType === undefined
      ? workflowData.taskTypes
      : [yield* resolveTaskType(workflowData.taskTypes, params.taskType)]
    const statusClass = yield* resolveStatusClass(targetTaskTypes)
    const statusesByName = yield* getRecoverableStatusesByName(client, params.name)
    const existingStatus = existingStatusByName(
      [...workflowData.statuses, ...statusesByName],
      params.name
    )
    const statusId = existingStatus?._id ?? generateId<Status>()

    if (existingStatus !== undefined) {
      yield* requireStatusCategoryMatch(existingStatus, params.category)
    }

    if (existingStatus === undefined) {
      yield* client.createDoc(
        statusClass,
        core.space.Model,
        {
          ofAttribute: tracker.attribute.IssueStatus,
          name: params.name,
          category: CATEGORY_TO_REF[params.category]
        },
        statusId
      )
    }

    const taskTypesMissingStatus = targetTaskTypes.filter((taskType) => !taskType.statuses.includes(statusId))
    yield* Effect.all(
      taskTypesMissingStatus.map((taskType) =>
        client.updateDoc(
          task.class.TaskType,
          core.space.Model,
          taskType._id,
          { statuses: [...taskType.statuses, statusId] } satisfies DocumentUpdate<TaskType>
        )
      )
    )

    const updatedProjectStatuses = targetTaskTypes.reduce<Array<ProjectStatus>>(
      (statuses, taskType) => replaceOrAppendProjectStatus(statuses, statusId, taskType._id),
      [...projectType.statuses]
    )
    const projectTypeChanged = updatedProjectStatuses.length !== projectType.statuses.length
    if (projectTypeChanged) {
      yield* client.updateDoc(
        task.class.ProjectType,
        core.space.Model,
        projectType._id,
        { statuses: updatedProjectStatuses } satisfies DocumentUpdate<ProjectType>
      )
    }

    const statusDoc = existingStatus ?? {
      _id: statusId,
      _class: statusClass,
      space: core.space.Model,
      modifiedOn: 0,
      modifiedBy: core.account.System,
      ofAttribute: tracker.attribute.IssueStatus,
      name: params.name,
      category: CATEGORY_TO_REF[params.category]
    } satisfies Status
    const result = {
      created: existingStatus === undefined || taskTypesMissingStatus.length > 0 || projectTypeChanged,
      projectType: projectTypeSummary({
        projectType: { ...projectType, statuses: updatedProjectStatuses },
        taskTypes: workflowData.taskTypes,
        statuses: existingStatus === undefined ? [...workflowData.statuses, statusDoc] : workflowData.statuses
      }),
      status: statusSummary({ ...projectType, statuses: updatedProjectStatuses }, statusDoc),
      affectedTaskTypeIds: targetTaskTypes.map((taskType) => TaskTypeId.make(taskType._id)),
      warning: WORKFLOW_WARNING
    }
    return yield* encodeOrConnectionError(CreateIssueStatusResultSchema, result, "createIssueStatus")
  })
