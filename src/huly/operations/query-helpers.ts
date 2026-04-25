import type { Class, Doc, DocumentQuery, FindOptions, Lookup, Ref, WithLookup } from "@hcengineering/core"
import { Effect } from "effect"

import { MAX_LIMIT } from "../../domain/schemas/shared.js"
import type { HulyClientError, HulyClientOperations } from "../client.js"

/**
 * Escape SQL LIKE wildcard characters in a string.
 * Prevents user input from being interpreted as wildcards.
 */
export const escapeLikeWildcards = (input: string): string =>
  input
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_")

/**
 * Add lookup to FindOptions for relationship joins.
 * Lookups allow fetching related documents in a single query,
 * avoiding N+1 query problems.
 */
export const withLookup = <T extends Doc>(
  options: FindOptions<T> | undefined,
  lookups: Lookup<T>
): FindOptions<T> => ({
  ...options,
  lookup: {
    ...options?.lookup,
    ...lookups
  }
})

export const findOneOrFail = <T extends Doc, E>(
  client: HulyClientOperations,
  _class: Ref<Class<T>>,
  query: DocumentQuery<T>,
  onNotFound: () => E,
  options?: FindOptions<T>
): Effect.Effect<WithLookup<T>, E | HulyClientError> =>
  Effect.flatMap(
    client.findOne<T>(_class, query, options),
    (result) =>
      result !== undefined
        ? Effect.succeed(result)
        : Effect.fail(onNotFound())
  )

export const findByNameOrId = <T extends Doc>(
  client: HulyClientOperations,
  _class: Ref<Class<T>>,
  primaryQuery: DocumentQuery<T>,
  fallbackQuery: DocumentQuery<T>,
  options?: FindOptions<T>
): Effect.Effect<WithLookup<T> | undefined, HulyClientError> =>
  Effect.flatMap(
    client.findOne<T>(_class, primaryQuery, options),
    (result) =>
      result !== undefined
        ? Effect.succeed(result)
        : client.findOne<T>(_class, fallbackQuery, options)
  )

export const findByNameOrIdOrFail = <T extends Doc, E>(
  client: HulyClientOperations,
  _class: Ref<Class<T>>,
  primaryQuery: DocumentQuery<T>,
  fallbackQuery: DocumentQuery<T>,
  onNotFound: () => E,
  options?: FindOptions<T>
): Effect.Effect<WithLookup<T>, E | HulyClientError> =>
  Effect.flatMap(
    findByNameOrId(client, _class, primaryQuery, fallbackQuery, options),
    (result) =>
      result !== undefined
        ? Effect.succeed(result)
        : Effect.fail(onNotFound())
  )

const DEFAULT_LIMIT = 50

export const clampLimit = (limit?: number): number => Math.min(limit ?? DEFAULT_LIMIT, MAX_LIMIT)
