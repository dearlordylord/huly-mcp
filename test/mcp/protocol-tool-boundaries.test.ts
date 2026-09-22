import { describe, expect, it } from "vitest"

import {
  defaultExposureOptions,
  normalizeRegistries,
  resolveProtocolExposure,
  toListedTool
} from "../../src/mcp/protocol-tool-exposure.js"
import {
  makeSearchToolLimit,
  makeToolSearchQuery,
  searchToolDefinitions,
  toolParamSummary
} from "../../src/mcp/proxy-tool-catalog.js"
import { parseMcpClientInfo } from "../../src/mcp/tool-mode.js"
import { createScopedRegistry, toolRegistry } from "../../src/mcp/tools/index.js"
import { makeToolCategory, makeToolName, type ToolDefinition } from "../../src/mcp/tools/registry.js"

const firstDefinition = (): ToolDefinition => {
  const definition = toolRegistry.definitions[0]
  if (definition === undefined) throw new Error("Expected the production tool registry to be non-empty.")
  return definition
}

const definitionWithSchema = (inputSchema: object): ToolDefinition => ({
  ...firstDefinition(),
  name: makeToolName("schema_summary_fixture"),
  inputSchema
})

describe("protocol tool boundaries", () => {
  it("rejects non-JSON property schemas and preserves absent optional listing metadata", () => {
    expect(() =>
      toListedTool({
        name: "invalid_schema_fixture",
        description: "Invalid schema fixture.",
        inputSchema: { type: "object", properties: { invalid: undefined } }
      })
    ).toThrow('Tool schema property "invalid" is not a JSON Schema object or boolean')

    const listed = toListedTool({
      name: "minimal_schema_fixture",
      description: "Minimal schema fixture.",
      inputSchema: { type: "object" }
    })
    expect(listed).toEqual({
      name: "minimal_schema_fixture",
      description: "Minimal schema fixture.",
      inputSchema: { type: "object" }
    })
  })

  it("keeps scoped native discovery available beside non-strict proxy tools", async () => {
    const scoped = createScopedRegistry({
      filteringActive: true,
      categories: new Set([makeToolCategory("empty-test-category")]),
      toolNames: new Set([makeToolName("list_projects")])
    })
    const exposure = resolveProtocolExposure(
      { fullRegistry: toolRegistry, scopedNativeRegistry: scoped },
      {
        exposureConfig: { configuredMode: "proxy", proxyOutputStrict: false },
        toolScopeFilteringActive: true,
        currentClientInfo: () => parseMcpClientInfo({ name: "generic-client" })
      }
    )

    expect(exposure.visibleNativeRegistry).toBe(scoped)
    expect(exposure.proxyCandidateRegistry).toBe(toolRegistry)

    const strict = resolveProtocolExposure(
      { fullRegistry: toolRegistry, scopedNativeRegistry: scoped },
      {
        exposureConfig: { configuredMode: "proxy", proxyOutputStrict: true },
        toolScopeFilteringActive: false,
        currentClientInfo: () => parseMcpClientInfo({ name: "generic-client" })
      }
    )
    expect(strict.visibleNativeRegistry.definitions).toEqual([])
    expect(await Reflect.apply(strict.visibleNativeRegistry.handleToolCall, undefined, ["missing", {}])).toBeNull()
    expect(defaultExposureOptions().currentClientInfo()).toBeUndefined()
  })

  it("normalizes the legacy single-registry form without replacing explicit registry roles", () => {
    const normalized = normalizeRegistries(toolRegistry)
    expect(normalized).toEqual({ fullRegistry: toolRegistry, scopedNativeRegistry: toolRegistry })

    const explicit = { fullRegistry: toolRegistry, scopedNativeRegistry: normalized.scopedNativeRegistry }
    expect(normalizeRegistries(explicit)).toBe(explicit)
  })

  it("reports malformed parameter summaries without publishing partial names", () => {
    const malformedSchemas = [
      [],
      { type: "object", properties: { valid: { type: "string" } }, required: [" "] },
      { type: "object", properties: { "": { type: "string" } } },
      { type: "object", properties: { declared: { type: "string" } }, required: ["missing"] }
    ]

    for (const schema of malformedSchemas) {
      expect(toolParamSummary(definitionWithSchema(schema))).toMatchObject({
        requiredParams: [],
        optionalParams: [],
        parameterSummaryStatus: "invalid_input_schema"
      })
    }
  })

  it("ranks an exact tool name ahead of descriptive matches", () => {
    const exact = firstDefinition()
    const categoryOnly: ToolDefinition = {
      ...exact,
      name: makeToolName("category_match_fixture"),
      category: makeToolCategory(exact.name)
    }
    const registry = { tools: toolRegistry.tools, definitions: [categoryOnly, exact], handleToolCall: async () => null }

    const matches = searchToolDefinitions(registry, makeToolSearchQuery(exact.name), makeSearchToolLimit(2))
    expect(matches.map((tool) => tool.name)).toEqual([exact.name, categoryOnly.name])
  })
})
