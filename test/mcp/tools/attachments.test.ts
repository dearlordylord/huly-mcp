import { describe, it } from "@effect/vitest"
import { expect } from "vitest"

import { attachmentTools } from "../../../src/mcp/tools/attachments.js"

describe("attachment tools", () => {
  it("registers saved attachment and drawing tools", () => {
    const names = new Set(attachmentTools.map(tool => tool.name))
    const expected = [
      "save_attachment",
      "unsave_attachment",
      "list_saved_attachments",
      "list_drawings",
      "get_drawing",
      "create_drawing",
      "update_drawing",
      "delete_drawing"
    ]

    for (const name of expected) {
      expect(names.has(name), name).toBe(true)
    }
  })
})
