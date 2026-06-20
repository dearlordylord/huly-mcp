import { JSONSchema, Schema } from "effect"

import { Count, enumValuesDescription, ListTotal, ProjectIdentifier } from "./shared.js"

const EntityTypeValues = ["issue", "project", "component", "milestone"] as const

const EntityTypeSchema = Schema.Literal(...EntityTypeValues).annotations({
  title: "EntityType",
  description: `Type of entity to preview deletion for: ${enumValuesDescription(EntityTypeValues)}`
})

export type EntityType = Schema.Schema.Type<typeof EntityTypeSchema>

export const PreviewDeletionParamsSchema = Schema.Struct({
  entityType: EntityTypeSchema.annotations({
    description: `Type of entity: ${enumValuesDescription(EntityTypeValues)}`
  }),
  project: ProjectIdentifier.annotations({
    description: "Project identifier (e.g., 'HULY'). For entityType='project', this IS the target project."
  }),
  identifier: Schema.optional(Schema.String).annotations({
    description:
      "Entity identifier within the project. Required for issue (e.g., 'PROJ-123' or number), component (label or ID), milestone (label or ID). Ignored for entityType='project'."
  })
}).pipe(
  Schema.filter((params) => {
    if (params.entityType !== "project" && (params.identifier === undefined || params.identifier.trim() === "")) {
      return {
        path: ["identifier"],
        message: `identifier is required when entityType is '${params.entityType}'`
      }
    }
    return undefined
  })
).annotations({
  title: "PreviewDeletionParams",
  description: "Parameters for previewing deletion impact"
})

export type PreviewDeletionParams = Schema.Schema.Type<typeof PreviewDeletionParamsSchema>
export const DeletionImpactSchema = Schema.Struct({
  entityType: EntityTypeSchema,
  identifier: Schema.String,
  impact: Schema.Struct({
    subIssues: Schema.optional(Count),
    comments: Schema.optional(Count),
    attachments: Schema.optional(Count),
    blockedBy: Schema.optional(Count),
    relations: Schema.optional(Count),
    issues: Schema.optional(ListTotal),
    components: Schema.optional(ListTotal),
    milestones: Schema.optional(ListTotal),
    templates: Schema.optional(ListTotal)
  }),
  warnings: Schema.Array(Schema.String),
  totalAffected: ListTotal
})
export type DeletionImpact = Schema.Schema.Type<typeof DeletionImpactSchema>

export const previewDeletionParamsJsonSchema = JSONSchema.make(PreviewDeletionParamsSchema)
export const parsePreviewDeletionParams = Schema.decodeUnknown(PreviewDeletionParamsSchema)

export const PreviewDeletionResultSchema = DeletionImpactSchema
