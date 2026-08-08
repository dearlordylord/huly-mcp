import type { Class, Doc, Ref, Space } from "@hcengineering/core"
import { Effect } from "effect"

import type {
  AddDocumentLabelParams,
  AddModuleLabelResult,
  AddTodoLabelParams,
  AttachedModuleLabel,
  ListAttachedModuleLabelsResult,
  ListDocumentLabelDefinitionsParams,
  ListDocumentLabelsParams,
  ListModuleLabelDefinitionsParams,
  ListModuleLabelDefinitionsResult,
  ListTodoLabelDefinitionsParams,
  ListTodoLabelsParams,
  ModuleLabelDefinition,
  RemoveDocumentLabelParams,
  RemoveModuleLabelResult,
  RemoveTodoLabelParams
} from "../../domain/schemas/module-labels.js"
import { PositiveInteger, TagElementId } from "../../domain/schemas/shared.js"
import { TagTargetClass, type AttachedTagSummary, type TagSummary } from "../../domain/schemas/tags.js"
import { HulyClient, type HulyClientError } from "../client.js"
import type { TagCategoryNotFoundError, TagIdentifierAmbiguousError, TagNotFoundError } from "../errors.js"
import { documentPlugin, time } from "../huly-plugins.js"
import { findTeamspaceAndDocument } from "./documents-shared.js"
import { findTodo, type PlannerLookupError } from "./planner-shared.js"
import {
  attachTagReference,
  detachTagReference,
  ensureTagElement,
  findTagElementOrFail,
  listTagReferencesForObject,
  toAttachedTagSummary,
  toResolvedTagElement
} from "./tags-shared.js"
import { listTags } from "./tags.js"

interface ModuleLabelObject {
  readonly objectId: Ref<Doc>
  readonly objectClass: Ref<Class<Doc>>
  readonly space: Ref<Space>
  readonly collection: "labels"
}

type AddLabelInput = Pick<AddDocumentLabelParams, "label" | "color">
type RemoveLabelInput = Pick<RemoveDocumentLabelParams, "label">

type LabelDefinitionError = HulyClientError | TagCategoryNotFoundError | TagIdentifierAmbiguousError
type LabelMutationError = HulyClientError | TagIdentifierAmbiguousError | TagNotFoundError

const DOCUMENT_LABEL_TARGET_CLASS = TagTargetClass.make(documentPlugin.class.Document)
const TODO_LABEL_TARGET_CLASS = TagTargetClass.make(time.class.ToDo)

const toModuleLabelDefinition = (label: TagSummary): ModuleLabelDefinition => ({
  id: label.id,
  title: label.title,
  description: label.description,
  color: label.color,
  ...(label.refCount === undefined ? {} : { refCount: label.refCount })
})

const toAttachedModuleLabel = (label: AttachedTagSummary): AttachedModuleLabel => ({
  id: label.id,
  label: label.tag,
  title: label.title,
  color: label.color
})

const listModuleLabelDefinitions = (
  targetClass: TagTargetClass,
  params: ListModuleLabelDefinitionsParams
): Effect.Effect<ListModuleLabelDefinitionsResult, LabelDefinitionError, HulyClient> =>
  Effect.gen(function* () {
    const labels = yield* listTags({ targetClass, ...params })
    return { labels: labels.map(toModuleLabelDefinition) }
  })

const listObjectLabels = (
  object: ModuleLabelObject
): Effect.Effect<ListAttachedModuleLabelsResult, HulyClientError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const labels = yield* listTagReferencesForObject(client, object)
    return { labels: labels.map((label) => toAttachedModuleLabel(toAttachedTagSummary(label))) }
  })

const addObjectLabel = (
  targetClass: TagTargetClass,
  object: ModuleLabelObject,
  params: AddLabelInput
): Effect.Effect<AddModuleLabelResult, LabelDefinitionError, HulyClient> =>
  Effect.gen(function* () {
    const label = yield* ensureTagElement({ targetClass, titleOrId: params.label, color: params.color })
    const result = yield* attachTagReference({
      tag: label,
      objectId: object.objectId,
      objectClass: object.objectClass,
      space: object.space,
      collection: object.collection
    })
    const base = { id: result.id, label: result.tag, title: result.title }
    if (label.created) return { ...base, attached: true, labelCreated: true }
    return result.attached
      ? { ...base, attached: true, labelCreated: false }
      : { ...base, attached: false, labelCreated: false }
  })

const removeObjectLabel = (
  targetClass: TagTargetClass,
  object: ModuleLabelObject,
  params: RemoveLabelInput
): Effect.Effect<RemoveModuleLabelResult, LabelMutationError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const label = toResolvedTagElement(yield* findTagElementOrFail(client, targetClass, params.label), false)
    const result = yield* detachTagReference({
      tag: label,
      objectId: object.objectId,
      objectClass: object.objectClass,
      space: object.space,
      collection: object.collection
    })
    const base = { label: TagElementId.make(label.id), title: label.title }
    return result.detached
      ? { ...base, detached: true, detachedCount: PositiveInteger.make(result.detachedCount) }
      : { ...base, detached: false, detachedCount: 0 }
  })

const documentLabelObject = (doc: {
  readonly _id: Ref<Doc>
  readonly _class: Ref<Class<Doc>>
  readonly space: Ref<Space>
}): ModuleLabelObject => ({ objectId: doc._id, objectClass: doc._class, space: doc.space, collection: "labels" })

const resolveDocumentLabelObject = (params: {
  readonly teamspace: ListDocumentLabelsParams["teamspace"]
  readonly document: ListDocumentLabelsParams["document"]
}) => Effect.map(findTeamspaceAndDocument(params), ({ doc }) => documentLabelObject(doc))

const resolveTodoLabelObject = (
  locator: ListTodoLabelsParams["locator"]
): Effect.Effect<ModuleLabelObject, PlannerLookupError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const todo = yield* findTodo(client, locator, "all")
    return { objectId: todo._id, objectClass: todo._class, space: todo.space, collection: "labels" }
  })

export const listDocumentLabelDefinitions = (params: ListDocumentLabelDefinitionsParams) =>
  listModuleLabelDefinitions(DOCUMENT_LABEL_TARGET_CLASS, params)

export const listDocumentLabels = (params: ListDocumentLabelsParams) =>
  Effect.flatMap(resolveDocumentLabelObject(params), listObjectLabels)

export const addDocumentLabel = (params: AddDocumentLabelParams) =>
  Effect.flatMap(resolveDocumentLabelObject(params), (object) =>
    addObjectLabel(DOCUMENT_LABEL_TARGET_CLASS, object, params)
  )

export const removeDocumentLabel = (params: RemoveDocumentLabelParams) =>
  Effect.flatMap(resolveDocumentLabelObject(params), (object) =>
    removeObjectLabel(DOCUMENT_LABEL_TARGET_CLASS, object, params)
  )

export const listTodoLabelDefinitions = (params: ListTodoLabelDefinitionsParams) =>
  listModuleLabelDefinitions(TODO_LABEL_TARGET_CLASS, params)

export const listTodoLabels = (params: ListTodoLabelsParams) =>
  Effect.flatMap(resolveTodoLabelObject(params.locator), listObjectLabels)

export const addTodoLabel = (params: AddTodoLabelParams) =>
  Effect.flatMap(resolveTodoLabelObject(params.locator), (object) =>
    addObjectLabel(TODO_LABEL_TARGET_CLASS, object, params)
  )

export const removeTodoLabel = (params: RemoveTodoLabelParams) =>
  Effect.flatMap(resolveTodoLabelObject(params.locator), (object) =>
    removeObjectLabel(TODO_LABEL_TARGET_CLASS, object, params)
  )
