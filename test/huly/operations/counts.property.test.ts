import * as fc from "fast-check"
import { describe, expect, it } from "vitest"

import { listTotal, optionalCount } from "../../../src/huly/operations/counts.js"
import { propertyTestParameters } from "../../helpers/property.js"

const countValueArbitrary = fc.integer({ min: 0, max: 1_000_000 })
const invalidNegativeCountArbitrary = fc.integer({ min: -1_000_000, max: -1 })
const invalidListTotalNegativeArbitrary = fc.integer({ min: -1_000_000, max: -2 })
const fractionalValueArbitrary = fc.double({
  min: -1_000_000,
  max: 1_000_000,
  noDefaultInfinity: true,
  noNaN: true
}).filter((value) => !Number.isInteger(value))

describe("count helper properties", () => {
  it("preserves generated non-negative integer counts", () => {
    fc.assert(
      fc.property(countValueArbitrary, (value) => {
        expect(listTotal(value)).toBe(value)
        expect(optionalCount(value)).toBe(value)
      }),
      propertyTestParameters
    )
  })

  it("rejects generated invalid count values", () => {
    fc.assert(
      fc.property(invalidNegativeCountArbitrary, (value) => {
        expect(() => optionalCount(value)).toThrow()
      }),
      propertyTestParameters
    )

    fc.assert(
      fc.property(invalidListTotalNegativeArbitrary, (value) => {
        expect(() => listTotal(value)).toThrow()
      }),
      propertyTestParameters
    )

    fc.assert(
      fc.property(fractionalValueArbitrary, (value) => {
        expect(() => listTotal(value)).toThrow()
        expect(() => optionalCount(value)).toThrow()
      }),
      propertyTestParameters
    )
  })
})
