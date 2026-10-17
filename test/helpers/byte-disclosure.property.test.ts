import * as fc from "fast-check"
import { expect, it } from "vitest"

import { makeByteDisclosureDetector } from "./byte-disclosure.js"
import { propertyTestParameters } from "./property.js"

it("matches whole-stream credential detection under arbitrary TCP chunk boundaries", () => {
  fc.assert(
    fc.property(
      fc.array(fc.uint8Array({ maxLength: 96 }), { maxLength: 12 }),
      fc.array(fc.uint8Array({ minLength: 1, maxLength: 32 }), { maxLength: 8 }),
      (chunks, forbidden) => {
        const detect = makeByteDisclosureDetector(forbidden)
        let actual = false
        for (const chunk of chunks) actual = detect(chunk) || actual
        const whole = Buffer.concat(chunks)
        expect(actual).toBe(forbidden.some((needle) => whole.includes(Buffer.from(needle))))
      }
    ),
    propertyTestParameters
  )
})

it("finds an inserted credential even when every fragment is shorter than the credential", () => {
  fc.assert(
    fc.property(
      fc.uint8Array({ maxLength: 32 }),
      fc.uint8Array({ minLength: 2, maxLength: 64 }),
      fc.uint8Array({ maxLength: 32 }),
      (prefix, secret, suffix) => {
        const whole = Buffer.concat([prefix, secret, suffix])
        const detect = makeByteDisclosureDetector([secret])
        let actual = false
        for (const byte of whole) actual = detect(Uint8Array.of(byte)) || actual
        expect(actual).toBe(true)
      }
    ),
    propertyTestParameters
  )
})
