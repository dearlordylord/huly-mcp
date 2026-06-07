/**
 * Fulltext search operations for Huly MCP server.
 *
 * Provides global fulltext search across all indexed content.
 *
 * @module
 */
import { Effect } from "effect"

import {
  type FulltextSearchParams,
  type FulltextSearchResult,
  parseSearchResult,
  UNKNOWN_SEARCH_TOTAL
} from "../../domain/schemas.js"
import { HulyClient, type HulyClientError } from "../client.js"
import { HulyConnectionError } from "../errors.js"
import { listTotal } from "./counts.js"
import { clampLimit } from "./query-helpers.js"

export const fulltextSearch = (
  params: FulltextSearchParams
): Effect.Effect<FulltextSearchResult, HulyClientError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient

    const limit = clampLimit(params.limit)

    const raw = yield* client.searchFulltext(
      { query: params.query },
      { limit }
    )

    const results = yield* parseSearchResult(raw).pipe(
      Effect.mapError((parseError) =>
        new HulyConnectionError({
          message: `searchFulltext response failed schema validation: ${parseError.message}`,
          cause: parseError
        })
      )
    )

    const items = results.docs.map((doc) => ({
      id: doc.doc._id,
      class: doc.doc._class,
      title: doc.title,
      description: doc.description,
      score: doc.score,
      createdOn: doc.doc.createdOn
    }))

    return {
      items,
      total: results.total === undefined ? UNKNOWN_SEARCH_TOTAL : listTotal(results.total),
      query: params.query
    }
  })
