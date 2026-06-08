import { describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { expect } from "vitest"

import { plannerTools } from "../../../src/mcp/tools/planner.js"

describe("plannerTools", () => {
  it.effect("exports planner tools in the planner category", () =>
    Effect.gen(function*() {
      expect(plannerTools.map((tool) => tool.name)).toContain("create_todo")
      expect(plannerTools.map((tool) => tool.name)).toContain("schedule_todo")
      expect(plannerTools.map((tool) => tool.name)).not.toContain("list_todo_automation_helpers")
      for (const tool of plannerTools) {
        expect(tool.category).toBe("planner")
      }
    }))
})
