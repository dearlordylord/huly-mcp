import { Schema } from "effect"

import { LimitParam, NonEmptyString } from "./shared.js"

export const SearchParamsSchema = Schema.Struct({
  query: Schema.optional(NonEmptyString),
  limit: Schema.optional(LimitParam)
})

export type SearchParams = Schema.Schema.Type<typeof SearchParamsSchema>

export const SubstringSearchSchema = Schema.Struct({
  search: Schema.optional(NonEmptyString)
})

export type SubstringSearch = Schema.Schema.Type<typeof SubstringSearchSchema>

export const FulltextSearchSchema = Schema.Struct({
  fulltext: Schema.optional(NonEmptyString)
})

export type FulltextSearch = Schema.Schema.Type<typeof FulltextSearchSchema>
