import { Schema } from "effect"
import * as fc from "fast-check"
import { describe, expect, it } from "vitest"

import { Count, ListTotal } from "../../../src/domain/schemas/shared.js"
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

describe("Count schemas properties", () => {
  it("accepts generated non-negative integers for counts and list totals", () => {
    fc.assert(
      fc.property(countValueArbitrary, (value) => {
        expect(Schema.decodeUnknownSync(Count)(value)).toBe(value)
        expect(Schema.decodeUnknownSync(ListTotal)(value)).toBe(value)
      }),
      propertyTestParameters
    )
  })

  it("rejects generated negative and fractional count values", () => {
    fc.assert(
      fc.property(invalidNegativeCountArbitrary, (value) => {
        expect(() => Schema.decodeUnknownSync(Count)(value)).toThrow()
      }),
      propertyTestParameters
    )

    fc.assert(
      fc.property(fractionalValueArbitrary, (value) => {
        expect(() => Schema.decodeUnknownSync(Count)(value)).toThrow()
        expect(() => Schema.decodeUnknownSync(ListTotal)(value)).toThrow()
      }),
      propertyTestParameters
    )
  })

  it("rejects generated list total negatives except the unknown sentinel", () => {
    fc.assert(
      fc.property(invalidListTotalNegativeArbitrary, (value) => {
        expect(() => Schema.decodeUnknownSync(ListTotal)(value)).toThrow()
      }),
      propertyTestParameters
    )
  })
})
