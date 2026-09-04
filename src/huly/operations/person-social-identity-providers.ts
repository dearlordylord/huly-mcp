import type { SocialIdentityProvider } from "@hcengineering/contact"
import { Effect, Schema } from "effect"

import { SocialIdentityProviderSchema } from "../../domain/schemas/person-administration.js"
import { HulyClient, type HulyClientError } from "../client.js"
import { HulyDataInvalidError } from "../errors.js"
import { contact } from "../huly-plugins.js"
import { hulyQuery } from "./query-helpers.js"

type SocialIdentityProviderResult = Schema.Schema.Type<typeof SocialIdentityProviderSchema>

const decodeSocialIdentityProviders = (
  input: unknown
): Effect.Effect<ReadonlyArray<SocialIdentityProviderResult>, HulyDataInvalidError> =>
  Schema.decodeUnknownEffect(Schema.Array(SocialIdentityProviderSchema))(input).pipe(
    Effect.mapError(
      (cause) => new HulyDataInvalidError({ operation: "listSocialIdentityProviders", entity: "provider", cause })
    )
  )

export const listSocialIdentityProviders = Effect.fn("PersonAdministration.listSocialIdentityProviders")(
  function* (): Effect.fn.Return<
    ReadonlyArray<SocialIdentityProviderResult>,
    HulyClientError | HulyDataInvalidError,
    HulyClient
  > {
    const client = yield* HulyClient
    const providers = yield* client.findAllInModel<SocialIdentityProvider>(
      contact.class.SocialIdentityProvider,
      hulyQuery({})
    )
    const decoded = yield* decodeSocialIdentityProviders(
      providers.map((provider) => ({ id: provider._id, type: provider.type }))
    )
    return [...decoded].sort(
      (left, right) => left.type.localeCompare(right.type) || String(left.id).localeCompare(String(right.id))
    )
  }
)
