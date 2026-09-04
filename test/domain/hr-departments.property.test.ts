import { Schema } from "effect"
import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { DepartmentName } from "../../src/domain/schemas/hr-departments.js"

describe("HR department schema properties", () => {
  it("accepts trimmed non-empty names exactly when they do not contain the path separator", () => {
    fc.assert(
      fc.property(fc.string(), (value) => {
        const result = Schema.decodeUnknownResult(DepartmentName)(value)
        const valid = value.trim().length > 0 && !value.trim().includes("/")
        expect(result._tag === "Success").toBe(valid)
      })
    )
  })
})
