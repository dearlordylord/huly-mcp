import { describe, expect, it } from "vitest"
import { normalizeForComparison } from "../../src/utils/normalize.js"

describe("normalizeForComparison", () => {
  it("strips hyphens and lowercases", () => {
    expect(normalizeForComparison("no-priority")).toBe("nopriority")
  })

  it("strips underscores and lowercases", () => {
    expect(normalizeForComparison("NO_PRIORITY")).toBe("nopriority")
  })

  it("strips spaces and lowercases", () => {
    expect(normalizeForComparison("No Priority")).toBe("nopriority")
  })

  it("handles camelCase", () => {
    expect(normalizeForComparison("NoPriority")).toBe("nopriority")
  })

  it("handles ALL_CAPS with underscores", () => {
    expect(normalizeForComparison("IN_PROGRESS")).toBe("inprogress")
  })

  it("handles mixed separators", () => {
    expect(normalizeForComparison("In-Progress")).toBe("inprogress")
  })

  it("handles already-normalized input", () => {
    expect(normalizeForComparison("urgent")).toBe("urgent")
  })

  it("handles empty string", () => {
    expect(normalizeForComparison("")).toBe("")
  })
})
