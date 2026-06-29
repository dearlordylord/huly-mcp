import { describe, expect, it } from "vitest"

import { deferredMechanicalCliCommandTools } from "../../packages/huly-cli/src/catalog-deferred.js"
import { deferredReadOnlyCliCommandTools } from "../../packages/huly-cli/src/catalog-read-only.js"
import {
  catalogSyncAssertions,
  cliCommandCatalog,
  ignoredMcpTools,
  isCliToolName
} from "../../packages/huly-cli/src/catalog.js"
import { allTools } from "../../src/mcp/tools/index.js"

describe("CLI catalog", () => {
  it("keeps implemented and ignored MCP tool decisions disjoint at runtime", () => {
    const implemented = new Set(Object.keys(cliCommandCatalog))
    const ignored = new Set(ignoredMcpTools)

    expect([...implemented].filter((name) => ignored.has(name))).toEqual([])
  })

  it("has an explicit CLI decision for every registry MCP tool", () => {
    const decided = new Set([...Object.keys(cliCommandCatalog), ...ignoredMcpTools])
    const toolNames = allTools.map((tool) => tool.name)

    expect(toolNames.filter((name) => !decided.has(name))).toEqual([])
    expect(catalogSyncAssertions).toEqual([])
  })

  it("keeps only logged non-mechanical read-like tools ignored", () => {
    const ignoredReadLikeTools = ignoredMcpTools.filter((name) => /^(list|get|describe)_/.test(name))

    expect(ignoredReadLikeTools.toSorted()).toEqual([...deferredReadOnlyCliCommandTools].toSorted())
  })

  it("keeps every ignored MCP tool in the mechanical deferral list", () => {
    expect(ignoredMcpTools.toSorted()).toEqual([...deferredMechanicalCliCommandTools].toSorted())
  })

  it("narrows CLI tool names at runtime", () => {
    expect(isCliToolName("list_projects")).toBe(true)
    expect(isCliToolName("not_a_tool")).toBe(false)
  })
})
