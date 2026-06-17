/* eslint-disable no-restricted-syntax -- Huly SDK phantom refs are erased at runtime; this test builds in-memory SDK fixtures. */
import { describe, it } from "@effect/vitest"
import type { Attachment as HulyAttachment } from "@hcengineering/attachment"
import type { Channel as HulyChannel, ChatMessage } from "@hcengineering/chunter"
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
import { toFindResult } from "@hcengineering/core"
import { Effect } from "effect"
import { expect } from "vitest"

import type { HulyClientOperations } from "../../../src/huly/client.js"
import { attachment, chunter } from "../../../src/huly/huly-plugins.js"
import { testMarkupUrlConfig } from "../../../src/huly/operations/markup.js"
import { toRef } from "../../../src/huly/operations/sdk-boundary.js"
import type { HulyStorageOperations } from "../../../src/huly/storage.js"
import { testWorkbenchUrlConfig } from "../../../src/huly/url-builders.js"
import { McpErrorCode } from "../../../src/mcp/error-mapping.js"
import { channelTools } from "../../../src/mcp/tools/channels.js"
import { toolRegistry } from "../../../src/mcp/tools/index.js"

const account = "00000000-0000-4000-8000-000000000000" as AccountUuid
const person = "person-1" as PersonId

const channel: HulyChannel = {
  _id: toRef<HulyChannel>("channel-1"),
  _class: chunter.class.Channel,
  space: toRef<Space>("space-1"),
  name: "general",
  topic: "",
  description: "",
  private: false,
  archived: false,
  members: [],
  messages: 1,
  modifiedBy: person,
  modifiedOn: 1,
  createdBy: person,
  createdOn: 1
}

const message: ChatMessage = {
  _id: toRef<ChatMessage>("msg-1"),
  _class: chunter.class.ChatMessage,
  space: channel._id,
  attachedTo: toRef<Doc>(channel._id),
  attachedToClass: toRef<Class<Doc>>(chunter.class.Channel),
  collection: "messages",
  message: "<p>Hello</p>",
  attachments: 1,
  modifiedBy: person,
  modifiedOn: 1,
  createdBy: person,
  createdOn: 1
}

const attachmentDoc = (id: string, attachedTo: Ref<Doc>): HulyAttachment => ({
  _id: toRef<HulyAttachment>(id),
  _class: attachment.class.Attachment,
  space: channel._id,
  attachedTo,
  attachedToClass: chunter.class.ChatMessage,
  collection: "attachments",
  name: `${id}.txt`,
  file: toRef("blob-1"),
  type: "text/plain",
  size: 5,
  lastModified: 1,
  pinned: false,
  modifiedBy: person,
  modifiedOn: 1,
  createdBy: person,
  createdOn: 1
})

const attachments = [
  attachmentDoc("att-1", message._id),
  attachmentDoc("att-foreign", toRef<Doc>("other-message"))
]

const matchesQuery = (doc: Doc, query: DocumentQuery<Doc>): boolean =>
  Object.entries(query).every(([key, value]) => Reflect.get(doc, key) === value)

const docsForClass = (classRef: Ref<Class<Doc>>): ReadonlyArray<Doc> =>
  classRef === chunter.class.Channel
    ? [channel]
    : classRef === chunter.class.ChatMessage
    ? [message]
    : classRef === attachment.class.Attachment
    ? attachments
    : []

const hulyClient: HulyClientOperations = {
  getAccountUuid: () => account,
  getPrimarySocialId: () => person,
  markupUrlConfig: testMarkupUrlConfig,
  workbenchUrlConfig: testWorkbenchUrlConfig,
  findAll: <T extends Doc>(classRef: Ref<Class<T>>, query: DocumentQuery<T>, options?: FindOptions<T>) => {
    const docs = docsForClass(classRef as Ref<Class<Doc>>)
      .filter((doc) => matchesQuery(doc, query as DocumentQuery<Doc>))
    const limited = options?.limit === undefined ? docs : docs.slice(0, options.limit)
    return Effect.succeed(toFindResult(limited as unknown as Array<T>, docs.length))
  },
  findAllInModel: <T extends Doc>(classRef: Ref<Class<T>>, query: DocumentQuery<T>, options?: FindOptions<T>) =>
    hulyClient.findAll(classRef, query, options),
  findOne: <T extends Doc>(classRef: Ref<Class<T>>, query: DocumentQuery<T>) =>
    Effect.map(hulyClient.findAll(classRef, query), (docs) => docs[0]),
  createDoc: () => Effect.die(new Error("not implemented")),
  updateDoc: <T extends Doc>(
    classRef: Ref<Class<T>>,
    _space: Ref<Space>,
    objectId: Ref<T>,
    operations: DocumentUpdate<T>
  ) => {
    if (classRef === attachment.class.Attachment) {
      const index = attachments.findIndex((candidate) => String(candidate._id) === String(objectId))
      if (index >= 0) {
        attachments[index] = {
          ...attachments[index],
          ...(operations as unknown as DocumentUpdate<HulyAttachment>)
        }
      }
    }
    return Effect.succeed([])
  },
  addCollection: <T extends Doc, P extends AttachedDoc>(
    classRef: Ref<Class<P>>,
    space: Ref<Space>,
    attachedTo: Ref<T>,
    attachedToClass: Ref<Class<T>>,
    collection: string,
    attributes: AttachedData<P>,
    id?: Ref<P>
  ) => {
    if (classRef === attachment.class.Attachment && id !== undefined) {
      attachments.push({
        _id: id as unknown as Ref<HulyAttachment>,
        _class: attachment.class.Attachment,
        space,
        attachedTo: attachedTo as unknown as Ref<Doc>,
        attachedToClass: attachedToClass as unknown as Ref<Class<Doc>>,
        collection,
        ...(attributes as unknown as AttachedData<HulyAttachment>),
        modifiedBy: person,
        modifiedOn: 1,
        createdBy: person,
        createdOn: 1
      } as HulyAttachment)
    }
    return Effect.succeed(id ?? toRef<P>("created-attachment"))
  },
  removeDoc: () => Effect.die(new Error("not implemented")),
  removeCollection: <T extends Doc, P extends AttachedDoc>(
    _classRef: Ref<Class<P>>,
    _space: Ref<Space>,
    objectId: Ref<P>,
    attachedTo: Ref<T>
  ) => {
    const index = attachments.findIndex((candidate) => String(candidate._id) === String(objectId))
    if (index >= 0) attachments.splice(index, 1)
    return Effect.succeed(attachedTo)
  },
  uploadMarkup: () => Effect.die(new Error("not implemented")),
  fetchMarkup: () => Effect.succeed(""),
  createMixin: () => Effect.die(new Error("not implemented")),
  updateMixin: () => Effect.die(new Error("not implemented")),
  updateMarkup: () => Effect.die(new Error("not implemented")),
  searchFulltext: () => Effect.die(new Error("not implemented"))
}

const storageClient: HulyStorageOperations = {
  uploadFile: (filename, data, contentType) =>
    Effect.succeed({
      blobId: toRef(`blob-${filename}`),
      contentType,
      size: data.length,
      url: `https://files.test/${filename}`
    }),
  getFileUrl: (blobId) => `https://files.test/${blobId}`
}

const findChannelTool = (name: string) => {
  const tool = channelTools.find((candidate) => candidate.name === name)
  if (tool === undefined) throw new Error(`Missing channel tool ${name}`)
  return tool
}

const structuredResult = (result: { readonly structuredContent?: { readonly result?: unknown } }) => {
  const payload = result.structuredContent?.result
  expect(typeof payload).toBe("object")
  expect(payload).not.toBeNull()
  // MCP structuredContent is typed as unknown; the assertions above narrow the JSON payload to a record.
  return payload as Record<string, unknown>
}

describe("channel MCP tools", () => {
  it.effect("registers chat message attachment tools in channel tool order and tools/list", () =>
    Effect.gen(function*() {
      const names = channelTools.map((tool) => tool.name)
      const expected = [
        "list_chat_message_attachments",
        "get_chat_message_attachment",
        "add_chat_message_attachment",
        "update_chat_message_attachment",
        "delete_chat_message_attachment"
      ]

      for (const name of expected) {
        expect(toolRegistry.tools.has(name)).toBe(true)
      }
      expect(names.indexOf("delete_thread_reply")).toBeLessThan(names.indexOf(expected[0]))
      expect(expected.map((name) => names.indexOf(name))).toEqual(
        expected.map((_name, index) => names.indexOf(expected[0]) + index)
      )
    }))

  it.effect("serializes successful chat message attachment responses for all wrappers", () =>
    Effect.gen(function*() {
      const listResult = yield* Effect.promise(() =>
        findChannelTool("list_chat_message_attachments").handler(
          {
            target: { kind: "channel_message", channel: "general", messageId: "msg-1" },
            limit: 10
          },
          hulyClient,
          storageClient
        )
      )
      expect(listResult.isError).toBeUndefined()
      expect(listResult.structuredContent?.result).toMatchObject({
        target: {
          kind: "channel_message",
          channelId: "channel-1",
          messageId: "msg-1",
          objectId: "msg-1",
          collection: "attachments"
        },
        attachments: [{ id: "att-1" }],
        total: 1
      })

      const getResult = yield* Effect.promise(() =>
        findChannelTool("get_chat_message_attachment").handler(
          {
            target: { kind: "channel_message", channel: "general", messageId: "msg-1" },
            attachmentId: "att-1"
          },
          hulyClient,
          storageClient
        )
      )

      expect(getResult.isError).toBeUndefined()
      expect(getResult.structuredContent?.result).toMatchObject({
        target: {
          kind: "channel_message",
          channelId: "channel-1",
          messageId: "msg-1",
          objectId: "msg-1",
          collection: "attachments"
        },
        attachment: { id: "att-1", url: "https://files.test/blob-1" }
      })

      const addResult = yield* Effect.promise(() =>
        findChannelTool("add_chat_message_attachment").handler(
          {
            target: { kind: "channel_message", channel: "general", messageId: "msg-1" },
            filename: "new-chat-attachment.txt",
            contentType: "text/plain",
            data: "bmV3",
            description: "created"
          },
          hulyClient,
          storageClient
        )
      )
      const addedAttachmentId = structuredResult(addResult).attachmentId
      expect(addResult.isError).toBeUndefined()
      expect(addResult.structuredContent?.result).toMatchObject({
        target: { kind: "channel_message", objectId: "msg-1", collection: "attachments" },
        blobId: "blob-new-chat-attachment.txt",
        url: "https://files.test/new-chat-attachment.txt"
      })
      expect(typeof addedAttachmentId).toBe("string")

      const updateResult = yield* Effect.promise(() =>
        findChannelTool("update_chat_message_attachment").handler(
          {
            target: { kind: "channel_message", channel: "general", messageId: "msg-1" },
            attachmentId: addedAttachmentId,
            description: "updated",
            pinned: true
          },
          hulyClient,
          storageClient
        )
      )
      expect(updateResult.isError).toBeUndefined()
      expect(updateResult.structuredContent?.result).toMatchObject({
        target: { kind: "channel_message", objectId: "msg-1", collection: "attachments" },
        attachmentId: addedAttachmentId,
        updated: true
      })

      const deleteResult = yield* Effect.promise(() =>
        findChannelTool("delete_chat_message_attachment").handler(
          {
            target: { kind: "channel_message", channel: "general", messageId: "msg-1" },
            attachmentId: addedAttachmentId
          },
          hulyClient,
          storageClient
        )
      )
      expect(deleteResult.isError).toBeUndefined()
      expect(deleteResult.structuredContent?.result).toMatchObject({
        target: { kind: "channel_message", objectId: "msg-1", collection: "attachments" },
        attachmentId: addedAttachmentId,
        deleted: true
      })
    }))

  it.effect("maps scoped chat attachment misses to invalid params", () =>
    Effect.gen(function*() {
      const result = yield* Effect.promise(() =>
        findChannelTool("get_chat_message_attachment").handler(
          {
            target: { kind: "channel_message", channel: "general", messageId: "msg-1" },
            attachmentId: "att-foreign"
          },
          hulyClient,
          storageClient
        )
      )

      expect(result.isError).toBe(true)
      expect(result._meta?.errorCode).toBe(McpErrorCode.InvalidParams)
      expect(result.content[0]?.text).toContain("Attachment 'att-foreign' not found on channel message")
    }))
})
