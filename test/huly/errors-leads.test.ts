import { describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { expect } from "vitest"
import { FunnelNotFoundError, LeadNotFoundError } from "../../src/huly/errors-leads.js"
import { funnelIdentifier, funnelReference, leadIdentifier } from "../helpers/brands.js"

describe("Lead Errors", () => {
  describe("FunnelNotFoundError", () => {
    it.effect("creates with correct tag and message", () =>
      Effect.gen(function*() {
        const error = new FunnelNotFoundError({ identifier: funnelReference("SALES") })
        expect(error._tag).toBe("FunnelNotFoundError")
        expect(error.message).toContain("SALES")
        expect(error.message).toContain("not found")
      }))
  })

  describe("LeadNotFoundError", () => {
    it.effect("creates with correct tag, identifier, and funnel in message", () =>
      Effect.gen(function*() {
        const error = new LeadNotFoundError({
          identifier: leadIdentifier("LEAD-1"),
          funnel: funnelIdentifier("funnel-1")
        })
        expect(error._tag).toBe("LeadNotFoundError")
        expect(error.message).toContain("LEAD-1")
        expect(error.message).toContain("funnel-1")
        expect(error.message).toContain("not found")
      }))
  })
})
