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

export const listSocialIdentityProviders = (): Effect.Effect<
  ReadonlyArray<SocialIdentityProviderResult>,
  HulyClientError | HulyDataInvalidError,
  HulyClient
> =>
  HulyClient.pipe(
    Effect.flatMap((client) =>
      client.findAllInModel<SocialIdentityProvider>(contact.class.SocialIdentityProvider, hulyQuery({}))
    ),
    Effect.map((providers) => providers.map((provider) => ({ id: provider._id, type: provider.type }))),
    Effect.flatMap(decodeSocialIdentityProviders),
    Effect.map((decoded) =>
      [...decoded].sort(
        (left, right) => left.type.localeCompare(right.type) || String(left.id).localeCompare(String(right.id))
      )
    )
  )
