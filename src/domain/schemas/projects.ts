import { JSONSchema, Schema } from "effect"

import type { ListTotal } from "./shared.js"
import {
  assertUpdateFields,
  atLeastOneUpdateFieldMessage,
  hasAtLeastOneDefined,
  LimitParam,
  NonEmptyString,
  ProjectIdentifier,
  StatusName,
  withAtLeastOneRequired
} from "./shared.js"
import { StatusCategoryValueSchema } from "./task-management.js"

export const ProjectSummarySchema = Schema.Struct({
  identifier: ProjectIdentifier,
  name: NonEmptyString,
  description: Schema.optional(Schema.String),
  archived: Schema.Boolean
}).annotations({
  title: "ProjectSummary",
  description: "Project summary for list operations"
})

export type ProjectSummary = Schema.Schema.Type<typeof ProjectSummarySchema>

export const ListProjectsParamsSchema = Schema.Struct({
  includeArchived: Schema.optional(Schema.Boolean.annotations({
    description: "Include archived projects in results (default: false, showing only active)"
  })),
  limit: Schema.optional(
    LimitParam.annotations({
      description: "Maximum number of projects to return (default: 50)"
    })
  )
}).annotations({
  title: "ListProjectsParams",
  description: "Parameters for listing projects"
})

export type ListProjectsParams = Schema.Schema.Type<typeof ListProjectsParamsSchema>

export interface ListProjectsResult {
  readonly projects: ReadonlyArray<ProjectSummary>
  readonly total: ListTotal
}

export const ProjectSchema = Schema.Struct({
  identifier: ProjectIdentifier,
  name: NonEmptyString,
  description: Schema.optional(Schema.String),
  archived: Schema.Boolean,
  defaultStatus: Schema.optional(StatusName),
  statuses: Schema.optional(Schema.Array(StatusName))
}).annotations({
  title: "Project",
  description: "Full project with status information"
})

export type Project = Schema.Schema.Type<typeof ProjectSchema>

export const GetProjectParamsSchema = Schema.Struct({
  project: ProjectIdentifier.annotations({ description: "Project identifier (e.g., 'HULY')" })
}).annotations({ title: "GetProjectParams", description: "Parameters for getting a project" })
export type GetProjectParams = Schema.Schema.Type<typeof GetProjectParamsSchema>

export const CreateProjectParamsSchema = Schema.Struct({
  name: NonEmptyString.annotations({ description: "Project name" }),
  identifier: Schema.String.pipe(
    Schema.pattern(/^[A-Z][A-Z0-9_]{0,4}$/)
  ).annotations({
    description: "Unique project identifier, 1-5 uppercase alphanumeric chars starting with letter (e.g., 'HULY', 'QA')"
  }),
  description: Schema.optional(Schema.String.annotations({ description: "Project description" })),
  private: Schema.optional(Schema.Boolean.annotations({ description: "Whether project is private (default: false)" }))
}).annotations({ title: "CreateProjectParams", description: "Parameters for creating a project" })
export type CreateProjectParams = Schema.Schema.Type<typeof CreateProjectParamsSchema>

export const UPDATE_PROJECT_FIELDS = ["name", "description"] as const satisfies ReadonlyArray<"name" | "description">

export const UpdateProjectParamsSchema = Schema.Struct({
  project: ProjectIdentifier.annotations({ description: "Project identifier to update" }),
  name: Schema.optional(NonEmptyString.annotations({ description: "New project name" })),
  description: Schema.optional(
    Schema.NullOr(Schema.String).annotations({ description: "New description (null to clear)" })
  )
}).pipe(
  Schema.filter((params) =>
    hasAtLeastOneDefined(params, UPDATE_PROJECT_FIELDS)
      ? undefined
      : atLeastOneUpdateFieldMessage(UPDATE_PROJECT_FIELDS)
  )
).annotations({
  title: "UpdateProjectParams",
  description: `Parameters for updating a project. ${atLeastOneUpdateFieldMessage(UPDATE_PROJECT_FIELDS)}`
})
export type UpdateProjectParams = Schema.Schema.Type<typeof UpdateProjectParamsSchema>
assertUpdateFields<UpdateProjectParams>()(["project"], UPDATE_PROJECT_FIELDS)

export const DeleteProjectParamsSchema = Schema.Struct({
  project: ProjectIdentifier.annotations({ description: "Project identifier to delete" })
}).annotations({ title: "DeleteProjectParams", description: "Parameters for deleting a project" })
export type DeleteProjectParams = Schema.Schema.Type<typeof DeleteProjectParamsSchema>

export const ListStatusesParamsSchema = Schema.Struct({
  project: ProjectIdentifier.annotations({ description: "Project identifier (e.g., 'HULY')" })
}).annotations({ title: "ListStatusesParams", description: "Parameters for listing project statuses" })
export type ListStatusesParams = Schema.Schema.Type<typeof ListStatusesParamsSchema>

export const StatusDetailSchema = Schema.Struct({
  name: StatusName,
  category: StatusCategoryValueSchema,
  isDefault: Schema.Boolean
}).annotations({
  title: "StatusDetail",
  description: "Issue status with workflow category and default info"
})
export type StatusDetail = Schema.Schema.Type<typeof StatusDetailSchema>

export interface ListStatusesResult {
  readonly statuses: ReadonlyArray<StatusDetail>
  readonly total: ListTotal
}

export const listProjectsParamsJsonSchema = JSONSchema.make(ListProjectsParamsSchema)
export const listStatusesParamsJsonSchema = JSONSchema.make(ListStatusesParamsSchema)
export const getProjectParamsJsonSchema = JSONSchema.make(GetProjectParamsSchema)
export const createProjectParamsJsonSchema = JSONSchema.make(CreateProjectParamsSchema)
export const updateProjectParamsJsonSchema = withAtLeastOneRequired(
  JSONSchema.make(UpdateProjectParamsSchema),
  UPDATE_PROJECT_FIELDS
)
export const deleteProjectParamsJsonSchema = JSONSchema.make(DeleteProjectParamsSchema)

export const parseListProjectsParams = Schema.decodeUnknown(ListProjectsParamsSchema)
export const parseListStatusesParams = Schema.decodeUnknown(ListStatusesParamsSchema)
export const parseGetProjectParams = Schema.decodeUnknown(GetProjectParamsSchema)
export const parseCreateProjectParams = Schema.decodeUnknown(CreateProjectParamsSchema)
export const parseUpdateProjectParams = Schema.decodeUnknown(UpdateProjectParamsSchema)
export const parseDeleteProjectParams = Schema.decodeUnknown(DeleteProjectParamsSchema)
export const parseProject = Schema.decodeUnknown(ProjectSchema)

export type GetProjectResult = Project

export interface CreateProjectResult {
  readonly identifier: ProjectIdentifier
  readonly name: string
  readonly created: boolean
}

export interface UpdateProjectResult {
  readonly identifier: ProjectIdentifier
  readonly updated: boolean
}

export interface DeleteProjectResult {
  readonly identifier: ProjectIdentifier
  readonly deleted: boolean
}
