import { describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { expect } from "vitest"

import { processTools } from "../../../src/mcp/tools/processes.js"

const findTool = (name: string) => {
  const tool = processTools.find((candidate) => candidate.name === name)
  if (tool === undefined) throw new Error(`Tool ${name} not found`)
  return tool
}

describe("processTools", () => {
  it.effect("exports process read and write tools in the processes category", () =>
    Effect.gen(function*() {
      expect(processTools.map((tool) => tool.name)).toEqual([
        "list_processes",
        "get_process",
        "list_process_executions",
        "start_process",
        "cancel_execution"
      ])
      for (const tool of processTools) {
        expect(tool.category).toBe("processes")
      }
    }))

  it.effect("start_process schema and annotations describe a non-idempotent write", () =>
    Effect.gen(function*() {
      const tool = findTool("start_process")

      expect(tool.inputSchema).toMatchObject({
        type: "object",
        required: ["process", "card"]
      })
      expect(tool.annotations).toMatchObject({
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      })
    }))

  it.effect("cancel_execution schema and annotations describe an idempotent write", () =>
    Effect.gen(function*() {
      const tool = findTool("cancel_execution")

      expect(tool.inputSchema).toMatchObject({
        type: "object",
        required: ["execution"]
      })
      expect(tool.annotations).toMatchObject({
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      })
    }))
})
