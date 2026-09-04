import { describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { expect } from "vitest"
import { leadTools } from "../../../src/mcp/tools/leads.js"
import { resolveAnnotations } from "../../../src/mcp/tools/registry.js"

describe("Lead MCP Tools", () => {
  it.effect("registers list_funnels tool", () =>
    Effect.sync(function () {
      const tool = leadTools.find((t) => t.name === "list_funnels")
      expect(tool).toBeDefined()
      expect(tool?.category).toBe("leads")
      expect(tool?.description).toContain("funnel")
      expect(tool?.inputSchema).toBeDefined()
      expect(typeof tool?.handler).toBe("function")
    })
  )

  it.effect("registers list_leads tool", () =>
    Effect.sync(function () {
      const tool = leadTools.find((t) => t.name === "list_leads")
      expect(tool).toBeDefined()
      expect(tool?.category).toBe("leads")
      expect(tool?.description).toContain("lead")
      expect(tool?.inputSchema).toBeDefined()
      expect(typeof tool?.handler).toBe("function")
    })
  )

  it.effect("registers get_lead tool", () =>
    Effect.sync(function () {
      const tool = leadTools.find((t) => t.name === "get_lead")
      expect(tool).toBeDefined()
      expect(tool?.category).toBe("leads")
      expect(tool?.description).toContain("lead")
      expect(tool?.inputSchema).toBeDefined()
      expect(typeof tool?.handler).toBe("function")
    })
  )

  it.effect("registers create_lead with an explicit existing-customer contract", () =>
    Effect.sync(function () {
      const tool = leadTools.find((candidate) => candidate.name === "create_lead")
      expect(tool).toBeDefined()
      if (tool === undefined) throw new Error("create_lead tool is missing")
      expect(tool?.category).toBe("leads")
      expect(tool?.description).toContain("existing person or organization")
      expect(tool?.description).toContain("never creates")
      expect(resolveAnnotations(tool)).toMatchObject({
        idempotentHint: false,
        destructiveHint: false,
        readOnlyHint: false
      })
      expect(tool?.inputSchema).toBeDefined()
      expect(tool.outputSchema.properties?.result).toMatchObject({
        type: "object",
        properties: {
          leadId: { allOf: [{ $ref: "#/$defs/NonEmptyString" }], description: "Raw Huly Lead document _id." },
          identifier: { type: "string", pattern: "^LEAD-[0-9]+$" }
        },
        required: ["leadId", "identifier"]
      })
      expect(typeof tool?.handler).toBe("function")
    })
  )

  it.effect("registers the workflow-aware funnel administration tools", () =>
    Effect.sync(function () {
      for (const name of ["get_funnel", "create_funnel", "update_funnel", "archive_funnel", "delete_funnel"]) {
        const tool = leadTools.find((candidate) => candidate.name === name)
        expect(tool, `${name} is registered`).toBeDefined()
        expect(tool?.category).toBe("leads")
      }
      const deleteTool = leadTools.find((candidate) => candidate.name === "delete_funnel")
      expect(deleteTool?.description).toContain("archived")
      expect(deleteTool?.description).toContain("impact")
    })
  )

  it.effect("registers lead mutation tools with clear mutation contracts", () =>
    Effect.sync(function () {
      for (const name of ["update_lead", "move_lead", "delete_lead"]) {
        const tool = leadTools.find((candidate) => candidate.name === name)
        expect(tool, `${name} is registered`).toBeDefined()
        expect(tool?.category).toBe("leads")
        expect(tool?.inputSchema).toBeDefined()
        expect(typeof tool?.handler).toBe("function")
      }
      expect(leadTools.find((candidate) => candidate.name === "update_lead")?.description).toContain("null")
      expect(leadTools.find((candidate) => candidate.name === "move_lead")?.description).toContain("destination")
      expect(leadTools.find((candidate) => candidate.name === "delete_lead")?.description).toContain("impact")
    })
  )

  it.effect("has exactly 12 tools", () =>
    Effect.sync(function () {
      expect(leadTools).toHaveLength(12)
    })
  )

  it.effect("all tools have unique names", () =>
    Effect.sync(function () {
      const names = leadTools.map((t) => t.name)
      expect(new Set(names).size).toBe(names.length)
    })
  )
})
