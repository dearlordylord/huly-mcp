import { fulltextSearchParamsJsonSchema, parseFulltextSearchParams } from "../../domain/schemas.js"
import { FulltextSearchResultSchema } from "../../domain/schemas/search.js"
import { fulltextSearch } from "../../huly/operations/search.js"
import { defineTool, type RegisteredTool } from "./registry.js"

const CATEGORY = "search" as const

export const searchTools: ReadonlyArray<RegisteredTool> = [
  defineTool(
    {
      name: "fulltext_search",
      description:
        "Perform a global fulltext search across all Huly content. Searches issues, documents, messages, and other indexed content. Returns matching items sorted by relevance (newest first).",
      category: CATEGORY,
      inputSchema: fulltextSearchParamsJsonSchema,
      resultSchema: FulltextSearchResultSchema
    },
    parseFulltextSearchParams,
    fulltextSearch
  )
]
