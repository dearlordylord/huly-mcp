import { Schema } from "effect"

import { LimitParam, makeJsonSchema, NonEmptyString, Timestamp } from "./shared.js"

export const CommentSchema = Schema.Struct({
  id: NonEmptyString,
  body: Schema.String,
  author: Schema.optional(Schema.String),
  authorId: Schema.optional(NonEmptyString),
  createdOn: Schema.optional(Timestamp),
  modifiedOn: Schema.optional(Timestamp),
  editedOn: Schema.optional(Schema.NullOr(Timestamp))
}).annotations({
  title: "Comment",
  description: "Issue comment"
})

export type Comment = Schema.Schema.Type<typeof CommentSchema>

export const ListCommentsParamsSchema = Schema.Struct({
  project: NonEmptyString.annotations({
    description: "Project identifier (e.g., 'HULY')"
  }),
  issueIdentifier: NonEmptyString.annotations({
    description: "Issue identifier (e.g., 'HULY-123' or just '123')"
  }),
  limit: Schema.optional(
    LimitParam.annotations({
      description: "Maximum number of comments to return (default: 50)"
    })
  )
}).annotations({
  title: "ListCommentsParams",
  description: "Parameters for listing comments on an issue"
})

export type ListCommentsParams = Schema.Schema.Type<typeof ListCommentsParamsSchema>

export const AddCommentParamsSchema = Schema.Struct({
  project: NonEmptyString.annotations({
    description: "Project identifier (e.g., 'HULY')"
  }),
  issueIdentifier: NonEmptyString.annotations({
    description: "Issue identifier (e.g., 'HULY-123' or just '123')"
  }),
  body: NonEmptyString.annotations({
    description: "Comment body (markdown supported)"
  })
}).annotations({
  title: "AddCommentParams",
  description: "Parameters for adding a comment to an issue"
})

export type AddCommentParams = Schema.Schema.Type<typeof AddCommentParamsSchema>

export const UpdateCommentParamsSchema = Schema.Struct({
  project: NonEmptyString.annotations({
    description: "Project identifier (e.g., 'HULY')"
  }),
  issueIdentifier: NonEmptyString.annotations({
    description: "Issue identifier (e.g., 'HULY-123' or just '123')"
  }),
  commentId: NonEmptyString.annotations({
    description: "Comment ID to update"
  }),
  body: NonEmptyString.annotations({
    description: "New comment body (markdown supported)"
  })
}).annotations({
  title: "UpdateCommentParams",
  description: "Parameters for updating a comment"
})

export type UpdateCommentParams = Schema.Schema.Type<typeof UpdateCommentParamsSchema>

export const DeleteCommentParamsSchema = Schema.Struct({
  project: NonEmptyString.annotations({
    description: "Project identifier (e.g., 'HULY')"
  }),
  issueIdentifier: NonEmptyString.annotations({
    description: "Issue identifier (e.g., 'HULY-123' or just '123')"
  }),
  commentId: NonEmptyString.annotations({
    description: "Comment ID to delete"
  })
}).annotations({
  title: "DeleteCommentParams",
  description: "Parameters for deleting a comment"
})

export type DeleteCommentParams = Schema.Schema.Type<typeof DeleteCommentParamsSchema>

export const listCommentsParamsJsonSchema = makeJsonSchema(ListCommentsParamsSchema)
export const addCommentParamsJsonSchema = makeJsonSchema(AddCommentParamsSchema)
export const updateCommentParamsJsonSchema = makeJsonSchema(UpdateCommentParamsSchema)
export const deleteCommentParamsJsonSchema = makeJsonSchema(DeleteCommentParamsSchema)

export const parseComment = Schema.decodeUnknown(CommentSchema)
export const parseListCommentsParams = Schema.decodeUnknown(ListCommentsParamsSchema)
export const parseAddCommentParams = Schema.decodeUnknown(AddCommentParamsSchema)
export const parseUpdateCommentParams = Schema.decodeUnknown(UpdateCommentParamsSchema)
export const parseDeleteCommentParams = Schema.decodeUnknown(DeleteCommentParamsSchema)
