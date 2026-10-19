import { Effect, Schema } from "effect"
import { describe, expect, it } from "vitest"
import { makeLazyTool, makeToolGroupLoader, preloadToolGroups } from "../../src/mcp/lazy-tool.js"
import { toolCatalog, ToolCatalogSchema } from "../../src/mcp/tools/catalog.js"
import { allTools as authoringTools } from "../../src/mcp/tools/eager.js"
import { preloadToolHandlers } from "../../src/mcp/tools/index.js"
import { projectTools } from "../../src/mcp/tools/projects.js"
import { HulyClient } from "../../src/huly/client.js"
import { HulyStorageClient } from "../../src/huly/storage.js"

describe("lazy tool execution", () => {
  it("keeps discovery independent of handler loading and shares concurrent loads", async () => {
    const definition = projectTools[0]
    let loads = 0
    const tool = makeLazyTool(definition, async () => {
      loads++
      return projectTools
    })
    expect(tool.name).toBe("list_projects")
    expect(tool.inputSchema).toEqual(definition.inputSchema)
    expect(loads).toBe(0)
    const huly = await Effect.runPromise(HulyClient.pipe(Effect.provide(HulyClient.testLayer({}))))
    const storage = await Effect.runPromise(HulyStorageClient.pipe(Effect.provide(HulyStorageClient.testLayer({}))))
    const results = await Promise.all([
      tool.handler({ limit: "invalid" }, huly, storage),
      tool.handler({ limit: "invalid" }, huly, storage)
    ])
    expect(results.every((result) => result.isError === true)).toBe(true)
    expect(loads).toBe(1)
  })

  it("retains every authoring definition and can explicitly preload all production handlers", async () => {
    await Effect.runPromise(preloadToolHandlers)
    expect(toolCatalog.map(({ group: _group, ...definition }) => definition)).toEqual(
      authoringTools.map(({ handler: _handler, operation: _operation, ...definition }) => definition)
    )
  })

  it.each([
    async () => {
      throw new Error("secret-bearing module error")
    },
    async () => []
  ])("returns a sanitized actionable error for an unavailable handler", async (load) => {
    const tool = makeLazyTool(projectTools[0], load)
    const huly = await Effect.runPromise(HulyClient.pipe(Effect.provide(HulyClient.testLayer({}))))
    const storage = await Effect.runPromise(HulyStorageClient.pipe(Effect.provide(HulyStorageClient.testLayer({}))))
    const response = await tool.handler({}, huly, storage)
    expect(response.isError).toBe(true)
    expect(JSON.stringify(response)).toContain("Restart the MCP server")
    expect(JSON.stringify(response)).not.toContain("secret-bearing")
  })

  it("shares a group load across different tool requests", async () => {
    let loads = 0
    const load = makeToolGroupLoader(async () => {
      loads++
      return projectTools
    })
    await Promise.all([load(), load()])
    expect(loads).toBe(1)
  })

  it.each([null, [{ name: "unknown" }], [{ group: "unknown" }], [{ name: 123 }], [{ group: 123 }]])(
    "rejects invalid generated metadata",
    (input) => expect(() => Schema.decodeUnknownSync(ToolCatalogSchema)(input)).toThrow()
  )
})

it("reports explicit preload failures without exposing module errors", async () => {
  const error = await Effect.runPromise(
    Effect.flip(
      preloadToolGroups([
        async () => {
          throw new Error("private import error")
        }
      ])
    )
  )
  expect(error.message).toContain("Tool preload failed")
  expect(error.message).not.toContain("private")
})
