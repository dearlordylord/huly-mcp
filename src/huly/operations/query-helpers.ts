import type { Doc, DocumentQuery, FindOptions, Lookup } from "@hcengineering/core"

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
 * Add substring search to query using $like operator.
 * The $like operator performs SQL-style LIKE matching with % wildcards.
 */
export const addSubstringSearch = <T extends Doc>(
  query: DocumentQuery<T>,
  field: keyof T & string,
  searchTerm: string | undefined
): DocumentQuery<T> => {
  if (!searchTerm) return query
  const escapedTerm = escapeLikeWildcards(searchTerm)
  return {
    ...query,
    [field]: { $like: `%${escapedTerm}%` }
  }
}

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
