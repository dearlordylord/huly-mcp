import * as fc from "fast-check"
import { describe, expect, it } from "vitest"

import { mergeUpdateEntries } from "../../../src/huly/operations/update-guards.js"
import { propertyTestParameters } from "../../helpers/property.js"

type GeneratedUpdateEntry = {
  readonly title?: string
  readonly description?: string | null
  readonly $inc?: Readonly<Record<string, unknown>>
  readonly $pull?: Readonly<Record<string, unknown>>
  readonly $push?: Readonly<Record<string, unknown>>
  readonly $unset?: Readonly<Record<string, unknown>>
  readonly $update?: Readonly<Record<string, unknown>>
}

const updateKeyArbitrary = fc.stringMatching(/^[a-z][a-z0-9_]{0,8}$/)
const operatorNumberArbitrary = fc.integer({ min: -1000, max: 1000 })
const operatorStringArbitrary = fc.string({ maxLength: 30 })

const updateEntryArbitrary: fc.Arbitrary<GeneratedUpdateEntry> = fc.record(
  {
    title: operatorStringArbitrary,
    description: fc.oneof(operatorStringArbitrary, fc.constant(null)),
    $inc: fc.dictionary(updateKeyArbitrary, operatorNumberArbitrary, { maxKeys: 5 }),
    $pull: fc.dictionary(updateKeyArbitrary, operatorStringArbitrary, { maxKeys: 5 }),
    $push: fc.dictionary(updateKeyArbitrary, operatorStringArbitrary, { maxKeys: 5 }),
    $unset: fc.dictionary(updateKeyArbitrary, fc.constant(""), { maxKeys: 5 }),
    $update: fc.dictionary(updateKeyArbitrary, fc.record({ value: operatorStringArbitrary }), { maxKeys: 5 })
  },
  { requiredKeys: [] }
)

const mergeOperatorPayloads = <Value>(
  entries: ReadonlyArray<Readonly<Record<string, Value>> | undefined>
): Readonly<Record<string, Value>> | undefined => {
  const present = entries.filter((entry): entry is Readonly<Record<string, Value>> => entry !== undefined)
  return present.length === 0 ? undefined : Object.assign({}, ...present)
}

describe("update guard helper properties", () => {
  it("preserves nested update operator fields for generated entries", () => {
    fc.assert(
      fc.property(fc.array(updateEntryArbitrary, { maxLength: 20 }), (entries) => {
        const result = mergeUpdateEntries(entries)

        expect(result.$inc).toEqual(mergeOperatorPayloads(entries.map((entry) => entry.$inc)))
        expect(result.$pull).toEqual(mergeOperatorPayloads(entries.map((entry) => entry.$pull)))
        expect(result.$push).toEqual(mergeOperatorPayloads(entries.map((entry) => entry.$push)))
        expect(result.$unset).toEqual(mergeOperatorPayloads(entries.map((entry) => entry.$unset)))
        expect(result.$update).toEqual(mergeOperatorPayloads(entries.map((entry) => entry.$update)))
      }),
      propertyTestParameters
    )
  })
})
