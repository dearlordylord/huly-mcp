import type { Doc, DocumentQuery, FindOptions } from "@hcengineering/core"

/**
 * Escape SQL LIKE wildcard characters in a string.
 * Prevents user input from being interpreted as wildcards.
 */
export const escapeLikeWildcards = (input: string): string =>
  input
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')

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
  lookups: Record<string, unknown>
): FindOptions<T> => {
  return {
    ...options,
    lookup: {
      ...options?.lookup,
      ...lookups
    }
  } as FindOptions<T>
}

/**
 * Add fulltext search to query using $search operator.
 * Searches across indexed text fields.
 */
export const addFulltextSearch = <T extends Doc>(
  query: DocumentQuery<T>,
  searchTerm: string | undefined
): DocumentQuery<T> => {
  if (!searchTerm) return query
  return {
    ...query,
    $search: searchTerm
  } as DocumentQuery<T>
}

/**
 * Add regex search to query.
 * Supports JavaScript-style regex patterns.
 */
export const addRegexSearch = <T extends Doc>(
  query: DocumentQuery<T>,
  field: keyof T & string,
  pattern: string | undefined,
  options?: string
): DocumentQuery<T> => {
  if (!pattern) return query
  const regexQuery: Record<string, unknown> = { $regex: pattern }
  if (options) {
    regexQuery.$options = options
  }
  return {
    ...query,
    [field]: regexQuery
  }
}
