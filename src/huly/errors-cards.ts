/**
 * Card domain errors.
 *
 * @module
 */
import { Schema } from "effect"

export class CardSpaceNotFoundError extends Schema.TaggedError<CardSpaceNotFoundError>()(
  "CardSpaceNotFoundError",
  {
    identifier: Schema.String
  }
) {
  override get message(): string {
    return `Card space '${this.identifier}' not found`
  }
}

export class CardNotFoundError extends Schema.TaggedError<CardNotFoundError>()(
  "CardNotFoundError",
  {
    identifier: Schema.String,
    cardSpace: Schema.String
  }
) {
  override get message(): string {
    return `Card '${this.identifier}' not found in card space '${this.cardSpace}'`
  }
}

export class MasterTagNotFoundError extends Schema.TaggedError<MasterTagNotFoundError>()(
  "MasterTagNotFoundError",
  {
    identifier: Schema.String,
    cardSpace: Schema.String
  }
) {
  override get message(): string {
    return `Master tag '${this.identifier}' not found in card space '${this.cardSpace}'`
  }
}

export class CardCommentNotFoundError extends Schema.TaggedError<CardCommentNotFoundError>()(
  "CardCommentNotFoundError",
  {
    commentId: Schema.String,
    card: Schema.String,
    cardSpace: Schema.String
  }
) {
  override get message(): string {
    return `Comment '${this.commentId}' not found on card '${this.card}' in card space '${this.cardSpace}'`
  }
}
