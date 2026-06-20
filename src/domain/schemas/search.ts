import { JSONSchema, Schema } from "effect"

import { Count, DEFAULT_LIMIT, DocId, LimitParam, NonEmptyString, ObjectClassName, UNKNOWN_TOTAL } from "./shared.js"

export const FulltextSearchParamsSchema = Schema.Struct({
  query: NonEmptyString.annotations({
    description: "Search query string for fulltext search"
  }),
  limit: Schema.optional(
    LimitParam.annotations({
      description: `Maximum number of results to return (default: ${DEFAULT_LIMIT})`
    })
  )
}).annotations({
  title: "FulltextSearchParams",
  description: "Parameters for fulltext search"
})

export type FulltextSearchParams = Schema.Schema.Type<typeof FulltextSearchParamsSchema>

// --- API boundary schemas for Huly SearchResult ---

const SearchResultDocInner = Schema.Struct({
  _id: DocId,
  _class: ObjectClassName,
  createdOn: Schema.optional(Schema.Number)
})

export const SearchResultDocSchema = Schema.Struct({
  id: Schema.String,
  title: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
  score: Schema.optional(Schema.Number),
  doc: SearchResultDocInner
})

export type ParsedSearchResultDoc = Schema.Schema.Type<typeof SearchResultDocSchema>

const SearchResultSchema = Schema.Struct({
  docs: Schema.Array(SearchResultDocSchema),
  total: Schema.optional(Schema.Number)
})

export const parseSearchResult = Schema.decodeUnknown(SearchResultSchema)
export const SearchResultItemSchema = Schema.Struct({
  id: DocId,
  class: ObjectClassName,
  title: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
  score: Schema.optional(Schema.Number),
  createdOn: Schema.optional(Schema.Number)
})
export type SearchResultItem = Schema.Schema.Type<typeof SearchResultItemSchema>

export const UNKNOWN_SEARCH_TOTAL = UNKNOWN_TOTAL
export const FulltextSearchResultSchema = Schema.Struct({
  items: Schema.Array(SearchResultItemSchema),
  total: Schema.Union(Count, Schema.Literal(UNKNOWN_SEARCH_TOTAL)),
  query: Schema.String
})
export type FulltextSearchResult = Schema.Schema.Type<typeof FulltextSearchResultSchema>

export const fulltextSearchParamsJsonSchema = JSONSchema.make(FulltextSearchParamsSchema)

export const parseFulltextSearchParams = Schema.decodeUnknown(FulltextSearchParamsSchema)
