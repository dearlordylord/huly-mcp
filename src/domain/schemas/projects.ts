import { JSONSchema, Schema } from "effect"

import {
  assertUpdateFields,
  atLeastOneUpdateFieldMessage,
  DEFAULT_INCLUDE_ARCHIVED,
  DEFAULT_LIMIT,
  DEFAULT_PRIVATE,
  hasAtLeastOneDefined,
  LimitParam,
  ListTotal,
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
    description: `Include archived projects in results (default: ${DEFAULT_INCLUDE_ARCHIVED}, showing only active)`
  })),
  limit: Schema.optional(
    LimitParam.annotations({
      description: `Maximum number of projects to return (default: ${DEFAULT_LIMIT})`
    })
  )
}).annotations({
  title: "ListProjectsParams",
  description: "Parameters for listing projects"
})

export type ListProjectsParams = Schema.Schema.Type<typeof ListProjectsParamsSchema>
export const ListProjectsResultSchema = Schema.Struct({
  projects: Schema.Array(ProjectSummarySchema),
  total: ListTotal
})
export type ListProjectsResult = Schema.Schema.Type<typeof ListProjectsResultSchema>

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
export const GetProjectResultSchema = ProjectSchema
export type GetProjectResult = Schema.Schema.Type<typeof GetProjectResultSchema>

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
  private: Schema.optional(Schema.Boolean.annotations({
    description: `Whether project is private (default: ${DEFAULT_PRIVATE})`
  }))
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
export const ListStatusesResultSchema = Schema.Struct({
  statuses: Schema.Array(StatusDetailSchema),
  total: ListTotal
})
export type ListStatusesResult = Schema.Schema.Type<typeof ListStatusesResultSchema>

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

export const CreateProjectResultSchema = Schema.Struct({
  identifier: ProjectIdentifier,
  name: Schema.String,
  created: Schema.Boolean
})
export type CreateProjectResult = Schema.Schema.Type<typeof CreateProjectResultSchema>
export const UpdateProjectResultSchema = Schema.Struct({
  identifier: ProjectIdentifier,
  updated: Schema.Boolean
})
export type UpdateProjectResult = Schema.Schema.Type<typeof UpdateProjectResultSchema>
export const DeleteProjectResultSchema = Schema.Struct({
  identifier: ProjectIdentifier,
  deleted: Schema.Boolean
})
export type DeleteProjectResult = Schema.Schema.Type<typeof DeleteProjectResultSchema>
