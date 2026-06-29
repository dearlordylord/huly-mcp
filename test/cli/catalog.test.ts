import { describe, expect, it } from "vitest"

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

  it("narrows CLI tool names at runtime", () => {
    expect(isCliToolName("list_projects")).toBe(true)
    expect(isCliToolName("not_a_tool")).toBe(false)
  })
})
