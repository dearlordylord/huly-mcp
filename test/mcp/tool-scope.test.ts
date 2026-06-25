import { Schema } from "effect"
import { describe, expect, it } from "vitest"

import { sanitizeHulyRuntimeConfigFromEnv } from "../../src/config/config.js"
import { GetHulyContextResultSchema } from "../../src/domain/schemas/index.js"
import { buildHulyContext } from "../../src/mcp/huly-context-tool.js"
import { createMcpProtocolHandlers } from "../../src/mcp/protocol-handlers.js"
import { resolveToolScope } from "../../src/mcp/tool-scope.js"
import { createScopedRegistry, toolRegistry } from "../../src/mcp/tools/index.js"
import { createNoopTelemetry } from "../../src/telemetry/noop.js"

interface PartialScopeEnv {
  readonly toolsets?: string
  readonly tools?: string
}

const resolveScoped = (env: PartialScopeEnv) => {
  const warnings: Array<string> = []
  const scope = resolveToolScope(
    {
      toolsets: env.toolsets ?? "",
      tools: env.tools ?? ""
    },
    toolRegistry.definitions,
    (message) => {
      warnings.push(message)
    }
  )
  const registry = createScopedRegistry({
    filteringActive: scope.filteringActive,
    categories: scope.enabledCategories,
    toolNames: scope.enabledToolNames
  })

  return { registry, scope, warnings }
}

describe("tool scope filtering", () => {
  it("leaves the full registry visible when no scope env is set", () => {
    const { registry, scope } = resolveScoped({})

    expect(scope.filteringActive).toBe(false)
    expect(registry).toBe(toolRegistry)
    expect(registry.tools.has("list_documents")).toBe(true)
    expect(registry.tools.has("list_issues")).toBe(true)
  })

  it("filters by TOOLSETS category", () => {
    const { registry, scope } = resolveScoped({ toolsets: "issues" })

    expect(scope.filteringActive).toBe(true)
    expect(scope.enabledToolsets).toEqual(["issues"])
    expect(registry.definitions.every((tool) => tool.category === "issues")).toBe(true)
    expect(registry.tools.has("list_issues")).toBe(true)
    expect(registry.tools.has("list_documents")).toBe(false)
  })

  it("filters by exact TOOLS names", () => {
    const { registry, scope } = resolveScoped({ tools: "list_documents" })

    expect(scope.enabledTools).toEqual(["list_documents"])
    expect(registry.definitions.map((tool) => tool.name)).toEqual(["list_documents"])
  })

  it("unions TOOLSETS and TOOLS while preserving registry order", () => {
    const { registry } = resolveScoped({
      toolsets: "issues",
      tools: "list_documents"
    })
    const names = registry.definitions.map((tool) => tool.name)
    const expected = toolRegistry.definitions
      .filter((tool) => tool.category === "issues" || tool.name === "list_documents")
      .map((tool) => tool.name)

    expect(names).toEqual(expected)
    expect(names).toContain("list_issues")
    expect(names).toContain("list_documents")
  })

  it("keeps only built-in tools visible when an active scope is all invalid", async () => {
    const { registry, scope, warnings } = resolveScoped({
      toolsets: "missing_category",
      tools: "missing_tool"
    })
    const handlers = createMcpProtocolHandlers(
      () => Promise.reject(new Error("clients must not resolve")),
      createNoopTelemetry(),
      registry,
      () => buildHulyContext({ transport: "stdio" }, registry, scope, sanitizeHulyRuntimeConfigFromEnv({}))
    )

    const listed = await handlers.listTools()
    const callResult = await handlers.callTool({ params: { name: "list_documents", arguments: {} } })

    expect(scope.filteringActive).toBe(true)
    expect(registry.definitions).toEqual([])
    expect(listed.tools.map((tool) => tool.name)).toEqual(["get_version", "get_huly_context"])
    expect(callResult.isError).toBe(true)
    expect(warnings).toEqual([
      expect.stringContaining("unknown toolset category"),
      expect.stringContaining("unknown tool name")
    ])
  })

  it("uses TOOLSETS as the primary category scope without deprecation warnings", () => {
    const { registry, scope, warnings } = resolveScoped({ toolsets: "issues" })

    expect(scope.requestedToolsets).toEqual(["issues"])
    expect(scope.enabledToolsets).toEqual(["issues"])
    expect(registry.tools.has("list_issues")).toBe(true)
    expect(registry.tools.has("list_documents")).toBe(false)
    expect(warnings).toEqual([])
  })

  it("reports toolsets and tool-name scope in get_huly_context", () => {
    const { registry, scope } = resolveScoped({
      toolsets: "issues",
      tools: "list_documents,missing_tool"
    })
    const context = Schema.decodeUnknownSync(GetHulyContextResultSchema)(
      buildHulyContext({ transport: "stdio" }, registry, scope, sanitizeHulyRuntimeConfigFromEnv({}))
    )

    expect(context.toolsets).toMatchObject({
      filteringActive: true,
      requestedCategories: ["issues"],
      enabledCategories: ["issues"]
    })
    expect(context.toolScope).toMatchObject({
      active: true,
      requestedToolsets: ["issues"],
      enabledToolsets: ["issues"],
      requestedTools: ["list_documents", "missing_tool"],
      enabledTools: ["list_documents"],
      ignoredTools: ["missing_tool"]
    })
    expect(context.toolScope.visibleRegisteredToolCount).toBe(registry.definitions.length)
    expect(context.toolScope.totalRegisteredToolCount).toBe(toolRegistry.definitions.length)
  })
})
