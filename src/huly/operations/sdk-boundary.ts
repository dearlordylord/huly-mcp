import type { Class, Doc, PersonUuid, Ref } from "@hcengineering/core"
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
