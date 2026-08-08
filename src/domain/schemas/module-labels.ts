import { JSONSchema, Schema } from "effect"

import { TodoLocatorSchema } from "./planner.js"
import {
  ColorCode,
  Count,
  DEFAULT_COLOR_INDEX,
  DEFAULT_LIMIT,
  DocumentIdentifier,
  LimitParam,
  MAX_COLOR_INDEX,
  NonEmptyString,
  PositiveInteger,
  TagElementId,
  TagIdentifier,
  TagReferenceId,
  TeamspaceIdentifier
} from "./shared.js"

export const ModuleLabelDefinitionSchema = Schema.Struct({
  id: TagElementId,
  title: NonEmptyString,
  description: Schema.String,
  color: ColorCode,
  refCount: Schema.optional(Count)
}).annotations({
  title: "ModuleLabelDefinition",
  description: "Human-readable label definition for one Huly module domain."
})
export type ModuleLabelDefinition = Schema.Schema.Type<typeof ModuleLabelDefinitionSchema>

export const AttachedModuleLabelSchema = Schema.Struct({
  id: TagReferenceId,
  label: TagElementId,
  title: NonEmptyString,
  color: ColorCode
}).annotations({ title: "AttachedModuleLabel", description: "Human-readable label attached to one Huly object." })
export type AttachedModuleLabel = Schema.Schema.Type<typeof AttachedModuleLabelSchema>

const ListModuleLabelDefinitionsParamsSchema = Schema.Struct({
  titleSearch: Schema.optional(Schema.String.annotations({ description: "Optional label title substring search." })),
  limit: Schema.optional(
    LimitParam.annotations({
      description: `Maximum number of label definitions to return (default: ${DEFAULT_LIMIT}).`
    })
  )
})
export type ListModuleLabelDefinitionsParams = Schema.Schema.Type<typeof ListModuleLabelDefinitionsParamsSchema>

export const ListDocumentLabelDefinitionsParamsSchema = ListModuleLabelDefinitionsParamsSchema.annotations({
  title: "ListDocumentLabelDefinitionsParams",
  description: "List document label definitions without requiring the document target class."
})
export type ListDocumentLabelDefinitionsParams = Schema.Schema.Type<typeof ListDocumentLabelDefinitionsParamsSchema>

export const ListTodoLabelDefinitionsParamsSchema = ListModuleLabelDefinitionsParamsSchema.annotations({
  title: "ListTodoLabelDefinitionsParams",
  description: "List Planner ToDo label definitions without requiring the ToDo target class."
})
export type ListTodoLabelDefinitionsParams = Schema.Schema.Type<typeof ListTodoLabelDefinitionsParamsSchema>

const DocumentLocatorFields = {
  teamspace: TeamspaceIdentifier.annotations({ description: "Teamspace name or ID containing the document." }),
  document: DocumentIdentifier.annotations({ description: "Document title or ID within the teamspace." })
}

export const ListDocumentLabelsParamsSchema = Schema.Struct(DocumentLocatorFields).annotations({
  title: "ListDocumentLabelsParams",
  description: "List labels attached to one document resolved by teamspace and document title or ID."
})
export type ListDocumentLabelsParams = Schema.Schema.Type<typeof ListDocumentLabelsParamsSchema>

const NewLabelFields = {
  label: TagIdentifier.annotations({
    description: "Label TagElement _id or exact title. A missing title creates the module label definition."
  }),
  color: Schema.optional(
    ColorCode.annotations({
      description: `Color for a newly created label definition from 0 through ${MAX_COLOR_INDEX} (default: ${DEFAULT_COLOR_INDEX}). Ignored for an existing label.`
    })
  )
}

export const AddDocumentLabelParamsSchema = Schema.Struct({ ...DocumentLocatorFields, ...NewLabelFields }).annotations({
  title: "AddDocumentLabelParams",
  description: "Idempotently attach a label to one document, creating a missing label title first."
})
export type AddDocumentLabelParams = Schema.Schema.Type<typeof AddDocumentLabelParamsSchema>

export const RemoveDocumentLabelParamsSchema = Schema.Struct({
  ...DocumentLocatorFields,
  label: TagIdentifier.annotations({ description: "Label TagElement _id or exact title." })
}).annotations({
  title: "RemoveDocumentLabelParams",
  description: "Detach a label from one document without deleting the label definition."
})
export type RemoveDocumentLabelParams = Schema.Schema.Type<typeof RemoveDocumentLabelParamsSchema>

export const ListTodoLabelsParamsSchema = Schema.Struct({ locator: TodoLocatorSchema }).annotations({
  title: "ListTodoLabelsParams",
  description: "List labels attached to one Planner ToDo resolved by raw ID or human-oriented locator."
})
export type ListTodoLabelsParams = Schema.Schema.Type<typeof ListTodoLabelsParamsSchema>

export const AddTodoLabelParamsSchema = Schema.Struct({ locator: TodoLocatorSchema, ...NewLabelFields }).annotations({
  title: "AddTodoLabelParams",
  description: "Idempotently attach a label to one Planner ToDo, creating a missing label title first."
})
export type AddTodoLabelParams = Schema.Schema.Type<typeof AddTodoLabelParamsSchema>

export const RemoveTodoLabelParamsSchema = Schema.Struct({
  locator: TodoLocatorSchema,
  label: TagIdentifier.annotations({ description: "Label TagElement _id or exact title." })
}).annotations({
  title: "RemoveTodoLabelParams",
  description: "Detach a label from one Planner ToDo without deleting the label definition."
})
export type RemoveTodoLabelParams = Schema.Schema.Type<typeof RemoveTodoLabelParamsSchema>

export const ListModuleLabelDefinitionsResultSchema = Schema.Struct({
  labels: Schema.Array(ModuleLabelDefinitionSchema)
})
export type ListModuleLabelDefinitionsResult = Schema.Schema.Type<typeof ListModuleLabelDefinitionsResultSchema>

export const ListAttachedModuleLabelsResultSchema = Schema.Struct({ labels: Schema.Array(AttachedModuleLabelSchema) })
export type ListAttachedModuleLabelsResult = Schema.Schema.Type<typeof ListAttachedModuleLabelsResultSchema>

const ModuleLabelMutationResultFields = { id: TagReferenceId, label: TagElementId, title: NonEmptyString }

export const AddModuleLabelResultSchema = Schema.Union(
  Schema.Struct({
    ...ModuleLabelMutationResultFields,
    attached: Schema.Literal(true),
    labelCreated: Schema.Literal(true)
  }),
  Schema.Struct({
    ...ModuleLabelMutationResultFields,
    attached: Schema.Literal(true),
    labelCreated: Schema.Literal(false)
  }),
  Schema.Struct({
    ...ModuleLabelMutationResultFields,
    attached: Schema.Literal(false),
    labelCreated: Schema.Literal(false)
  })
)
export type AddModuleLabelResult = Schema.Schema.Type<typeof AddModuleLabelResultSchema>

const RemovedModuleLabelFields = { label: TagElementId, title: NonEmptyString }

export const RemoveModuleLabelResultSchema = Schema.Union(
  Schema.Struct({ ...RemovedModuleLabelFields, detached: Schema.Literal(true), detachedCount: PositiveInteger }),
  Schema.Struct({ ...RemovedModuleLabelFields, detached: Schema.Literal(false), detachedCount: Schema.Literal(0) })
)
export type RemoveModuleLabelResult = Schema.Schema.Type<typeof RemoveModuleLabelResultSchema>

export const listDocumentLabelDefinitionsParamsJsonSchema = JSONSchema.make(ListDocumentLabelDefinitionsParamsSchema)
export const listDocumentLabelsParamsJsonSchema = JSONSchema.make(ListDocumentLabelsParamsSchema)
export const addDocumentLabelParamsJsonSchema = JSONSchema.make(AddDocumentLabelParamsSchema)
export const removeDocumentLabelParamsJsonSchema = JSONSchema.make(RemoveDocumentLabelParamsSchema)
export const listTodoLabelDefinitionsParamsJsonSchema = JSONSchema.make(ListTodoLabelDefinitionsParamsSchema)
export const listTodoLabelsParamsJsonSchema = JSONSchema.make(ListTodoLabelsParamsSchema)
export const addTodoLabelParamsJsonSchema = JSONSchema.make(AddTodoLabelParamsSchema)
export const removeTodoLabelParamsJsonSchema = JSONSchema.make(RemoveTodoLabelParamsSchema)

export const parseListDocumentLabelDefinitionsParams = Schema.decodeUnknown(ListDocumentLabelDefinitionsParamsSchema)
export const parseListDocumentLabelsParams = Schema.decodeUnknown(ListDocumentLabelsParamsSchema)
export const parseAddDocumentLabelParams = Schema.decodeUnknown(AddDocumentLabelParamsSchema)
export const parseRemoveDocumentLabelParams = Schema.decodeUnknown(RemoveDocumentLabelParamsSchema)
export const parseListTodoLabelDefinitionsParams = Schema.decodeUnknown(ListTodoLabelDefinitionsParamsSchema)
export const parseListTodoLabelsParams = Schema.decodeUnknown(ListTodoLabelsParamsSchema)
export const parseAddTodoLabelParams = Schema.decodeUnknown(AddTodoLabelParamsSchema)
export const parseRemoveTodoLabelParams = Schema.decodeUnknown(RemoveTodoLabelParamsSchema)
