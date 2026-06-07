import { Schema } from "effect"
import * as fc from "fast-check"
import { describe, expect, it } from "vitest"

import {
  assertDecodeFailure,
  assertDecodeSuccess,
  assertEncodeFailure,
  assertEncodeSuccess,
  propertyTestParameters
} from "./helpers/property.js"

describe("property test harness", () => {
  it("runs fast-check properties under Vitest with Effect Schema helpers", () => {
    fc.assert(
      fc.property(fc.integer(), (value) => {
        const decoded = assertDecodeSuccess(Schema.Int, value)
        const encoded = assertEncodeSuccess(Schema.Int, decoded)

        expect(encoded).toBe(value)
      }),
      propertyTestParameters
    )
  })

  it("reports Effect Schema decode and encode failures", () => {
    assertDecodeFailure(Schema.Int, 1.5)
    assertEncodeFailure(Schema.Int, 1.5)
  })
})
