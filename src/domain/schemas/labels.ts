import { JSONSchema, Schema } from "effect"

import { clearableText } from "./clearable.js"
import {
  assertUpdateFields,
  atLeastOneUpdateFieldMessage,
  ColorCode,
  DEFAULT_COLOR_INDEX,
  DEFAULT_LIMIT,
  hasAtLeastOneDefined,
  LimitParam,
  MAX_COLOR_INDEX,
  NonEmptyString,
  TagCategoryIdentifier,
  TagElementId,
  TagIdentifier,
  withAtLeastOneRequired
} from "./shared.js"

export const TagElementSummarySchema = Schema.Struct({
  id: TagElementId,
  title: NonEmptyString,
  color: ColorCode,
  category: NonEmptyString
}).annotations({
  title: "TagElementSummary",
  description: "Label/tag summary for list operations"
})

export type TagElementSummary = Schema.Schema.Type<typeof TagElementSummarySchema>

export const ListLabelsParamsSchema = Schema.Struct({
  category: Schema.optional(
    TagCategoryIdentifier.annotations({
      description: "Filter by category ID or label name"
    })
  ),
  limit: Schema.optional(
    LimitParam.annotations({
      description: `Maximum number of labels to return (default: ${DEFAULT_LIMIT})`
    })
  )
}).annotations({
  title: "ListLabelsParams",
  description: "Parameters for listing label definitions"
})

export type ListLabelsParams = Schema.Schema.Type<typeof ListLabelsParamsSchema>

export const CreateLabelParamsSchema = Schema.Struct({
  title: NonEmptyString.annotations({
    description: "Label name"
  }),
  color: Schema.optional(
    ColorCode.annotations({
      description:
        `Huly platform color palette index from 0 through ${MAX_COLOR_INDEX} (default: ${DEFAULT_COLOR_INDEX})`
    })
  ),
  description: Schema.optional(Schema.String.annotations({
    description: "Label description"
  })),
  category: Schema.optional(
    TagCategoryIdentifier.annotations({
      description: "Category ID or label name. Falls back to tracker default category ('Other') if not specified."
    })
  )
}).annotations({
  title: "CreateLabelParams",
  description: "Parameters for creating a label definition"
})

export type CreateLabelParams = Schema.Schema.Type<typeof CreateLabelParamsSchema>

export const UPDATE_LABEL_FIELDS = ["title", "color", "description"] as const satisfies ReadonlyArray<
  "title" | "color" | "description"
>

export const UpdateLabelParamsSchema = Schema.Struct({
  label: TagIdentifier.annotations({
    description: "Label ID or title to update"
  }),
  title: Schema.optional(NonEmptyString.annotations({
    description: "New label name"
  })),
  color: Schema.optional(
    ColorCode.annotations({
      description: `New Huly platform color palette index from 0 through ${MAX_COLOR_INDEX}`
    })
  ),
  description: Schema.optional(clearableText("New label description."))
}).pipe(
  Schema.filter((params) =>
    hasAtLeastOneDefined(params, UPDATE_LABEL_FIELDS) ? undefined : atLeastOneUpdateFieldMessage(UPDATE_LABEL_FIELDS)
  )
).annotations({
  title: "UpdateLabelParams",
  description: `Parameters for updating a label definition. ${atLeastOneUpdateFieldMessage(UPDATE_LABEL_FIELDS)}`
})

export type UpdateLabelParams = Schema.Schema.Type<typeof UpdateLabelParamsSchema>
assertUpdateFields<UpdateLabelParams>()(["label"], UPDATE_LABEL_FIELDS)

export const DeleteLabelParamsSchema = Schema.Struct({
  label: TagIdentifier.annotations({
    description: "Label ID or title to delete"
  })
}).annotations({
  title: "DeleteLabelParams",
  description: "Parameters for deleting a label definition"
})

export type DeleteLabelParams = Schema.Schema.Type<typeof DeleteLabelParamsSchema>

export const listLabelsParamsJsonSchema = JSONSchema.make(ListLabelsParamsSchema)
export const createLabelParamsJsonSchema = JSONSchema.make(CreateLabelParamsSchema)
export const updateLabelParamsJsonSchema = withAtLeastOneRequired(
  JSONSchema.make(UpdateLabelParamsSchema),
  UPDATE_LABEL_FIELDS
)
export const deleteLabelParamsJsonSchema = JSONSchema.make(DeleteLabelParamsSchema)

export const parseListLabelsParams = Schema.decodeUnknown(ListLabelsParamsSchema)
export const parseCreateLabelParams = Schema.decodeUnknown(CreateLabelParamsSchema)
export const parseUpdateLabelParams = Schema.decodeUnknown(UpdateLabelParamsSchema)
export const parseDeleteLabelParams = Schema.decodeUnknown(DeleteLabelParamsSchema)
export const CreateLabelResultSchema = Schema.Struct({
  id: TagElementId,
  title: Schema.String,
  created: Schema.Boolean
})
export type CreateLabelResult = Schema.Schema.Type<typeof CreateLabelResultSchema>
export const UpdateLabelResultSchema = Schema.Struct({
  id: TagElementId,
  updated: Schema.Boolean
})
export type UpdateLabelResult = Schema.Schema.Type<typeof UpdateLabelResultSchema>
export const DeleteLabelResultSchema = Schema.Struct({
  id: TagElementId,
  deleted: Schema.Boolean
})
export type DeleteLabelResult = Schema.Schema.Type<typeof DeleteLabelResultSchema>

export const ListLabelsResultSchema = Schema.Array(TagElementSummarySchema)
