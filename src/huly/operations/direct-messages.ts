/**
 * Direct-message conversation operations: list / send / update / delete
 * messages in a Huly DM conversation.
 *
 * A DM `dm` identifier accepts either:
 * - the DM `_id` (an opaque chunter Space ref), or
 * - a participant display name (e.g. `Kerr,Shannon`) — resolved to the
 *   one-to-one DM whose `members` are the authenticated account and the named
 *   person's AccountUuid.
 *
 * @module
 */
import type { ChatMessage, DirectMessage as HulyDirectMessage } from "@hcengineering/chunter"
import type { Employee as HulyEmployee } from "@hcengineering/contact"
import {
  type AccountUuid as HulyAccountUuid,
  type AttachedData,
  type DocumentUpdate,
  generateId,
  type Ref,
  SortingOrder
} from "@hcengineering/core"
import { Clock, Effect } from "effect"

import type { MessageSummary } from "../../domain/schemas/channels.js"
import type {
  DeleteDmMessageParams,
  DeleteDmMessageResult,
  ListDmMessagesParams,
  ListDmMessagesResult,
  SendDmMessageParams,
  SendDmMessageResult,
  UpdateDmMessageParams,
  UpdateDmMessageResult
} from "../../domain/schemas/direct-messages.js"
import { ChannelId, type DirectMessageIdentifier, MessageId, PersonName } from "../../domain/schemas/shared.js"
import { HulyClient, type HulyClientError } from "../client.js"
import { DirectMessageIdentifierAmbiguousError, DirectMessageNotFoundError, MessageNotFoundError } from "../errors.js"
import { buildSocialIdToPersonNameMap } from "./channels.js"
import { markdownToMarkupString, markupToMarkdownString } from "./markup.js"
import { clampLimit } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"

import { chunter, contact } from "../huly-plugins.js"

// --- Error Types ---

type FindDirectMessageError =
  | HulyClientError
  | DirectMessageIdentifierAmbiguousError
  | DirectMessageNotFoundError

type ListDmMessagesError = FindDirectMessageError

type SendDmMessageError = FindDirectMessageError

type UpdateDmMessageError =
  | FindDirectMessageError
  | MessageNotFoundError

type DeleteDmMessageError = UpdateDmMessageError

// --- Helpers ---

const ONE_TO_ONE_DM_MEMBER_COUNT = 2

/**
 * Resolve a `dm` identifier to a Huly DirectMessage document.
 *
 * Resolution order:
 * 1. Treat the identifier as a DM `_id`. If a DM with that ref exists, return it.
 * 2. Treat the identifier as a participant display name. Look up Employees with
 *    that exact name to obtain candidate AccountUuids, then find the one-to-one
 *    DM whose members are exactly the authenticated account and one candidate.
 *
 * If neither lookup yields a hit, fail with `DirectMessageNotFoundError`.
 */
export const findDirectMessage = (
  identifier: DirectMessageIdentifier
): Effect.Effect<
  { client: HulyClient["Type"]; dm: HulyDirectMessage },
  FindDirectMessageError,
  HulyClient
> =>
  Effect.gen(function*() {
    const client = yield* HulyClient

    const byId = yield* client.findOne<HulyDirectMessage>(
      chunter.class.DirectMessage,
      { _id: toRef<HulyDirectMessage>(identifier) }
    )

    if (byId !== undefined) {
      if (!byId.members.includes(client.getAccountUuid())) {
        return yield* new DirectMessageNotFoundError({ identifier })
      }
      return { client, dm: byId }
    }

    const employees = yield* client.findAll<HulyEmployee>(
      contact.mixin.Employee,
      { name: identifier }
    )

    const accountUuid = client.getAccountUuid()
    const accountUuids = [
      ...new Set(
        employees
          .map((e) => e.personUuid)
          .filter((u): u is HulyAccountUuid => u !== undefined && u !== accountUuid)
      )
    ]

    if (accountUuids.length === 0) {
      return yield* new DirectMessageNotFoundError({ identifier })
    }

    const directMessages = yield* client.findAll<HulyDirectMessage>(
      chunter.class.DirectMessage,
      { members: accountUuid }
    )

    const matches = directMessages.filter((dm) =>
      dm.members.length === ONE_TO_ONE_DM_MEMBER_COUNT
      && dm.members.includes(accountUuid)
      && accountUuids.some((candidate) => dm.members.includes(candidate))
    )

    if (matches.length === 0) {
      return yield* new DirectMessageNotFoundError({ identifier })
    }

    if (matches.length > 1) {
      return yield* new DirectMessageIdentifierAmbiguousError({ identifier, matches: matches.length })
    }

    return { client, dm: matches[0] }
  })

const findDirectMessageMessage = (
  params: { dm: DirectMessageIdentifier; messageId: MessageId }
): Effect.Effect<
  { client: HulyClient["Type"]; dm: HulyDirectMessage; message: ChatMessage },
  FindDirectMessageError | MessageNotFoundError,
  HulyClient
> =>
  Effect.gen(function*() {
    const { client, dm } = yield* findDirectMessage(params.dm)

    const message = yield* client.findOne<ChatMessage>(
      chunter.class.ChatMessage,
      {
        _id: toRef<ChatMessage>(params.messageId),
        space: dm._id
      }
    )

    if (message === undefined) {
      return yield* new MessageNotFoundError({
        messageId: params.messageId,
        channel: params.dm
      })
    }

    return { client, dm, message }
  })

// --- Operations ---

/**
 * List messages in a DM conversation, newest first.
 */
export const listDirectMessageMessages = (
  params: ListDmMessagesParams
): Effect.Effect<ListDmMessagesResult, ListDmMessagesError, HulyClient> =>
  Effect.gen(function*() {
    const { client, dm } = yield* findDirectMessage(params.dm)
    const markupUrlConfig = client.markupUrlConfig

    const limit = clampLimit(params.limit)

    const messages = yield* client.findAll<ChatMessage>(
      chunter.class.ChatMessage,
      { space: dm._id },
      {
        limit,
        sort: { createdOn: SortingOrder.Descending }
      }
    )

    const total = messages.total

    const uniqueSocialIds = [
      ...new Set(messages.map((msg) => msg.modifiedBy))
    ]

    const socialIdToName = yield* buildSocialIdToPersonNameMap(client, uniqueSocialIds)

    const summaries: Array<MessageSummary> = messages.map((msg) => {
      const senderName = socialIdToName.get(msg.modifiedBy)
      return {
        id: MessageId.make(msg._id),
        body: markupToMarkdownString(msg.message, markupUrlConfig),
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

/**
 * Send a message to a DM conversation.
 */
export const sendDirectMessage = (
  params: SendDmMessageParams
): Effect.Effect<SendDmMessageResult, SendDmMessageError, HulyClient> =>
  Effect.gen(function*() {
    const { client, dm } = yield* findDirectMessage(params.dm)
    const markupUrlConfig = client.markupUrlConfig

    const messageId: Ref<ChatMessage> = generateId()
    const markup = markdownToMarkupString(params.body, markupUrlConfig)

    const messageData: AttachedData<ChatMessage> = {
      message: markup,
      attachments: 0
    }

    yield* client.addCollection(
      chunter.class.ChatMessage,
      dm._id,
      dm._id,
      chunter.class.DirectMessage,
      "messages",
      messageData,
      messageId
    )

    return { id: MessageId.make(messageId), dmId: ChannelId.make(dm._id) }
  })

/**
 * Update an existing DM message. Only the body can be modified.
 */
export const updateDirectMessage = (
  params: UpdateDmMessageParams
): Effect.Effect<UpdateDmMessageResult, UpdateDmMessageError, HulyClient> =>
  Effect.gen(function*() {
    const { client, dm, message } = yield* findDirectMessageMessage(params)
    const markupUrlConfig = client.markupUrlConfig

    const markup = markdownToMarkupString(params.body, markupUrlConfig)

    const now = yield* Clock.currentTimeMillis
    const updateOps: DocumentUpdate<ChatMessage> = {
      message: markup,
      editedOn: now
    }

    yield* client.updateDoc(
      chunter.class.ChatMessage,
      dm._id,
      message._id,
      updateOps
    )

    return { id: MessageId.make(message._id), updated: true }
  })

/**
 * Permanently delete a DM message.
 */
export const deleteDirectMessage = (
  params: DeleteDmMessageParams
): Effect.Effect<DeleteDmMessageResult, DeleteDmMessageError, HulyClient> =>
  Effect.gen(function*() {
    const { client, dm, message } = yield* findDirectMessageMessage(params)

    yield* client.removeDoc(
      chunter.class.ChatMessage,
      dm._id,
      message._id
    )

    return { id: MessageId.make(message._id), deleted: true }
  })
