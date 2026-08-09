import { Schema } from "effect"

import {
  ActivityMessageNotFoundError,
  ActivityRecordInvalidError,
  CannotDirectMessageSelfError,
  ChannelArchivedError,
  ChannelLastMemberRemovalError,
  ChannelLastOwnerRemovalError,
  ChannelNotFoundError,
  ChatMessageAttachmentNotFoundError,
  DirectMessageIdentifierAmbiguousError,
  DirectMessageNotFoundError,
  DirectMessageParticipantCountError,
  MessageNotFoundError,
  PersonNotAnEmployeeError,
  ReactionNotFoundError,
  SavedMessageNotFoundError,
  TelegramChannelIdentifierAmbiguousError,
  ThreadReplyNotFoundError
} from "./errors-messaging.js"

export const HulyMessagingDomainError = Schema.Union(
  ChannelNotFoundError,
  ChannelArchivedError,
  ChannelLastMemberRemovalError,
  ChannelLastOwnerRemovalError,
  CannotDirectMessageSelfError,
  DirectMessageIdentifierAmbiguousError,
  DirectMessageNotFoundError,
  DirectMessageParticipantCountError,
  MessageNotFoundError,
  ChatMessageAttachmentNotFoundError,
  PersonNotAnEmployeeError,
  ThreadReplyNotFoundError,
  ActivityMessageNotFoundError,
  ActivityRecordInvalidError,
  ReactionNotFoundError,
  SavedMessageNotFoundError,
  TelegramChannelIdentifierAmbiguousError
)
