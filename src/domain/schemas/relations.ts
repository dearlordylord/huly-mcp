import { JSONSchema, Schema } from "effect"

import type { DocumentId, IssueId, ObjectClassName, TeamspaceIdentifier } from "./shared.js"
import { IssueIdentifier, ProjectIdentifier } from "./shared.js"

export const RelationTypeValues = ["blocks", "is-blocked-by", "relates-to"] as const

export const RelationTypeSchema = Schema.Literal(...RelationTypeValues).annotations({
  title: "RelationType",
  description:
    "Type of issue relation: 'blocks' (source blocks target), 'is-blocked-by' (source is blocked by target), 'relates-to' (bidirectional link)",
  jsonSchema: { type: "string", enum: [...RelationTypeValues] }
})

export type RelationType = Schema.Schema.Type<typeof RelationTypeSchema>

const issueRelationFields = {
  project: ProjectIdentifier.annotations({
    description: "Project identifier of the source issue (e.g., 'HULY')"
  }),
  issueIdentifier: IssueIdentifier.annotations({
    description: "Source issue identifier (e.g., 'HULY-123')"
  }),
  targetIssue: IssueIdentifier.annotations({
    description: "Target issue identifier — same project: '42' or 'PROJ-42'; cross-project: 'OTHER-42'"
  }),
  relationType: RelationTypeSchema
}

export const AddIssueRelationParamsSchema = Schema.Struct(issueRelationFields).annotations({
  title: "AddIssueRelationParams",
  description: "Parameters for adding a relation between two issues"
})

export type AddIssueRelationParams = Schema.Schema.Type<typeof AddIssueRelationParamsSchema>

export const RemoveIssueRelationParamsSchema = Schema.Struct(issueRelationFields).annotations({
  title: "RemoveIssueRelationParams",
  description: "Parameters for removing a relation between two issues"
})

export type RemoveIssueRelationParams = Schema.Schema.Type<typeof RemoveIssueRelationParamsSchema>

export const ListIssueRelationsParamsSchema = Schema.Struct({
  project: ProjectIdentifier.annotations({
    description: "Project identifier (e.g., 'HULY')"
  }),
  issueIdentifier: IssueIdentifier.annotations({
    description: "Issue identifier (e.g., 'HULY-123')"
  })
}).annotations({
  title: "ListIssueRelationsParams",
  description: "Parameters for listing all relations of an issue"
})

export type ListIssueRelationsParams = Schema.Schema.Type<typeof ListIssueRelationsParamsSchema>

export const addIssueRelationParamsJsonSchema = JSONSchema.make(AddIssueRelationParamsSchema)
export const removeIssueRelationParamsJsonSchema = JSONSchema.make(RemoveIssueRelationParamsSchema)
export const listIssueRelationsParamsJsonSchema = JSONSchema.make(ListIssueRelationsParamsSchema)

export const parseAddIssueRelationParams = Schema.decodeUnknown(AddIssueRelationParamsSchema)
export const parseRemoveIssueRelationParams = Schema.decodeUnknown(RemoveIssueRelationParamsSchema)
export const parseListIssueRelationsParams = Schema.decodeUnknown(ListIssueRelationsParamsSchema)

export interface RelationEntry {
  readonly identifier: IssueIdentifier
  readonly _id: IssueId
  readonly _class: ObjectClassName
}

export interface DocumentRelationEntry {
  readonly title: string
  readonly teamspace: TeamspaceIdentifier
  readonly _id: DocumentId
  readonly _class: ObjectClassName
}

export interface AddIssueRelationResult {
  readonly sourceIssue: IssueIdentifier
  readonly targetIssue: IssueIdentifier
  readonly relationType: RelationType
  readonly added: boolean
}

export interface RemoveIssueRelationResult {
  readonly sourceIssue: IssueIdentifier
  readonly targetIssue: IssueIdentifier
  readonly relationType: RelationType
  readonly removed: boolean
}

export interface ListIssueRelationsResult {
  readonly blockedBy: ReadonlyArray<RelationEntry>
  readonly relations: ReadonlyArray<RelationEntry>
  readonly documents: ReadonlyArray<DocumentRelationEntry>
}
