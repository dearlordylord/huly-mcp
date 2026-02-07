import { JSONSchema, Schema } from "effect"

import { LimitParam, NonEmptyString, Timestamp } from "./shared.js"

export const FulltextSearchParamsSchema = Schema.Struct({
  query: NonEmptyString.annotations({
    description: "Search query string for fulltext search"
  }),
  limit: Schema.optional(
    LimitParam.annotations({
      description: "Maximum number of results to return (default: 50)"
    })
  )
}).annotations({
  title: "FulltextSearchParams",
  description: "Parameters for fulltext search"
})

export type FulltextSearchParams = Schema.Schema.Type<typeof FulltextSearchParamsSchema>

export const SearchResultItemSchema = Schema.Struct({
  id: NonEmptyString,
  class: Schema.String,
  space: Schema.optional(Schema.String),
  modifiedOn: Schema.optional(Timestamp)
}).annotations({
  title: "SearchResultItem",
  description: "Single search result item"
})

export type SearchResultItem = Schema.Schema.Type<typeof SearchResultItemSchema>

export const FulltextSearchResultSchema = Schema.Struct({
  items: Schema.Array(SearchResultItemSchema),
  total: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
  query: Schema.String
}).annotations({
  title: "FulltextSearchResult",
  description: "Result of fulltext search"
})

export type FulltextSearchResult = Schema.Schema.Type<typeof FulltextSearchResultSchema>

export const fulltextSearchParamsJsonSchema = JSONSchema.make(FulltextSearchParamsSchema)

export const parseFulltextSearchParams = Schema.decodeUnknown(FulltextSearchParamsSchema)
