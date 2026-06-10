import { describe, it } from "@effect/vitest"
import { expect } from "vitest"

import { collaboratorTools } from "../../../src/mcp/tools/collaborators.js"

describe("collaborator tools", () => {
  it("registers object collaborator tools", () => {
    const names = new Set(collaboratorTools.map(tool => tool.name))

    expect(names.has("list_object_collaborators")).toBe(true)
    expect(names.has("add_object_collaborator")).toBe(true)
    expect(names.has("remove_object_collaborator")).toBe(true)
  })
})
