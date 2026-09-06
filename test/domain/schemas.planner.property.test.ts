import * as fc from "fast-check"
import { describe, expect, it } from "vitest"

import { TodoAttachmentInputSchema } from "../../src/domain/schemas/planner.js"
import { assertDecodeSuccess, assertEncodeSuccess, propertyTestParameters } from "../helpers/property.js"

const nonBlankText = fc.string({ minLength: 1, maxLength: 32 }).filter((value) => value.trim().length > 0)

describe("planner document attachment schema properties", () => {
  it("round-trips every generated document attachment locator", () => {
    fc.assert(
      fc.property(nonBlankText, nonBlankText, (teamspace, document) => {
        const parsed = assertDecodeSuccess(TodoAttachmentInputSchema, { type: "document", teamspace, document })
        if (parsed.type !== "document") throw new Error("Expected document attachment")
        const encoded = assertEncodeSuccess(TodoAttachmentInputSchema, parsed)

        expect(parsed.type).toBe("document")
        expect(encoded).toEqual({ type: "document", teamspace: parsed.teamspace, document: parsed.document })
      }),
      propertyTestParameters
    )
  })
})
