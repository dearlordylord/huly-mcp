import { JSONSchema, Schema } from "effect"

import { CommentSchema } from "./comments.js"
import { HULY_NATIVE_REFERENCE_MARKDOWN_INPUT } from "./document-native-references.js"
import {
  CardId,
  CardIdentifier,
  CardSpaceIdentifier,
  CommentId,
  Count,
  DEFAULT_LIMIT,
  LimitParam,
  NonEmptyString
} from "./shared.js"

const CardCommentTargetFields = {
  cardSpace: CardSpaceIdentifier.annotations({
    description: "Card space name or ID"
  }),
  card: CardIdentifier.annotations({
    description: "Card title or ID"
  })
} as const

export const ListCardCommentsParamsSchema = Schema.Struct({
  ...CardCommentTargetFields,
  limit: Schema.optional(
    LimitParam.annotations({
      description: `Maximum number of comments to return (default: ${DEFAULT_LIMIT})`
    })
  )
}).annotations({
  title: "ListCardCommentsParams",
  description: "Parameters for listing comments on a card"
})

export type ListCardCommentsParams = Schema.Schema.Type<typeof ListCardCommentsParamsSchema>

export const AddCardCommentParamsSchema = Schema.Struct({
  ...CardCommentTargetFields,
  body: NonEmptyString.annotations({
    description: `Comment body in markdown. ${HULY_NATIVE_REFERENCE_MARKDOWN_INPUT}`
  })
}).annotations({
  title: "AddCardCommentParams",
  description: "Parameters for adding a comment to a card"
})

export type AddCardCommentParams = Schema.Schema.Type<typeof AddCardCommentParamsSchema>

export const UpdateCardCommentParamsSchema = Schema.Struct({
  ...CardCommentTargetFields,
  commentId: CommentId.annotations({
    description: "Comment ID to update"
  }),
  body: NonEmptyString.annotations({
    description: `New comment body in markdown. ${HULY_NATIVE_REFERENCE_MARKDOWN_INPUT}`
  })
}).annotations({
  title: "UpdateCardCommentParams",
  description: "Parameters for updating a card comment"
})

export type UpdateCardCommentParams = Schema.Schema.Type<typeof UpdateCardCommentParamsSchema>

export const DeleteCardCommentParamsSchema = Schema.Struct({
  ...CardCommentTargetFields,
  commentId: CommentId.annotations({
    description: "Comment ID to delete"
  })
}).annotations({
  title: "DeleteCardCommentParams",
  description: "Parameters for deleting a card comment"
})

export type DeleteCardCommentParams = Schema.Schema.Type<typeof DeleteCardCommentParamsSchema>

export const ListCardCommentsResultSchema = Schema.Struct({
  cardId: CardId,
  comments: Schema.Array(CommentSchema),
  total: Count
})
export type ListCardCommentsResult = Schema.Schema.Type<typeof ListCardCommentsResultSchema>

export const AddCardCommentResultSchema = Schema.Struct({
  cardId: CardId,
  commentId: CommentId
})
export type AddCardCommentResult = Schema.Schema.Type<typeof AddCardCommentResultSchema>

export const UpdateCardCommentResultSchema = Schema.Struct({
  cardId: CardId,
  commentId: CommentId,
  updated: Schema.Boolean
})
export type UpdateCardCommentResult = Schema.Schema.Type<typeof UpdateCardCommentResultSchema>

export const DeleteCardCommentResultSchema = Schema.Struct({
  cardId: CardId,
  commentId: CommentId,
  deleted: Schema.Boolean
})
export type DeleteCardCommentResult = Schema.Schema.Type<typeof DeleteCardCommentResultSchema>

export const listCardCommentsParamsJsonSchema = JSONSchema.make(ListCardCommentsParamsSchema)
export const addCardCommentParamsJsonSchema = JSONSchema.make(AddCardCommentParamsSchema)
export const updateCardCommentParamsJsonSchema = JSONSchema.make(UpdateCardCommentParamsSchema)
export const deleteCardCommentParamsJsonSchema = JSONSchema.make(DeleteCardCommentParamsSchema)

export const parseListCardCommentsParams = Schema.decodeUnknown(ListCardCommentsParamsSchema)
export const parseAddCardCommentParams = Schema.decodeUnknown(AddCardCommentParamsSchema)
export const parseUpdateCardCommentParams = Schema.decodeUnknown(UpdateCardCommentParamsSchema)
export const parseDeleteCardCommentParams = Schema.decodeUnknown(DeleteCardCommentParamsSchema)
