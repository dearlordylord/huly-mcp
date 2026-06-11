/**
 * Messaging domain errors: channels, messages, threads, reactions, saved messages.
 *
 * @module
 */
import { Schema } from "effect"

import { Count } from "../domain/schemas/shared.js"

const MIN_AMBIGUOUS_DM_MATCHES = 2
const AmbiguousMatchCount = Count.pipe(Schema.greaterThanOrEqualTo(MIN_AMBIGUOUS_DM_MATCHES))

/**
 * Channel not found in the workspace.
 */
export class ChannelNotFoundError extends Schema.TaggedError<ChannelNotFoundError>()(
  "ChannelNotFoundError",
  {
    identifier: Schema.String
  }
) {
  override get message(): string {
    return `Channel '${this.identifier}' not found`
  }
}

/**
 * Direct-message conversation not found in the workspace.
 *
 * Raised when a `dm` identifier (DM `_id` or participant display name) does
 * not resolve to an existing DM the authenticated account is a member of.
 */
export class DirectMessageNotFoundError extends Schema.TaggedError<DirectMessageNotFoundError>()(
  "DirectMessageNotFoundError",
  {
    identifier: Schema.String
  }
) {
  override get message(): string {
    return `Direct message '${this.identifier}' not found`
  }
}

/**
 * Direct-message participant name resolves to more than one conversation.
 */
export class DirectMessageIdentifierAmbiguousError extends Schema.TaggedError<DirectMessageIdentifierAmbiguousError>()(
  "DirectMessageIdentifierAmbiguousError",
  {
    identifier: Schema.String,
    matches: AmbiguousMatchCount
  }
) {
  override get message(): string {
    return `Direct message '${this.identifier}' is ambiguous (${this.matches} matches); use the DM _id`
  }
}

/**
 * Caller attempted to open a direct-message conversation with themselves.
 *
 * Huly models a one-to-one DM as a space whose `members` are the authenticated
 * account and one other account; a self-DM has only one member and is rejected
 * upfront rather than producing a malformed space.
 */
export class CannotDirectMessageSelfError extends Schema.TaggedError<CannotDirectMessageSelfError>()(
  "CannotDirectMessageSelfError",
  {
    identifier: Schema.String
  }
) {
  override get message(): string {
    return `Cannot start a direct-message conversation with yourself ('${this.identifier}')`
  }
}

/**
 * Group direct-message creation needs at least two other workspace members.
 */
export class DirectMessageParticipantCountError extends Schema.TaggedError<DirectMessageParticipantCountError>()(
  "DirectMessageParticipantCountError",
  {
    requested: Count,
    nonSelfParticipants: Count
  }
) {
  override get message(): string {
    return `Group direct messages require at least two non-self participants; got ${this.nonSelfParticipants} after resolving ${this.requested} requested people`
  }
}

/**
 * Resolved Person has no Huly workspace account.
 *
 * DMs are addressed by `AccountUuid`, which is populated only on the Employee
 * mixin (`contact.mixin.Employee.personUuid`). External contacts and persons
 * who haven't accepted a workspace invite have no account and cannot be DM'd.
 *
 * Upstream reference: only Employees with `personUuid` set are returned by
 * Huly's account services, so DM membership lists are constructed from those.
 * See `@hcengineering/chunter/src/utils.ts#getDirectChannel`.
 */
export class PersonNotAnEmployeeError extends Schema.TaggedError<PersonNotAnEmployeeError>()(
  "PersonNotAnEmployeeError",
  {
    identifier: Schema.String
  }
) {
  override get message(): string {
    return `Person '${this.identifier}' is not a workspace member (no Huly account) and cannot receive direct messages`
  }
}

/**
 * Archived channels cannot accept membership mutations.
 */
export class ChannelArchivedError extends Schema.TaggedError<ChannelArchivedError>()(
  "ChannelArchivedError",
  {
    channel: Schema.String
  }
) {
  override get message(): string {
    return `Channel '${this.channel}' is archived; unarchive it before changing members`
  }
}

/**
 * Channel member removal cannot leave a channel empty.
 */
export class ChannelLastMemberRemovalError extends Schema.TaggedError<ChannelLastMemberRemovalError>()(
  "ChannelLastMemberRemovalError",
  {
    channel: Schema.String
  }
) {
  override get message(): string {
    return `Cannot remove the last member from channel '${this.channel}'`
  }
}

/**
 * Channel member removal cannot leave a channel with no remaining owner.
 */
export class ChannelLastOwnerRemovalError extends Schema.TaggedError<ChannelLastOwnerRemovalError>()(
  "ChannelLastOwnerRemovalError",
  {
    channel: Schema.String
  }
) {
  override get message(): string {
    return `Cannot remove channel members because channel '${this.channel}' would have no remaining owner`
  }
}

/**
 * Message not found in the channel.
 */
export class MessageNotFoundError extends Schema.TaggedError<MessageNotFoundError>()(
  "MessageNotFoundError",
  {
    messageId: Schema.String,
    channel: Schema.String
  }
) {
  override get message(): string {
    return `Message '${this.messageId}' not found in channel '${this.channel}'`
  }
}

/**
 * Thread reply not found.
 */
export class ThreadReplyNotFoundError extends Schema.TaggedError<ThreadReplyNotFoundError>()(
  "ThreadReplyNotFoundError",
  {
    replyId: Schema.String,
    messageId: Schema.String
  }
) {
  override get message(): string {
    return `Thread reply '${this.replyId}' not found on message '${this.messageId}'`
  }
}

/**
 * Activity message not found.
 */
export class ActivityMessageNotFoundError extends Schema.TaggedError<ActivityMessageNotFoundError>()(
  "ActivityMessageNotFoundError",
  {
    messageId: Schema.String
  }
) {
  override get message(): string {
    return `Activity message '${this.messageId}' not found`
  }
}

/**
 * Reaction not found on message.
 */
export class ReactionNotFoundError extends Schema.TaggedError<ReactionNotFoundError>()(
  "ReactionNotFoundError",
  {
    messageId: Schema.String,
    emoji: Schema.String
  }
) {
  override get message(): string {
    return `Reaction '${this.emoji}' not found on message '${this.messageId}'`
  }
}

/**
 * Saved message not found.
 */
export class SavedMessageNotFoundError extends Schema.TaggedError<SavedMessageNotFoundError>()(
  "SavedMessageNotFoundError",
  {
    messageId: Schema.String
  }
) {
  override get message(): string {
    return `Saved message for '${this.messageId}' not found`
  }
}
