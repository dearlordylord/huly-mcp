import {
  fulltextSearchParamsJsonSchema,
  parseFulltextSearchParams
} from "../../domain/schemas.js"
import { fulltextSearch } from "../../huly/operations/search.js"
import { createToolHandler, type RegisteredTool } from "./registry.js"

const CATEGORY = "Search" as const

export const searchTools: ReadonlyArray<RegisteredTool> = [
  {
    name: "fulltext_search",
    description:
      "Perform a global fulltext search across all Huly content. Searches issues, documents, messages, and other indexed content. Returns matching items sorted by relevance (newest first).",
    category: CATEGORY,
    inputSchema: fulltextSearchParamsJsonSchema,
    handler: createToolHandler(
      "fulltext_search",
      parseFulltextSearchParams,
      (params) => fulltextSearch(params)
    )
  }
]
