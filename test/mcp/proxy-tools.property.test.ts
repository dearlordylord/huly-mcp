import { Schema } from "effect"
import * as fc from "fast-check"
import { describe, expect, it } from "vitest"

import { createSuccessResponse } from "../../src/mcp/error-mapping.js"
import { resolveProtocolExposure } from "../../src/mcp/protocol-tool-exposure.js"
import { makeSearchToolLimit, makeToolSearchQuery, searchToolDefinitions } from "../../src/mcp/proxy-tools.js"
import { parseMcpClientInfo } from "../../src/mcp/tool-mode.js"
import { createToolOutputSchema } from "../../src/mcp/tool-output-schema.js"
import { CATEGORY_NAMES, createScopedRegistry, type ToolRegistry, toolRegistry } from "../../src/mcp/tools/index.js"
import {
  createToolDefinition,
  makeToolCategory,
  makeToolName,
  type RegisteredTool
} from "../../src/mcp/tools/registry.js"
import { propertyTestParameters } from "../helpers/property.js"

const knownCategories = [...CATEGORY_NAMES]
const knownToolNames = toolRegistry.definitions.map((tool) => tool.name)
const knownCategoryArbitrary = fc.constantFrom(...knownCategories)
const knownToolNameArbitrary = fc.constantFrom(...knownToolNames)
const queryArbitrary = fc.stringMatching(/^[a-z][a-z0-9_-]{0,39}$/).map(makeToolSearchQuery)
const searchLimitArbitrary = fc.integer({ min: 1, max: 50 }).map(makeSearchToolLimit)

const generatedOutputSchema = createToolOutputSchema(Schema.Struct({ ok: Schema.Boolean }))

const generatedTool = (name: string): RegisteredTool => ({
  ...createToolDefinition({
    name,
    description: "alpha generated tool",
    inputSchema: {
      type: "object",
      properties: { shared: { type: "string" } },
      additionalProperties: false
    },
    outputSchema: generatedOutputSchema,
    category: "generated"
  }),
  handler: async () => createSuccessResponse({ ok: true })
})

const registryFromDefinitions = (definitions: ReadonlyArray<RegisteredTool>): ToolRegistry => ({
  tools: new Map(definitions.map((tool) => [tool.name, tool])),
  definitions,
  handleToolCall: async () => null
})

describe("proxy tool search properties", () => {
  it("returns only tools from the searched candidate registry", () => {
    fc.assert(
      fc.property(queryArbitrary, searchLimitArbitrary, (query, limit) => {
        const scoped = createScopedRegistry({
          filteringActive: true,
          categories: new Set([makeToolCategory("issues")]),
          toolNames: new Set([makeToolName("list_documents")])
        })
        const resultNames = searchToolDefinitions(scoped, query, limit).map((tool) => tool.name)

        for (const name of resultNames) {
          expect(scoped.tools.has(name)).toBe(true)
        }
      }),
      propertyTestParameters
    )
  })

  it("strict proxy candidates are always a subset of the full registry", () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.array(knownCategoryArbitrary, { maxLength: 8 }),
        fc.array(knownToolNameArbitrary, { maxLength: 8 }),
        (active, categories, toolNames) => {
          const scoped = createScopedRegistry({
            filteringActive: true,
            categories: new Set(categories),
            toolNames: new Set(toolNames)
          })
          const exposure = resolveProtocolExposure(
            { fullRegistry: toolRegistry, scopedNativeRegistry: scoped },
            {
              exposureConfig: { configuredMode: "proxy", proxyOutputStrict: true },
              toolScopeFilteringActive: active,
              currentClientInfo: () => parseMcpClientInfo({ name: "codex" })
            }
          )

          for (const tool of exposure.proxyCandidateRegistry.definitions) {
            expect(toolRegistry.tools.get(tool.name)).toBe(tool)
          }
        }
      ),
      propertyTestParameters
    )
  })

  it("preserves registry order when scores tie", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.stringMatching(/^[a-z][a-z0-9]{0,8}$/), { minLength: 1, maxLength: 20 }),
        (suffixes) => {
          const definitions = suffixes.map((suffix) => generatedTool(`alpha_${suffix}`))
          const registry = registryFromDefinitions(definitions)
          const matches = searchToolDefinitions(registry, makeToolSearchQuery("alpha"), makeSearchToolLimit(50))

          expect(matches.map((tool) => tool.name)).toEqual(definitions.map((tool) => tool.name))
        }
      ),
      propertyTestParameters
    )
  })
})
