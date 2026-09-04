import { Effect } from "effect"

import type { LeadPersonDocument } from "../../domain/schemas/leads-mutations.js"
import { Count, type PersonLocator } from "../../domain/schemas/shared.js"
import { PersonIdentifierAmbiguousError, PersonNotFoundError } from "../errors.js"

export const selectUniquePerson = (
  identifier: PersonLocator,
  candidates: ReadonlyArray<LeadPersonDocument | undefined>
): Effect.Effect<LeadPersonDocument, PersonIdentifierAmbiguousError | PersonNotFoundError> => {
  const uniqueMatches = [
    ...new Map(
      candidates
        .filter((person): person is LeadPersonDocument => person !== undefined)
        .map((person) => [String(person._id), person])
    ).values()
  ]
  if (uniqueMatches.length > 1) {
    return Effect.fail(new PersonIdentifierAmbiguousError({ identifier, matches: Count.make(uniqueMatches.length) }))
  }
  const person = uniqueMatches[0]
  return person === undefined ? Effect.fail(new PersonNotFoundError({ identifier })) : Effect.succeed(person)
}
