import { JSONSchema, Schema } from "effect"

import { clearableText } from "./clearable.js"
import {
  assertUpdateFields,
  atLeastOneUpdateFieldMessage,
  DEFAULT_INCLUDE_ARCHIVED,
  DEFAULT_LIMIT,
  DEFAULT_PRIVATE,
  DocId,
  hasAtLeastOneDefined,
  LimitParam,
  MAX_COLOR_INDEX,
  NonEmptyString,
  PersonRefInput,
  Timestamp,
  withAtLeastOneRequired
} from "./shared.js"
import { ProjectTypeRefSchema, TaskTypeRefSchema } from "./task-management.js"

export const BoardId = DocId.pipe(Schema.brand("BoardId"))
export type BoardId = Schema.Schema.Type<typeof BoardId>

export const BoardCardId = DocId.pipe(Schema.brand("BoardCardId"))
export type BoardCardId = Schema.Schema.Type<typeof BoardCardId>

export const BoardName = NonEmptyString.pipe(Schema.brand("BoardName")).annotations({
  identifier: "BoardName",
  title: "BoardName",
  description: "Non-empty Huly board name."
})
export type BoardName = Schema.Schema.Type<typeof BoardName>

export const BoardCardTitle = NonEmptyString.pipe(Schema.brand("BoardCardTitle")).annotations({
  identifier: "BoardCardTitle",
  title: "BoardCardTitle",
  description: "Non-empty Huly board card title."
})
export type BoardCardTitle = Schema.Schema.Type<typeof BoardCardTitle>

export const BoardCardSequenceIdentifier = Schema.String.pipe(
  Schema.pattern(/^CARD-\d+$/),
  Schema.brand("BoardCardSequenceIdentifier")
).annotations({
  identifier: "BoardCardSequenceIdentifier",
  title: "BoardCardSequenceIdentifier",
  description: "Generated board card identifier in CARD-123 form."
})
export type BoardCardSequenceIdentifier = Schema.Schema.Type<typeof BoardCardSequenceIdentifier>

export const BoardIdentifier = NonEmptyString.pipe(Schema.brand("BoardIdentifier"))
export type BoardIdentifier = Schema.Schema.Type<typeof BoardIdentifier>

export const BoardCardIdentifier = NonEmptyString.pipe(Schema.brand("BoardCardIdentifier"))
export type BoardCardIdentifier = Schema.Schema.Type<typeof BoardCardIdentifier>

export const BoardRefSchema = BoardIdentifier.annotations({
  description:
    "Board locator: board _id or exact board name. Names must match exactly; use list_boards to discover IDs when names are ambiguous."
})
export type BoardRef = Schema.Schema.Type<typeof BoardRefSchema>

export const BoardCardRefSchema = BoardCardIdentifier.annotations({
  description:
    "Board card locator scoped to the board: card _id, CARD-123 identifier, bare number 123, or exact card title."
})
export type BoardCardRef = Schema.Schema.Type<typeof BoardCardRefSchema>

const MemberIdentifier = NonEmptyString.annotations({
  description: "Workspace employee locator: Employee _id, exact email address, or exact person display name."
})

export const BoardCardCoverSchema = Schema.Struct({
  color: Schema.Number.pipe(Schema.int(), Schema.between(0, MAX_COLOR_INDEX)).annotations({
    description: `Board card cover color index from 0 through ${MAX_COLOR_INDEX}.`
  }),
  size: Schema.Literal("small", "large").annotations({
    description: "Board card cover size."
  })
}).annotations({
  title: "BoardCardCoverInput",
  description: "Cover settings for a board card."
})
export type BoardCardCoverInput = Schema.Schema.Type<typeof BoardCardCoverSchema>

export const ListBoardsParamsSchema = Schema.Struct({
  includeArchived: Schema.optional(Schema.Boolean.annotations({
    description:
      `Include archived boards in results (default: ${DEFAULT_INCLUDE_ARCHIVED}, showing only active boards).`
  })),
  limit: Schema.optional(LimitParam.annotations({
    description: `Maximum number of boards to return (default: ${DEFAULT_LIMIT}).`
  }))
}).annotations({
  title: "ListBoardsParams",
  description: "Parameters for listing Huly boards from the @hcengineering/board module."
})
export type ListBoardsParams = Schema.Schema.Type<typeof ListBoardsParamsSchema>

export const GetBoardParamsSchema = Schema.Struct({
  board: BoardRefSchema
}).annotations({
  title: "GetBoardParams",
  description: "Parameters for getting one board by _id or exact name."
})
export type GetBoardParams = Schema.Schema.Type<typeof GetBoardParamsSchema>

export const CreateBoardParamsSchema = Schema.Struct({
  name: BoardName.annotations({ description: "Board name. Creation is idempotent by exact active board name." }),
  description: Schema.optional(Schema.String.annotations({ description: "Plain text board description." })),
  private: Schema.optional(Schema.Boolean.annotations({
    description: `Whether the board is private (default: ${DEFAULT_PRIVATE}).`
  })),
  projectType: Schema.optional(ProjectTypeRefSchema.annotations({
    description:
      "Optional board project type _id or exact name. Omit to use the unambiguous project type whose descriptor is board.descriptors.BoardType."
  }))
}).annotations({
  title: "CreateBoardParams",
  description: "Parameters for creating a Huly board. Returns the existing active board when the name already exists."
})
export type CreateBoardParams = Schema.Schema.Type<typeof CreateBoardParamsSchema>

export const UPDATE_BOARD_FIELDS = ["name", "description", "private"] as const satisfies ReadonlyArray<
  "name" | "description" | "private"
>

export const UpdateBoardParamsSchema = Schema.Struct({
  board: BoardRefSchema,
  name: Schema.optional(BoardName.annotations({ description: "New exact board name." })),
  description: Schema.optional(clearableText("New plain text board description.")),
  private: Schema.optional(Schema.Boolean.annotations({ description: "Whether the board is private." }))
}).pipe(
  Schema.filter((params) =>
    hasAtLeastOneDefined(params, UPDATE_BOARD_FIELDS) ? undefined : atLeastOneUpdateFieldMessage(UPDATE_BOARD_FIELDS)
  )
).annotations({
  title: "UpdateBoardParams",
  description: `Parameters for updating a board. ${atLeastOneUpdateFieldMessage(UPDATE_BOARD_FIELDS)}`
})
export type UpdateBoardParams = Schema.Schema.Type<typeof UpdateBoardParamsSchema>
assertUpdateFields<UpdateBoardParams>()(["board"], UPDATE_BOARD_FIELDS)

export const BoardMutationParamsSchema = Schema.Struct({
  board: BoardRefSchema
}).annotations({
  title: "BoardMutationParams",
  description: "Parameters for archiving or unarchiving a board."
})
export type BoardMutationParams = Schema.Schema.Type<typeof BoardMutationParamsSchema>

export const ListBoardCardsParamsSchema = Schema.Struct({
  board: BoardRefSchema,
  includeArchived: Schema.optional(Schema.Boolean.annotations({
    description:
      `Include archived board cards in results (default: ${DEFAULT_INCLUDE_ARCHIVED}, showing only active cards).`
  })),
  titleSearch: Schema.optional(Schema.String.annotations({
    description: "Search board cards by title substring (case-insensitive SQL LIKE)."
  })),
  limit: Schema.optional(LimitParam.annotations({
    description: `Maximum number of board cards to return (default: ${DEFAULT_LIMIT}).`
  }))
}).annotations({
  title: "ListBoardCardsParams",
  description: "Parameters for listing cards on one Huly board."
})
export type ListBoardCardsParams = Schema.Schema.Type<typeof ListBoardCardsParamsSchema>

export const GetBoardCardParamsSchema = Schema.Struct({
  board: BoardRefSchema,
  card: BoardCardRefSchema
}).annotations({
  title: "GetBoardCardParams",
  description: "Parameters for getting one board card scoped to a board."
})
export type GetBoardCardParams = Schema.Schema.Type<typeof GetBoardCardParamsSchema>

export const CreateBoardCardParamsSchema = Schema.Struct({
  board: BoardRefSchema,
  title: BoardCardTitle.annotations({ description: "Board card title." }),
  description: Schema.optional(Schema.String.annotations({
    description: "Board card description in markdown. Stored as inline Huly Markup."
  })),
  kind: Schema.optional(TaskTypeRefSchema.annotations({
    description:
      "Board card task type _id or exact task type name. Omit to use the unambiguous board card task type for the board project type."
  })),
  status: Schema.optional(NonEmptyString.annotations({
    description:
      "Workflow status _id or exact status name. Omit to use the first status configured on the board project type."
  })),
  assignee: Schema.optional(PersonRefInput.annotations({
    description: "Assignee Employee _id, exact email address, or exact person display name."
  })),
  members: Schema.optional(
    Schema.Array(MemberIdentifier).annotations({
      description: "Initial card members. Each entry accepts Employee _id, exact email, or exact person display name."
    })
  ),
  location: Schema.optional(Schema.String.annotations({ description: "Optional card location text." })),
  cover: Schema.optional(BoardCardCoverSchema),
  startDate: Schema.optional(Timestamp.annotations({ description: "Start date timestamp in milliseconds." })),
  dueDate: Schema.optional(Timestamp.annotations({ description: "Due date timestamp in milliseconds." }))
}).annotations({
  title: "CreateBoardCardParams",
  description:
    "Parameters for creating a board card on a Huly board. The server increments the board CARD-number sequence automatically."
})
export type CreateBoardCardParams = Schema.Schema.Type<typeof CreateBoardCardParamsSchema>

export const UPDATE_BOARD_CARD_FIELDS = [
  "title",
  "description",
  "status",
  "assignee",
  "members",
  "addMembers",
  "removeMembers",
  "location",
  "cover",
  "startDate",
  "dueDate"
] as const satisfies ReadonlyArray<
  | "title"
  | "description"
  | "status"
  | "assignee"
  | "members"
  | "addMembers"
  | "removeMembers"
  | "location"
  | "cover"
  | "startDate"
  | "dueDate"
>

export const UpdateBoardCardParamsSchema = Schema.Struct({
  board: BoardRefSchema,
  card: BoardCardRefSchema,
  title: Schema.optional(BoardCardTitle.annotations({ description: "New board card title." })),
  description: Schema.optional(clearableText("New board card description in markdown.")),
  status: Schema.optional(NonEmptyString.annotations({
    description: "New workflow status _id or exact status name in the board project type."
  })),
  assignee: Schema.optional(
    Schema.NullOr(PersonRefInput).annotations({
      description: "New assignee Employee _id, exact email, or exact person display name; null unassigns."
    })
  ),
  members: Schema.optional(
    Schema.Array(MemberIdentifier).annotations({
      description: "Replace card members with this exact list. Cannot be combined with addMembers or removeMembers."
    })
  ),
  addMembers: Schema.optional(
    Schema.Array(MemberIdentifier).pipe(Schema.minItems(1)).annotations({
      description: "Members to add without replacing existing members."
    })
  ),
  removeMembers: Schema.optional(
    Schema.Array(MemberIdentifier).pipe(Schema.minItems(1)).annotations({
      description: "Members to remove without replacing existing members."
    })
  ),
  location: Schema.optional(clearableText("New card location.")),
  cover: Schema.optional(
    Schema.NullOr(BoardCardCoverSchema).annotations({
      description: "New card cover; null clears the cover."
    })
  ),
  startDate: Schema.optional(
    Schema.NullOr(Timestamp).annotations({
      description: "New start date timestamp in milliseconds; null clears it."
    })
  ),
  dueDate: Schema.optional(
    Schema.NullOr(Timestamp).annotations({
      description: "New due date timestamp in milliseconds; null clears it."
    })
  )
}).pipe(
  Schema.filter((params) => {
    if (!hasAtLeastOneDefined(params, UPDATE_BOARD_CARD_FIELDS)) {
      return atLeastOneUpdateFieldMessage(UPDATE_BOARD_CARD_FIELDS)
    }
    if (params.members !== undefined && (params.addMembers !== undefined || params.removeMembers !== undefined)) {
      return "Cannot provide members with addMembers or removeMembers. Replace all members or mutate members, not both."
    }
    return undefined
  })
).annotations({
  title: "UpdateBoardCardParams",
  description: `Parameters for updating a board card. ${atLeastOneUpdateFieldMessage(UPDATE_BOARD_CARD_FIELDS)}`
})
export type UpdateBoardCardParams = Schema.Schema.Type<typeof UpdateBoardCardParamsSchema>
assertUpdateFields<UpdateBoardCardParams>()(["board", "card"], UPDATE_BOARD_CARD_FIELDS)

export const BoardCardMutationParamsSchema = Schema.Struct({
  board: BoardRefSchema,
  card: BoardCardRefSchema
}).annotations({
  title: "BoardCardMutationParams",
  description: "Parameters for archiving, unarchiving, or deleting one board card scoped to a board."
})
export type BoardCardMutationParams = Schema.Schema.Type<typeof BoardCardMutationParamsSchema>

export const listBoardsParamsJsonSchema = JSONSchema.make(ListBoardsParamsSchema)
export const getBoardParamsJsonSchema = JSONSchema.make(GetBoardParamsSchema)
export const createBoardParamsJsonSchema = JSONSchema.make(CreateBoardParamsSchema)
export const updateBoardParamsJsonSchema = withAtLeastOneRequired(
  JSONSchema.make(UpdateBoardParamsSchema),
  UPDATE_BOARD_FIELDS
)
export const boardMutationParamsJsonSchema = JSONSchema.make(BoardMutationParamsSchema)
export const listBoardCardsParamsJsonSchema = JSONSchema.make(ListBoardCardsParamsSchema)
export const getBoardCardParamsJsonSchema = JSONSchema.make(GetBoardCardParamsSchema)
export const createBoardCardParamsJsonSchema = JSONSchema.make(CreateBoardCardParamsSchema)
export const updateBoardCardParamsJsonSchema = withAtLeastOneRequired(
  JSONSchema.make(UpdateBoardCardParamsSchema),
  UPDATE_BOARD_CARD_FIELDS
)
export const boardCardMutationParamsJsonSchema = JSONSchema.make(BoardCardMutationParamsSchema)

export const parseListBoardsParams = Schema.decodeUnknown(ListBoardsParamsSchema)
export const parseGetBoardParams = Schema.decodeUnknown(GetBoardParamsSchema)
export const parseCreateBoardParams = Schema.decodeUnknown(CreateBoardParamsSchema)
export const parseUpdateBoardParams = Schema.decodeUnknown(UpdateBoardParamsSchema)
export const parseBoardMutationParams = Schema.decodeUnknown(BoardMutationParamsSchema)
export const parseListBoardCardsParams = Schema.decodeUnknown(ListBoardCardsParamsSchema)
export const parseGetBoardCardParams = Schema.decodeUnknown(GetBoardCardParamsSchema)
export const parseCreateBoardCardParams = Schema.decodeUnknown(CreateBoardCardParamsSchema)
export const parseUpdateBoardCardParams = Schema.decodeUnknown(UpdateBoardCardParamsSchema)
export const parseBoardCardMutationParams = Schema.decodeUnknown(BoardCardMutationParamsSchema)
