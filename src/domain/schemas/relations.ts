import { JSONSchema, Schema } from "effect"

import {
  DocumentId,
  enumValuesDescription,
  IssueId,
  IssueIdentifier,
  ObjectClassName,
  ProjectIdentifier,
  TeamspaceIdentifier
} from "./shared.js"

export const RelationTypeValues = ["blocks", "is-blocked-by", "relates-to"] as const
type RelationTypeValue = (typeof RelationTypeValues)[number]

const RelationTypeDescriptions = {
  blocks: "source blocks target",
  "is-blocked-by": "source is blocked by target",
  "relates-to": "bidirectional link"
} satisfies Record<RelationTypeValue, string>

const relationTypeDescription = enumValuesDescription(
  RelationTypeValues.map((value) => `'${value}' (${RelationTypeDescriptions[value]})`)
)

export const RelationTypeSchema = Schema.Literal(...RelationTypeValues).annotations({
  title: "RelationType",
  description: `Type of issue relation: ${relationTypeDescription}`,
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
  readonly blocks: ReadonlyArray<RelationEntry>
  readonly relations: ReadonlyArray<RelationEntry>
  readonly documents: ReadonlyArray<DocumentRelationEntry>
}

export const RelationEntryWireSchema = Schema.Struct({
  identifier: IssueIdentifier,
  _id: IssueId,
  _class: ObjectClassName
})

export const DocumentRelationEntryWireSchema = Schema.Struct({
  title: Schema.String,
  teamspace: TeamspaceIdentifier,
  _id: DocumentId,
  _class: ObjectClassName
})

export const AddIssueRelationResultSchema = Schema.Struct({
  sourceIssue: IssueIdentifier,
  targetIssue: IssueIdentifier,
  relationType: RelationTypeSchema,
  added: Schema.Boolean
})

export const RemoveIssueRelationResultSchema = Schema.Struct({
  sourceIssue: IssueIdentifier,
  targetIssue: IssueIdentifier,
  relationType: RelationTypeSchema,
  removed: Schema.Boolean
})

export const ListIssueRelationsResultSchema = Schema.Struct({
  blockedBy: Schema.Array(RelationEntryWireSchema),
  blocks: Schema.Array(RelationEntryWireSchema),
  relations: Schema.Array(RelationEntryWireSchema),
  documents: Schema.Array(DocumentRelationEntryWireSchema)
})
