import { JSONSchema, Schema } from "effect"

import { IssueStatusId, NonEmptyString, ProjectTypeId, TaskTypeId } from "./shared.js"

export const StatusCategoryValueSchema = Schema.Literal("backlog", "todo", "active", "done", "canceled", "unknown")
export type StatusCategoryValue = Schema.Schema.Type<typeof StatusCategoryValueSchema>

export const CreateStatusCategoryValueSchema = Schema.Literal("backlog", "todo", "active", "done", "canceled")
export type CreateStatusCategoryValue = Schema.Schema.Type<typeof CreateStatusCategoryValueSchema>

export const TaskTypeKindSchema = Schema.Literal("task", "subtask", "both")
export type TaskTypeKind = Schema.Schema.Type<typeof TaskTypeKindSchema>

export const ProjectTypeRefSchema = NonEmptyString.pipe(Schema.brand("ProjectTypeRef"))
export type ProjectTypeRef = Schema.Schema.Type<typeof ProjectTypeRefSchema>

export const TaskTypeRefSchema = NonEmptyString.pipe(Schema.brand("TaskTypeRef"))
export type TaskTypeRef = Schema.Schema.Type<typeof TaskTypeRefSchema>

export const StatusCategorySummarySchema = Schema.Struct({
  value: StatusCategoryValueSchema,
  id: NonEmptyString,
  name: NonEmptyString
})
export type StatusCategorySummary = Schema.Schema.Type<typeof StatusCategorySummarySchema>

export const IssueStatusSummarySchema = Schema.Struct({
  id: IssueStatusId,
  name: NonEmptyString,
  category: StatusCategoryValueSchema,
  taskTypeIds: Schema.Array(TaskTypeId)
})
export type IssueStatusSummary = Schema.Schema.Type<typeof IssueStatusSummarySchema>

export const TaskTypeSummarySchema = Schema.Struct({
  id: TaskTypeId,
  name: NonEmptyString,
  projectTypeId: ProjectTypeId,
  projectTypeName: NonEmptyString,
  kind: TaskTypeKindSchema,
  issueClass: NonEmptyString,
  statusCount: Schema.NonNegativeInt
})
export type TaskTypeSummary = Schema.Schema.Type<typeof TaskTypeSummarySchema>

export const ProjectTypeSummarySchema = Schema.Struct({
  id: ProjectTypeId,
  name: NonEmptyString,
  descriptor: NonEmptyString,
  taskTypeCount: Schema.NonNegativeInt,
  statusCount: Schema.NonNegativeInt,
  isDefaultClassic: Schema.Boolean
})
export type ProjectTypeSummary = Schema.Schema.Type<typeof ProjectTypeSummarySchema>

export const ProjectTypeDetailSchema = Schema.Struct({
  id: ProjectTypeId,
  name: NonEmptyString,
  description: Schema.optional(Schema.String),
  descriptor: NonEmptyString,
  classic: Schema.Boolean,
  isDefaultClassic: Schema.Boolean,
  taskTypes: Schema.Array(TaskTypeSummarySchema),
  statuses: Schema.Array(IssueStatusSummarySchema),
  statusCategories: Schema.Array(StatusCategorySummarySchema),
  taskTypeStatuses: Schema.Array(Schema.Struct({
    taskTypeId: TaskTypeId,
    taskTypeName: NonEmptyString,
    statusIds: Schema.Array(IssueStatusId)
  }))
})
export type ProjectTypeDetail = Schema.Schema.Type<typeof ProjectTypeDetailSchema>

export const ListProjectTypesParamsSchema = Schema.Struct({})
export type ListProjectTypesParams = Schema.Schema.Type<typeof ListProjectTypesParamsSchema>

export const GetProjectTypeParamsSchema = Schema.Struct({
  projectType: Schema.optional(ProjectTypeRefSchema.annotations({
    description: "Project type ID or display name. If omitted, uses the unambiguous Classic tracker project type."
  }))
})
export type GetProjectTypeParams = Schema.Schema.Type<typeof GetProjectTypeParamsSchema>

export const ListTaskTypesParamsSchema = Schema.Struct({
  projectType: Schema.optional(ProjectTypeRefSchema.annotations({
    description: "Optional project type ID or display name. If omitted, returns task types from all project types."
  }))
})
export type ListTaskTypesParams = Schema.Schema.Type<typeof ListTaskTypesParamsSchema>

export const CreateTaskTypeParamsSchema = Schema.Struct({
  projectType: Schema.optional(ProjectTypeRefSchema.annotations({
    description: "Project type ID or display name. If omitted, uses the unambiguous Classic tracker project type."
  })),
  name: NonEmptyString.annotations({ description: "Display name for the new issue/task type." }),
  templateTaskType: Schema.optional(TaskTypeRefSchema.annotations({
    description:
      "Existing task type ID or display name to copy required Huly configuration from. Defaults to the first task type on the project type."
  }))
})
export type CreateTaskTypeParams = Schema.Schema.Type<typeof CreateTaskTypeParamsSchema>

export const CreateIssueStatusParamsSchema = Schema.Struct({
  projectType: Schema.optional(ProjectTypeRefSchema.annotations({
    description: "Project type ID or display name. If omitted, uses the unambiguous Classic tracker project type."
  })),
  name: NonEmptyString.annotations({ description: "Display name for the workflow status to add." }),
  category: CreateStatusCategoryValueSchema.annotations({
    description: "Business category for the status: backlog, todo, active, done, or canceled."
  }),
  taskType: Schema.optional(TaskTypeRefSchema.annotations({
    description:
      "Optional task type ID or display name to scope the status to. If omitted, the status is added to every task type in the project type."
  }))
})
export type CreateIssueStatusParams = Schema.Schema.Type<typeof CreateIssueStatusParamsSchema>

export const ListProjectTypesResultSchema = Schema.Struct({
  projectTypes: Schema.Array(ProjectTypeSummarySchema),
  total: Schema.NonNegativeInt
})
export type ListProjectTypesResult = Schema.Schema.Type<typeof ListProjectTypesResultSchema>

export const ListTaskTypesResultSchema = Schema.Struct({
  taskTypes: Schema.Array(TaskTypeSummarySchema),
  total: Schema.NonNegativeInt
})
export type ListTaskTypesResult = Schema.Schema.Type<typeof ListTaskTypesResultSchema>

export const CreateTaskTypeResultSchema = Schema.Struct({
  created: Schema.Boolean,
  projectType: ProjectTypeSummarySchema,
  taskType: TaskTypeSummarySchema,
  affectedTaskTypeIds: Schema.Array(TaskTypeId),
  warning: NonEmptyString
})
export type CreateTaskTypeResult = Schema.Schema.Type<typeof CreateTaskTypeResultSchema>

export const CreateIssueStatusResultSchema = Schema.Struct({
  created: Schema.Boolean,
  projectType: ProjectTypeSummarySchema,
  status: IssueStatusSummarySchema,
  affectedTaskTypeIds: Schema.Array(TaskTypeId),
  warning: NonEmptyString
})
export type CreateIssueStatusResult = Schema.Schema.Type<typeof CreateIssueStatusResultSchema>

export const listProjectTypesParamsJsonSchema = JSONSchema.make(ListProjectTypesParamsSchema)
export const getProjectTypeParamsJsonSchema = JSONSchema.make(GetProjectTypeParamsSchema)
export const listTaskTypesParamsJsonSchema = JSONSchema.make(ListTaskTypesParamsSchema)
export const createTaskTypeParamsJsonSchema = JSONSchema.make(CreateTaskTypeParamsSchema)
export const createIssueStatusParamsJsonSchema = JSONSchema.make(CreateIssueStatusParamsSchema)

export const parseListProjectTypesParams = Schema.decodeUnknown(ListProjectTypesParamsSchema)
export const parseGetProjectTypeParams = Schema.decodeUnknown(GetProjectTypeParamsSchema)
export const parseListTaskTypesParams = Schema.decodeUnknown(ListTaskTypesParamsSchema)
export const parseCreateTaskTypeParams = Schema.decodeUnknown(CreateTaskTypeParamsSchema)
export const parseCreateIssueStatusParams = Schema.decodeUnknown(CreateIssueStatusParamsSchema)
