import type { Person } from "@hcengineering/contact"
import { Effect } from "effect"

import type { PersonAdministrationLocator } from "../../domain/schemas/person-administration.js"
import type { HulyClient, HulyClientError } from "../client.js"
import { PersonNotFoundError, type PersonIdentifierAmbiguousError } from "../errors.js"
import { findPersonByExactEmail, findPersonByExactName, findPersonById } from "./contacts-shared.js"

export type ResolvePersonAdministrationError = HulyClientError | PersonIdentifierAmbiguousError | PersonNotFoundError

export const personLocatorText = (locator: PersonAdministrationLocator): string =>
  "id" in locator ? locator.id : "email" in locator ? locator.email : locator.name

export const resolvePersonAdministrationTarget = (
  client: HulyClient["Service"],
  locator: PersonAdministrationLocator
): Effect.Effect<Person, ResolvePersonAdministrationError> =>
  Effect.gen(function* () {
    const person =
      "id" in locator
        ? yield* findPersonById(client, locator.id)
        : "email" in locator
          ? yield* findPersonByExactEmail(client, locator.email)
          : yield* findPersonByExactName(client, locator.name)
    if (person === undefined) return yield* new PersonNotFoundError({ identifier: personLocatorText(locator) })
    return person
  })
