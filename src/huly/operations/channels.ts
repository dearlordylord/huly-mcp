import type { Channel as HulyChannel, ChatMessage, DirectMessage as HulyDirectMessage } from "@hcengineering/chunter"
import type { Employee as HulyEmployee, Person, SocialIdentity, SocialIdentityRef } from "@hcengineering/contact"
import {
  type AccountUuid as HulyAccountUuid,
  type AttachedData,
  type Data,
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
import type {
  CreateChannelResult,
  DeleteChannelResult,
  ListChannelMessagesResult,
  ListDirectMessagesResult,
  SendChannelMessageResult,
  UpdateChannelResult
} from "../../domain/schemas/channels.js"
import { AccountUuid, ChannelId, ChannelName, MessageId, PersonName } from "../../domain/schemas/shared.js"
import { HulyClient, type HulyClientError } from "../client.js"
import { ChannelNotFoundError } from "../errors.js"
import { escapeLikeWildcards } from "./query-helpers.js"
import { toRef } from "./shared.js"

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

// --- SDK Type Bridges ---

// SDK: PersonId and SocialIdentityRef are the same underlying string but typed differently.
const personIdsAsSocialIdentityRefs = (
  ids: Array<PersonId>
): Array<SocialIdentityRef> => ids as unknown as Array<SocialIdentityRef>

// SDK: jsonToMarkup return type doesn't match Markup; cast contained here.
const jsonAsMarkup = (json: ReturnType<typeof markdownToMarkup>): Markup => jsonToMarkup(json) as Markup

// --- Helpers ---

export const findChannel = (
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
        { _id: toRef<HulyChannel>(identifier) }
      )
    }

    if (channel === undefined) {
      return yield* new ChannelNotFoundError({ identifier })
    }

    return { client, channel }
  })

export const markupToMarkdownString = (markup: Markup): string => {
  const json = markupToJSON(markup)
  return markupToMarkdown(json, { refUrl: "", imageUrl: "" })
}

export const markdownToMarkupString = (markdown: string): Markup => {
  const json = markdownToMarkup(markdown, { refUrl: "", imageUrl: "" })
  return jsonAsMarkup(json)
}

/**
 * Build a map from SocialIdentity ID to Person name.
 * SocialIdentity._id (typed as Ref<SocialIdentity> & PersonId) has attachedTo pointing to Person.
 * The PersonId from Doc.modifiedBy is the same string value as SocialIdentity._id.
 */
export const buildSocialIdToPersonNameMap = (
  client: HulyClient["Type"],
  socialIds: Array<PersonId>
): Effect.Effect<Map<string, string>, HulyClientError> =>
  Effect.gen(function*() {
    if (socialIds.length === 0) {
      return new Map<string, string>()
    }

    const socialIdentities = yield* client.findAll<SocialIdentity>(
      contact.class.SocialIdentity,
      { _id: { $in: personIdsAsSocialIdentityRefs(socialIds) } }
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
  accountUuids: Array<HulyAccountUuid>
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
      query.name = { $like: `%${escapeLikeWildcards(params.nameSearch)}%` }
    }

    // Apply topic search using $like operator
    if (params.topicSearch !== undefined && params.topicSearch.trim() !== "") {
      query.topic = { $like: `%${escapeLikeWildcards(params.topicSearch)}%` }
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
      id: ChannelId.make(ch._id),
      name: ChannelName.make(ch.name),
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
      id: ChannelId.make(channel._id),
      name: ChannelName.make(channel.name),
      topic: channel.topic || undefined,
      description: channel.description || undefined,
      private: channel.private,
      archived: channel.archived,
      members: memberNames?.map(m => PersonName.make(m)),
      messages: channel.messages,
      modifiedOn: channel.modifiedOn,
      createdOn: channel.createdOn
    }

    return result
  })

export type {
  CreateChannelResult,
  DeleteChannelResult,
  ListChannelMessagesResult,
  ListDirectMessagesResult,
  SendChannelMessageResult,
  UpdateChannelResult
}

// --- Create Channel ---

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
      toRef<Space>(channelId),
      channelData,
      channelId
    )

    return { id: ChannelId.make(channelId), name: ChannelName.make(params.name) }
  })

// --- Update Channel ---

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
      return { id: ChannelId.make(channel._id), updated: false }
    }

    yield* client.updateDoc(
      chunter.class.Channel,
      toRef<Space>(channel._id),
      channel._id,
      updateOps
    )

    return { id: ChannelId.make(channel._id), updated: true }
  })

// --- Delete Channel ---

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
      toRef<Space>(channel._id),
      channel._id
    )

    return { id: ChannelId.make(channel._id), deleted: true }
  })

// --- List Channel Messages ---

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
        id: MessageId.make(msg._id),
        body: markupToMarkdownString(msg.message),
        sender: senderName !== undefined ? PersonName.make(senderName) : undefined,
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

    return { id: MessageId.make(messageId), channelId: ChannelId.make(channel._id) }
  })

// --- List Direct Messages ---

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
        .map((n) => PersonName.make(n))

      const participantIds = members.map((m) => AccountUuid.make(m))

      return {
        id: ChannelId.make(dm._id),
        participants,
        participantIds,
        messages: dm.messages,
        modifiedOn: dm.modifiedOn
      }
    })

    return { conversations: summaries, total }
  })
