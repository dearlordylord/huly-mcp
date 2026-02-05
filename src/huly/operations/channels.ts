import type { ActivityMessage } from "@hcengineering/activity"
import type {
  Channel as HulyChannel,
  ChatMessage,
  DirectMessage as HulyDirectMessage,
  ThreadMessage as HulyThreadMessage
} from "@hcengineering/chunter"
import type { Employee as HulyEmployee, Person, SocialIdentity, SocialIdentityRef } from "@hcengineering/contact"
import {
  type AccountUuid,
  type AttachedData,
  type Class,
  type Data,
  type Doc,
  type DocumentUpdate,
  generateId,
  type Markup,
  type PersonId,
  type Ref,
  SortingOrder,
  type Space
} from "@hcengineering/core"
import { jsonToMarkup, markupToJSON } from "@hcengineering/text"
import { markdownToMarkup, markupToMarkdown } from "@hcengineering/text-markdown"
import { Effect } from "effect"

import type {
  AddThreadReplyParams,
  Channel,
  ChannelSummary,
  CreateChannelParams,
  DeleteChannelParams,
  DeleteThreadReplyParams,
  DirectMessageSummary,
  GetChannelParams,
  ListChannelMessagesParams,
  ListChannelsParams,
  ListDirectMessagesParams,
  ListThreadRepliesParams,
  MessageSummary,
  SendChannelMessageParams,
  ThreadMessage,
  UpdateChannelParams,
  UpdateThreadReplyParams
} from "../../domain/schemas.js"
import { HulyClient, type HulyClientError } from "../client.js"
import { ChannelNotFoundError, MessageNotFoundError, ThreadReplyNotFoundError } from "../errors.js"

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports -- CJS interop
const chunter = require("@hcengineering/chunter").default as typeof import("@hcengineering/chunter").default
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports -- CJS interop
const contact = require("@hcengineering/contact").default as typeof import("@hcengineering/contact").default

// --- Error Types ---

export type ListChannelsError = HulyClientError

export type GetChannelError =
  | HulyClientError
  | ChannelNotFoundError

export type CreateChannelError = HulyClientError

export type UpdateChannelError =
  | HulyClientError
  | ChannelNotFoundError

export type DeleteChannelError =
  | HulyClientError
  | ChannelNotFoundError

export type ListChannelMessagesError =
  | HulyClientError
  | ChannelNotFoundError

export type SendChannelMessageError =
  | HulyClientError
  | ChannelNotFoundError

export type ListDirectMessagesError = HulyClientError

export type ListThreadRepliesError =
  | HulyClientError
  | ChannelNotFoundError
  | MessageNotFoundError

export type AddThreadReplyError =
  | HulyClientError
  | ChannelNotFoundError
  | MessageNotFoundError

export type UpdateThreadReplyError =
  | HulyClientError
  | ChannelNotFoundError
  | MessageNotFoundError
  | ThreadReplyNotFoundError

export type DeleteThreadReplyError =
  | HulyClientError
  | ChannelNotFoundError
  | MessageNotFoundError
  | ThreadReplyNotFoundError

// --- Helpers ---

const findChannel = (
  identifier: string
): Effect.Effect<
  { client: HulyClient["Type"]; channel: HulyChannel },
  ChannelNotFoundError | HulyClientError,
  HulyClient
> =>
  Effect.gen(function*() {
    const client = yield* HulyClient

    let channel = yield* client.findOne<HulyChannel>(
      chunter.class.Channel,
      { name: identifier }
    )

    if (channel === undefined) {
      channel = yield* client.findOne<HulyChannel>(
        chunter.class.Channel,
        { _id: identifier as Ref<HulyChannel> }
      )
    }

    if (channel === undefined) {
      return yield* new ChannelNotFoundError({ identifier })
    }

    return { client, channel }
  })

const markupToMarkdownString = (markup: Markup): string => {
  const json = markupToJSON(markup)
  return markupToMarkdown(json, { refUrl: "", imageUrl: "" })
}

const markdownToMarkupString = (markdown: string): Markup => {
  const json = markdownToMarkup(markdown, { refUrl: "", imageUrl: "" })
  return jsonToMarkup(json) as Markup
}

/**
 * Build a map from SocialIdentity ID to Person name.
 * SocialIdentity._id (typed as Ref<SocialIdentity> & PersonId) has attachedTo pointing to Person.
 * The PersonId from Doc.modifiedBy is the same string value as SocialIdentity._id.
 */
const buildSocialIdToPersonNameMap = (
  client: HulyClient["Type"],
  socialIds: Array<PersonId>
): Effect.Effect<Map<string, string>, HulyClientError> =>
  Effect.gen(function*() {
    if (socialIds.length === 0) {
      return new Map<string, string>()
    }

    // PersonId values from Doc.modifiedBy are the same underlying string as SocialIdentityRef
    // (both are the _id of SocialIdentity documents), so this cast is safe
    const socialIdentities = yield* client.findAll<SocialIdentity>(
      contact.class.SocialIdentity,
      { _id: { $in: socialIds as unknown as Array<SocialIdentityRef> } }
    )

    if (socialIdentities.length === 0) {
      return new Map<string, string>()
    }

    const personRefs = [...new Set(socialIdentities.map((si) => si.attachedTo))]
    const persons = yield* client.findAll<Person>(
      contact.class.Person,
      { _id: { $in: personRefs } }
    )

    const personById = new Map(persons.map((p) => [p._id, p]))
    const result = new Map<string, string>()

    for (const si of socialIdentities) {
      const person = personById.get(si.attachedTo)
      if (person !== undefined) {
        result.set(si._id, person.name)
      }
    }

    return result
  })

/**
 * Build a map from AccountUuid to Person name by querying Employee.
 * Employee has personUuid field that matches AccountUuid.
 */
const buildAccountUuidToNameMap = (
  client: HulyClient["Type"],
  accountUuids: Array<AccountUuid>
): Effect.Effect<Map<string, string>, HulyClientError> =>
  Effect.gen(function*() {
    if (accountUuids.length === 0) {
      return new Map<string, string>()
    }

    const employees = yield* client.findAll<HulyEmployee>(
      contact.mixin.Employee,
      { personUuid: { $in: accountUuids } }
    )

    const result = new Map<string, string>()
    for (const emp of employees) {
      if (emp.personUuid !== undefined) {
        result.set(emp.personUuid, emp.name)
      }
    }

    return result
  })

// --- Operations ---

/**
 * List channels.
 * Results sorted by name ascending.
 * Supports filtering by name and topic substring.
 */
export const listChannels = (
  params: ListChannelsParams
): Effect.Effect<Array<ChannelSummary>, ListChannelsError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient

    const query: Record<string, unknown> = {}
    if (!params.includeArchived) {
      query.archived = false
    }

    // Apply name search using $like operator
    if (params.nameSearch !== undefined && params.nameSearch.trim() !== "") {
      query.name = { $like: `%${params.nameSearch}%` }
    }

    // Apply topic search using $like operator
    if (params.topicSearch !== undefined && params.topicSearch.trim() !== "") {
      query.topic = { $like: `%${params.topicSearch}%` }
    }

    const limit = Math.min(params.limit ?? 50, 200)

    const channels = yield* client.findAll<HulyChannel>(
      chunter.class.Channel,
      query,
      {
        limit,
        sort: {
          name: SortingOrder.Ascending
        }
      }
    )

    const summaries: Array<ChannelSummary> = channels.map((ch) => ({
      id: String(ch._id),
      name: ch.name,
      topic: ch.topic || undefined,
      private: ch.private,
      archived: ch.archived,
      members: ch.members?.length,
      messages: ch.messages,
      modifiedOn: ch.modifiedOn
    }))

    return summaries
  })

/**
 * Get a single channel with full details.
 */
export const getChannel = (
  params: GetChannelParams
): Effect.Effect<Channel, GetChannelError, HulyClient> =>
  Effect.gen(function*() {
    const { channel, client } = yield* findChannel(params.channel)

    let memberNames: Array<string> | undefined
    if (channel.members && channel.members.length > 0) {
      // Space.members is typed as AccountUuid[] in @hcengineering/core
      const accountUuidToName = yield* buildAccountUuidToNameMap(
        client,
        channel.members
      )

      memberNames = channel.members
        .map((m) => accountUuidToName.get(m))
        .filter((n): n is string => n !== undefined)
    }

    const result: Channel = {
      id: String(channel._id),
      name: channel.name,
      topic: channel.topic || undefined,
      description: channel.description || undefined,
      private: channel.private,
      archived: channel.archived,
      members: memberNames,
      messages: channel.messages,
      modifiedOn: channel.modifiedOn,
      createdOn: channel.createdOn
    }

    return result
  })

// --- Create Channel ---

export interface CreateChannelResult {
  id: string
  name: string
}

/**
 * Create a new channel.
 */
export const createChannel = (
  params: CreateChannelParams
): Effect.Effect<CreateChannelResult, CreateChannelError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient

    const channelId: Ref<HulyChannel> = generateId()

    const channelData: Data<HulyChannel> = {
      name: params.name,
      topic: params.topic || "",
      description: "",
      private: params.private ?? false,
      archived: false,
      members: []
    }

    yield* client.createDoc(
      chunter.class.Channel,
      channelId as unknown as Ref<Space>,
      channelData,
      channelId
    )

    return { id: String(channelId), name: params.name }
  })

// --- Update Channel ---

export interface UpdateChannelResult {
  id: string
  updated: boolean
}

/**
 * Update an existing channel.
 */
export const updateChannel = (
  params: UpdateChannelParams
): Effect.Effect<UpdateChannelResult, UpdateChannelError, HulyClient> =>
  Effect.gen(function*() {
    const { channel, client } = yield* findChannel(params.channel)

    const updateOps: DocumentUpdate<HulyChannel> = {}

    if (params.name !== undefined) {
      updateOps.name = params.name
    }

    if (params.topic !== undefined) {
      updateOps.topic = params.topic
    }

    if (Object.keys(updateOps).length === 0) {
      return { id: String(channel._id), updated: false }
    }

    yield* client.updateDoc(
      chunter.class.Channel,
      channel._id as unknown as Ref<Space>,
      channel._id,
      updateOps
    )

    return { id: String(channel._id), updated: true }
  })

// --- Delete Channel ---

export interface DeleteChannelResult {
  id: string
  deleted: boolean
}

/**
 * Delete a channel.
 */
export const deleteChannel = (
  params: DeleteChannelParams
): Effect.Effect<DeleteChannelResult, DeleteChannelError, HulyClient> =>
  Effect.gen(function*() {
    const { channel, client } = yield* findChannel(params.channel)

    yield* client.removeDoc(
      chunter.class.Channel,
      channel._id as unknown as Ref<Space>,
      channel._id
    )

    return { id: String(channel._id), deleted: true }
  })

// --- List Channel Messages ---

export interface ListChannelMessagesResult {
  messages: Array<MessageSummary>
  total: number
}

/**
 * List messages in a channel.
 * Results sorted by creation date descending (newest first).
 */
export const listChannelMessages = (
  params: ListChannelMessagesParams
): Effect.Effect<ListChannelMessagesResult, ListChannelMessagesError, HulyClient> =>
  Effect.gen(function*() {
    const { channel, client } = yield* findChannel(params.channel)

    const limit = Math.min(params.limit ?? 50, 200)

    const messages = yield* client.findAll<ChatMessage>(
      chunter.class.ChatMessage,
      {
        space: channel._id
      },
      {
        limit,
        sort: {
          createdOn: SortingOrder.Descending
        }
      }
    )

    const total = messages.total ?? messages.length

    const uniqueSocialIds = [
      ...new Set(
        messages
          .map((msg) => msg.modifiedBy)
          .filter((id): id is PersonId => id !== undefined)
      )
    ]

    const socialIdToName = yield* buildSocialIdToPersonNameMap(client, uniqueSocialIds)

    const summaries: Array<MessageSummary> = messages.map((msg) => {
      const senderName = msg.modifiedBy ? socialIdToName.get(msg.modifiedBy) : undefined
      return {
        id: msg._id,
        body: markupToMarkdownString(msg.message),
        sender: senderName,
        senderId: msg.modifiedBy,
        createdOn: msg.createdOn,
        modifiedOn: msg.modifiedOn,
        editedOn: msg.editedOn,
        replies: msg.replies
      }
    })

    return { messages: summaries, total }
  })

// --- Send Channel Message ---

export interface SendChannelMessageResult {
  id: string
  channelId: string
}

/**
 * Send a message to a channel.
 */
export const sendChannelMessage = (
  params: SendChannelMessageParams
): Effect.Effect<SendChannelMessageResult, SendChannelMessageError, HulyClient> =>
  Effect.gen(function*() {
    const { channel, client } = yield* findChannel(params.channel)

    const messageId: Ref<ChatMessage> = generateId()
    const markup = markdownToMarkupString(params.body)

    const messageData: AttachedData<ChatMessage> = {
      message: markup,
      attachments: 0
    }

    yield* client.addCollection(
      chunter.class.ChatMessage,
      channel._id,
      channel._id,
      chunter.class.Channel,
      "messages",
      messageData,
      messageId
    )

    return { id: String(messageId), channelId: String(channel._id) }
  })

// --- List Direct Messages ---

export interface ListDirectMessagesResult {
  conversations: Array<DirectMessageSummary>
  total: number
}

/**
 * List direct message conversations.
 * Results sorted by modification date descending (newest first).
 */
export const listDirectMessages = (
  params: ListDirectMessagesParams
): Effect.Effect<ListDirectMessagesResult, ListDirectMessagesError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient

    const limit = Math.min(params.limit ?? 50, 200)

    const dms = yield* client.findAll<HulyDirectMessage>(
      chunter.class.DirectMessage,
      {},
      {
        limit,
        sort: {
          modifiedOn: SortingOrder.Descending
        }
      }
    )

    const total = dms.total ?? dms.length

    // DirectMessage.members is typed as AccountUuid[] in @hcengineering/chunter (extends Space)
    const uniqueAccountUuids = [
      ...new Set(
        dms.flatMap((dm) => dm.members || [])
      )
    ]

    const accountUuidToName = yield* buildAccountUuidToNameMap(client, uniqueAccountUuids)

    const summaries: Array<DirectMessageSummary> = dms.map((dm) => {
      const members = dm.members || []
      const participants = members
        .map((m) => accountUuidToName.get(m))
        .filter((n): n is string => n !== undefined)

      const participantIds = members as Array<string>

      return {
        id: dm._id,
        participants,
        participantIds,
        messages: dm.messages,
        modifiedOn: dm.modifiedOn
      }
    })

    return { conversations: summaries, total }
  })

// --- Thread Message Operations ---

/**
 * Find a message in a channel by ID.
 * Returns the client, channel, and message.
 */
const findMessage = (
  channelIdentifier: string,
  messageId: string
): Effect.Effect<
  { client: HulyClient["Type"]; channel: HulyChannel; message: ChatMessage },
  ChannelNotFoundError | MessageNotFoundError | HulyClientError,
  HulyClient
> =>
  Effect.gen(function*() {
    const { channel, client } = yield* findChannel(channelIdentifier)

    const message = yield* client.findOne<ChatMessage>(
      chunter.class.ChatMessage,
      {
        _id: messageId as Ref<ChatMessage>,
        space: channel._id
      }
    )

    if (message === undefined) {
      return yield* new MessageNotFoundError({ messageId, channel: channelIdentifier })
    }

    return { client, channel, message }
  })

export interface ListThreadRepliesResult {
  replies: Array<ThreadMessage>
  total: number
}

/**
 * List replies in a thread.
 * Results sorted by creation date ascending (oldest first).
 */
export const listThreadReplies = (
  params: ListThreadRepliesParams
): Effect.Effect<ListThreadRepliesResult, ListThreadRepliesError, HulyClient> =>
  Effect.gen(function*() {
    const { channel, client, message } = yield* findMessage(params.channel, params.messageId)

    const limit = Math.min(params.limit ?? 50, 200)

    const replies = yield* client.findAll<HulyThreadMessage>(
      chunter.class.ThreadMessage,
      {
        attachedTo: message._id as Ref<ActivityMessage>,
        space: channel._id
      },
      {
        limit,
        sort: {
          createdOn: SortingOrder.Ascending
        }
      }
    )

    const total = replies.total ?? replies.length

    const uniqueSocialIds = [
      ...new Set(
        replies
          .map((msg) => msg.modifiedBy)
          .filter((id): id is PersonId => id !== undefined)
      )
    ]

    const socialIdToName = yield* buildSocialIdToPersonNameMap(client, uniqueSocialIds)

    const threadMessages: Array<ThreadMessage> = replies.map((msg) => {
      const senderName = msg.modifiedBy ? socialIdToName.get(msg.modifiedBy) : undefined
      return {
        id: msg._id,
        body: markupToMarkdownString(msg.message),
        sender: senderName,
        senderId: msg.modifiedBy,
        createdOn: msg.createdOn,
        modifiedOn: msg.modifiedOn,
        editedOn: msg.editedOn
      }
    })

    return { replies: threadMessages, total }
  })

export interface AddThreadReplyResult {
  id: string
  messageId: string
  channelId: string
}

/**
 * Add a reply to a message thread.
 */
export const addThreadReply = (
  params: AddThreadReplyParams
): Effect.Effect<AddThreadReplyResult, AddThreadReplyError, HulyClient> =>
  Effect.gen(function*() {
    const { channel, client, message } = yield* findMessage(params.channel, params.messageId)

    const replyId: Ref<HulyThreadMessage> = generateId()
    const markup = markdownToMarkupString(params.body)

    // ThreadMessage requires attachedTo, attachedToClass, objectId, objectClass
    // attachedTo points to the parent message
    // objectId/objectClass point to the channel (the object the thread is about)
    const replyData: AttachedData<HulyThreadMessage> = {
      message: markup,
      attachments: 0,
      objectId: channel._id as Ref<Doc>,
      objectClass: chunter.class.Channel as Ref<Class<Doc>>
    }

    yield* client.addCollection(
      chunter.class.ThreadMessage,
      channel._id,
      message._id as Ref<ActivityMessage>,
      chunter.class.ChatMessage as Ref<Class<ActivityMessage>>,
      "replies",
      replyData,
      replyId
    )

    return {
      id: String(replyId),
      messageId: String(message._id),
      channelId: String(channel._id)
    }
  })

export interface UpdateThreadReplyResult {
  id: string
  updated: boolean
}

/**
 * Update a thread reply.
 */
export const updateThreadReply = (
  params: UpdateThreadReplyParams
): Effect.Effect<UpdateThreadReplyResult, UpdateThreadReplyError, HulyClient> =>
  Effect.gen(function*() {
    const { channel, client, message } = yield* findMessage(params.channel, params.messageId)

    const reply = yield* client.findOne<HulyThreadMessage>(
      chunter.class.ThreadMessage,
      {
        _id: params.replyId as Ref<HulyThreadMessage>,
        attachedTo: message._id as Ref<ActivityMessage>,
        space: channel._id
      }
    )

    if (reply === undefined) {
      return yield* new ThreadReplyNotFoundError({
        replyId: params.replyId,
        messageId: params.messageId
      })
    }

    const markup = markdownToMarkupString(params.body)

    const updateOps: DocumentUpdate<HulyThreadMessage> = {
      message: markup,
      editedOn: Date.now()
    }

    yield* client.updateDoc(
      chunter.class.ThreadMessage,
      channel._id,
      reply._id,
      updateOps
    )

    return { id: String(reply._id), updated: true }
  })

export interface DeleteThreadReplyResult {
  id: string
  deleted: boolean
}

/**
 * Delete a thread reply.
 */
export const deleteThreadReply = (
  params: DeleteThreadReplyParams
): Effect.Effect<DeleteThreadReplyResult, DeleteThreadReplyError, HulyClient> =>
  Effect.gen(function*() {
    const { channel, client, message } = yield* findMessage(params.channel, params.messageId)

    const reply = yield* client.findOne<HulyThreadMessage>(
      chunter.class.ThreadMessage,
      {
        _id: params.replyId as Ref<HulyThreadMessage>,
        attachedTo: message._id as Ref<ActivityMessage>,
        space: channel._id
      }
    )

    if (reply === undefined) {
      return yield* new ThreadReplyNotFoundError({
        replyId: params.replyId,
        messageId: params.messageId
      })
    }

    yield* client.removeDoc(
      chunter.class.ThreadMessage,
      channel._id,
      reply._id
    )

    return { id: String(reply._id), deleted: true }
  })
