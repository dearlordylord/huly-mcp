import { describe, expect, it } from "@effect/vitest"

import { TodoTitle } from "../../../src/domain/schemas/planner.js"
import { hulyDisplayTextOrFallback } from "../../../src/huly/operations/display-text.js"

describe("hulyDisplayTextOrFallback", () => {
  const fallback = TodoTitle.make("Untitled ToDo")

  it("keeps non-empty Huly display text", () => {
    expect(hulyDisplayTextOrFallback(TodoTitle, "  Follow up  ", fallback)).toBe("Follow up")
  })

  it("uses fallback for empty or missing Huly display text", () => {
    expect(hulyDisplayTextOrFallback(TodoTitle, "", fallback)).toBe("Untitled ToDo")
    expect(hulyDisplayTextOrFallback(TodoTitle, "   ", fallback)).toBe("Untitled ToDo")
    expect(hulyDisplayTextOrFallback(TodoTitle, undefined, fallback)).toBe("Untitled ToDo")
    expect(hulyDisplayTextOrFallback(TodoTitle, null, fallback)).toBe("Untitled ToDo")
  })
})
