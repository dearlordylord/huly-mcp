/**
 * Generic space, space type, role, and permission domain errors.
 *
 * @module
 */
import { Schema } from "effect"

import { NonEmptyString, ObjectClassName, SpaceId, SpaceTypeId } from "../domain/schemas/shared.js"

const MIN_AMBIGUOUS_SPACE_MATCHES = 2

const AmbiguousSpaceMatchSchema = Schema.Struct({
  id: SpaceId,
  name: NonEmptyString,
  class: ObjectClassName,
  type: Schema.optional(SpaceTypeId)
})

const AmbiguousSpaceTypeMatchSchema = Schema.Struct({
  id: SpaceTypeId,
  name: NonEmptyString,
  targetClass: ObjectClassName
})

export class SpaceNotFoundError extends Schema.TaggedError<SpaceNotFoundError>()(
  "SpaceNotFoundError",
  {
    identifier: NonEmptyString
  }
) {
  override get message(): string {
    return `Space '${this.identifier}' not found`
  }
}

export class SpaceIdentifierAmbiguousError extends Schema.TaggedError<SpaceIdentifierAmbiguousError>()(
  "SpaceIdentifierAmbiguousError",
  {
    identifier: NonEmptyString,
    matches: Schema.Array(AmbiguousSpaceMatchSchema).pipe(Schema.minItems(MIN_AMBIGUOUS_SPACE_MATCHES))
  }
) {
  override get message(): string {
    const details = this.matches
      .map((match) => `${match.id} (${match.class}${match.type === undefined ? "" : `, type ${match.type}`})`)
      .join(", ")
    return `Space '${this.identifier}' is ambiguous; use a space id or narrow by class/type. Matches: ${details}`
  }
}

export class SpaceTypeNotFoundError extends Schema.TaggedError<SpaceTypeNotFoundError>()(
  "SpaceTypeNotFoundError",
  {
    identifier: NonEmptyString
  }
) {
  override get message(): string {
    return `Space type '${this.identifier}' not found`
  }
}

export class SpaceTypeIdentifierAmbiguousError extends Schema.TaggedError<SpaceTypeIdentifierAmbiguousError>()(
  "SpaceTypeIdentifierAmbiguousError",
  {
    identifier: NonEmptyString,
    matches: Schema.Array(AmbiguousSpaceTypeMatchSchema).pipe(Schema.minItems(MIN_AMBIGUOUS_SPACE_MATCHES))
  }
) {
  override get message(): string {
    const details = this.matches.map((match) => `${match.id} (${match.targetClass})`).join(", ")
    return `Space type '${this.identifier}' is ambiguous; use a space type id. Matches: ${details}`
  }
}
