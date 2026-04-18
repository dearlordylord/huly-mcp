import { describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { expect } from "vitest"
import { leadTools } from "../../../src/mcp/tools/leads.js"

describe("Lead MCP Tools", () => {
  // test-revizorro: approved
  it.effect("registers list_funnels tool", () =>
    Effect.gen(function*() {
      const tool = leadTools.find(t => t.name === "list_funnels")
      expect(tool).toBeDefined()
      expect(tool?.category).toBe("leads")
      expect(tool?.description).toContain("funnel")
      expect(tool?.inputSchema).toBeDefined()
      expect(typeof tool?.handler).toBe("function")
    }))

  // test-revizorro: approved
  it.effect("registers list_leads tool", () =>
    Effect.gen(function*() {
      const tool = leadTools.find(t => t.name === "list_leads")
      expect(tool).toBeDefined()
      expect(tool?.category).toBe("leads")
      expect(tool?.description).toContain("lead")
      expect(tool?.inputSchema).toBeDefined()
      expect(typeof tool?.handler).toBe("function")
    }))

  // test-revizorro: approved
  it.effect("registers get_lead tool", () =>
    Effect.gen(function*() {
      const tool = leadTools.find(t => t.name === "get_lead")
      expect(tool).toBeDefined()
      expect(tool?.category).toBe("leads")
      expect(tool?.description).toContain("lead")
      expect(tool?.inputSchema).toBeDefined()
      expect(typeof tool?.handler).toBe("function")
    }))

  // test-revizorro: approved
  it.effect("has exactly 3 tools", () =>
    Effect.gen(function*() {
      expect(leadTools).toHaveLength(3)
    }))

  // test-revizorro: approved
  it.effect("all tools have unique names", () =>
    Effect.gen(function*() {
      const names = leadTools.map(t => t.name)
      expect(new Set(names).size).toBe(names.length)
    }))
})
