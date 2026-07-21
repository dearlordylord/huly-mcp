import { assertAt } from "../../../src/utils/assertions.js"
/* eslint-disable no-restricted-syntax -- Huly SDK phantom refs are erased at runtime; these tests centralize fixture casts. */
import { describe, it } from "@effect/vitest"
import type { Card as HulyCard, CardSpace as HulyCardSpace } from "@hcengineering/card"
import type { ChatMessage } from "@hcengineering/chunter"
import type {
  AttachedData,
  AttachedDoc,
  Class,
  Doc,
  DocumentQuery,
  DocumentUpdate,
  Ref,
  Space
} from "@hcengineering/core"
import { Effect, Exit, type Layer } from "effect"
import { expect } from "vitest"

import {
  parseAddCardCommentParams,
  parseDeleteCardCommentParams,
  parseListCardCommentsParams,
  parseUpdateCardCommentParams
} from "../../../src/domain/schemas.js"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import { CardCommentNotFoundError, CardNotFoundError, CardSpaceNotFoundError } from "../../../src/huly/errors.js"
import { cardPlugin, chunter } from "../../../src/huly/huly-plugins.js"
import {
  addCardComment,
  deleteCardComment,
  listCardComments,
  updateCardComment
} from "../../../src/huly/operations/card-comments.js"
import { markdownToMarkupString, testMarkupUrlConfig } from "../../../src/huly/operations/markup.js"
import { toRef } from "../../../src/huly/operations/sdk-boundary.js"
import { testWorkbenchUrlConfig } from "../../../src/huly/url-builders.js"
import { corePersonId, findResult } from "../../helpers/huly-sdk.js"

const SPACE_ID = toRef<HulyCardSpace>("card-space-1")
const CARD_CLASS = toRef<Class<HulyCard>>("master-tag-1")

interface CardCommentState {
  readonly cardSpaces: Array<HulyCardSpace>
  readonly cards: Array<HulyCard>
  readonly messages: Array<ChatMessage>
  nextId: number
  readonly updates: Array<{ readonly id: string; readonly operations: DocumentUpdate<ChatMessage> }>
  readonly removals: Array<{ readonly classRef: string; readonly id: string }>
}

const personId = corePersonId("card-comment-person")

const cardSpace = (): HulyCardSpace =>
  ({
    _id: SPACE_ID,
    _class: cardPlugin.class.CardSpace,
    space: toRef<Space>("workspace"),
    name: "MedAIRA",
    description: "Card space",
    private: false,
    archived: false,
    members: [],
    types: [CARD_CLASS],
    modifiedBy: personId,
    modifiedOn: 0,
    createdBy: personId,
    createdOn: 0
  }) as unknown as HulyCardSpace

const card = (): HulyCard =>
  ({
    _id: toRef<HulyCard>("card-1"),
    _class: CARD_CLASS,
    space: SPACE_ID,
    title: "Decision Record",
    content: "content-blob",
    parent: null,
    parentInfo: [],
    children: 0,
    blobs: {},
    modifiedBy: personId,
    modifiedOn: 0,
    createdBy: personId,
    createdOn: 0
  }) as unknown as HulyCard

const chatMessage = (id: string, body: string): ChatMessage =>
  ({
    _id: toRef<ChatMessage>(id),
    _class: chunter.class.ChatMessage,
    space: SPACE_ID,
    attachedTo: toRef<Doc>("card-1"),
    attachedToClass: CARD_CLASS as unknown as Ref<Class<Doc>>,
    collection: "comments",
    message: markdownToMarkupString(body, testMarkupUrlConfig),
    modifiedBy: personId,
    modifiedOn: 1,
    createdBy: personId,
    createdOn: 1,
    editedOn: undefined,
    isPinned: false,
    replies: 0,
    reactions: 0
  }) as unknown as ChatMessage

const matchesQuery = (doc: Doc, query: DocumentQuery<Doc>) =>
  Object.entries(query).every(([key, value]) => Reflect.get(doc, key) === value)

const docsForClass = (state: CardCommentState, classRef: Ref<Class<Doc>>): ReadonlyArray<Doc> =>
  classRef === cardPlugin.class.CardSpace
    ? state.cardSpaces
    : classRef === cardPlugin.class.Card
    ? state.cards
    : classRef === chunter.class.ChatMessage
    ? state.messages
    : []

const makeLayer = (state: CardCommentState): Layer.Layer<HulyClient> => {
  const findAll: HulyClientOperations["findAll"] = <T extends Doc>(
    classRef: Ref<Class<T>>,
    query: DocumentQuery<T>
  ) => {
    const docs = docsForClass(state, classRef as unknown as Ref<Class<Doc>>)
    return Effect.succeed(
      findResult(docs.filter((doc) => matchesQuery(doc, query as unknown as DocumentQuery<Doc>)) as Array<T>)
    )
  }

  const findOne: HulyClientOperations["findOne"] = <T extends Doc>(
    classRef: Ref<Class<T>>,
    query: DocumentQuery<T>
  ) => Effect.map(findAll(classRef, query), (docs) => docs.at(0))

  const addCollection: HulyClientOperations["addCollection"] = <T extends Doc, P extends AttachedDoc>(
    classRef: Ref<Class<P>>,
    space: Ref<Space>,
    attachedTo: Ref<T>,
    attachedToClass: Ref<Class<T>>,
    collection: string,
    attributes: AttachedData<P>,
    id?: Ref<P>
  ) => {
    const next = id ?? toRef<P>(`created-${state.nextId++}`)
    if (classRef === chunter.class.ChatMessage) {
      state.messages.push({
        _id: next as unknown as Ref<ChatMessage>,
        _class: chunter.class.ChatMessage,
        space,
        attachedTo: attachedTo as unknown as Ref<Doc>,
        attachedToClass: attachedToClass as unknown as Ref<Class<Doc>>,
        collection,
        modifiedBy: personId,
        modifiedOn: 0,
        createdBy: personId,
        createdOn: 0,
        editedOn: undefined,
        isPinned: false,
        replies: 0,
        reactions: 0,
        ...(attributes as unknown as AttachedData<ChatMessage>)
      } as unknown as ChatMessage)
    }
    return Effect.succeed(next)
  }

  const updateDoc: HulyClientOperations["updateDoc"] = <T extends Doc>(
    classRef: Ref<Class<T>>,
    _space: Ref<Space>,
    objectId: Ref<T>,
    operations: DocumentUpdate<T>
  ) => {
    if (classRef === chunter.class.ChatMessage) {
      state.updates.push({
        id: String(objectId),
        operations: operations as unknown as DocumentUpdate<ChatMessage>
      })
      const index = state.messages.findIndex((message) => String(message._id) === String(objectId))
      const message = assertAt(state.messages, index)
      state.messages[index] = {
        ...message,
        ...(operations as unknown as Partial<ChatMessage>)
      }
    }
    return Effect.succeed([])
  }

  const removeDoc: HulyClientOperations["removeDoc"] = <T extends Doc>(
    classRef: Ref<Class<T>>,
    _space: Ref<Space>,
    objectId: Ref<T>
  ) => {
    state.removals.push({ classRef: String(classRef), id: String(objectId) })
    if (classRef === chunter.class.ChatMessage) {
      const index = state.messages.findIndex((message) => String(message._id) === String(objectId))
      if (index >= 0) state.messages.splice(index, 1)
    }
    return Effect.succeed([])
  }

  return HulyClient.testLayer({
    findAll,
    findOne,
    addCollection,
    updateDoc,
    removeDoc,
    workbenchUrlConfig: testWorkbenchUrlConfig,
    markupUrlConfig: testMarkupUrlConfig
  })
}

const baseState = (): CardCommentState => ({
  cardSpaces: [cardSpace()],
  cards: [card()],
  messages: [chatMessage("comment-1", "Initial")],
  nextId: 1,
  updates: [],
  removals: []
})

describe("card comment operations", () => {
  it.effect("adds, lists, updates, and deletes card comments", () =>
    Effect.gen(function*() {
      const state = baseState()
      const layer = makeLayer(state)
      const listParams = yield* parseListCardCommentsParams({ cardSpace: "MedAIRA", card: "Decision Record" })
      const addParams = yield* parseAddCardCommentParams({
        cardSpace: "MedAIRA",
        card: "card-1",
        body: "Added"
      })
      const updateNoopParams = yield* parseUpdateCardCommentParams({
        cardSpace: "MedAIRA",
        card: "Decision Record",
        commentId: "comment-1",
        body: "Initial"
      })
      const updateParams = yield* parseUpdateCardCommentParams({
        cardSpace: "MedAIRA",
        card: "Decision Record",
        commentId: "comment-1",
        body: "Updated"
      })
      const deleteParams = yield* parseDeleteCardCommentParams({
        cardSpace: "MedAIRA",
        card: "card-1",
        commentId: "comment-1"
      })

      const listed = yield* listCardComments(listParams).pipe(Effect.provide(layer))
      const added = yield* addCardComment(addParams).pipe(Effect.provide(layer))
      const noop = yield* updateCardComment(updateNoopParams).pipe(Effect.provide(layer))
      const updated = yield* updateCardComment(updateParams).pipe(Effect.provide(layer))
      const deleted = yield* deleteCardComment(deleteParams).pipe(Effect.provide(layer))

      expect(listed).toMatchObject({ cardId: "card-1", total: 1 })
      expect(assertAt(listed.comments, 0)).toMatchObject({ id: "comment-1", body: "Initial" })
      expect(added.cardId).toBe("card-1")
      expect(added.commentId).toBeDefined()
      const addedMessage = state.messages.find((message) => String(message._id) === String(added.commentId))
      expect(addedMessage).toMatchObject({
        space: SPACE_ID,
        attachedTo: "card-1",
        attachedToClass: CARD_CLASS,
        collection: "comments"
      })
      expect(noop.updated).toBe(false)
      expect(updated.updated).toBe(true)
      expect(state.updates).toHaveLength(1)
      expect(deleted.deleted).toBe(true)
      expect(state.removals).toEqual([{ classRef: chunter.class.ChatMessage, id: "comment-1" }])
    }))

  it.effect("fails with CardSpaceNotFoundError for an unknown card space", () =>
    Effect.gen(function*() {
      const layer = makeLayer(baseState())
      const params = yield* parseListCardCommentsParams({ cardSpace: "Nope", card: "Decision Record" })
      const exit = yield* Effect.exit(listCardComments(params).pipe(Effect.provide(layer)))
      expect(exit).toEqual(Exit.fail(new CardSpaceNotFoundError({ identifier: "Nope" })))
    }))

  it.effect("fails with CardNotFoundError for an unknown card", () =>
    Effect.gen(function*() {
      const layer = makeLayer(baseState())
      const params = yield* parseListCardCommentsParams({ cardSpace: "MedAIRA", card: "Nope" })
      const exit = yield* Effect.exit(listCardComments(params).pipe(Effect.provide(layer)))
      expect(exit).toEqual(Exit.fail(new CardNotFoundError({ identifier: "Nope", cardSpace: "MedAIRA" })))
    }))

  it.effect("fails with CardCommentNotFoundError when updating or deleting a missing comment", () =>
    Effect.gen(function*() {
      const layer = makeLayer(baseState())
      const updateParams = yield* parseUpdateCardCommentParams({
        cardSpace: "MedAIRA",
        card: "Decision Record",
        commentId: "missing",
        body: "Whatever"
      })
      const deleteParams = yield* parseDeleteCardCommentParams({
        cardSpace: "MedAIRA",
        card: "Decision Record",
        commentId: "missing"
      })

      const expected = Exit.fail(
        new CardCommentNotFoundError({ commentId: "missing", card: "Decision Record", cardSpace: "MedAIRA" })
      )
      expect(yield* Effect.exit(updateCardComment(updateParams).pipe(Effect.provide(layer)))).toEqual(expected)
      expect(yield* Effect.exit(deleteCardComment(deleteParams).pipe(Effect.provide(layer)))).toEqual(expected)
    }))
})
