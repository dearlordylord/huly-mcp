/* eslint-disable no-restricted-syntax -- test fixtures bridge Huly SDK phantom refs and generic fake-client signatures */
import { describe, it } from "@effect/vitest"
import type { ActivityMessage } from "@hcengineering/activity"
import type { Attachment as HulyAttachment } from "@hcengineering/attachment"
import type {
  Channel as HulyChannel,
  ChatMessage,
  DirectMessage as HulyDirectMessage,
  ThreadMessage as HulyThreadMessage
} from "@hcengineering/chunter"
import { AvatarType } from "@hcengineering/contact"
import type { Employee as HulyEmployee } from "@hcengineering/contact"
import type {
  AccountUuid,
  AttachedData,
  AttachedDoc,
  Class,
  Doc,
  DocumentQuery,
  DocumentUpdate,
  FindOptions,
  PersonId,
  Ref,
  Space
} from "@hcengineering/core"
import { Effect, Layer } from "effect"
import { expect } from "vitest"

import { parseListChannelMessagesParams, parseListThreadRepliesParams } from "../../../src/domain/schemas/channels.js"
import {
  parseAddChatMessageAttachmentParams,
  parseDeleteChatMessageAttachmentParams,
  parseGetChatMessageAttachmentParams,
  parseListChatMessageAttachmentsParams,
  parseUpdateChatMessageAttachmentParams
} from "../../../src/domain/schemas/chat-message-attachments.js"
import { parseListDmMessagesParams } from "../../../src/domain/schemas/direct-messages.js"
import { AttachmentId } from "../../../src/domain/schemas/shared.js"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import { ChatMessageAttachmentNotFoundError } from "../../../src/huly/errors.js"
import { attachment, chunter, contact } from "../../../src/huly/huly-plugins.js"
import { listChannelMessages } from "../../../src/huly/operations/channels.js"
import {
  addChatMessageAttachment,
  deleteChatMessageAttachment,
  getChatMessageAttachment,
  listChatMessageAttachments,
  updateChatMessageAttachment
} from "../../../src/huly/operations/chat-message-attachments.js"
import { listDirectMessageMessages } from "../../../src/huly/operations/direct-messages.js"
import { toRef } from "../../../src/huly/operations/sdk-boundary.js"
import { listThreadReplies } from "../../../src/huly/operations/threads.js"
import { HulyStorageClient, type HulyStorageOperations } from "../../../src/huly/storage.js"
import { withDiagnostics } from "../../helpers/diagnostics.js"

const currentAccount = "00000000-0000-4000-8000-000000000000" as AccountUuid
const participantAccount = "11111111-1111-4111-8111-111111111111" as AccountUuid
const person = "person-1" as PersonId

interface State {
  readonly channels: Array<HulyChannel>
  readonly directMessages: Array<HulyDirectMessage>
  readonly employees: Array<HulyEmployee>
  readonly messages: Array<ChatMessage>
  readonly replies: Array<HulyThreadMessage>
  readonly attachments: Array<HulyAttachment>
  readonly addCalls: Array<
    { readonly attachedTo: string; readonly attachedToClass: string; readonly collection: string }
  >
  readonly updateCalls: Array<{ readonly objectId: string; readonly operations: DocumentUpdate<HulyAttachment> }>
  readonly removeCalls: Array<{ readonly objectId: string; readonly attachedTo: string; readonly collection: string }>
  nextBlob: number
}

const baseDoc = {
  space: toRef<Space>("space-1"),
  modifiedBy: person,
  modifiedOn: 1,
  createdBy: person,
  createdOn: 1
}

const makeChannel = (): HulyChannel => ({
  ...baseDoc,
  _id: toRef<HulyChannel>("channel-1"),
  _class: chunter.class.Channel,
  name: "general",
  topic: "",
  description: "",
  private: false,
  archived: false,
  members: [],
  messages: 1
})

const makeDirectMessage = (): HulyDirectMessage => ({
  ...baseDoc,
  _id: toRef<HulyDirectMessage>("dm-1"),
  _class: chunter.class.DirectMessage,
  name: "",
  description: "",
  private: true,
  archived: false,
  members: [currentAccount, participantAccount],
  messages: 1
})

const makeEmployee = (): HulyEmployee => {
  const employee: HulyEmployee = {
    ...baseDoc,
    _id: toRef<HulyEmployee>("employee-participant"),
    _class: contact.mixin.Employee,
    name: "Test,Participant",
    personUuid: participantAccount,
    avatarType: AvatarType.COLOR,
    active: true
  }
  return employee
}

const makeMessage = (
  id: string,
  space: Ref<Space>,
  attachedTo: Ref<Doc>,
  attachedToClass: Ref<Class<Doc>>,
  attachments: number
): ChatMessage => ({
  ...baseDoc,
  _id: toRef<ChatMessage>(id),
  _class: chunter.class.ChatMessage,
  space,
  attachedTo,
  attachedToClass,
  collection: "messages",
  message: "<p>Hello</p>",
  attachments,
  replies: 1
})

const makeReply = (id: string, attachments: number): HulyThreadMessage => ({
  ...baseDoc,
  _id: toRef<HulyThreadMessage>(id),
  _class: chunter.class.ThreadMessage,
  space: toRef<Space>("channel-1"),
  attachedTo: toRef<ActivityMessage>("msg-channel"),
  attachedToClass: chunter.class.ChatMessage,
  collection: "replies",
  message: "<p>Reply</p>",
  attachments,
  objectId: toRef<Doc>("channel-1"),
  objectClass: chunter.class.Channel
})

const makeAttachment = (
  id: string,
  attachedTo: Ref<Doc>,
  attachedToClass: Ref<Class<Doc>>
): HulyAttachment => ({
  ...baseDoc,
  _id: toRef<HulyAttachment>(id),
  _class: attachment.class.Attachment,
  space: toRef<Space>("channel-1"),
  attachedTo,
  attachedToClass,
  collection: "attachments",
  name: `${id}.txt`,
  file: toRef("blob-1"),
  type: "text/plain",
  size: 5,
  lastModified: 1,
  pinned: false
})

const matchesQuery = (doc: Doc, query: DocumentQuery<Doc>): boolean =>
  Object.entries(query).every(([key, value]) => {
    const actual = Reflect.get(doc, key)
    return Array.isArray(actual) && !Array.isArray(value) ? actual.includes(value) : actual === value
  })

const docsForClass = (state: State, classRef: Ref<Class<Doc>>): ReadonlyArray<Doc> =>
  classRef === chunter.class.Channel
    ? state.channels
    : classRef === chunter.class.DirectMessage
    ? state.directMessages
    : classRef === contact.mixin.Employee
    ? state.employees
    : classRef === chunter.class.ChatMessage
    ? state.messages
    : classRef === chunter.class.ThreadMessage
    ? state.replies
    : classRef === attachment.class.Attachment
    ? state.attachments
    : []

const applyOptions = <T extends Doc>(docs: ReadonlyArray<T>, options: FindOptions<T> | undefined): ReadonlyArray<T> =>
  options?.limit === undefined ? docs : docs.slice(0, options.limit)

const stateFixture = (): State => {
  const channel = makeChannel()
  const dm = makeDirectMessage()
  const channelMessage = makeMessage(
    "msg-channel",
    channel._id,
    toRef<Doc>(channel._id),
    toRef<Class<Doc>>(chunter.class.Channel),
    1
  )
  const dmMessage = makeMessage(
    "msg-dm",
    dm._id,
    toRef<Doc>(dm._id),
    toRef<Class<Doc>>(chunter.class.DirectMessage),
    2
  )
  const reply = makeReply("reply-1", 3)
  return {
    channels: [channel],
    directMessages: [dm],
    employees: [makeEmployee()],
    messages: [channelMessage, dmMessage],
    replies: [reply],
    attachments: [
      makeAttachment("att-channel", channelMessage._id, chunter.class.ChatMessage),
      makeAttachment("att-dm", dmMessage._id, chunter.class.ChatMessage),
      makeAttachment("att-reply", reply._id, chunter.class.ThreadMessage)
    ],
    addCalls: [],
    updateCalls: [],
    removeCalls: [],
    nextBlob: 1
  }
}

const layerFor = (state: State): Layer.Layer<HulyClient | HulyStorageClient> => {
  const findAll: HulyClientOperations["findAll"] = <T extends Doc>(
    classRef: Ref<Class<T>>,
    query: DocumentQuery<T>,
    options?: FindOptions<T>
  ) => {
    const docs = docsForClass(state, classRef as Ref<Class<Doc>>)
    const filtered = docs.filter((doc) => matchesQuery(doc, query as DocumentQuery<Doc>))
    return Effect.succeed(Object.assign([...applyOptions(filtered as Array<T>, options)], { total: filtered.length }))
  }

  const findOne: HulyClientOperations["findOne"] = <T extends Doc>(
    classRef: Ref<Class<T>>,
    query: DocumentQuery<T>
  ) => Effect.map(findAll(classRef, query), (docs) => docs[0])

  const addCollection: HulyClientOperations["addCollection"] = <T extends Doc, P extends AttachedDoc>(
    classRef: Ref<Class<P>>,
    space: Ref<Space>,
    attachedTo: Ref<T>,
    attachedToClass: Ref<Class<T>>,
    collection: string,
    attributes: AttachedData<P>,
    id?: Ref<P>
  ) => {
    state.addCalls.push({ attachedTo: String(attachedTo), attachedToClass: String(attachedToClass), collection })
    if (classRef === attachment.class.Attachment && id !== undefined) {
      state.attachments.push({
        ...baseDoc,
        _id: id as unknown as Ref<HulyAttachment>,
        _class: attachment.class.Attachment,
        space,
        attachedTo: attachedTo as unknown as Ref<Doc>,
        attachedToClass: attachedToClass as unknown as Ref<Class<Doc>>,
        collection,
        ...(attributes as unknown as AttachedData<HulyAttachment>)
      } as HulyAttachment)
    }
    return Effect.succeed(id ?? toRef<P>("created-attachment"))
  }

  const updateDoc: HulyClientOperations["updateDoc"] = <T extends Doc>(
    classRef: Ref<Class<T>>,
    _space: Ref<Space>,
    objectId: Ref<T>,
    operations: DocumentUpdate<T>
  ) => {
    if (classRef === attachment.class.Attachment) {
      const index = state.attachments.findIndex((candidate) => String(candidate._id) === String(objectId))
      if (index >= 0) state.attachments[index] = { ...state.attachments[index], ...operations }
      state.updateCalls.push({
        objectId: String(objectId),
        operations: operations as unknown as DocumentUpdate<HulyAttachment>
      })
    }
    return Effect.succeed([])
  }

  const removeCollection: NonNullable<HulyClientOperations["removeCollection"]> = <
    T extends Doc,
    P extends AttachedDoc
  >(
    _classRef: Ref<Class<P>>,
    _space: Ref<Space>,
    objectId: Ref<P>,
    attachedTo: Ref<T>,
    _attachedToClass: Ref<Class<T>>,
    collection: string
  ) => {
    state.removeCalls.push({ objectId: String(objectId), attachedTo: String(attachedTo), collection })
    const index = state.attachments.findIndex((candidate) => String(candidate._id) === String(objectId))
    if (index >= 0) state.attachments.splice(index, 1)
    return Effect.succeed(attachedTo)
  }

  const storage: HulyStorageOperations = {
    uploadFile: (filename, data, contentType) =>
      Effect.succeed({
        blobId: toRef(`blob-${state.nextBlob++}`),
        contentType,
        size: data.length,
        url: `https://files.test/${filename}`
      }),
    getFileUrl: (blobId) => `https://files.test/${blobId}`
  }

  return Layer.merge(
    HulyClient.testLayer({ findAll, findOne, addCollection, updateDoc, removeCollection }),
    HulyStorageClient.testLayer(storage)
  )
}

const exerciseLifecycle = (
  state: State,
  target: unknown,
  existingAttachmentId: string,
  expectedAttachedTo: string,
  expectedClass: string
) =>
  Effect.gen(function*() {
    const layer = layerFor(state)
    const listParams = yield* parseListChatMessageAttachmentsParams({ target, limit: 10 })
    const listed = yield* listChatMessageAttachments(listParams).pipe(Effect.provide(layer), withDiagnostics)
    expect(listed.attachments.map((item) => item.id)).toContain(existingAttachmentId)

    const addParams = yield* parseAddChatMessageAttachmentParams({
      target,
      filename: `${existingAttachmentId}-new.txt`,
      contentType: "text/plain",
      data: "aGVsbG8=",
      description: "created",
      pinned: true
    })
    const added = yield* addChatMessageAttachment(addParams).pipe(Effect.provide(layer), withDiagnostics)
    expect(state.addCalls.at(-1)).toMatchObject({
      attachedTo: expectedAttachedTo,
      attachedToClass: expectedClass,
      collection: "attachments"
    })

    const getParams = yield* parseGetChatMessageAttachmentParams({
      target,
      attachmentId: added.attachmentId
    })
    const read = yield* getChatMessageAttachment(getParams).pipe(Effect.provide(layer), withDiagnostics)
    expect(read.attachment.url).toBe(`https://files.test/${added.blobId}`)

    const updateParams = yield* parseUpdateChatMessageAttachmentParams({
      target,
      attachmentId: added.attachmentId,
      description: "updated",
      pinned: false
    })
    const updated = yield* updateChatMessageAttachment(updateParams).pipe(Effect.provide(layer), withDiagnostics)
    expect(updated.updated).toBe(true)
    expect(state.updateCalls.at(-1)?.operations).toMatchObject({ description: "updated", pinned: false })

    const clearParams = yield* parseUpdateChatMessageAttachmentParams({
      target,
      attachmentId: added.attachmentId,
      description: null
    })
    yield* updateChatMessageAttachment(clearParams).pipe(Effect.provide(layer), withDiagnostics)
    expect(state.updateCalls.at(-1)?.operations).toMatchObject({ description: "" })

    const deleteParams = yield* parseDeleteChatMessageAttachmentParams({
      target,
      attachmentId: added.attachmentId
    })
    const deleted = yield* deleteChatMessageAttachment(deleteParams).pipe(Effect.provide(layer), withDiagnostics)
    expect(deleted.deleted).toBe(true)
    expect(state.removeCalls.at(-1)).toMatchObject({
      attachedTo: expectedAttachedTo,
      collection: "attachments"
    })
  })

describe("chat message attachment operations", () => {
  it.effect("resolves all supported targets and runs attachment lifecycles", () =>
    Effect.gen(function*() {
      const state = stateFixture()

      yield* exerciseLifecycle(
        state,
        { kind: "channel_message", channel: "general", messageId: "msg-channel" },
        "att-channel",
        "msg-channel",
        chunter.class.ChatMessage
      )
      yield* exerciseLifecycle(
        state,
        { kind: "dm_message", dm: "dm-1", messageId: "msg-dm" },
        "att-dm",
        "msg-dm",
        chunter.class.ChatMessage
      )
      const byParticipantName = yield* listChatMessageAttachments(
        yield* parseListChatMessageAttachmentsParams({
          target: { kind: "dm_message", dm: "Test,Participant", messageId: "msg-dm" }
        })
      ).pipe(Effect.provide(layerFor(state)), withDiagnostics)
      expect(byParticipantName.attachments.map((item) => item.id)).toContain("att-dm")
      yield* exerciseLifecycle(
        state,
        { kind: "thread_reply", channel: "general", messageId: "msg-channel", replyId: "reply-1" },
        "att-reply",
        "reply-1",
        chunter.class.ThreadMessage
      )
    }))

  it.effect("rejects attachment IDs that belong to another chat message target", () =>
    Effect.gen(function*() {
      const state = stateFixture()
      const layer = layerFor(state)
      const params = yield* parseGetChatMessageAttachmentParams({
        target: { kind: "channel_message", channel: "general", messageId: "msg-channel" },
        attachmentId: "att-dm"
      })

      const error = yield* Effect.flip(getChatMessageAttachment(params).pipe(Effect.provide(layer), withDiagnostics))

      expect(error).toBeInstanceOf(ChatMessageAttachmentNotFoundError)
    }))

  it.effect("exposes attachment counts in message and reply summaries", () =>
    Effect.gen(function*() {
      const state = stateFixture()
      const layer = layerFor(state)

      const channelMessages = yield* listChannelMessages(
        yield* parseListChannelMessagesParams({ channel: "general" })
      ).pipe(Effect.provide(layer))
      const dmMessages = yield* listDirectMessageMessages(
        yield* parseListDmMessagesParams({ dm: "dm-1" })
      ).pipe(Effect.provide(layer))
      const replies = yield* listThreadReplies(
        yield* parseListThreadRepliesParams({ channel: "general", messageId: "msg-channel" })
      ).pipe(Effect.provide(layer))

      expect(channelMessages.messages[0]?.attachments).toBe(1)
      expect(dmMessages.messages[0]?.attachments).toBe(2)
      expect(replies.replies[0]?.attachments).toBe(3)
    }))

  it.effect("returns target-aware metadata in results", () =>
    Effect.gen(function*() {
      const state = stateFixture()
      const layer = layerFor(state)
      const params = yield* parseGetChatMessageAttachmentParams({
        target: { kind: "channel_message", channel: "general", messageId: "msg-channel" },
        attachmentId: AttachmentId.make("att-channel")
      })

      const result = yield* getChatMessageAttachment(params).pipe(Effect.provide(layer), withDiagnostics)

      expect(result.target).toMatchObject({
        kind: "channel_message",
        channelId: "channel-1",
        channelName: "general",
        messageId: "msg-channel",
        objectId: "msg-channel",
        objectClass: chunter.class.ChatMessage,
        collection: "attachments"
      })
      expect(result.attachment.description).toBeUndefined()
    }))

  it.effect("allows clearing descriptions with null", () =>
    Effect.gen(function*() {
      const state = stateFixture()
      const layer = layerFor(state)
      const params = yield* parseUpdateChatMessageAttachmentParams({
        target: { kind: "channel_message", channel: "general", messageId: "msg-channel" },
        attachmentId: AttachmentId.make("att-channel"),
        description: null
      })

      yield* updateChatMessageAttachment(params).pipe(Effect.provide(layer), withDiagnostics)

      expect(state.updateCalls.at(-1)?.operations).toMatchObject({ description: "" })
    }))
})
