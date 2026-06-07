import { describe, expect, it } from "vitest"

import { UNKNOWN_TOTAL } from "../../../src/domain/schemas/shared.js"
import { listTotal, optionalCount } from "../../../src/huly/operations/counts.js"

describe("count helpers", () => {
  it("preserves only the explicit unknown total sentinel", () => {
    expect(listTotal(0)).toBe(0)
    expect(listTotal(3)).toBe(3)
    expect(listTotal(UNKNOWN_TOTAL)).toBe(UNKNOWN_TOTAL)
    expect(() => listTotal(-2)).toThrow()
  })

  it("validates optional counts when present", () => {
    expect(optionalCount(undefined)).toBeUndefined()
    expect(optionalCount(2)).toBe(2)
    expect(() => optionalCount(-1)).toThrow()
  })
})
