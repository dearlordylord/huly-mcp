import { Schema } from "effect"

import { clearableText } from "./clearable.js"
import { HULY_NATIVE_REFERENCE_MARKDOWN_INPUT } from "./document-native-references.js"
import { toDraft07JsonSchema, withJsonSchemaPropertyDescriptions } from "./json-schema.js"
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

export const BoardName = NonEmptyString.pipe(Schema.brand("BoardName")).annotate({
  identifier: "BoardName",
  title: "BoardName",
  description: "Non-empty Huly board name."
})
export type BoardName = Schema.Schema.Type<typeof BoardName>

export const BoardCardTitle = NonEmptyString.pipe(Schema.brand("BoardCardTitle")).annotate({
  identifier: "BoardCardTitle",
  title: "BoardCardTitle",
  description: "Non-empty Huly board card title."
})
export type BoardCardTitle = Schema.Schema.Type<typeof BoardCardTitle>

export const BoardCardSequenceIdentifier = Schema.String.pipe(
  Schema.check(Schema.isPattern(/^CARD-\d+$/u)),
  Schema.brand("BoardCardSequenceIdentifier")
).annotate({
  identifier: "BoardCardSequenceIdentifier",
  title: "BoardCardSequenceIdentifier",
  description: "Generated board card identifier in CARD-123 form."
})
export type BoardCardSequenceIdentifier = Schema.Schema.Type<typeof BoardCardSequenceIdentifier>

export const BoardIdentifier = NonEmptyString.pipe(Schema.brand("BoardIdentifier"))
export type BoardIdentifier = Schema.Schema.Type<typeof BoardIdentifier>

export const BoardCardIdentifier = NonEmptyString.pipe(Schema.brand("BoardCardIdentifier"))
export type BoardCardIdentifier = Schema.Schema.Type<typeof BoardCardIdentifier>

export const BoardRefSchema = BoardIdentifier.annotate({
  description:
    "Board locator: board _id or exact board name. Names must match exactly; use list_boards to discover IDs when names are ambiguous."
})
export type BoardRef = Schema.Schema.Type<typeof BoardRefSchema>

export const BoardCardRefSchema = BoardCardIdentifier.annotate({
  description:
    "Board card locator scoped to the board: card _id, CARD-123 identifier, bare number 123, or exact card title."
})
export type BoardCardRef = Schema.Schema.Type<typeof BoardCardRefSchema>

const MemberIdentifier = NonEmptyString.annotate({
  description: "Workspace employee locator: Employee _id, exact email address, or exact person display name."
})

export const BoardCardCoverSchema = Schema.Struct({
  color: Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 0, maximum: MAX_COLOR_INDEX })).annotate({
    description: `Board card cover color index from 0 through ${MAX_COLOR_INDEX}.`
  }),
  size: Schema.Literals(["small", "large"]).annotateKey({ description: "Board card cover size." })
}).annotate({ title: "BoardCardCoverInput", description: "Cover settings for a board card." })
export type BoardCardCoverInput = Schema.Schema.Type<typeof BoardCardCoverSchema>

export const ListBoardsParamsSchema = Schema.Struct({
  includeArchived: Schema.optional(
    Schema.Boolean.annotate({
      description: `Include archived boards in results (default: ${DEFAULT_INCLUDE_ARCHIVED}, showing only active boards).`
    })
  ),
  limit: Schema.optional(
    LimitParam.annotateKey({ description: `Maximum number of boards to return (default: ${DEFAULT_LIMIT}).` })
  )
}).annotate({
  title: "ListBoardsParams",
  description: "Parameters for listing Huly boards from the @hcengineering/board module."
})
export type ListBoardsParams = Schema.Schema.Type<typeof ListBoardsParamsSchema>

export const GetBoardParamsSchema = Schema.Struct({ board: BoardRefSchema }).annotate({
  title: "GetBoardParams",
  description: "Parameters for getting one board by _id or exact name."
})
export type GetBoardParams = Schema.Schema.Type<typeof GetBoardParamsSchema>

export const CreateBoardParamsSchema = Schema.Struct({
  name: BoardName.annotateKey({ description: "Board name. Creation is idempotent by exact active board name." }),
  description: Schema.optional(Schema.String.annotateKey({ description: "Plain text board description." })),
  private: Schema.optional(
    Schema.Boolean.annotateKey({ description: `Whether the board is private (default: ${DEFAULT_PRIVATE}).` })
  ),
  projectType: Schema.optional(
    ProjectTypeRefSchema.annotate({
      description:
        "Optional board project type _id or exact name. Omit to use the unambiguous project type whose descriptor is board.descriptors.BoardType."
    })
  )
}).annotate({
  title: "CreateBoardParams",
  description: "Parameters for creating a Huly board. Returns the existing active board when the name already exists."
})
export type CreateBoardParams = Schema.Schema.Type<typeof CreateBoardParamsSchema>

export const UPDATE_BOARD_FIELDS = ["name", "description", "private"] as const satisfies ReadonlyArray<
  "name" | "description" | "private"
>

export const UpdateBoardParamsSchema = Schema.Struct({
  board: BoardRefSchema,
  name: Schema.optional(BoardName.annotateKey({ description: "New exact board name." })),
  description: Schema.optional(clearableText("New plain text board description.")),
  private: Schema.optional(Schema.Boolean.annotateKey({ description: "Whether the board is private." }))
})
  .pipe(
    Schema.check(
      Schema.makeFilter((params) =>
        hasAtLeastOneDefined(params, UPDATE_BOARD_FIELDS)
          ? undefined
          : atLeastOneUpdateFieldMessage(UPDATE_BOARD_FIELDS)
      )
    )
  )
  .annotate({
    title: "UpdateBoardParams",
    description: `Parameters for updating a board. ${atLeastOneUpdateFieldMessage(UPDATE_BOARD_FIELDS)}`
  })
export type UpdateBoardParams = Schema.Schema.Type<typeof UpdateBoardParamsSchema>
assertUpdateFields<UpdateBoardParams>()(["board"], UPDATE_BOARD_FIELDS)

export const BoardMutationParamsSchema = Schema.Struct({ board: BoardRefSchema }).annotate({
  title: "BoardMutationParams",
  description: "Parameters for archiving or unarchiving a board."
})
export type BoardMutationParams = Schema.Schema.Type<typeof BoardMutationParamsSchema>

export const ListBoardCardsParamsSchema = Schema.Struct({
  board: BoardRefSchema,
  includeArchived: Schema.optional(
    Schema.Boolean.annotate({
      description: `Include archived board cards in results (default: ${DEFAULT_INCLUDE_ARCHIVED}, showing only active cards).`
    })
  ),
  titleSearch: Schema.optional(
    Schema.String.annotateKey({ description: "Search board cards by title substring (case-insensitive SQL LIKE)." })
  ),
  limit: Schema.optional(
    LimitParam.annotateKey({ description: `Maximum number of board cards to return (default: ${DEFAULT_LIMIT}).` })
  )
}).annotate({ title: "ListBoardCardsParams", description: "Parameters for listing cards on one Huly board." })
export type ListBoardCardsParams = Schema.Schema.Type<typeof ListBoardCardsParamsSchema>

export const GetBoardCardParamsSchema = Schema.Struct({ board: BoardRefSchema, card: BoardCardRefSchema }).annotate({
  title: "GetBoardCardParams",
  description: "Parameters for getting one board card scoped to a board."
})
export type GetBoardCardParams = Schema.Schema.Type<typeof GetBoardCardParamsSchema>

export const CreateBoardCardParamsSchema = Schema.Struct({
  board: BoardRefSchema,
  title: BoardCardTitle.annotateKey({ description: "Board card title." }),
  description: Schema.optional(
    Schema.String.annotate({
      description: `Board card description in markdown. Stored as inline Huly Markup. ${HULY_NATIVE_REFERENCE_MARKDOWN_INPUT}`
    })
  ),
  kind: Schema.optional(
    TaskTypeRefSchema.annotate({
      description:
        "Board card task type _id or exact task type name. Omit to use the unambiguous board card task type for the board project type."
    })
  ),
  status: Schema.optional(
    NonEmptyString.annotate({
      description:
        "Workflow status _id or exact status name. Omit to use the first status configured on the board project type."
    })
  ),
  assignee: Schema.optional(
    PersonRefInput.annotate({
      description: "Assignee Employee _id, exact email address, or exact person display name."
    })
  ),
  members: Schema.optional(
    Schema.Array(MemberIdentifier).annotate({
      description: "Initial card members. Each entry accepts Employee _id, exact email, or exact person display name."
    })
  ),
  location: Schema.optional(Schema.String.annotateKey({ description: "Optional card location text." })),
  cover: Schema.optional(BoardCardCoverSchema),
  startDate: Schema.optional(Timestamp.annotateKey({ description: "Start date timestamp in milliseconds." })),
  dueDate: Schema.optional(Timestamp.annotateKey({ description: "Due date timestamp in milliseconds." }))
}).annotate({
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
  title: Schema.optional(BoardCardTitle.annotateKey({ description: "New board card title." })),
  description: Schema.optional(
    clearableText(`New board card description in markdown. ${HULY_NATIVE_REFERENCE_MARKDOWN_INPUT}`)
  ),
  status: Schema.optional(
    NonEmptyString.annotateKey({
      description: "New workflow status _id or exact status name in the board project type."
    })
  ),
  assignee: Schema.optional(
    Schema.NullOr(PersonRefInput).annotate({
      description: "New assignee Employee _id, exact email, or exact person display name; null unassigns."
    })
  ),
  members: Schema.optional(
    Schema.Array(MemberIdentifier).annotate({
      description: "Replace card members with this exact list. Cannot be combined with addMembers or removeMembers."
    })
  ),
  addMembers: Schema.optional(
    Schema.Array(MemberIdentifier)
      .check(Schema.isMinLength(1))
      .annotateKey({ description: "Members to add without replacing existing members." })
  ),
  removeMembers: Schema.optional(
    Schema.Array(MemberIdentifier)
      .check(Schema.isMinLength(1))
      .annotateKey({ description: "Members to remove without replacing existing members." })
  ),
  location: Schema.optional(clearableText("New card location.")),
  cover: Schema.optional(
    Schema.NullOr(BoardCardCoverSchema).annotateKey({ description: "New card cover; null clears the cover." })
  ),
  startDate: Schema.optional(
    Schema.NullOr(Timestamp).annotateKey({ description: "New start date timestamp in milliseconds; null clears it." })
  ),
  dueDate: Schema.optional(
    Schema.NullOr(Timestamp).annotateKey({ description: "New due date timestamp in milliseconds; null clears it." })
  )
})
  .pipe(
    Schema.check(
      Schema.makeFilter((params) => {
        if (!hasAtLeastOneDefined(params, UPDATE_BOARD_CARD_FIELDS)) {
          return atLeastOneUpdateFieldMessage(UPDATE_BOARD_CARD_FIELDS)
        }
        if (params.members !== undefined && (params.addMembers !== undefined || params.removeMembers !== undefined)) {
          return "Cannot provide members with addMembers or removeMembers. Replace all members or mutate members, not both."
        }
        return undefined
      })
    )
  )
  .annotate({
    title: "UpdateBoardCardParams",
    description: `Parameters for updating a board card. ${atLeastOneUpdateFieldMessage(UPDATE_BOARD_CARD_FIELDS)}`
  })
export type UpdateBoardCardParams = Schema.Schema.Type<typeof UpdateBoardCardParamsSchema>
assertUpdateFields<UpdateBoardCardParams>()(["board", "card"], UPDATE_BOARD_CARD_FIELDS)

export const BoardCardMutationParamsSchema = Schema.Struct({
  board: BoardRefSchema,
  card: BoardCardRefSchema
}).annotate({
  title: "BoardCardMutationParams",
  description: "Parameters for archiving, unarchiving, or deleting one board card scoped to a board."
})
export type BoardCardMutationParams = Schema.Schema.Type<typeof BoardCardMutationParamsSchema>

const BOARD_REF_DESCRIPTION =
  "Board locator: board _id or exact board name. Names must match exactly; use list_boards to discover IDs when names are ambiguous."
const BOARD_CARD_REF_DESCRIPTION =
  "Board card locator scoped to the board: card _id, CARD-123 identifier, bare number 123, or exact card title."
const boardParamsJsonSchema = (schema: Schema.Constraint, descriptions: Readonly<Record<string, string>>): object =>
  withJsonSchemaPropertyDescriptions(toDraft07JsonSchema(schema), descriptions)

const withBoardCardMemberExclusion = (schema: object): object => ({
  ...schema,
  allOf: [{ not: { required: ["members", "addMembers"] } }, { not: { required: ["members", "removeMembers"] } }]
})

export const listBoardsParamsJsonSchema = boardParamsJsonSchema(ListBoardsParamsSchema, {
  includeArchived: `Include archived boards in results (default: ${DEFAULT_INCLUDE_ARCHIVED}, showing only active boards).`,
  limit: `Maximum number of boards to return (default: ${DEFAULT_LIMIT}).`
})
export const getBoardParamsJsonSchema = boardParamsJsonSchema(GetBoardParamsSchema, { board: BOARD_REF_DESCRIPTION })
export const createBoardParamsJsonSchema = boardParamsJsonSchema(CreateBoardParamsSchema, {
  name: "Board name. Creation is idempotent by exact active board name.",
  description: "Plain text board description.",
  private: `Whether the board is private (default: ${DEFAULT_PRIVATE}).`,
  projectType:
    "Optional board project type _id or exact name. Omit to use the unambiguous project type whose descriptor is board.descriptors.BoardType."
})
export const updateBoardParamsJsonSchema = withAtLeastOneRequired(
  boardParamsJsonSchema(UpdateBoardParamsSchema, {
    board: BOARD_REF_DESCRIPTION,
    name: "New exact board name.",
    description: "New plain text board description; null clears it.",
    private: "Whether the board is private."
  }),
  UPDATE_BOARD_FIELDS
)
export const boardMutationParamsJsonSchema = boardParamsJsonSchema(BoardMutationParamsSchema, {
  board: BOARD_REF_DESCRIPTION
})
export const listBoardCardsParamsJsonSchema = boardParamsJsonSchema(ListBoardCardsParamsSchema, {
  board: BOARD_REF_DESCRIPTION,
  includeArchived: `Include archived board cards in results (default: ${DEFAULT_INCLUDE_ARCHIVED}, showing only active cards).`,
  titleSearch: "Search board cards by title substring (case-insensitive SQL LIKE).",
  limit: `Maximum number of board cards to return (default: ${DEFAULT_LIMIT}).`
})
export const getBoardCardParamsJsonSchema = boardParamsJsonSchema(GetBoardCardParamsSchema, {
  board: BOARD_REF_DESCRIPTION,
  card: BOARD_CARD_REF_DESCRIPTION
})
export const createBoardCardParamsJsonSchema = boardParamsJsonSchema(CreateBoardCardParamsSchema, {
  board: BOARD_REF_DESCRIPTION,
  title: "Board card title.",
  description: `Board card description in markdown. Stored as inline Huly Markup. ${HULY_NATIVE_REFERENCE_MARKDOWN_INPUT}`,
  kind: "Board card task type _id or exact task type name. Omit to use the unambiguous board card task type for the board project type.",
  status:
    "Workflow status _id or exact status name. Omit to use the first status configured on the board project type.",
  assignee: "Assignee Employee _id, exact email address, or exact person display name.",
  members: "Initial card members. Each entry accepts Employee _id, exact email, or exact person display name.",
  location: "Optional card location text.",
  cover: "Cover settings for a board card.",
  startDate: "Start date timestamp in milliseconds.",
  dueDate: "Due date timestamp in milliseconds."
})
export const updateBoardCardParamsJsonSchema = withBoardCardMemberExclusion(
  withAtLeastOneRequired(
    boardParamsJsonSchema(UpdateBoardCardParamsSchema, {
      board: BOARD_REF_DESCRIPTION,
      card: BOARD_CARD_REF_DESCRIPTION,
      title: "New board card title.",
      description: `New board card description in markdown; null clears it. ${HULY_NATIVE_REFERENCE_MARKDOWN_INPUT}`,
      status: "New workflow status _id or exact status name in the board project type.",
      assignee: "New assignee Employee _id, exact email, or exact person display name; null unassigns.",
      members: "Replace card members with this exact list. Cannot be combined with addMembers or removeMembers.",
      addMembers: "Members to add without replacing existing members.",
      removeMembers: "Members to remove without replacing existing members.",
      location: "New card location; null clears it.",
      cover: "New card cover; null clears the cover.",
      startDate: "New start date timestamp in milliseconds; null clears it.",
      dueDate: "New due date timestamp in milliseconds; null clears it."
    }),
    UPDATE_BOARD_CARD_FIELDS
  )
)
export const boardCardMutationParamsJsonSchema = boardParamsJsonSchema(BoardCardMutationParamsSchema, {
  board: BOARD_REF_DESCRIPTION,
  card: BOARD_CARD_REF_DESCRIPTION
})

export const parseListBoardsParams = Schema.decodeUnknownEffect(ListBoardsParamsSchema)
export const parseGetBoardParams = Schema.decodeUnknownEffect(GetBoardParamsSchema)
export const parseCreateBoardParams = Schema.decodeUnknownEffect(CreateBoardParamsSchema)
export const parseUpdateBoardParams = Schema.decodeUnknownEffect(UpdateBoardParamsSchema)
export const parseBoardMutationParams = Schema.decodeUnknownEffect(BoardMutationParamsSchema)
export const parseListBoardCardsParams = Schema.decodeUnknownEffect(ListBoardCardsParamsSchema)
export const parseGetBoardCardParams = Schema.decodeUnknownEffect(GetBoardCardParamsSchema)
export const parseCreateBoardCardParams = Schema.decodeUnknownEffect(CreateBoardCardParamsSchema)
export const parseUpdateBoardCardParams = Schema.decodeUnknownEffect(UpdateBoardCardParamsSchema)
export const parseBoardCardMutationParams = Schema.decodeUnknownEffect(BoardCardMutationParamsSchema)
