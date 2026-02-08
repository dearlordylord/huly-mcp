import { JSONSchema, Schema } from "effect"

import { LimitParam, ProjectIdentifier, StatusName } from "./shared.js"

export const ProjectSummarySchema = Schema.Struct({
  identifier: ProjectIdentifier,
  name: Schema.String,
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

export const ListProjectsResultSchema = Schema.Struct({
  projects: Schema.Array(ProjectSummarySchema),
  total: Schema.Number.pipe(Schema.int(), Schema.nonNegative())
}).annotations({
  title: "ListProjectsResult",
  description: "Result of listing projects"
})

export type ListProjectsResult = Schema.Schema.Type<typeof ListProjectsResultSchema>

export const ProjectSchema = Schema.Struct({
  identifier: ProjectIdentifier,
  name: Schema.String,
  description: Schema.optional(Schema.String),
  archived: Schema.Boolean,
  defaultStatus: Schema.optional(StatusName),
  statuses: Schema.optional(Schema.Array(StatusName))
}).annotations({
  title: "Project",
  description: "Full project with status information"
})

export type Project = Schema.Schema.Type<typeof ProjectSchema>

export const listProjectsParamsJsonSchema = JSONSchema.make(ListProjectsParamsSchema)

export const parseListProjectsParams = Schema.decodeUnknown(ListProjectsParamsSchema)
export const parseProject = Schema.decodeUnknown(ProjectSchema)
