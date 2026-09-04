import { Schema } from "effect"

import { CommentId, NonEmptyString, PersonId } from "../domain/schemas/shared.js"

export class PersonCommentNotFoundError extends Schema.TaggedError<PersonCommentNotFoundError>()(
  "PersonCommentNotFoundError",
  { personId: PersonId, commentId: CommentId }
) {
  override get message(): string {
    return `Comment '${this.commentId}' is not attached to person '${this.personId}'`
  }
}

export class PersonIdentityRepairUnsupportedError extends Schema.TaggedError<PersonIdentityRepairUnsupportedError>()(
  "PersonIdentityRepairUnsupportedError",
  { personId: PersonId, reason: NonEmptyString }
) {
  override get message(): string {
    return `Social identity repair is unsupported for person '${this.personId}': ${this.reason}`
  }
}

export const PersonAdministrationDomainError = Schema.Union([
  PersonCommentNotFoundError,
  PersonIdentityRepairUnsupportedError
])
