import { Effect } from "effect"

import type { PersonAdministrationLocator } from "../../domain/schemas/person-administration.js"
import type { HulyClient, HulyClientError } from "../client.js"
import { type HulyDataInvalidError, type PersonIdentifierAmbiguousError, PersonNotFoundError } from "../errors.js"
import { findPersonByExactEmail, findPersonByExactName, findPersonById } from "./contacts-shared.js"
import { decodeResolvedPerson, type ResolvedPerson } from "./person-administration-boundaries.js"

export type ResolvePersonAdministrationError =
  | HulyClientError
  | HulyDataInvalidError
  | PersonIdentifierAmbiguousError
  | PersonNotFoundError

export const personLocatorText = (locator: PersonAdministrationLocator): string =>
  "id" in locator ? locator.id : "email" in locator ? locator.email : locator.name

export const resolvePersonAdministrationTarget = Effect.fn("PersonAdministration.resolveTarget")(function* (
  client: HulyClient["Service"],
  locator: PersonAdministrationLocator
): Effect.fn.Return<ResolvedPerson, ResolvePersonAdministrationError> {
  const person =
    "id" in locator
      ? yield* findPersonById(client, locator.id)
      : "email" in locator
        ? yield* findPersonByExactEmail(client, locator.email)
        : yield* findPersonByExactName(client, locator.name)
  if (person === undefined) return yield* new PersonNotFoundError({ identifier: personLocatorText(locator) })
  return yield* decodeResolvedPerson(person)
})
