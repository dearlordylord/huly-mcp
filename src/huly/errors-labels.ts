/**
 * Label/tag domain errors.
 *
 * @module
 */
import { Schema } from "effect"

import { NonEmptyString, TagElementId, TagIdentifier } from "../domain/schemas/shared.js"

const MIN_AMBIGUOUS_LABEL_MATCHES = 2

export class TagNotFoundError extends Schema.TaggedError<TagNotFoundError>()("TagNotFoundError", {
  identifier: Schema.String
}) {
  override get message(): string {
    return `Tag/label '${this.identifier}' not found`
  }
}

export class TagCategoryNotFoundError extends Schema.TaggedError<TagCategoryNotFoundError>()(
  "TagCategoryNotFoundError",
  { identifier: Schema.String }
) {
  override get message(): string {
    return `Tag category '${this.identifier}' not found`
  }
}

export class TagIdentifierAmbiguousError extends Schema.TaggedError<TagIdentifierAmbiguousError>()(
  "TagIdentifierAmbiguousError",
  {
    identifier: TagIdentifier,
    candidateIds: Schema.Array(TagElementId).pipe(Schema.minItems(MIN_AMBIGUOUS_LABEL_MATCHES))
  }
) {
  override get message(): NonEmptyString {
    return NonEmptyString.make(
      `Tag/label '${this.identifier}' matched multiple definitions; pass one of these label IDs: ${this.candidateIds.join(", ")}`
    )
  }
}

export const LabelDomainError = Schema.Union(TagNotFoundError, TagCategoryNotFoundError, TagIdentifierAmbiguousError)
