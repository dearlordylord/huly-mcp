/**
 * Fulltext search operations for Huly MCP server.
 *
 * Provides global fulltext search across all indexed content.
 *
 * @module
 */
import type { Doc } from "@hcengineering/core"
import { SortingOrder } from "@hcengineering/core"
import { Effect } from "effect"

import type { FulltextSearchParams, FulltextSearchResult } from "../../domain/schemas.js"
import { HulyClient, type HulyClientError } from "../client.js"
import { clampLimit } from "./shared.js"

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports -- CJS interop
const core = require("@hcengineering/core").default as typeof import("@hcengineering/core").default

type FulltextSearchError = HulyClientError

/**
 * Perform a fulltext search across all indexed content.
 *
 * Uses the $search query operator to search across all indexed text fields.
 * Results are sorted by relevance (modification date as proxy).
 *
 * @param params - Search parameters including query string and limit
 * @returns Array of matching documents with basic metadata
 */
export const fulltextSearch = (
  params: FulltextSearchParams
): Effect.Effect<FulltextSearchResult, FulltextSearchError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient

    const limit = clampLimit(params.limit)

    // Use $search operator for fulltext search
    // This searches across all indexed fields
    const results = yield* client.findAll<Doc>(
      core.class.Doc,
      { $search: params.query },
      {
        limit,
        sort: {
          modifiedOn: SortingOrder.Descending
        }
      }
    )

    const total = results.total

    // Map results to a consistent format
    const items = results.map((doc) => ({
      id: String(doc._id),
      class: String(doc._class),
      space: doc.space ? String(doc.space) : undefined,
      modifiedOn: doc.modifiedOn
    }))

    return {
      items,
      total,
      query: params.query
    }
  })
