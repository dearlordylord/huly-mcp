import { Schema } from "effect"

export class BoardNotFoundError extends Schema.TaggedError<BoardNotFoundError>()(
  "BoardNotFoundError",
  {
    identifier: Schema.String
  }
) {
  override get message(): string {
    return `Board '${this.identifier}' not found`
  }
}

export class BoardIdentifierAmbiguousError extends Schema.TaggedError<BoardIdentifierAmbiguousError>()(
  "BoardIdentifierAmbiguousError",
  {
    identifier: Schema.String,
    matches: Schema.Number
  }
) {
  override get message(): string {
    return `Board '${this.identifier}' matched ${this.matches} boards; pass a board _id instead`
  }
}

export class BoardCardNotFoundError extends Schema.TaggedError<BoardCardNotFoundError>()(
  "BoardCardNotFoundError",
  {
    identifier: Schema.String,
    board: Schema.String
  }
) {
  override get message(): string {
    return `Board card '${this.identifier}' not found on board '${this.board}'`
  }
}

export class BoardCardIdentifierAmbiguousError extends Schema.TaggedError<BoardCardIdentifierAmbiguousError>()(
  "BoardCardIdentifierAmbiguousError",
  {
    identifier: Schema.String,
    board: Schema.String,
    matches: Schema.Number
  }
) {
  override get message(): string {
    return `Board card '${this.identifier}' matched ${this.matches} cards on board '${this.board}'; pass a card _id`
  }
}

export class BoardProjectTypeNotFoundError extends Schema.TaggedError<BoardProjectTypeNotFoundError>()(
  "BoardProjectTypeNotFoundError",
  {
    identifier: Schema.String
  }
) {
  override get message(): string {
    return `Board project type '${this.identifier}' not found`
  }
}

export class BoardProjectTypeIdentifierAmbiguousError
  extends Schema.TaggedError<BoardProjectTypeIdentifierAmbiguousError>()(
    "BoardProjectTypeIdentifierAmbiguousError",
    {
      identifier: Schema.String,
      matches: Schema.Number
    }
  )
{
  override get message(): string {
    return `Board project type '${this.identifier}' matched ${this.matches} project types; pass a project type _id`
  }
}

export class BoardTaskTypeNotFoundError extends Schema.TaggedError<BoardTaskTypeNotFoundError>()(
  "BoardTaskTypeNotFoundError",
  {
    identifier: Schema.String,
    board: Schema.String
  }
) {
  override get message(): string {
    return `Board task type '${this.identifier}' not found for board '${this.board}'`
  }
}

export class BoardTaskTypeIdentifierAmbiguousError extends Schema.TaggedError<BoardTaskTypeIdentifierAmbiguousError>()(
  "BoardTaskTypeIdentifierAmbiguousError",
  {
    identifier: Schema.String,
    board: Schema.String,
    matches: Schema.Number
  }
) {
  override get message(): string {
    return `Board task type '${this.identifier}' matched ${this.matches} task types for board '${this.board}'; pass a task type _id`
  }
}

export class BoardStatusNotFoundError extends Schema.TaggedError<BoardStatusNotFoundError>()(
  "BoardStatusNotFoundError",
  {
    identifier: Schema.String,
    board: Schema.String
  }
) {
  override get message(): string {
    return `Board status '${this.identifier}' not found for board '${this.board}'`
  }
}

export class BoardStatusIdentifierAmbiguousError extends Schema.TaggedError<BoardStatusIdentifierAmbiguousError>()(
  "BoardStatusIdentifierAmbiguousError",
  {
    identifier: Schema.String,
    board: Schema.String,
    matches: Schema.Number
  }
) {
  override get message(): string {
    return `Board status '${this.identifier}' matched ${this.matches} statuses for board '${this.board}'; pass a status _id`
  }
}

export class BoardModelSequenceMissingError extends Schema.TaggedError<BoardModelSequenceMissingError>()(
  "BoardModelSequenceMissingError",
  {
    cardClass: Schema.String
  }
) {
  override get message(): string {
    return `Board model sequence for '${this.cardClass}' is missing`
  }
}

export class BoardArchivedCardDeleteError extends Schema.TaggedError<BoardArchivedCardDeleteError>()(
  "BoardArchivedCardDeleteError",
  {
    identifier: Schema.String,
    board: Schema.String
  }
) {
  override get message(): string {
    return `Board card '${this.identifier}' on board '${this.board}' must be archived before delete_board_card`
  }
}

export class BoardMutationUnsupportedError extends Schema.TaggedError<BoardMutationUnsupportedError>()(
  "BoardMutationUnsupportedError",
  {
    message: Schema.String
  }
) {}

export class BoardLabelNotFoundError extends Schema.TaggedError<BoardLabelNotFoundError>()(
  "BoardLabelNotFoundError",
  {
    identifier: Schema.String
  }
) {
  override get message(): string {
    return `Board label '${this.identifier}' not found`
  }
}

export class BoardLabelIdentifierAmbiguousError extends Schema.TaggedError<BoardLabelIdentifierAmbiguousError>()(
  "BoardLabelIdentifierAmbiguousError",
  {
    identifier: Schema.String,
    matches: Schema.Number
  }
) {
  override get message(): string {
    return `Board label '${this.identifier}' matched ${this.matches} labels; pass a label _id`
  }
}

export class BoardSavedViewNotFoundError extends Schema.TaggedError<BoardSavedViewNotFoundError>()(
  "BoardSavedViewNotFoundError",
  {
    identifier: Schema.String
  }
) {
  override get message(): string {
    return `Board saved view '${this.identifier}' not found`
  }
}

export class BoardSavedViewIdentifierAmbiguousError
  extends Schema.TaggedError<BoardSavedViewIdentifierAmbiguousError>()(
    "BoardSavedViewIdentifierAmbiguousError",
    {
      identifier: Schema.String,
      matches: Schema.Number
    }
  )
{
  override get message(): string {
    return `Board saved view '${this.identifier}' matched ${this.matches} saved views; pass a saved view _id`
  }
}

export class BoardMenuPageNotFoundError extends Schema.TaggedError<BoardMenuPageNotFoundError>()(
  "BoardMenuPageNotFoundError",
  {
    identifier: Schema.String
  }
) {
  override get message(): string {
    return `Board menu page '${this.identifier}' not found`
  }
}

export class BoardMenuPageIdentifierAmbiguousError extends Schema.TaggedError<BoardMenuPageIdentifierAmbiguousError>()(
  "BoardMenuPageIdentifierAmbiguousError",
  {
    identifier: Schema.String,
    matches: Schema.Number
  }
) {
  override get message(): string {
    return `Board menu page '${this.identifier}' matched ${this.matches} menu pages; pass a menu page _id`
  }
}

export class BoardViewletNotFoundError extends Schema.TaggedError<BoardViewletNotFoundError>()(
  "BoardViewletNotFoundError",
  {
    identifier: Schema.String
  }
) {
  override get message(): string {
    return `Board viewlet '${this.identifier}' not found`
  }
}

export class BoardViewletIdentifierAmbiguousError extends Schema.TaggedError<BoardViewletIdentifierAmbiguousError>()(
  "BoardViewletIdentifierAmbiguousError",
  {
    identifier: Schema.String,
    matches: Schema.Number
  }
) {
  override get message(): string {
    return `Board viewlet '${this.identifier}' matched ${this.matches} viewlets; pass a viewlet _id`
  }
}
