import { JSONSchema, Schema } from "effect"

import { clearableText } from "./clearable.js"
import {
  assertUpdateFields,
  atLeastOneUpdateFieldMessage,
  CardId,
  CardIdentifier,
  CardSpaceId,
  CardSpaceIdentifier,
  Count,
  DEFAULT_INCLUDE_ARCHIVED,
  DEFAULT_LIMIT,
  hasAtLeastOneDefined,
  LimitParam,
  ListTotal,
  MasterTagId,
  MasterTagIdentifier,
  NonEmptyString,
  withAtLeastOneRequired
} from "./shared.js"
export const CardSpaceSummarySchema = Schema.Struct({
  id: CardSpaceId,
  name: Schema.String,
  description: Schema.optional(Schema.String),
  types: Schema.Array(Schema.String)
})
export type CardSpaceSummary = Schema.Schema.Type<typeof CardSpaceSummarySchema>

export const ListCardSpacesParamsSchema = Schema.Struct({
  includeArchived: Schema.optional(Schema.Boolean.annotations({
    description: `Include archived card spaces in results (default: ${DEFAULT_INCLUDE_ARCHIVED}, showing only active)`
  })),
  limit: Schema.optional(
    LimitParam.annotations({
      description: `Maximum number of card spaces to return (default: ${DEFAULT_LIMIT})`
    })
  )
}).annotations({
  title: "ListCardSpacesParams",
  description: "Parameters for listing card spaces"
})

export type ListCardSpacesParams = Schema.Schema.Type<typeof ListCardSpacesParamsSchema>
export const ListCardSpacesResultSchema = Schema.Struct({
  cardSpaces: Schema.Array(CardSpaceSummarySchema),
  total: ListTotal
})
export type ListCardSpacesResult = Schema.Schema.Type<typeof ListCardSpacesResultSchema>
export const MasterTagSummarySchema = Schema.Struct({
  id: MasterTagId,
  name: Schema.String
})
export type MasterTagSummary = Schema.Schema.Type<typeof MasterTagSummarySchema>

export const ListMasterTagsParamsSchema = Schema.Struct({
  cardSpace: CardSpaceIdentifier.annotations({
    description: "Card space name or ID"
  })
}).annotations({
  title: "ListMasterTagsParams",
  description: "Parameters for listing master tags (card types) available in a card space"
})

export type ListMasterTagsParams = Schema.Schema.Type<typeof ListMasterTagsParamsSchema>
export const ListMasterTagsResultSchema = Schema.Struct({
  masterTags: Schema.Array(MasterTagSummarySchema),
  total: ListTotal
})
export type ListMasterTagsResult = Schema.Schema.Type<typeof ListMasterTagsResultSchema>
export const CardSummarySchema = Schema.Struct({
  id: CardId,
  title: Schema.String,
  type: Schema.String,
  modifiedOn: Schema.optional(Schema.Number)
})
export type CardSummary = Schema.Schema.Type<typeof CardSummarySchema>

const ListCardsParamsBase = Schema.Struct({
  cardSpace: CardSpaceIdentifier.annotations({
    description: "Card space name or ID"
  }),
  type: Schema.optional(MasterTagIdentifier.annotations({
    description: "Filter by master tag (card type) name or ID"
  })),
  titleSearch: Schema.optional(Schema.String.annotations({
    description: "Search cards by title substring (case-insensitive). Mutually exclusive with titleRegex."
  })),
  titleRegex: Schema.optional(Schema.String.annotations({
    description:
      "Filter cards by title using Huly $regex. On the supported Postgres backend this is SQL SIMILAR TO, not JavaScript RegExp; matching is case-sensitive and the pattern must match the whole title: use '%' for any string (e.g., '%TODO%' contains, 'TODO%' prefix). Mutually exclusive with titleSearch; use titleSearch for simple substring matching."
  })),
  contentSearch: Schema.optional(Schema.String.annotations({
    description: "Search cards by content (fulltext search)"
  })),
  limit: Schema.optional(
    LimitParam.annotations({
      description: `Maximum number of cards to return (default: ${DEFAULT_LIMIT})`
    })
  )
})

export const ListCardsParamsSchema = ListCardsParamsBase.pipe(
  Schema.filter((params) => {
    if (params.titleSearch !== undefined && params.titleRegex !== undefined) {
      return "Cannot provide both 'titleSearch' and 'titleRegex'. Use one or the other."
    }
    return undefined
  })
).annotations({
  title: "ListCardsParams",
  description: "Parameters for listing cards in a card space"
})

export type ListCardsParams = Schema.Schema.Type<typeof ListCardsParamsSchema>
export const ListCardsResultSchema = Schema.Struct({
  cards: Schema.Array(CardSummarySchema),
  total: ListTotal
})
export type ListCardsResult = Schema.Schema.Type<typeof ListCardsResultSchema>
export const CardDetailSchema = Schema.Struct({
  id: CardId,
  title: Schema.String,
  content: Schema.optional(Schema.String),
  type: Schema.String,
  parent: Schema.optional(Schema.String),
  children: Schema.optional(Count),
  cardSpace: Schema.String,
  modifiedOn: Schema.optional(Schema.Number),
  createdOn: Schema.optional(Schema.Number)
})
export type CardDetail = Schema.Schema.Type<typeof CardDetailSchema>

export const GetCardParamsSchema = Schema.Struct({
  cardSpace: CardSpaceIdentifier.annotations({
    description: "Card space name or ID"
  }),
  card: CardIdentifier.annotations({
    description: "Card title or ID"
  })
}).annotations({
  title: "GetCardParams",
  description: "Parameters for getting a single card"
})

export type GetCardParams = Schema.Schema.Type<typeof GetCardParamsSchema>

export const CreateCardParamsSchema = Schema.Struct({
  cardSpace: CardSpaceIdentifier.annotations({
    description: "Card space name or ID"
  }),
  type: MasterTagIdentifier.annotations({
    description: "Master tag (card type) name or ID"
  }),
  title: NonEmptyString.annotations({
    description: "Card title"
  }),
  content: Schema.optional(Schema.String.annotations({
    description: "Card content (markdown supported)"
  })),
  parent: Schema.optional(CardIdentifier.annotations({
    description: "Parent card title or ID (for creating child cards)"
  }))
}).annotations({
  title: "CreateCardParams",
  description: "Parameters for creating a card"
})

export type CreateCardParams = Schema.Schema.Type<typeof CreateCardParamsSchema>

export const UPDATE_CARD_FIELDS = ["title", "content"] as const satisfies ReadonlyArray<"title" | "content">

export const UpdateCardParamsSchema = Schema.Struct({
  cardSpace: CardSpaceIdentifier.annotations({
    description: "Card space name or ID"
  }),
  card: CardIdentifier.annotations({
    description: "Card title or ID"
  }),
  title: Schema.optional(NonEmptyString.annotations({
    description: "New card title"
  })),
  content: Schema.optional(clearableText("New card content (markdown supported)."))
}).pipe(
  Schema.filter((params) =>
    hasAtLeastOneDefined(params, UPDATE_CARD_FIELDS) ? undefined : atLeastOneUpdateFieldMessage(UPDATE_CARD_FIELDS)
  )
).annotations({
  title: "UpdateCardParams",
  description: `Parameters for updating a card. ${atLeastOneUpdateFieldMessage(UPDATE_CARD_FIELDS)}`
})

export type UpdateCardParams = Schema.Schema.Type<typeof UpdateCardParamsSchema>
assertUpdateFields<UpdateCardParams>()(["cardSpace", "card"], UPDATE_CARD_FIELDS)

export const DeleteCardParamsSchema = Schema.Struct({
  cardSpace: CardSpaceIdentifier.annotations({
    description: "Card space name or ID"
  }),
  card: CardIdentifier.annotations({
    description: "Card title or ID"
  })
}).annotations({
  title: "DeleteCardParams",
  description: "Parameters for deleting a card"
})

export type DeleteCardParams = Schema.Schema.Type<typeof DeleteCardParamsSchema>

export const listCardSpacesParamsJsonSchema = JSONSchema.make(ListCardSpacesParamsSchema)
export const listMasterTagsParamsJsonSchema = JSONSchema.make(ListMasterTagsParamsSchema)
export const listCardsParamsJsonSchema = JSONSchema.make(ListCardsParamsSchema)
export const getCardParamsJsonSchema = JSONSchema.make(GetCardParamsSchema)
export const createCardParamsJsonSchema = JSONSchema.make(CreateCardParamsSchema)
export const updateCardParamsJsonSchema = withAtLeastOneRequired(
  JSONSchema.make(UpdateCardParamsSchema),
  UPDATE_CARD_FIELDS
)
export const deleteCardParamsJsonSchema = JSONSchema.make(DeleteCardParamsSchema)

export const parseListCardSpacesParams = Schema.decodeUnknown(ListCardSpacesParamsSchema)
export const parseListMasterTagsParams = Schema.decodeUnknown(ListMasterTagsParamsSchema)
export const parseListCardsParams = Schema.decodeUnknown(ListCardsParamsSchema)
export const parseGetCardParams = Schema.decodeUnknown(GetCardParamsSchema)
export const parseCreateCardParams = Schema.decodeUnknown(CreateCardParamsSchema)
export const parseUpdateCardParams = Schema.decodeUnknown(UpdateCardParamsSchema)
export const parseDeleteCardParams = Schema.decodeUnknown(DeleteCardParamsSchema)
export const CreateCardResultSchema = Schema.Struct({
  id: CardId,
  title: Schema.String
})
export type CreateCardResult = Schema.Schema.Type<typeof CreateCardResultSchema>
export const UpdateCardResultSchema = Schema.Struct({
  id: CardId,
  updated: Schema.Boolean
})
export type UpdateCardResult = Schema.Schema.Type<typeof UpdateCardResultSchema>
export const DeleteCardResultSchema = Schema.Struct({
  id: CardId,
  deleted: Schema.Boolean
})
export type DeleteCardResult = Schema.Schema.Type<typeof DeleteCardResultSchema>

export const GetCardResultSchema = CardDetailSchema
