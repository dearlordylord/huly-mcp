import type { DocumentUpdate, Space } from "@hcengineering/core"
import { SortingOrder } from "@hcengineering/core"
import type { TagElement as HulyTagElement } from "@hcengineering/tags"
import { Effect } from "effect"

import { Count, TagElementId } from "../../domain/schemas/shared.js"
import type {
  AttachedTagSummary,
  AttachTagParams,
  AttachTagResult,
  CreateTagParams,
  CreateTagResult,
  DeleteTagParams,
  DeleteTagResult,
  DetachTagParams,
  DetachTagResult,
  ListAttachedTagsParams,
  ListTagsParams,
  TagSummary,
  UpdateTagField,
  UpdateTagParams,
  UpdateTagResult
} from "../../domain/schemas/tags.js"
import { TagTargetClass, UPDATE_TAG_FIELDS } from "../../domain/schemas/tags.js"
import { HulyClient, type HulyClientError } from "../client.js"
import type { NoUpdateFieldsError, TagCategoryNotFoundError, TagNotFoundError } from "../errors.js"
import { core, tags } from "../huly-plugins.js"
import { clampLimit, escapeLikeWildcards, hulyQuery, type StrictDocumentQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"
import {
  attachTagReference,
  detachTagReference,
  ensureTagElement,
  findTagElementOrFail,
  listTagReferencesForObject,
  normalizeColorCode,
  resolveTagCategoryRef,
  toAttachedTagSummary,
  toResolvedTagElement,
  toTargetClassRef
} from "./tags-shared.js"
import { type DirectUpdateEntry, mergeUpdateEntries, requireUpdateFields } from "./update-guards.js"

type ListTagsError = HulyClientError | TagCategoryNotFoundError
type CreateTagError = HulyClientError | TagCategoryNotFoundError
type UpdateTagError = HulyClientError | NoUpdateFieldsError | TagCategoryNotFoundError | TagNotFoundError
type DeleteTagError = HulyClientError | TagNotFoundError
type TagReferenceError = HulyClientError | TagCategoryNotFoundError | TagNotFoundError

const toTagSummary = (tag: HulyTagElement): TagSummary => {
  const summary = {
    id: TagElementId.make(tag._id),
    title: tag.title,
    targetClass: TagTargetClass.make(String(tag.targetClass)),
    description: tag.description,
    color: normalizeColorCode(tag.color),
    category: tag.category
  }

  return tag.refCount === undefined ? summary : { ...summary, refCount: Count.make(tag.refCount) }
}

const buildUpdateTagOperations = (
  client: HulyClient["Type"],
  params: UpdateTagParams
): Effect.Effect<DocumentUpdate<HulyTagElement>, HulyClientError | TagCategoryNotFoundError> =>
  Effect.gen(function*() {
    type UpdateTagEntries = {
      readonly [Field in UpdateTagField]: DirectUpdateEntry<UpdateTagField, DocumentUpdate<HulyTagElement>, Field>
    }
    const updateEntries = {
      category: params.category === undefined
        ? {}
        : { category: yield* resolveTagCategoryRef(client, params.targetClass, params.category) },
      color: params.color === undefined ? {} : { color: params.color },
      description: params.description === undefined ? {} : { description: params.description },
      title: params.title === undefined ? {} : { title: params.title }
    } satisfies UpdateTagEntries

    return mergeUpdateEntries(Object.values(updateEntries))
  })

export const listTags = (
  params: ListTagsParams
): Effect.Effect<Array<TagSummary>, ListTagsError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const limit = clampLimit(params.limit)
    const categoryFilter = params.category === undefined
      ? {}
      : { category: yield* resolveTagCategoryRef(client, params.targetClass, params.category) }
    const titleSearch = params.titleSearch?.trim() ?? ""
    const titleFilter = titleSearch === ""
      ? {}
      : { title: { $like: `%${escapeLikeWildcards(titleSearch)}%` } }
    const query: StrictDocumentQuery<HulyTagElement> = {
      targetClass: toTargetClassRef(params.targetClass),
      ...categoryFilter,
      ...titleFilter
    }

    const elements = yield* client.findAll<HulyTagElement>(
      tags.class.TagElement,
      hulyQuery(query),
      {
        limit,
        sort: { modifiedOn: SortingOrder.Descending }
      }
    )

    return elements.map(toTagSummary)
  })

export const createTag = (
  params: CreateTagParams
): Effect.Effect<CreateTagResult, CreateTagError, HulyClient> =>
  Effect.gen(function*() {
    const tag = yield* ensureTagElement({
      targetClass: params.targetClass,
      titleOrId: params.title,
      color: params.color,
      description: params.description,
      category: params.category
    })

    return {
      id: TagElementId.make(tag.id),
      title: tag.title,
      targetClass: TagTargetClass.make(String(tag.targetClass)),
      created: tag.created
    }
  })

export const updateTag = (
  params: UpdateTagParams
): Effect.Effect<UpdateTagResult, UpdateTagError, HulyClient> =>
  Effect.gen(function*() {
    yield* requireUpdateFields("update_tag", params, UPDATE_TAG_FIELDS)

    const client = yield* HulyClient
    const tag = yield* findTagElementOrFail(client, params.targetClass, params.tag)
    const updateOps = yield* buildUpdateTagOperations(client, params)

    yield* client.updateDoc(
      tags.class.TagElement,
      toRef<Space>(core.space.Workspace),
      tag._id,
      updateOps
    )

    return { id: TagElementId.make(tag._id), updated: true }
  })

export const deleteTag = (
  params: DeleteTagParams
): Effect.Effect<DeleteTagResult, DeleteTagError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const tag = yield* findTagElementOrFail(client, params.targetClass, params.tag)

    yield* client.removeDoc(
      tags.class.TagElement,
      toRef<Space>(core.space.Workspace),
      tag._id
    )

    return { id: TagElementId.make(tag._id), deleted: true }
  })

export const listAttachedTags = (
  params: ListAttachedTagsParams
): Effect.Effect<Array<AttachedTagSummary>, HulyClientError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const tagRefs = yield* listTagReferencesForObject(client, params)
    return tagRefs.map(toAttachedTagSummary)
  })

export const attachTag = (
  params: AttachTagParams
): Effect.Effect<AttachTagResult, TagReferenceError, HulyClient> =>
  Effect.gen(function*() {
    const tag = yield* ensureTagElement({
      targetClass: params.targetClass,
      titleOrId: params.tag,
      color: params.color,
      category: params.category
    })

    return yield* attachTagReference({
      tag,
      objectId: params.object.objectId,
      objectClass: params.object.objectClass,
      space: params.object.space,
      collection: params.object.collection,
      weight: params.weight
    })
  })

export const detachTag = (
  params: DetachTagParams
): Effect.Effect<DetachTagResult, TagReferenceError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const tag = toResolvedTagElement(yield* findTagElementOrFail(client, params.targetClass, params.tag), false)

    return yield* detachTagReference({
      tag,
      objectId: params.object.objectId,
      objectClass: params.object.objectClass,
      space: params.object.space,
      collection: params.object.collection
    })
  })
