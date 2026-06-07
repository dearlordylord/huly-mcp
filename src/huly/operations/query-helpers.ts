import type { Class, Doc, DocumentQuery, FindOptions, Lookup, Ref, WithLookup } from "@hcengineering/core"
import { Effect } from "effect"

import { DEFAULT_LIMIT, MAX_LIMIT } from "../../domain/schemas/shared.js"
import type { HulyClientError, HulyClientOperations } from "../client.js"
import { HulyError } from "../errors-base.js"

export type StrictDocumentQuery<T extends Doc> =
  & {
    [P in keyof T]?: DocumentQuery<T>[P]
  }
  & {
    $search?: string
  }

export const hulyQuery = <T extends Doc>(query: StrictDocumentQuery<T>): DocumentQuery<T> => query

/**
 * Escape SQL LIKE wildcard characters in a string.
 * Prevents user input from being interpreted as wildcards.
 */
export const escapeLikeWildcards = (input: string): string =>
  input
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_")

type RegexParameterName = "nameRegex" | "titleRegex"

const compileUserRegex = (
  pattern: string,
  parameterName: RegexParameterName
): Effect.Effect<RegExp, HulyError> =>
  Effect.try({
    try: () => new RegExp(pattern),
    catch: (cause) =>
      new HulyError({
        message: `Invalid ${parameterName}: ${String(cause)}`,
        cause
      })
  })

export const compileOptionalUserRegex = (
  pattern: string | undefined,
  parameterName: RegexParameterName
): Effect.Effect<RegExp | undefined, HulyError> =>
  pattern !== undefined && pattern.trim() !== ""
    ? compileUserRegex(pattern, parameterName)
    : Effect.succeed(undefined)

export const filterByRegex = <T>(
  items: ReadonlyArray<T>,
  regex: RegExp | undefined,
  getValue: (item: T) => string
): Array<T> => {
  if (regex === undefined) return [...items]
  const statelessRegex = new RegExp(regex.source, regex.flags.replace(/[gy]/g, ""))
  return items.filter((item) => statelessRegex.test(getValue(item)))
}

export const findOptionsForOptionalRegex = <T extends Doc>(
  limit: number,
  sort: NonNullable<FindOptions<T>["sort"]>,
  regex: RegExp | undefined
): FindOptions<T> =>
  regex === undefined
    ? { limit, sort }
    : { sort }

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
  query: StrictDocumentQuery<T>,
  onNotFound: () => E,
  options?: FindOptions<T>
): Effect.Effect<WithLookup<T>, E | HulyClientError> =>
  Effect.flatMap(
    client.findOne<T>(_class, hulyQuery(query), options),
    (result) =>
      result !== undefined
        ? Effect.succeed(result)
        : Effect.fail(onNotFound())
  )

export const findByNameOrId = <T extends Doc>(
  client: HulyClientOperations,
  _class: Ref<Class<T>>,
  primaryQuery: StrictDocumentQuery<T>,
  fallbackQuery: StrictDocumentQuery<T>,
  options?: FindOptions<T>
): Effect.Effect<WithLookup<T> | undefined, HulyClientError> =>
  Effect.flatMap(
    client.findOne<T>(_class, hulyQuery(primaryQuery), options),
    (result) =>
      result !== undefined
        ? Effect.succeed(result)
        : client.findOne<T>(_class, hulyQuery(fallbackQuery), options)
  )

export const findByNameOrIdOrFail = <T extends Doc, E>(
  client: HulyClientOperations,
  _class: Ref<Class<T>>,
  primaryQuery: StrictDocumentQuery<T>,
  fallbackQuery: StrictDocumentQuery<T>,
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

export const clampLimit = (limit?: number): number => Math.min(limit ?? DEFAULT_LIMIT, MAX_LIMIT)
