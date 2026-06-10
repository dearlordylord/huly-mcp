import { JSONSchema, Schema } from "effect"

import { DrawingContent } from "./domain-values.js"
import {
  AttachmentId,
  DEFAULT_LIMIT,
  DocId,
  DrawingId,
  LimitParam,
  ObjectClassName,
  SavedAttachmentId,
  SpaceId,
  Timestamp
} from "./shared.js"

export interface SavedAttachment {
  readonly id: SavedAttachmentId
  readonly attachmentId: AttachmentId
}

export interface Drawing {
  readonly id: DrawingId
  readonly parentId: DocId
  readonly parentClass: ObjectClassName
  readonly content?: DrawingContent | undefined
  readonly modifiedOn?: Timestamp | undefined
  readonly createdOn?: Timestamp | undefined
}

export const SaveAttachmentParamsSchema = Schema.Struct({
  attachmentId: AttachmentId.annotations({
    description: "Attachment ID to save/bookmark."
  })
}).annotations({
  title: "SaveAttachmentParams",
  description: "Parameters for saving/bookmarking an attachment."
})

export type SaveAttachmentParams = Schema.Schema.Type<typeof SaveAttachmentParamsSchema>

export const UnsaveAttachmentParamsSchema = SaveAttachmentParamsSchema.annotations({
  title: "UnsaveAttachmentParams",
  description: "Parameters for removing an attachment from saved/bookmarks."
})

export type UnsaveAttachmentParams = Schema.Schema.Type<typeof UnsaveAttachmentParamsSchema>

export const ListSavedAttachmentsParamsSchema = Schema.Struct({
  limit: Schema.optional(
    LimitParam.annotations({
      description: `Maximum number of saved attachments to return (default: ${DEFAULT_LIMIT})`
    })
  )
}).annotations({
  title: "ListSavedAttachmentsParams",
  description: "Parameters for listing saved/bookmarked attachments."
})

export type ListSavedAttachmentsParams = Schema.Schema.Type<typeof ListSavedAttachmentsParamsSchema>

export const ListDrawingsParamsSchema = Schema.Struct({
  parentId: DocId.annotations({
    description: "Internal Huly parent object ID."
  }),
  parentClass: ObjectClassName.annotations({
    description: "Internal Huly parent object class."
  }),
  limit: Schema.optional(
    LimitParam.annotations({
      description: `Maximum number of drawings to return (default: ${DEFAULT_LIMIT})`
    })
  )
}).annotations({
  title: "ListDrawingsParams",
  description: "Parameters for listing drawings attached to a parent object."
})

export type ListDrawingsParams = Schema.Schema.Type<typeof ListDrawingsParamsSchema>

export const GetDrawingParamsSchema = Schema.Struct({
  drawingId: DrawingId.annotations({
    description: "Drawing ID."
  })
}).annotations({
  title: "GetDrawingParams",
  description: "Parameters for retrieving a drawing."
})

export type GetDrawingParams = Schema.Schema.Type<typeof GetDrawingParamsSchema>

export const CreateDrawingParamsSchema = Schema.Struct({
  parentId: DocId.annotations({
    description: "Internal Huly parent object ID."
  }),
  parentClass: ObjectClassName.annotations({
    description: "Internal Huly parent object class."
  }),
  space: SpaceId.annotations({
    description: "Space ID where the drawing should be created."
  }),
  content: Schema.optional(DrawingContent)
}).annotations({
  title: "CreateDrawingParams",
  description: "Parameters for creating a drawing under a Huly object."
})

export type CreateDrawingParams = Schema.Schema.Type<typeof CreateDrawingParamsSchema>

export const UpdateDrawingParamsSchema = Schema.Struct({
  drawingId: DrawingId.annotations({
    description: "Drawing ID."
  }),
  content: Schema.NullOr(DrawingContent).annotations({
    description: "New drawing content payload. Use null to clear."
  })
}).annotations({
  title: "UpdateDrawingParams",
  description: "Parameters for updating drawing content."
})

export type UpdateDrawingParams = Schema.Schema.Type<typeof UpdateDrawingParamsSchema>

export const DeleteDrawingParamsSchema = Schema.Struct({
  drawingId: DrawingId.annotations({
    description: "Drawing ID to delete."
  })
}).annotations({
  title: "DeleteDrawingParams",
  description: "Parameters for deleting a drawing."
})

export type DeleteDrawingParams = Schema.Schema.Type<typeof DeleteDrawingParamsSchema>

export const saveAttachmentParamsJsonSchema = JSONSchema.make(SaveAttachmentParamsSchema)
export const unsaveAttachmentParamsJsonSchema = JSONSchema.make(UnsaveAttachmentParamsSchema)
export const listSavedAttachmentsParamsJsonSchema = JSONSchema.make(ListSavedAttachmentsParamsSchema)
export const listDrawingsParamsJsonSchema = JSONSchema.make(ListDrawingsParamsSchema)
export const getDrawingParamsJsonSchema = JSONSchema.make(GetDrawingParamsSchema)
export const createDrawingParamsJsonSchema = JSONSchema.make(CreateDrawingParamsSchema)
export const updateDrawingParamsJsonSchema = JSONSchema.make(UpdateDrawingParamsSchema)
export const deleteDrawingParamsJsonSchema = JSONSchema.make(DeleteDrawingParamsSchema)

export const parseSaveAttachmentParams = Schema.decodeUnknown(SaveAttachmentParamsSchema)
export const parseUnsaveAttachmentParams = Schema.decodeUnknown(UnsaveAttachmentParamsSchema)
export const parseListSavedAttachmentsParams = Schema.decodeUnknown(ListSavedAttachmentsParamsSchema)
export const parseListDrawingsParams = Schema.decodeUnknown(ListDrawingsParamsSchema)
export const parseGetDrawingParams = Schema.decodeUnknown(GetDrawingParamsSchema)
export const parseCreateDrawingParams = Schema.decodeUnknown(CreateDrawingParamsSchema)
export const parseUpdateDrawingParams = Schema.decodeUnknown(UpdateDrawingParamsSchema)
export const parseDeleteDrawingParams = Schema.decodeUnknown(DeleteDrawingParamsSchema)

export interface SaveAttachmentResult {
  readonly savedId: SavedAttachmentId
  readonly attachmentId: AttachmentId
  readonly saved: boolean
}

export interface UnsaveAttachmentResult {
  readonly attachmentId: AttachmentId
  readonly removed: boolean
}

export interface CreateDrawingResult {
  readonly drawingId: DrawingId
}

export interface UpdateDrawingResult {
  readonly drawingId: DrawingId
  readonly updated: boolean
}

export interface DeleteDrawingResult {
  readonly drawingId: DrawingId
  readonly deleted: boolean
}

export const SavedAttachmentWireSchema = Schema.Struct({
  id: SavedAttachmentId,
  attachmentId: AttachmentId
})

export const DrawingWireSchema = Schema.Struct({
  id: DrawingId,
  parentId: DocId,
  parentClass: ObjectClassName,
  content: Schema.optional(DrawingContent),
  modifiedOn: Schema.optional(Timestamp),
  createdOn: Schema.optional(Timestamp)
})

export const SaveAttachmentResultSchema = Schema.Struct({
  savedId: SavedAttachmentId,
  attachmentId: AttachmentId,
  saved: Schema.Boolean
})

export const UnsaveAttachmentResultSchema = Schema.Struct({
  attachmentId: AttachmentId,
  removed: Schema.Boolean
})

export const CreateDrawingResultSchema = Schema.Struct({
  drawingId: DrawingId
})

export const UpdateDrawingResultSchema = Schema.Struct({
  drawingId: DrawingId,
  updated: Schema.Boolean
})

export const DeleteDrawingResultSchema = Schema.Struct({
  drawingId: DrawingId,
  deleted: Schema.Boolean
})

export const ListSavedAttachmentsResultSchema = Schema.Array(SavedAttachmentWireSchema)
export const ListDrawingsResultSchema = Schema.Array(DrawingWireSchema)
export const GetDrawingResultSchema = DrawingWireSchema
