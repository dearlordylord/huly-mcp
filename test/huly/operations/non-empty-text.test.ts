import { describe, expect, it } from "@effect/vitest"

import { TodoTitle } from "../../../src/domain/schemas/planner.js"
import { hulyNonEmptyTextOrFallback } from "../../../src/huly/operations/non-empty-text.js"

describe("hulyNonEmptyTextOrFallback", () => {
  const fallback = TodoTitle.make("Untitled ToDo")

  it("keeps non-empty Huly display text", () => {
    expect(hulyNonEmptyTextOrFallback(TodoTitle, "  Follow up  ", fallback)).toBe("Follow up")
  })

  it("uses fallback for empty or missing Huly display text", () => {
    expect(hulyNonEmptyTextOrFallback(TodoTitle, "", fallback)).toBe("Untitled ToDo")
    expect(hulyNonEmptyTextOrFallback(TodoTitle, "   ", fallback)).toBe("Untitled ToDo")
    expect(hulyNonEmptyTextOrFallback(TodoTitle, undefined, fallback)).toBe("Untitled ToDo")
    expect(hulyNonEmptyTextOrFallback(TodoTitle, null, fallback)).toBe("Untitled ToDo")
  })
})
