import { describe, it } from "@effect/vitest"
import { expect } from "vitest"

import { leadCollaborationTools } from "../../../src/mcp/tools/lead-collaboration.js"

describe("lead collaboration tools", () => {
  it("registers the complete friendly collaboration surface", () => {
    expect(leadCollaborationTools.map((tool) => tool.name)).toEqual([
      "list_lead_comments",
      "add_lead_comment",
      "update_lead_comment",
      "delete_lead_comment",
      "list_lead_attachments",
      "add_lead_attachment",
      "get_lead_attachment",
      "update_lead_attachment",
      "delete_lead_attachment",
      "list_lead_label_definitions",
      "list_lead_labels",
      "add_lead_label",
      "update_lead_label",
      "remove_lead_label"
    ])
  })

  it("marks idempotent label relation operations", () => {
    expect(leadCollaborationTools.find((tool) => tool.name === "add_lead_label")?.annotations?.idempotentHint).toBe(
      true
    )
    expect(leadCollaborationTools.find((tool) => tool.name === "remove_lead_label")?.annotations?.idempotentHint).toBe(
      true
    )
  })
})
