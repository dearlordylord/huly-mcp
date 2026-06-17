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
  CreateDirectMessageParams,
  CreateDirectMessageResult,
  DeleteDmMessageParams,
  DeleteDmMessageResult,
  ListDmMessagesParams,
  ListDmMessagesResult,
  SendDmMessageParams,
  SendDmMessageResult,
  UpdateDmMessageParams,
  UpdateDmMessageResult
} from "../../domain/schemas/direct-messages.js"
import { ChannelId, type DirectMessageIdentifier, MessageId, type PersonRefInput } from "../../domain/schemas/shared.js"
import { HulyClient, type HulyClientError } from "../client.js"
import type { PersonIdentifierAmbiguousError, PersonNotAnEmployeeError, PersonNotFoundError } from "../errors.js"
import { CannotDirectMessageSelfError, MessageNotFoundError } from "../errors.js"
import { buildSocialIdToPersonNameMap } from "./channels.js"
import { resolveEmployeeAccountUuid } from "./contacts-shared.js"
import { listTotal, optionalCount } from "./counts.js"
import {
  createDirectMessageSpace,
  findDirectMessage,
  type FindDirectMessageError,
  hasExactDirectMessageMembers,
  sortedDirectMessageMembers
} from "./direct-message-shared.js"
import { markdownToMarkupString, markupToMarkdownString } from "./markup.js"
import { clampLimit } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"

import { chunter } from "../huly-plugins.js"

export { findDirectMessage } from "./direct-message-shared.js"

// --- Error Types ---

type ListDmMessagesError = FindDirectMessageError

type SendDmMessageError = FindDirectMessageError

type UpdateDmMessageError =
  | FindDirectMessageError
  | MessageNotFoundError

type DeleteDmMessageError = UpdateDmMessageError

type CreateDirectMessageError =
  | HulyClientError
  | PersonIdentifierAmbiguousError
  | PersonNotFoundError
  | PersonNotAnEmployeeError
  | CannotDirectMessageSelfError

// --- Helpers ---

export const findDirectMessageMessage = (
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
        sender: senderName,
        senderId: msg.modifiedBy,
        createdOn: msg.createdOn,
        modifiedOn: msg.modifiedOn,
        editedOn: msg.editedOn,
        replies: optionalCount(msg.replies),
        attachments: optionalCount(msg.attachments)
      }
    })

    return { messages: summaries, total: listTotal(total) }
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

/**
 * Resolve a person identifier (email or display name) to the `AccountUuid`
 * carried on the `contact.mixin.Employee` mixin. DMs are addressed by account
 * UUID; non-employee Persons (external contacts, unaccepted invites) have no
 * `personUuid` and cannot be DM'd.
 */
const resolveEmployeeAccount = (
  identifier: PersonRefInput
): Effect.Effect<
  HulyAccountUuid,
  HulyClientError | PersonIdentifierAmbiguousError | PersonNotFoundError | PersonNotAnEmployeeError,
  HulyClient
> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    return yield* resolveEmployeeAccountUuid(client, identifier)
  })

/**
 * Open a one-to-one direct-message conversation with another workspace member.
 *
 * Idempotent: if a one-to-one DM whose members are the authenticated account
 * and the resolved participant already exists, it is returned with
 * `created: false` and no new space is created. Otherwise a new DM is created
 * with `members: [me, other].sort()` to match Huly's convention.
 *
 * Mirrors `getDirectChannel` in upstream Huly's chunter plugin:
 * https://github.com/hcengineering/platform/blob/main/plugins/chunter/src/utils.ts
 */
export const createDirectMessage = (
  params: CreateDirectMessageParams
): Effect.Effect<CreateDirectMessageResult, CreateDirectMessageError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const me = client.getAccountUuid()

    const other = yield* resolveEmployeeAccount(params.person)
    if (other === me) {
      return yield* new CannotDirectMessageSelfError({ identifier: params.person })
    }

    const existingDms = yield* client.findAll<HulyDirectMessage>(
      chunter.class.DirectMessage,
      { members: me }
    )

    const members = sortedDirectMessageMembers(me, other)
    const existing = existingDms.find((dm) => hasExactDirectMessageMembers(dm, members))

    if (existing !== undefined) {
      return { id: ChannelId.make(existing._id), created: false }
    }

    const dmId = yield* createDirectMessageSpace(client, members)
    return { id: ChannelId.make(dmId), created: true }
  })
