import { describe, expect, it } from "vitest"

import { allTools } from "../../src/mcp/tools/index.js"

describe("employee lifecycle tools", () => {
  it("registers the complete LLM-first lifecycle surface with safety annotations", () => {
    const names = ["invite_employee", "list_inactive_employees", "deactivate_employee"]
    const tools = names.map((name) => allTools.find((tool) => tool.name === name))
    expect(tools.every((tool) => tool !== undefined)).toBe(true)
    expect(tools[0]?.description).toContain("exact email")
    expect(tools[1]?.description).toContain("workspace membership")
    expect(tools[2]?.description).toContain("exact expected relationship")
    expect(tools[2]?.annotations).toMatchObject({ destructiveHint: true, idempotentHint: true })
  })
})
