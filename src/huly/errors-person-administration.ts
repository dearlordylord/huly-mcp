import { Schema } from "effect"

import { PersonMergePreflightToken } from "../domain/schemas/person-merge.js"
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

export class PersonMergeSelfError extends Schema.TaggedError<PersonMergeSelfError>()("PersonMergeSelfError", {
  personId: PersonId
}) {
  override get message(): string {
    return `Source and survivor both resolve to person '${this.personId}'. Choose two distinct people.`
  }
}

export class PersonMergePreflightMismatchError extends Schema.TaggedError<PersonMergePreflightMismatchError>()(
  "PersonMergePreflightMismatchError",
  { expected: PersonMergePreflightToken, actual: PersonMergePreflightToken }
) {
  override get message(): string {
    return "Person merge impact or account eligibility changed since preflight. Preview again and review the new token."
  }
}

export class PersonMergeAccountBlockedError extends Schema.TaggedError<PersonMergeAccountBlockedError>()(
  "PersonMergeAccountBlockedError",
  { sourceId: PersonId, survivorId: PersonId, reason: NonEmptyString }
) {
  override get message(): string {
    return `Huly cannot safely merge the global people behind source '${this.sourceId}' and survivor '${this.survivorId}': ${this.reason}`
  }
}

export const PersonAdministrationDomainError = Schema.Union([
  PersonCommentNotFoundError,
  PersonIdentityRepairUnsupportedError,
  PersonMergeSelfError,
  PersonMergePreflightMismatchError,
  PersonMergeAccountBlockedError
])
