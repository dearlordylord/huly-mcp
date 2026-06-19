import type { Card as HulyBoardCard } from "@hcengineering/board"
import type { AttachedData, Data, DocumentUpdate, Ref, Space } from "@hcengineering/core"
import { generateId, SortingOrder } from "@hcengineering/core"
import type { TagCategory, TagElement as HulyTagElement, TagReference } from "@hcengineering/tags"
import { Effect } from "effect"

import type {
  AddBoardCardLabelParams,
  AddBoardCardLabelResult,
  BoardCardLabelParams,
  BoardLabelMutationResult,
  BoardLabelRef,
  CreateBoardLabelParams,
  DeleteBoardLabelParams,
  ListBoardCardLabelsResult,
  ListBoardLabelsParams,
  ListBoardLabelsResult,
  RemoveBoardCardLabelParams,
  RemoveBoardCardLabelResult,
  UpdateBoardLabelParams
} from "../../domain/schemas.js"
import { UPDATE_BOARD_LABEL_FIELDS } from "../../domain/schemas/board-labels.js"
import { DEFAULT_COLOR_INDEX, type NonEmptyString } from "../../domain/schemas/shared.js"
import { Count, TagCategoryId, TagElementId, TagReferenceId } from "../../domain/schemas/shared.js"
import { HulyClient, type HulyClientError } from "../client.js"
import type { NoUpdateFieldsError, TagCategoryNotFoundError } from "../errors.js"
import { BoardLabelIdentifierAmbiguousError, BoardLabelNotFoundError } from "../errors.js"
import { board, core, tags } from "../huly-plugins.js"
import { resolveBoardCard } from "./boards-card-read.js"
import { type BoardCardReadError, resolveBoardFromContext } from "./boards-shared.js"
import { clearTextAsEmptyString } from "./clear-field-updates.js"
import { listTotal } from "./counts.js"
import { clampLimit, escapeLikeWildcards, hulyQuery, type StrictDocumentQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"
import { normalizeColorCode, resolveTagCategoryRef, toTargetClassRef } from "./tags-shared.js"
import { requireUpdateFields } from "./update-guards.js"

type BoardLabelReadError = HulyClientError | BoardLabelNotFoundError | BoardLabelIdentifierAmbiguousError
type BoardLabelCreateError = HulyClientError | TagCategoryNotFoundError | BoardLabelIdentifierAmbiguousError
type BoardLabelLookup = BoardLabelRef | NonEmptyString
type BoardLabelUpdateError = BoardLabelReadError | HulyClientError | TagCategoryNotFoundError | NoUpdateFieldsError
type BoardCardLabelError = BoardLabelReadError | BoardCardReadError | TagCategoryNotFoundError

interface ResolvedBoardLabel {
  readonly id: Ref<HulyTagElement>
  readonly title: string
  readonly description: string
  readonly color: number
  readonly category: Ref<TagCategory>
  readonly refCount?: number | undefined
  readonly created: boolean
}

const BOARD_CARD_LABEL_COLLECTION = "labels"
const boardLabelTargetClass = String(board.class.Card)
const boardLabelTargetClassRef = toTargetClassRef(boardLabelTargetClass)
const workspaceSpace = toRef<Space>(core.space.Workspace)

const toBoardLabelSummary = (label: HulyTagElement) => {
  const summary = {
    id: TagElementId.make(label._id),
    title: label.title,
    description: label.description,
    color: normalizeColorCode(label.color),
    category: TagCategoryId.make(label.category)
  }

  return label.refCount === undefined ? summary : { ...summary, refCount: Count.make(label.refCount) }
}

const toAttachedBoardLabel = (tagRef: TagReference) => ({
  id: TagReferenceId.make(tagRef._id),
  label: TagElementId.make(tagRef.tag),
  title: tagRef.title,
  color: normalizeColorCode(tagRef.color)
})

const createdBoardLabel = (id: Ref<HulyTagElement>, data: Data<HulyTagElement>): ResolvedBoardLabel => ({
  id,
  title: data.title,
  description: data.description,
  color: data.color,
  category: data.category,
  created: true
})

const existingBoardLabel = (label: HulyTagElement): ResolvedBoardLabel => ({
  id: label._id,
  title: label.title,
  description: label.description,
  color: label.color,
  category: label.category,
  refCount: label.refCount,
  created: false
})

const findBoardLabelMatches = (
  client: HulyClient["Type"],
  identifier: BoardLabelLookup,
  options: { readonly lookupById: boolean }
): Effect.Effect<ReadonlyArray<HulyTagElement>, HulyClientError> =>
  Effect.gen(function*() {
    if (options.lookupById) {
      const byId = yield* client.findAll<HulyTagElement>(
        tags.class.TagElement,
        hulyQuery<HulyTagElement>({
          _id: toRef<HulyTagElement>(identifier),
          targetClass: boardLabelTargetClassRef
        })
      )
      if (byId.length > 0) return byId
    }

    return yield* client.findAll<HulyTagElement>(
      tags.class.TagElement,
      hulyQuery<HulyTagElement>({
        targetClass: boardLabelTargetClassRef,
        title: identifier
      })
    )
  })

const resolveBoardLabel = (
  client: HulyClient["Type"],
  identifier: BoardLabelLookup
): Effect.Effect<HulyTagElement, BoardLabelReadError> =>
  Effect.gen(function*() {
    const matches = yield* findBoardLabelMatches(client, identifier, { lookupById: true })
    const first = matches[0]
    if (matches.length === 1 && first !== undefined) return first
    if (matches.length > 1) {
      return yield* new BoardLabelIdentifierAmbiguousError({ identifier: String(identifier), matches: matches.length })
    }
    return yield* new BoardLabelNotFoundError({ identifier: String(identifier) })
  })

const ensureBoardLabel = (
  client: HulyClient["Type"],
  params: {
    readonly label: BoardLabelLookup
    readonly color?: number | undefined
    readonly description?: string | undefined
    readonly category?: string | undefined
    readonly lookupById: boolean
  }
): Effect.Effect<ResolvedBoardLabel, BoardLabelCreateError> =>
  Effect.gen(function*() {
    const existing = yield* findBoardLabelMatches(client, params.label, { lookupById: params.lookupById })
    const first = existing[0]
    if (existing.length === 1 && first !== undefined) return existingBoardLabel(first)
    if (existing.length > 1) {
      return yield* new BoardLabelIdentifierAmbiguousError({
        identifier: String(params.label),
        matches: existing.length
      })
    }

    const category = yield* resolveTagCategoryRef(
      client,
      boardLabelTargetClass,
      params.category,
      board.category.Other
    )
    const labelId = generateId<HulyTagElement>()
    const data: Data<HulyTagElement> = {
      title: params.label,
      description: params.description ?? "",
      targetClass: boardLabelTargetClassRef,
      color: params.color ?? DEFAULT_COLOR_INDEX,
      category
    }
    yield* client.createDoc(tags.class.TagElement, workspaceSpace, data, labelId)
    return createdBoardLabel(labelId, data)
  })

const ensureBoardLabelTitleAvailable = (
  client: HulyClient["Type"],
  label: HulyTagElement,
  title: NonEmptyString | undefined
): Effect.Effect<void, HulyClientError | BoardLabelIdentifierAmbiguousError> =>
  Effect.gen(function*() {
    if (title === undefined || title === label.title) return

    const matches = yield* findBoardLabelMatches(client, title, { lookupById: false })
    const conflicts = matches.filter((match) => match._id !== label._id)
    if (conflicts.length > 0) {
      return yield* new BoardLabelIdentifierAmbiguousError({
        identifier: String(title),
        matches: conflicts.length + 1
      })
    }
  })

const listCardTagReferences = (
  client: HulyClient["Type"],
  card: HulyBoardCard
): Effect.Effect<ReadonlyArray<TagReference>, HulyClientError> =>
  client.findAll<TagReference>(
    tags.class.TagReference,
    hulyQuery<TagReference>({
      attachedTo: card._id,
      attachedToClass: board.class.Card,
      collection: BOARD_CARD_LABEL_COLLECTION,
      space: card.space
    }),
    { sort: { modifiedOn: SortingOrder.Descending } }
  )

export const listBoardLabels = (
  params: ListBoardLabelsParams
): Effect.Effect<ListBoardLabelsResult, HulyClientError | TagCategoryNotFoundError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const categoryFilter = params.category === undefined
      ? {}
      : { category: yield* resolveTagCategoryRef(client, boardLabelTargetClass, params.category) }
    const titleSearch = params.titleSearch?.trim() ?? ""
    const query: StrictDocumentQuery<HulyTagElement> = {
      targetClass: boardLabelTargetClassRef,
      ...categoryFilter,
      ...(titleSearch === "" ? {} : { title: { $like: `%${escapeLikeWildcards(titleSearch)}%` } })
    }
    const labels = yield* client.findAll<HulyTagElement>(
      tags.class.TagElement,
      hulyQuery(query),
      { limit: clampLimit(params.limit), sort: { modifiedOn: SortingOrder.Descending }, total: true }
    )
    return { labels: labels.map(toBoardLabelSummary), total: Count.make(Math.max(0, listTotal(labels.total))) }
  })

export const createBoardLabel = (
  params: CreateBoardLabelParams
): Effect.Effect<BoardLabelMutationResult, BoardLabelCreateError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const label = yield* ensureBoardLabel(client, { ...params, label: params.title, lookupById: false })
    return { id: TagElementId.make(label.id), title: label.title, created: label.created }
  })

export const updateBoardLabel = (
  params: UpdateBoardLabelParams
): Effect.Effect<BoardLabelMutationResult, BoardLabelUpdateError, HulyClient> =>
  Effect.gen(function*() {
    yield* requireUpdateFields("update_board_label", params, UPDATE_BOARD_LABEL_FIELDS)
    const client = yield* HulyClient
    const label = yield* resolveBoardLabel(client, params.label)
    yield* ensureBoardLabelTitleAvailable(client, label, params.title)
    const update: DocumentUpdate<HulyTagElement> = {
      ...(params.title === undefined ? {} : { title: params.title }),
      ...(params.color === undefined ? {} : { color: params.color }),
      ...(params.description === undefined ? {} : { description: clearTextAsEmptyString(params.description) }),
      ...(params.category === undefined
        ? {}
        : { category: yield* resolveTagCategoryRef(client, boardLabelTargetClass, params.category) })
    }
    yield* client.updateDoc(tags.class.TagElement, workspaceSpace, label._id, update)
    return { id: TagElementId.make(label._id), updated: true }
  })

export const deleteBoardLabel = (
  params: DeleteBoardLabelParams
): Effect.Effect<BoardLabelMutationResult, BoardLabelReadError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const label = yield* resolveBoardLabel(client, params.label)
    yield* client.removeDoc(tags.class.TagElement, workspaceSpace, label._id)
    return { id: TagElementId.make(label._id), deleted: true }
  })

export const listBoardCardLabels = (
  params: BoardCardLabelParams
): Effect.Effect<ListBoardCardLabelsResult, BoardCardLabelError, HulyClient> =>
  Effect.gen(function*() {
    const { board: resolvedBoard, client } = yield* resolveBoardFromContext(params.board, { includeArchived: true })
    const card = yield* resolveBoardCard(client, resolvedBoard, params.card)
    const tagRefs = yield* listCardTagReferences(client, card)
    return { labels: tagRefs.map(toAttachedBoardLabel), total: Count.make(tagRefs.length) }
  })

export const addBoardCardLabel = (
  params: AddBoardCardLabelParams
): Effect.Effect<AddBoardCardLabelResult, BoardCardLabelError, HulyClient> =>
  Effect.gen(function*() {
    const { board: resolvedBoard, client } = yield* resolveBoardFromContext(params.board, { includeArchived: true })
    const card = yield* resolveBoardCard(client, resolvedBoard, params.card)
    const label = yield* ensureBoardLabel(client, { ...params, lookupById: true })
    const existingRefs = yield* listCardTagReferences(client, card)
    const existing = existingRefs.find((tagRef) => tagRef.tag === label.id)
    if (existing !== undefined) {
      return {
        id: TagReferenceId.make(existing._id),
        label: TagElementId.make(label.id),
        title: existing.title,
        attached: false,
        labelCreated: label.created
      }
    }

    const attributes: AttachedData<TagReference> = {
      tag: label.id,
      title: label.title,
      color: label.color
    }
    const tagRefId = yield* client.addCollection(
      tags.class.TagReference,
      card.space,
      card._id,
      board.class.Card,
      BOARD_CARD_LABEL_COLLECTION,
      attributes
    )
    return {
      id: TagReferenceId.make(tagRefId),
      label: TagElementId.make(label.id),
      title: label.title,
      attached: true,
      labelCreated: label.created
    }
  })

export const removeBoardCardLabel = (
  params: RemoveBoardCardLabelParams
): Effect.Effect<RemoveBoardCardLabelResult, BoardCardLabelError, HulyClient> =>
  Effect.gen(function*() {
    const { board: resolvedBoard, client } = yield* resolveBoardFromContext(params.board, { includeArchived: true })
    const card = yield* resolveBoardCard(client, resolvedBoard, params.card)
    const label = yield* resolveBoardLabel(client, params.label)
    const existingRefs = yield* listCardTagReferences(client, card)
    const matchingRefs = existingRefs.filter((tagRef) => tagRef.tag === label._id)

    for (const tagRef of matchingRefs) {
      yield* client.removeDoc(tags.class.TagReference, card.space, tagRef._id)
    }

    return {
      label: TagElementId.make(label._id),
      title: label.title,
      detached: matchingRefs.length > 0,
      detachedCount: Count.make(matchingRefs.length)
    }
  })
