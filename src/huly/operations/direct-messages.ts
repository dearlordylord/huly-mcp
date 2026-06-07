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
  type Data,
  type DocumentUpdate,
  generateId,
  type Ref,
  SortingOrder,
  type Space
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
import {
  ChannelId,
  Count,
  type DirectMessageIdentifier,
  MessageId,
  type PersonRefInput
} from "../../domain/schemas/shared.js"
import { HulyClient, type HulyClientError } from "../client.js"
import type { PersonIdentifierAmbiguousError, PersonNotAnEmployeeError, PersonNotFoundError } from "../errors.js"
import {
  CannotDirectMessageSelfError,
  DirectMessageIdentifierAmbiguousError,
  DirectMessageNotFoundError,
  MessageNotFoundError
} from "../errors.js"
import { buildSocialIdToPersonNameMap } from "./channels.js"
import { resolveEmployeeAccountUuid } from "./contacts-shared.js"
import { listTotal, optionalCount } from "./counts.js"
import { markdownToMarkupString, markupToMarkdownString } from "./markup.js"
import { clampLimit } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"

import { chunter, contact, core } from "../huly-plugins.js"

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

type CreateDirectMessageError =
  | HulyClientError
  | PersonIdentifierAmbiguousError
  | PersonNotFoundError
  | PersonNotAnEmployeeError
  | CannotDirectMessageSelfError

// --- Helpers ---

const sortedMemberPair = (first: HulyAccountUuid, second: HulyAccountUuid): Array<HulyAccountUuid> =>
  [first, second].sort()

const hasExactMembers = (dm: HulyDirectMessage, sortedMembers: ReadonlyArray<HulyAccountUuid>): boolean => {
  const dmMembers = [...dm.members].sort()
  return dmMembers.length === sortedMembers.length
    && sortedMembers.every((member, index) => dmMembers[index] === member)
}

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
          .filter((u) => u !== undefined)
          .filter((u) => u !== accountUuid)
      )
    ]

    if (accountUuids.length === 0) {
      return yield* new DirectMessageNotFoundError({ identifier })
    }

    const directMessages = yield* client.findAll<HulyDirectMessage>(
      chunter.class.DirectMessage,
      { members: accountUuid }
    )

    const memberPairs = accountUuids.map((candidate) => sortedMemberPair(accountUuid, candidate))
    const matches = directMessages.filter((dm) => memberPairs.some((members) => hasExactMembers(dm, members)))

    if (matches.length === 0) {
      return yield* new DirectMessageNotFoundError({ identifier })
    }

    if (matches.length > 1) {
      return yield* new DirectMessageIdentifierAmbiguousError({ identifier, matches: Count.make(matches.length) })
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
        sender: senderName,
        senderId: msg.modifiedBy,
        createdOn: msg.createdOn,
        modifiedOn: msg.modifiedOn,
        editedOn: msg.editedOn,
        replies: optionalCount(msg.replies)
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

    const members = sortedMemberPair(me, other)
    const existing = existingDms.find((dm) => hasExactMembers(dm, members))

    if (existing !== undefined) {
      return { id: ChannelId.make(existing._id), created: false }
    }

    const dmId: Ref<HulyDirectMessage> = generateId()
    const dmData: Data<HulyDirectMessage> = {
      name: "",
      description: "",
      private: true,
      archived: false,
      members
    }

    yield* client.createDoc(
      chunter.class.DirectMessage,
      toRef<Space>(core.space.Space),
      dmData,
      dmId
    )

    return { id: ChannelId.make(dmId), created: true }
  })
