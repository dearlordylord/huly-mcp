import type { Organization as HulyOrganization } from "@hcengineering/contact"
import { Effect, Option } from "effect"

import { Count } from "../../domain/schemas/shared.js"
import type { HulyClient, HulyClientError } from "../client.js"
import { OrganizationIdentifierAmbiguousError, OrganizationNotFoundError } from "../errors.js"
import { contact } from "../huly-plugins.js"
import { hulyQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"

const findOrganizationByIdentifier = (
  client: HulyClient["Type"],
  identifier: string
): Effect.Effect<
  Option.Option<HulyOrganization>,
  HulyClientError | OrganizationIdentifierAmbiguousError
> =>
  Effect.gen(function*() {
    const byId = Option.fromNullable(
      yield* client.findOne<HulyOrganization>(
        contact.class.Organization,
        hulyQuery<HulyOrganization>({ _id: toRef<HulyOrganization>(identifier) })
      )
    )
    if (Option.isSome(byId)) return byId

    const byName = yield* client.findAll<HulyOrganization>(
      contact.class.Organization,
      hulyQuery<HulyOrganization>({ name: identifier })
    )

    if (byName.length === 0) return Option.none()
    if (byName.length > 1) {
      return yield* new OrganizationIdentifierAmbiguousError({
        identifier,
        matches: Count.make(byName.length)
      })
    }
    return Option.some(byName[0])
  })

export const resolveOrganizationByIdentifier = (
  client: HulyClient["Type"],
  identifier: string
): Effect.Effect<
  HulyOrganization,
  HulyClientError | OrganizationIdentifierAmbiguousError | OrganizationNotFoundError
> =>
  Effect.flatMap(findOrganizationByIdentifier(client, identifier), (organization) =>
    Option.match(organization, {
      onNone: () => Effect.fail(new OrganizationNotFoundError({ identifier })),
      onSome: Effect.succeed
    }))
