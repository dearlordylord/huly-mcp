import { JSONSchema, Schema } from "effect"

import { withJsonSchemaPropertyDescriptions } from "./json-schema.js"
import {
  Count,
  DEFAULT_LIMIT,
  DocId,
  emptyParamsJsonSchema,
  EmptyParamsSchema,
  LimitParam,
  NonEmptyString
} from "./shared.js"

const SdkOpenPayload = Schema.Unknown.annotations({
  description: "Raw SDK-owned payload passed through without inventing a closed MCP-side schema."
})

export const BoardMenuPageId = DocId.pipe(Schema.brand("BoardMenuPageId"))
export type BoardMenuPageId = Schema.Schema.Type<typeof BoardMenuPageId>

export const BoardSavedViewId = DocId.pipe(Schema.brand("BoardSavedViewId"))
export type BoardSavedViewId = Schema.Schema.Type<typeof BoardSavedViewId>

export const BoardViewletId = DocId.pipe(Schema.brand("BoardViewletId"))
export type BoardViewletId = Schema.Schema.Type<typeof BoardViewletId>

export const BoardViewletDescriptorId = DocId.pipe(Schema.brand("BoardViewletDescriptorId"))
export type BoardViewletDescriptorId = Schema.Schema.Type<typeof BoardViewletDescriptorId>

export const BoardViewletPreferenceId = DocId.pipe(Schema.brand("BoardViewletPreferenceId"))
export type BoardViewletPreferenceId = Schema.Schema.Type<typeof BoardViewletPreferenceId>

export const BoardCommonPreferenceId = DocId.pipe(Schema.brand("BoardCommonPreferenceId"))
export type BoardCommonPreferenceId = Schema.Schema.Type<typeof BoardCommonPreferenceId>

export const BoardMenuPageIdentifier = NonEmptyString.pipe(Schema.brand("BoardMenuPageIdentifier")).annotations({
  identifier: "BoardMenuPageIdentifier",
  title: "BoardMenuPageIdentifier",
  description:
    "Board menu page locator: MenuPage _id, raw pageId such as board:menuPageId:Main, shorthand main/archive, or exact label."
})
export type BoardMenuPageIdentifier = Schema.Schema.Type<typeof BoardMenuPageIdentifier>

export const BoardSavedViewIdentifier = NonEmptyString.pipe(Schema.brand("BoardSavedViewIdentifier")).annotations({
  identifier: "BoardSavedViewIdentifier",
  title: "BoardSavedViewIdentifier",
  description: "Board saved view locator: FilteredView _id or exact saved view name."
})
export type BoardSavedViewIdentifier = Schema.Schema.Type<typeof BoardSavedViewIdentifier>

export const BoardViewletIdentifier = NonEmptyString.pipe(Schema.brand("BoardViewletIdentifier")).annotations({
  identifier: "BoardViewletIdentifier",
  title: "BoardViewletIdentifier",
  description: "Board viewlet locator: Viewlet _id, exact title, variant, or descriptor _id."
})
export type BoardViewletIdentifier = Schema.Schema.Type<typeof BoardViewletIdentifier>

export const BoardSavedViewVisibilitySchema = Schema.Literal("own", "shared", "all").annotations({
  title: "BoardSavedViewVisibility",
  description: "Filter board saved views by whether the current account is in the saved view users list."
})
export type BoardSavedViewVisibility = Schema.Schema.Type<typeof BoardSavedViewVisibilitySchema>

export const ListBoardMenuPagesParamsSchema = Schema.Struct({
  page: Schema.optional(BoardMenuPageIdentifier.annotations({
    description: "Optional MenuPage _id, pageId, or exact label. Omit to list all board menu pages."
  })),
  limit: Schema.optional(LimitParam.annotations({
    description: `Maximum number of board menu pages to return (default: ${DEFAULT_LIMIT}).`
  }))
}).annotations({
  title: "ListBoardMenuPagesParams",
  description: "Read-only discovery for @hcengineering/board MenuPage model documents."
})
export type ListBoardMenuPagesParams = Schema.Schema.Type<typeof ListBoardMenuPagesParamsSchema>

export const ListBoardSavedViewsParamsSchema = Schema.Struct({
  visibility: Schema.optional(BoardSavedViewVisibilitySchema),
  nameSearch: Schema.optional(Schema.String.annotations({
    description: "Optional saved view name substring search."
  })),
  limit: Schema.optional(LimitParam.annotations({
    description: `Maximum number of board saved views to return (default: ${DEFAULT_LIMIT}).`
  }))
}).annotations({
  title: "ListBoardSavedViewsParams",
  description:
    "List read-only saved filtered views for the board app. Queries view.class.FilteredView with attachedTo = board.app.Board."
})
export type ListBoardSavedViewsParams = Schema.Schema.Type<typeof ListBoardSavedViewsParamsSchema>

export const GetBoardSavedViewParamsSchema = Schema.Struct({
  savedView: BoardSavedViewIdentifier.annotations({
    description: "FilteredView _id or exact saved view name scoped to attachedTo = board.app.Board."
  })
}).annotations({
  title: "GetBoardSavedViewParams",
  description: "Read one board saved filtered view by _id or exact name."
})
export type GetBoardSavedViewParams = Schema.Schema.Type<typeof GetBoardSavedViewParamsSchema>

export const ListBoardViewletsParamsSchema = Schema.Struct({
  viewlet: Schema.optional(BoardViewletIdentifier.annotations({
    description: "Optional Viewlet _id, exact title, variant, or descriptor _id. Omit to list board card viewlets."
  })),
  limit: Schema.optional(LimitParam.annotations({
    description: `Maximum number of board viewlets to return (default: ${DEFAULT_LIMIT}).`
  }))
}).annotations({
  title: "ListBoardViewletsParams",
  description:
    "Read-only discovery for board card viewlets. Queries view.class.Viewlet with attachTo = board.class.Card and includes matching ViewletPreference config rows."
})
export type ListBoardViewletsParams = Schema.Schema.Type<typeof ListBoardViewletsParamsSchema>

export type GetBoardCommonPreferenceParams = Schema.Schema.Type<typeof EmptyParamsSchema>

const BoardMenuPageSummarySchema = Schema.Struct({
  id: BoardMenuPageId,
  pageId: NonEmptyString,
  label: NonEmptyString,
  component: SdkOpenPayload
})
export type BoardMenuPageSummary = Schema.Schema.Type<typeof BoardMenuPageSummarySchema>

export const ListBoardMenuPagesResultSchema = Schema.Struct({
  pages: Schema.Array(BoardMenuPageSummarySchema),
  total: Count
})
export type ListBoardMenuPagesResult = Schema.Schema.Type<typeof ListBoardMenuPagesResultSchema>

const ViewletDescriptorSummarySchema = Schema.Struct({
  id: BoardViewletDescriptorId,
  label: Schema.optional(NonEmptyString),
  icon: Schema.optional(Schema.String),
  color: Schema.optional(Schema.Number),
  hidden: Schema.optional(Schema.Boolean),
  readonly: Schema.optional(Schema.Boolean),
  component: Schema.optional(SdkOpenPayload)
})
export type BoardViewletDescriptorSummary = Schema.Schema.Type<typeof ViewletDescriptorSummarySchema>

const ViewletPreferenceConfigSchema = Schema.Struct({
  id: BoardViewletPreferenceId,
  attachedTo: BoardViewletId,
  config: Schema.Array(SdkOpenPayload)
})
export type BoardViewletPreferenceConfig = Schema.Schema.Type<typeof ViewletPreferenceConfigSchema>

export const BoardSavedViewSummarySchema = Schema.Struct({
  id: BoardSavedViewId,
  name: NonEmptyString,
  visibility: Schema.Literal("own", "shared"),
  sharable: Schema.optional(Schema.Boolean),
  users: Count,
  viewletId: Schema.optional(BoardViewletId)
})
export type BoardSavedViewSummary = Schema.Schema.Type<typeof BoardSavedViewSummarySchema>

export const BoardSavedViewDetailSchema = Schema.Struct({
  id: BoardSavedViewId,
  name: NonEmptyString,
  visibility: Schema.Literal("own", "shared"),
  attachedTo: NonEmptyString,
  location: SdkOpenPayload,
  filters: SdkOpenPayload,
  viewOptions: Schema.optional(SdkOpenPayload),
  filterClass: Schema.optional(Schema.String),
  viewletId: Schema.optional(BoardViewletId),
  sharable: Schema.optional(Schema.Boolean),
  users: Count,
  createdBy: Schema.String
})
export type BoardSavedViewDetail = Schema.Schema.Type<typeof BoardSavedViewDetailSchema>

export const ListBoardSavedViewsResultSchema = Schema.Struct({
  savedViews: Schema.Array(BoardSavedViewSummarySchema),
  total: Count
})
export type ListBoardSavedViewsResult = Schema.Schema.Type<typeof ListBoardSavedViewsResultSchema>

export const BoardViewletSummarySchema = Schema.Struct({
  id: BoardViewletId,
  attachTo: NonEmptyString,
  descriptor: BoardViewletDescriptorId,
  title: Schema.optional(NonEmptyString),
  variant: Schema.optional(NonEmptyString),
  baseQuery: Schema.optional(SdkOpenPayload),
  options: Schema.optional(SdkOpenPayload),
  config: Schema.Array(SdkOpenPayload),
  configOptions: Schema.optional(SdkOpenPayload),
  viewOptions: Schema.optional(SdkOpenPayload),
  masterDetailOptions: Schema.optional(SdkOpenPayload),
  props: Schema.optional(SdkOpenPayload),
  descriptorInfo: Schema.optional(ViewletDescriptorSummarySchema),
  preferences: Schema.Array(ViewletPreferenceConfigSchema)
})
export type BoardViewletSummary = Schema.Schema.Type<typeof BoardViewletSummarySchema>

export const ListBoardViewletsResultSchema = Schema.Struct({
  viewlets: Schema.Array(BoardViewletSummarySchema),
  total: Count
})
export type ListBoardViewletsResult = Schema.Schema.Type<typeof ListBoardViewletsResultSchema>

const AbsentBoardCommonPreferenceResultSchema = Schema.Struct({
  present: Schema.Literal(false),
  attachedTo: NonEmptyString
})

const PresentBoardCommonPreferenceResultSchema = Schema.Struct({
  present: Schema.Literal(true),
  attachedTo: NonEmptyString,
  id: BoardCommonPreferenceId,
  raw: SdkOpenPayload
})

export const BoardCommonPreferenceResultSchema = Schema.Union(
  AbsentBoardCommonPreferenceResultSchema,
  PresentBoardCommonPreferenceResultSchema
)
export type BoardCommonPreferenceResult = Schema.Schema.Type<typeof BoardCommonPreferenceResultSchema>

export const listBoardMenuPagesParamsJsonSchema = JSONSchema.make(ListBoardMenuPagesParamsSchema)
export const listBoardSavedViewsParamsJsonSchema = JSONSchema.make(ListBoardSavedViewsParamsSchema)
export const getBoardSavedViewParamsJsonSchema = {
  ...withJsonSchemaPropertyDescriptions(JSONSchema.make(GetBoardSavedViewParamsSchema), {
    savedView: "FilteredView _id or exact saved view name scoped to attachedTo = board.app.Board."
  }),
  description: "Read one board saved filtered view by _id or exact name scoped to attachedTo = board.app.Board."
}
export const listBoardViewletsParamsJsonSchema = JSONSchema.make(ListBoardViewletsParamsSchema)
export const getBoardCommonPreferenceParamsJsonSchema = emptyParamsJsonSchema

export const parseListBoardMenuPagesParams = Schema.decodeUnknown(ListBoardMenuPagesParamsSchema)
export const parseListBoardSavedViewsParams = Schema.decodeUnknown(ListBoardSavedViewsParamsSchema)
export const parseGetBoardSavedViewParams = Schema.decodeUnknown(GetBoardSavedViewParamsSchema)
export const parseListBoardViewletsParams = Schema.decodeUnknown(ListBoardViewletsParamsSchema)
export const parseGetBoardCommonPreferenceParams = Schema.decodeUnknown(EmptyParamsSchema)
