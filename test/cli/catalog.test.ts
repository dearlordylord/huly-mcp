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

const catalogEntries = () => Object.entries(cliCommandCatalog)

const pathKey = (path: ReadonlyArray<string>): string => path.join(" ")

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

  it("keeps generated CLI command paths unique and non-overlapping", () => {
    const byPath = new Map<string, Array<string>>()
    for (const [toolName, spec] of catalogEntries()) {
      const key = pathKey(spec.path)
      byPath.set(key, [...(byPath.get(key) ?? []), toolName])
    }

    const duplicates = [...byPath.entries()].filter(([, toolNames]) => toolNames.length > 1)
    const prefixConflicts = catalogEntries().flatMap(([toolName, spec]) =>
      catalogEntries()
        .filter(([otherToolName, otherSpec]) =>
          toolName !== otherToolName
          && spec.path.length < otherSpec.path.length
          && spec.path.every((segment, index) => otherSpec.path[index] === segment)
        )
        .map(([otherToolName]) => [toolName, otherToolName])
    )

    expect(duplicates).toEqual([])
    expect(prefixConflicts).toEqual([])
  })

  it("keeps notable generated paths aligned with the public command vocabulary", () => {
    expect(cliCommandCatalog.list_tags.path).toEqual(["tags", "list"])
    expect(cliCommandCatalog.create_tag.path).toEqual(["tags", "create"])
    expect(cliCommandCatalog.list_tag_categories.path).toEqual(["tags", "categories", "list"])
  })

  it("narrows CLI tool names at runtime", () => {
    expect(isCliToolName("list_projects")).toBe(true)
    expect(isCliToolName("not_a_tool")).toBe(false)
  })
})
