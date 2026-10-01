import { Schema } from "effect"

import { toDraft07JsonSchema } from "./json-schema.js"
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
}).annotate({ title: "ProjectSummary", description: "Project summary for list operations" })

export type ProjectSummary = Schema.Schema.Type<typeof ProjectSummarySchema>

export const ListProjectsParamsSchema = Schema.Struct({
  includeArchived: Schema.optional(
    Schema.Boolean.annotate({
      description: `Include archived projects in results (default: ${DEFAULT_INCLUDE_ARCHIVED}, showing only active)`
    })
  ),
  limit: Schema.optional(
    LimitParam.annotate({ description: `Maximum number of projects to return (default: ${DEFAULT_LIMIT})` })
  )
}).annotate({ title: "ListProjectsParams", description: "Parameters for listing projects" })

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
}).annotate({ title: "Project", description: "Full project with status information" })

export type Project = Schema.Schema.Type<typeof ProjectSchema>
export const GetProjectResultSchema = ProjectSchema
export type GetProjectResult = Schema.Schema.Type<typeof GetProjectResultSchema>

export const GetProjectParamsSchema = Schema.Struct({
  project: ProjectIdentifier.annotate({ description: "Project identifier (e.g., 'HULY')" })
}).annotate({ title: "GetProjectParams", description: "Parameters for getting a project" })
export type GetProjectParams = Schema.Schema.Type<typeof GetProjectParamsSchema>

export const CreateProjectParamsSchema = Schema.Struct({
  name: NonEmptyString.annotate({ description: "Project name" }),
  identifier: Schema.String.check(Schema.isPattern(/^[A-Z][A-Z0-9_]{0,4}$/u)).annotate({
    description: "Unique project identifier, 1-5 uppercase alphanumeric chars starting with letter (e.g., 'HULY', 'QA')"
  }),
  description: Schema.optional(Schema.String.annotate({ description: "Project description" })),
  private: Schema.optional(
    Schema.Boolean.annotate({ description: `Whether project is private (default: ${DEFAULT_PRIVATE})` })
  )
}).annotate({ title: "CreateProjectParams", description: "Parameters for creating a project" })
export type CreateProjectParams = Schema.Schema.Type<typeof CreateProjectParamsSchema>

export const UPDATE_PROJECT_FIELDS = ["name", "description"] as const satisfies ReadonlyArray<"name" | "description">

export const UpdateProjectParamsSchema = Schema.Struct({
  project: ProjectIdentifier.annotate({ description: "Project identifier to update" }),
  name: Schema.optional(NonEmptyString.annotate({ description: "New project name" })),
  description: Schema.optional(
    Schema.NullOr(Schema.String).annotate({ description: "New description (null to clear)" })
  )
})
  .pipe(
    Schema.check(
      Schema.makeFilter((params) =>
        hasAtLeastOneDefined(params, UPDATE_PROJECT_FIELDS)
          ? undefined
          : atLeastOneUpdateFieldMessage(UPDATE_PROJECT_FIELDS)
      )
    )
  )
  .annotate({
    title: "UpdateProjectParams",
    description: `Parameters for updating a project. ${atLeastOneUpdateFieldMessage(UPDATE_PROJECT_FIELDS)}`
  })
export type UpdateProjectParams = Schema.Schema.Type<typeof UpdateProjectParamsSchema>
assertUpdateFields<UpdateProjectParams>()(["project"], UPDATE_PROJECT_FIELDS)

export const DeleteProjectParamsSchema = Schema.Struct({
  project: ProjectIdentifier.annotate({ description: "Project identifier to delete" })
}).annotate({ title: "DeleteProjectParams", description: "Parameters for deleting a project" })
export type DeleteProjectParams = Schema.Schema.Type<typeof DeleteProjectParamsSchema>

export const ListStatusesParamsSchema = Schema.Struct({
  project: ProjectIdentifier.annotate({ description: "Project identifier (e.g., 'HULY')" })
}).annotate({ title: "ListStatusesParams", description: "Parameters for listing project statuses" })
export type ListStatusesParams = Schema.Schema.Type<typeof ListStatusesParamsSchema>

export const StatusDetailSchema = Schema.Struct({
  name: StatusName,
  category: StatusCategoryValueSchema,
  isDefault: Schema.Boolean
}).annotate({ title: "StatusDetail", description: "Issue status with workflow category and default info" })
export type StatusDetail = Schema.Schema.Type<typeof StatusDetailSchema>
export const ListStatusesResultSchema = Schema.Struct({ statuses: Schema.Array(StatusDetailSchema), total: ListTotal })
export type ListStatusesResult = Schema.Schema.Type<typeof ListStatusesResultSchema>

export const listProjectsParamsJsonSchema = toDraft07JsonSchema(ListProjectsParamsSchema)
export const listStatusesParamsJsonSchema = toDraft07JsonSchema(ListStatusesParamsSchema)
export const getProjectParamsJsonSchema = toDraft07JsonSchema(GetProjectParamsSchema)
export const createProjectParamsJsonSchema = toDraft07JsonSchema(CreateProjectParamsSchema)
export const updateProjectParamsJsonSchema = withAtLeastOneRequired(
  toDraft07JsonSchema(UpdateProjectParamsSchema),
  UPDATE_PROJECT_FIELDS
)
export const deleteProjectParamsJsonSchema = toDraft07JsonSchema(DeleteProjectParamsSchema)

export const parseListProjectsParams = Schema.decodeUnknownEffect(ListProjectsParamsSchema)
export const parseListStatusesParams = Schema.decodeUnknownEffect(ListStatusesParamsSchema)
export const parseGetProjectParams = Schema.decodeUnknownEffect(GetProjectParamsSchema)
export const parseCreateProjectParams = Schema.decodeUnknownEffect(CreateProjectParamsSchema)
export const parseUpdateProjectParams = Schema.decodeUnknownEffect(UpdateProjectParamsSchema)
export const parseDeleteProjectParams = Schema.decodeUnknownEffect(DeleteProjectParamsSchema)
export const parseProject = Schema.decodeUnknownEffect(ProjectSchema)

export const CreateProjectResultSchema = Schema.Struct({
  identifier: ProjectIdentifier,
  name: Schema.String,
  created: Schema.Boolean
})
export type CreateProjectResult = Schema.Schema.Type<typeof CreateProjectResultSchema>
export const UpdateProjectResultSchema = Schema.Struct({ identifier: ProjectIdentifier, updated: Schema.Boolean })
export type UpdateProjectResult = Schema.Schema.Type<typeof UpdateProjectResultSchema>
export const DeleteProjectResultSchema = Schema.Struct({ identifier: ProjectIdentifier, deleted: Schema.Boolean })
export type DeleteProjectResult = Schema.Schema.Type<typeof DeleteProjectResultSchema>
