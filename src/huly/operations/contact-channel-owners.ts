import type { Organization as HulyOrganization, Person as HulyPerson } from "@hcengineering/contact"
import type { Class, Ref } from "@hcengineering/core"
import { Effect, Option, Schema } from "effect"

import { Email, PersonName } from "../../domain/schemas/shared.js"
import type { HulyClient, HulyClientError } from "../client.js"
import type {
  OrganizationIdentifierAmbiguousError,
  OrganizationNotFoundError,
  PersonIdentifierAmbiguousError
} from "../errors.js"
import { PersonNotFoundError } from "../errors.js"
import { contact } from "../huly-plugins.js"
import { findPersonByExactEmailOrName, findPersonById } from "./contacts-shared.js"
import { resolveOrganizationByIdentifier } from "./organization-resolvers.js"

export type ChannelOwner = HulyPerson | HulyOrganization

export interface ResolvedOwner<Owner extends ChannelOwner> {
  readonly id: Ref<Owner>
  readonly ownerClass: Ref<Class<Owner>>
  readonly identifier: string
}

const resolvePerson = (
  client: HulyClient["Type"],
  identifier: string
): Effect.Effect<HulyPerson, HulyClientError | PersonIdentifierAmbiguousError | PersonNotFoundError> =>
  Effect.gen(function*() {
    const byId = Option.fromNullable(yield* findPersonById(client, identifier))
    return yield* Option.match(byId, {
      onNone: () =>
        Effect.flatMap(
          Effect.map(
            findPersonByExactEmailOrName(
              client,
              Schema.is(Email)(identifier) ? identifier : PersonName.make(identifier)
            ),
            Option.fromNullable
          ),
          (byEmailOrName) =>
            Option.match(byEmailOrName, {
              onNone: () => Effect.fail(new PersonNotFoundError({ identifier })),
              onSome: Effect.succeed
            })
        ),
      onSome: Effect.succeed
    })
  })

export const resolvePersonOwner = (
  client: HulyClient["Type"],
  identifier: string
): Effect.Effect<ResolvedOwner<HulyPerson>, HulyClientError | PersonIdentifierAmbiguousError | PersonNotFoundError> =>
  Effect.map(resolvePerson(client, identifier), (person) => ({
    id: person._id,
    ownerClass: contact.class.Person,
    identifier
  }))

export const resolveOrganizationOwner = (
  client: HulyClient["Type"],
  identifier: string
): Effect.Effect<
  ResolvedOwner<HulyOrganization>,
  HulyClientError | OrganizationIdentifierAmbiguousError | OrganizationNotFoundError
> =>
  Effect.gen(function*() {
    const org = yield* resolveOrganizationByIdentifier(client, identifier)
    return { id: org._id, ownerClass: contact.class.Organization, identifier }
  })
