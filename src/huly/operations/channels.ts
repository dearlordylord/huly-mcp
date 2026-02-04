import type { Channel as HulyChannel, ChatMessage, DirectMessage as HulyDirectMessage } from "@hcengineering/chunter"
import type { Person } from "@hcengineering/contact"
import {
  type AttachedData,
  type Data,
  type DocumentUpdate,
  generateId,
  type Markup,
  type Ref,
  SortingOrder,
  type Space
} from "@hcengineering/core"
import { jsonToMarkup, markupToJSON } from "@hcengineering/text"
import { markdownToMarkup, markupToMarkdown } from "@hcengineering/text-markdown"
import { Effect } from "effect"

import type {
  Channel,
  ChannelSummary,
  CreateChannelParams,
  DeleteChannelParams,
  DirectMessageSummary,
  GetChannelParams,
  ListChannelMessagesParams,
  ListChannelsParams,
  ListDirectMessagesParams,
  MessageSummary,
  SendChannelMessageParams,
  UpdateChannelParams
} from "../../domain/schemas.js"
import { HulyClient, type HulyClientError } from "../client.js"
import { ChannelNotFoundError } from "../errors.js"

// eslint-disable-next-line @typescript-eslint/no-require-imports
const chunter = require("@hcengineering/chunter").default as typeof import("@hcengineering/chunter").default
// eslint-disable-next-line @typescript-eslint/no-require-imports
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

// --- Operations ---

/**
 * List channels.
 * Results sorted by name ascending.
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
      const memberIds = channel.members as Array<Ref<Person>>
      const persons = yield* client.findAll<Person>(
        contact.class.Person,
        { _id: { $in: memberIds } }
      )

      const personByAccount = new Map<string, Person>(
        persons.map((p) => [String(p._id), p])
      )

      memberNames = channel.members
        .map((m) => personByAccount.get(String(m))?.name)
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

    // Note: modifiedBy is AccountUuid which doesn't directly map to Person._id
    // We fetch all persons to map accounts to names. This could be optimized
    // if Huly provides an account-to-person mapping API.
    const persons = messages.length > 0
      ? yield* client.findAll<Person>(contact.class.Person, {})
      : []
    const personMap = new Map(persons.map((p) => [String(p._id), p]))

    const summaries: Array<MessageSummary> = messages.map((msg) => {
      const sender = msg.modifiedBy ? personMap.get(String(msg.modifiedBy)) : undefined
      return {
        id: String(msg._id),
        body: markupToMarkdownString(msg.message),
        sender: sender?.name,
        senderId: msg.modifiedBy ? String(msg.modifiedBy) : undefined,
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

    // Note: DM members are AccountUuids which don't directly map to Person._id
    // We fetch all persons to map accounts to names.
    const persons = dms.length > 0
      ? yield* client.findAll<Person>(contact.class.Person, {})
      : []
    const personMap = new Map(persons.map((p) => [String(p._id), p]))

    const summaries: Array<DirectMessageSummary> = dms.map((dm) => {
      const participants = (dm.members || [])
        .map((m) => personMap.get(String(m))?.name)
        .filter((n): n is string => n !== undefined)

      const participantIds = (dm.members || []).map(String)

      return {
        id: String(dm._id),
        participants,
        participantIds,
        messages: dm.messages,
        modifiedOn: dm.modifiedOn
      }
    })

    return { conversations: summaries, total }
  })
