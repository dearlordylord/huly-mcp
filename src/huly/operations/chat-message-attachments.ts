import type { Class, Doc, Ref, Space } from "@hcengineering/core"
import { Effect } from "effect"

import type {
  AddChatMessageAttachmentResult,
  DeleteChatMessageAttachmentResult,
  GetChatMessageAttachmentResult,
  ListChatMessageAttachmentsResult,
  UpdateChatMessageAttachmentResult
} from "../../domain/schemas/chat-message-attachment-results.js"
import type {
  AddChatMessageAttachmentParams,
  ChatMessageAttachmentTarget,
  DeleteChatMessageAttachmentParams,
  GetChatMessageAttachmentParams,
  ListChatMessageAttachmentsParams,
  UpdateChatMessageAttachmentParams
} from "../../domain/schemas/chat-message-attachments.js"
import type { AttachmentId } from "../../domain/schemas/shared.js"
import {
  ChannelId,
  ChannelName,
  DocId,
  MessageId,
  NonEmptyString,
  ObjectClassName,
  SpaceId,
  ThreadReplyId
} from "../../domain/schemas/shared.js"
import type { HulyClient } from "../client.js"
import type { Diagnostics } from "../diagnostics.js"
import type { HulyDomainError } from "../errors.js"
import { ChatMessageAttachmentNotFoundError, HulyError } from "../errors.js"
import { attachment, chunter } from "../huly-plugins.js"
import { HulyStorageClient } from "../storage.js"
import {
  type AttachmentCollectionScope,
  findAttachmentForScope,
  getAttachmentForScope,
  listAttachmentPageForScope,
  updateAttachmentForScope
} from "./attachments-shared.js"
import { uploadAndAttach } from "./attachments-upload.js"
import { findChannelMessage } from "./channel-messages-shared.js"
import { findDirectMessageMessage } from "./direct-messages.js"
import { toRef } from "./sdk-boundary.js"
import { findThreadReply } from "./thread-replies-shared.js"

interface ResolvedChatAttachmentTarget {
  readonly client: HulyClient["Type"]
  readonly target: ListChatMessageAttachmentsResult["target"]
  readonly space: Ref<Space>
  readonly objectId: Ref<Doc>
  readonly objectClass: Ref<Class<Doc>>
  readonly collection: "attachments"
}

const chatMessageScope = (target: ResolvedChatAttachmentTarget): AttachmentCollectionScope => ({
  classRef: attachment.class.Attachment,
  attachedTo: target.objectId,
  attachedToClass: target.objectClass,
  collection: target.collection
})

const channelMessageDisplay = (messageId: MessageId, channelName: string): NonEmptyString =>
  NonEmptyString.make(`channel message '${messageId}' in channel '${channelName}'`)

const dmMessageDisplay = (messageId: MessageId, dmId: ChannelId): NonEmptyString =>
  NonEmptyString.make(`DM message '${messageId}' in direct message '${dmId}'`)

const threadReplyDisplay = (replyId: ThreadReplyId, messageId: MessageId, channelName: string): NonEmptyString =>
  NonEmptyString.make(`thread reply '${replyId}' on message '${messageId}' in channel '${channelName}'`)

const targetCoordinates = (
  space: Ref<Space>,
  objectId: Ref<Doc>,
  objectClass: Ref<Class<Doc>>
) => ({
  space,
  objectId,
  objectClass,
  collection: "attachments" as const,
  spaceId: SpaceId.make(space),
  docId: DocId.make(objectId),
  className: ObjectClassName.make(objectClass)
})

const resolveChannelMessageTarget = (
  target: Extract<ChatMessageAttachmentTarget, { readonly kind: "channel_message" }>
): Effect.Effect<ResolvedChatAttachmentTarget, HulyDomainError, HulyClient> =>
  Effect.gen(function*() {
    const { channel, client, message } = yield* findChannelMessage(target)
    const messageId = MessageId.make(message._id)
    const coordinates = targetCoordinates(
      message.space,
      toRef<Doc>(DocId.make(message._id)),
      toRef<Class<Doc>>(chunter.class.ChatMessage)
    )
    return {
      client,
      space: coordinates.space,
      objectId: coordinates.objectId,
      objectClass: coordinates.objectClass,
      collection: coordinates.collection,
      target: {
        kind: "channel_message",
        channelId: ChannelId.make(channel._id),
        channelName: ChannelName.make(channel.name),
        messageId,
        display: channelMessageDisplay(messageId, channel.name),
        space: coordinates.spaceId,
        objectId: coordinates.docId,
        objectClass: coordinates.className,
        collection: coordinates.collection
      }
    }
  })

const resolveDmMessageTarget = (
  target: Extract<ChatMessageAttachmentTarget, { readonly kind: "dm_message" }>
): Effect.Effect<ResolvedChatAttachmentTarget, HulyDomainError, HulyClient> =>
  Effect.gen(function*() {
    const { client, dm, message } = yield* findDirectMessageMessage(target)
    const messageId = MessageId.make(message._id)
    const dmId = ChannelId.make(dm._id)
    const coordinates = targetCoordinates(
      message.space,
      toRef<Doc>(DocId.make(message._id)),
      toRef<Class<Doc>>(chunter.class.ChatMessage)
    )
    return {
      client,
      space: coordinates.space,
      objectId: coordinates.objectId,
      objectClass: coordinates.objectClass,
      collection: coordinates.collection,
      target: {
        kind: "dm_message",
        dmId,
        messageId,
        display: dmMessageDisplay(messageId, dmId),
        space: coordinates.spaceId,
        objectId: coordinates.docId,
        objectClass: coordinates.className,
        collection: coordinates.collection
      }
    }
  })

const resolveThreadReplyTarget = (
  target: Extract<ChatMessageAttachmentTarget, { readonly kind: "thread_reply" }>
): Effect.Effect<ResolvedChatAttachmentTarget, HulyDomainError, HulyClient> =>
  Effect.gen(function*() {
    const { channel, client, message } = yield* findChannelMessage(target)
    const reply = yield* findThreadReply(client, channel, message, target.replyId)
    const messageId = MessageId.make(message._id)
    const replyId = ThreadReplyId.make(reply._id)
    const coordinates = targetCoordinates(
      reply.space,
      toRef<Doc>(DocId.make(reply._id)),
      toRef<Class<Doc>>(chunter.class.ThreadMessage)
    )
    return {
      client,
      space: coordinates.space,
      objectId: coordinates.objectId,
      objectClass: coordinates.objectClass,
      collection: coordinates.collection,
      target: {
        kind: "thread_reply",
        channelId: ChannelId.make(channel._id),
        channelName: ChannelName.make(channel.name),
        messageId,
        replyId,
        display: threadReplyDisplay(replyId, messageId, channel.name),
        space: coordinates.spaceId,
        objectId: coordinates.docId,
        objectClass: coordinates.className,
        collection: coordinates.collection
      }
    }
  })

const resolveChatAttachmentTarget = (
  target: ChatMessageAttachmentTarget
): Effect.Effect<ResolvedChatAttachmentTarget, HulyDomainError, HulyClient> => {
  switch (target.kind) {
    case "channel_message":
      return resolveChannelMessageTarget(target)
    case "dm_message":
      return resolveDmMessageTarget(target)
    case "thread_reply":
      return resolveThreadReplyTarget(target)
  }
}

const scopedAttachmentNotFound = (
  target: ResolvedChatAttachmentTarget,
  attachmentId: AttachmentId
) =>
  new ChatMessageAttachmentNotFoundError({
    target: target.target.display,
    attachmentId
  })

const removeChatAttachment = (
  target: ResolvedChatAttachmentTarget,
  attachmentId: AttachmentId
): Effect.Effect<void, HulyDomainError> =>
  Effect.gen(function*() {
    const media = yield* findAttachmentForScope(target.client, attachmentId, chatMessageScope(target)).pipe(
      Effect.catchTag("AttachmentNotFoundError", () => scopedAttachmentNotFound(target, attachmentId))
    )
    const removeCollection = target.client.removeCollection
    if (removeCollection === undefined) {
      return yield* new HulyError({ message: "Huly client does not support removeCollection" })
    }
    yield* removeCollection(
      attachment.class.Attachment,
      media.space,
      media._id,
      target.objectId,
      target.objectClass,
      target.collection
    )
  })

export const listChatMessageAttachments = (
  params: ListChatMessageAttachmentsParams
): Effect.Effect<ListChatMessageAttachmentsResult, HulyDomainError, HulyClient | Diagnostics> =>
  Effect.gen(function*() {
    const target = yield* resolveChatAttachmentTarget(params.target)
    const page = yield* listAttachmentPageForScope(target.client, chatMessageScope(target), params.limit)
    return { target: target.target, attachments: page.attachments, total: page.total }
  })

export const getChatMessageAttachment = (
  params: GetChatMessageAttachmentParams
): Effect.Effect<GetChatMessageAttachmentResult, HulyDomainError, HulyClient | HulyStorageClient | Diagnostics> =>
  Effect.gen(function*() {
    const storageClient = yield* HulyStorageClient
    const target = yield* resolveChatAttachmentTarget(params.target)
    const attachmentResult = yield* getAttachmentForScope(
      target.client,
      storageClient,
      params.attachmentId,
      chatMessageScope(target)
    ).pipe(
      Effect.catchTag("AttachmentNotFoundError", () => scopedAttachmentNotFound(target, params.attachmentId))
    )
    return { target: target.target, attachment: attachmentResult }
  })

export const addChatMessageAttachment = (
  params: AddChatMessageAttachmentParams
): Effect.Effect<AddChatMessageAttachmentResult, HulyDomainError, HulyClient | HulyStorageClient | Diagnostics> =>
  Effect.gen(function*() {
    const target = yield* resolveChatAttachmentTarget(params.target)
    const result = yield* uploadAndAttach(params, {
      spaceRef: target.space,
      objectRef: target.objectId,
      objectClassRef: target.objectClass,
      attachmentClassRef: attachment.class.Attachment,
      collection: target.collection
    })
    return {
      target: target.target,
      attachmentId: result.attachmentId,
      blobId: result.blobId,
      url: result.url
    }
  })

export const updateChatMessageAttachment = (
  params: UpdateChatMessageAttachmentParams
): Effect.Effect<UpdateChatMessageAttachmentResult, HulyDomainError, HulyClient | Diagnostics> =>
  Effect.gen(function*() {
    const target = yield* resolveChatAttachmentTarget(params.target)
    yield* updateAttachmentForScope(
      target.client,
      params.attachmentId,
      params,
      chatMessageScope(target)
    ).pipe(
      Effect.catchTag("AttachmentNotFoundError", () => scopedAttachmentNotFound(target, params.attachmentId))
    )
    return { target: target.target, attachmentId: params.attachmentId, updated: true }
  })

export const deleteChatMessageAttachment = (
  params: DeleteChatMessageAttachmentParams
): Effect.Effect<DeleteChatMessageAttachmentResult, HulyDomainError, HulyClient | Diagnostics> =>
  Effect.gen(function*() {
    const target = yield* resolveChatAttachmentTarget(params.target)
    yield* removeChatAttachment(target, params.attachmentId)
    return { target: target.target, attachmentId: params.attachmentId, deleted: true }
  })
