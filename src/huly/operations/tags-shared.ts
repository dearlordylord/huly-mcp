import type { AttachedData, Class, Data, Doc, Ref, Space } from "@hcengineering/core"
import { generateId, SortingOrder } from "@hcengineering/core"
import type { TagCategory as HulyTagCategory, TagElement as HulyTagElement, TagReference } from "@hcengineering/tags"
import { Effect } from "effect"

import { ColorCode, Count, MAX_COLOR_INDEX, TagElementId, TagReferenceId } from "../../domain/schemas/shared.js"
import type { AttachedTagSummary, AttachTagResult, DetachTagResult, TagWeight } from "../../domain/schemas/tags.js"
import { HulyClient, type HulyClientError } from "../client.js"
import { TagCategoryNotFoundError, TagNotFoundError } from "../errors.js"
import { core, tags } from "../huly-plugins.js"
import { hulyQuery, type StrictDocumentQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"

type CreateTagError = HulyClientError | TagCategoryNotFoundError

interface ResolvedTagElement {
  readonly id: Ref<HulyTagElement>
  readonly title: string
  readonly targetClass: Ref<Class<Doc>>
  readonly description: string
  readonly color: number
  readonly category: Ref<HulyTagCategory>
  readonly refCount?: number | undefined
  readonly created: boolean
}

interface EnsureTagElementParams {
  readonly targetClass: string
  readonly titleOrId: string
  readonly color?: number | undefined
  readonly description?: string | undefined
  readonly category?: string | undefined
  readonly fallbackCategory?: Ref<HulyTagCategory> | undefined
}

interface AttachTagReferenceParams {
  readonly tag: ResolvedTagElement
  readonly objectId: string
  readonly objectClass: string
  readonly space: string
  readonly collection: string
  readonly weight?: TagWeight | undefined
  readonly matchTitleCaseInsensitive?: boolean | undefined
}

interface DetachTagReferenceParams {
  readonly tag: ResolvedTagElement
  readonly objectId: string
  readonly objectClass: string
  readonly space: string
  readonly collection: string
}

interface RawTagObjectLocator {
  readonly objectId: string
  readonly objectClass: string
  readonly space: string
  readonly collection: string
}

export const toTargetClassRef: (targetClass: string) => Ref<Class<Doc>> = toRef
const toTagElementRef: (tag: string) => Ref<HulyTagElement> = toRef
const toTagCategoryRef: (category: string) => Ref<HulyTagCategory> = toRef
const toTagReferenceRef: (tagReference: string) => Ref<TagReference> = toRef
const toSpaceRef: (space: string) => Ref<Space> = toRef
const toDocRef: (doc: string) => Ref<Doc> = toRef

export const normalizeColorCode = (color: number): ColorCode => {
  if (!Number.isFinite(color)) {
    return ColorCode.make(0)
  }

  return ColorCode.make(Math.min(MAX_COLOR_INDEX, Math.max(0, Math.trunc(color))))
}

export const toResolvedTagElement = (tag: HulyTagElement, created: boolean): ResolvedTagElement => ({
  id: tag._id,
  title: tag.title,
  targetClass: tag.targetClass,
  description: tag.description,
  color: tag.color,
  category: tag.category,
  refCount: tag.refCount,
  created
})

const createdResolvedTagElement = (
  id: Ref<HulyTagElement>,
  data: Data<HulyTagElement>
): ResolvedTagElement => ({
  id,
  title: data.title,
  targetClass: data.targetClass,
  description: data.description,
  color: data.color,
  category: data.category,
  created: true
})

export const toAttachedTagSummary = (
  tagRef: Pick<TagReference, "_id" | "tag" | "title" | "color" | "weight">
): AttachedTagSummary => {
  const summary = {
    id: TagReferenceId.make(tagRef._id),
    tag: TagElementId.make(tagRef.tag),
    title: tagRef.title,
    color: normalizeColorCode(tagRef.color)
  }

  return tagRef.weight === undefined ? summary : { ...summary, weight: tagRef.weight }
}

const findTagElementByIdOrTitle = (
  client: HulyClient["Type"],
  targetClass: string,
  idOrTitle: string
): Effect.Effect<HulyTagElement | undefined, HulyClientError> =>
  Effect.gen(function*() {
    const targetClassRef = toTargetClassRef(targetClass)

    const byId = yield* client.findOne<HulyTagElement>(
      tags.class.TagElement,
      hulyQuery<HulyTagElement>({
        _id: toTagElementRef(idOrTitle),
        targetClass: targetClassRef
      })
    )
    if (byId !== undefined) return byId

    return yield* client.findOne<HulyTagElement>(
      tags.class.TagElement,
      hulyQuery<HulyTagElement>({
        title: idOrTitle,
        targetClass: targetClassRef
      })
    )
  })

export const findTagElementOrFail = (
  client: HulyClient["Type"],
  targetClass: string,
  idOrTitle: string
): Effect.Effect<HulyTagElement, TagNotFoundError | HulyClientError> =>
  Effect.gen(function*() {
    const tag = yield* findTagElementByIdOrTitle(client, targetClass, idOrTitle)
    if (tag === undefined) {
      return yield* new TagNotFoundError({ identifier: idOrTitle })
    }
    return tag
  })

const findDefaultCategory = (
  client: HulyClient["Type"],
  targetClass: string
): Effect.Effect<HulyTagCategory | undefined, HulyClientError> =>
  client.findOne<HulyTagCategory>(
    tags.class.TagCategory,
    hulyQuery<HulyTagCategory>({
      targetClass: toTargetClassRef(targetClass),
      default: true
    })
  )

const findTagCategoryByIdOrLabelForTarget = (
  client: HulyClient["Type"],
  targetClass: string,
  idOrLabel: string
): Effect.Effect<HulyTagCategory | undefined, HulyClientError> =>
  Effect.gen(function*() {
    const targetClassRef = toTargetClassRef(targetClass)

    const byId = yield* client.findOne<HulyTagCategory>(
      tags.class.TagCategory,
      hulyQuery<HulyTagCategory>({
        _id: toTagCategoryRef(idOrLabel),
        targetClass: targetClassRef
      })
    )
    if (byId !== undefined) return byId

    return yield* client.findOne<HulyTagCategory>(
      tags.class.TagCategory,
      hulyQuery<HulyTagCategory>({
        label: idOrLabel,
        targetClass: targetClassRef
      })
    )
  })

export const resolveTagCategoryRef = (
  client: HulyClient["Type"],
  targetClass: string,
  category: string | undefined,
  fallbackCategory?: Ref<HulyTagCategory>
): Effect.Effect<Ref<HulyTagCategory>, TagCategoryNotFoundError | HulyClientError> =>
  Effect.gen(function*() {
    if (category !== undefined) {
      const resolved = yield* findTagCategoryByIdOrLabelForTarget(client, targetClass, category)
      if (resolved === undefined) {
        return yield* new TagCategoryNotFoundError({ identifier: category })
      }
      return resolved._id
    }

    const defaultCategory = yield* findDefaultCategory(client, targetClass)
    return defaultCategory?._id ?? fallbackCategory ?? tags.category.NoCategory
  })

export const ensureTagElement = (
  params: EnsureTagElementParams
): Effect.Effect<ResolvedTagElement, CreateTagError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const targetClassRef = toTargetClassRef(params.targetClass)
    const existing = yield* findTagElementByIdOrTitle(client, params.targetClass, params.titleOrId)

    if (existing !== undefined) {
      return toResolvedTagElement(existing, false)
    }

    const category = yield* resolveTagCategoryRef(client, params.targetClass, params.category, params.fallbackCategory)
    const tagId = generateId<HulyTagElement>()
    const tagData: Data<HulyTagElement> = {
      title: params.titleOrId,
      description: params.description ?? "",
      targetClass: targetClassRef,
      color: params.color ?? 0,
      category
    }

    yield* client.createDoc(
      tags.class.TagElement,
      toRef<Space>(core.space.Workspace),
      tagData,
      tagId
    )

    return createdResolvedTagElement(tagId, tagData)
  })

export const listTagReferencesForObject = (
  client: HulyClient["Type"],
  params: RawTagObjectLocator
): Effect.Effect<Array<TagReference>, HulyClientError> =>
  Effect.gen(function*() {
    const query: StrictDocumentQuery<TagReference> = {
      attachedTo: toDocRef(params.objectId),
      attachedToClass: toTargetClassRef(params.objectClass),
      space: toSpaceRef(params.space),
      collection: params.collection
    }

    return yield* client.findAll<TagReference>(
      tags.class.TagReference,
      hulyQuery(query),
      { sort: { modifiedOn: SortingOrder.Descending } }
    )
  })

export const attachTagReference = (
  params: AttachTagReferenceParams
): Effect.Effect<AttachTagResult, HulyClientError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const existingRefs = yield* listTagReferencesForObject(client, {
      objectId: params.objectId,
      objectClass: params.objectClass,
      space: params.space,
      collection: params.collection
    })
    const tagTitle = params.tag.title.trim().toLowerCase()
    const existing = existingRefs.find((tagRef) =>
      tagRef.tag === params.tag.id
      || (
        params.matchTitleCaseInsensitive === true
        && tagRef.title.trim().toLowerCase() === tagTitle
      )
    )

    if (existing !== undefined) {
      return {
        id: TagReferenceId.make(existing._id),
        tag: TagElementId.make(params.tag.id),
        title: existing.title,
        attached: false
      }
    }

    const attributes: AttachedData<TagReference> = params.weight === undefined
      ? {
        title: params.tag.title,
        color: params.tag.color,
        tag: params.tag.id
      }
      : {
        title: params.tag.title,
        color: params.tag.color,
        tag: params.tag.id,
        weight: params.weight
      }

    const tagReferenceId = yield* client.addCollection(
      tags.class.TagReference,
      toSpaceRef(params.space),
      toDocRef(params.objectId),
      toTargetClassRef(params.objectClass),
      params.collection,
      attributes
    )

    return {
      id: TagReferenceId.make(tagReferenceId),
      tag: TagElementId.make(params.tag.id),
      title: params.tag.title,
      attached: true
    }
  })

export const detachTagReference = (
  params: DetachTagReferenceParams
): Effect.Effect<DetachTagResult, HulyClientError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const existingRefs = yield* listTagReferencesForObject(client, {
      objectId: params.objectId,
      objectClass: params.objectClass,
      space: params.space,
      collection: params.collection
    })
    const matchingRefs = existingRefs.filter((tagRef) => tagRef.tag === params.tag.id)

    for (const tagRef of matchingRefs) {
      yield* client.removeDoc(
        tags.class.TagReference,
        toSpaceRef(params.space),
        toTagReferenceRef(tagRef._id)
      )
    }

    return {
      detached: matchingRefs.length > 0,
      detachedCount: Count.make(matchingRefs.length)
    }
  })
