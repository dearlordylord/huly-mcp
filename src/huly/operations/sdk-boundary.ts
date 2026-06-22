import type { SocialIdentity } from "@hcengineering/contact"
import type { AccountUuid, Class, Doc, Mixin, PersonId as HulyPersonId, PersonUuid, Ref, Tx } from "@hcengineering/core"
import { Effect } from "effect"

import type { NonEmptyString } from "../../domain/schemas/shared.js"
import { InvalidPersonUuidError } from "../errors.js"

// Huly SDK uses `Ref<T>` (a branded string) for entity references.
// Our domain uses Effect Schema brands. No type-safe bridge exists; this is the boundary cast.
// eslint-disable-next-line no-restricted-syntax -- see above
export const toRef = <T extends Doc>(id: NonEmptyString | Ref<T>): Ref<T> => id as Ref<T>

// Huly class references are also branded strings. Dynamic generic-association
// operations receive class IDs from association metadata, so this is the
// centralized SDK boundary for converting validated class strings back to refs.
// eslint-disable-next-line no-restricted-syntax -- see above
export const toClassRef = <T extends Doc>(id: string | Ref<Class<T>>): Ref<Class<T>> => id as Ref<Class<T>>

// SpaceType targetClass can point at a mixin class; mixin APIs require the more
// specific branded reference type at the SDK boundary.
// eslint-disable-next-line no-restricted-syntax -- see above
export const toMixinRef = <T extends Doc>(id: string | Ref<Mixin<T>>): Ref<Mixin<T>> => id as Ref<Mixin<T>>

// Approval request tx/rejectedTx payloads are owned by the Huly SDK and are
// deliberately exposed as open payloads at the MCP boundary.
// eslint-disable-next-line no-restricted-syntax -- centralized SDK boundary for opaque Huly Tx payloads
export const toTx = (payload: unknown): Tx => payload as Tx

// Brands are erased at runtime; the domain value and SDK AccountUuid are both
// non-empty strings, so this is the final boundary conversion into the SDK type.
// eslint-disable-next-line no-restricted-syntax -- see above
export const toAccountUuid = (uuid: NonEmptyString | AccountUuid): AccountUuid => uuid as AccountUuid

// SocialIdentity ids are branded as both a document ref and a core PersonId.
// eslint-disable-next-line no-restricted-syntax -- see above
export const toSocialIdentityRef = (id: HulyPersonId): SocialIdentity["_id"] => id as SocialIdentity["_id"]

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const validatePersonUuid = (uuid?: string): Effect.Effect<PersonUuid | undefined, InvalidPersonUuidError> => {
  if (uuid === undefined) return Effect.succeed(undefined)
  if (!UUID_REGEX.test(uuid)) {
    return Effect.fail(new InvalidPersonUuidError({ uuid }))
  }
  // PersonUuid is a branded string type from @hcengineering/core.
  // After regex validation confirms UUID format, cast is safe.
  // eslint-disable-next-line no-restricted-syntax -- see above
  return Effect.succeed(uuid as PersonUuid)
}
