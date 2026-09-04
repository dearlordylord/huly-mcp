import { describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { expect } from "vitest"
import {
  FunnelNotFoundError,
  LeadDeleteConflictError,
  LeadMoveConflictError,
  LeadNotFoundError,
  LeadUpdateConflictError
} from "../../src/huly/errors-leads.js"
import { NonEmptyString } from "../../src/domain/schemas/shared.js"
import { funnelIdentifier, funnelReference, leadIdentifier } from "../helpers/brands.js"

describe("Lead Errors", () => {
  describe("FunnelNotFoundError", () => {
    it.effect("creates with correct tag and message", () =>
      Effect.sync(function () {
        const error = new FunnelNotFoundError({ identifier: funnelReference("SALES") })
        expect(error._tag).toBe("FunnelNotFoundError")
        expect(error.message).toContain("SALES")
        expect(error.message).toContain("not found")
      })
    )
  })

  describe("LeadNotFoundError", () => {
    it.effect("creates with correct tag, identifier, and funnel in message", () =>
      Effect.sync(function () {
        const error = new LeadNotFoundError({
          identifier: leadIdentifier("LEAD-1"),
          funnel: funnelIdentifier("funnel-1")
        })
        expect(error._tag).toBe("LeadNotFoundError")
        expect(error.message).toContain("LEAD-1")
        expect(error.message).toContain("funnel-1")
        expect(error.message).toContain("not found")
      })
    )
  })

  it.effect("describes move and deletion conflicts with actionable targets", () =>
    Effect.sync(function () {
      const move = new LeadMoveConflictError({
        identifier: leadIdentifier("LEAD-1"),
        sourceFunnel: funnelIdentifier("source"),
        destinationFunnel: funnelIdentifier("destination"),
        reason: NonEmptyString.make("status mapping is incompatible")
      })
      const deletion = new LeadDeleteConflictError({
        identifier: leadIdentifier("LEAD-1"),
        funnel: funnelIdentifier("source"),
        reason: NonEmptyString.make("impact changed")
      })
      const update = new LeadUpdateConflictError({
        identifier: leadIdentifier("LEAD-1"),
        funnel: funnelIdentifier("source"),
        reason: NonEmptyString.make("funnel is archived")
      })

      expect(move.message).toContain("source")
      expect(move.message).toContain("destination")
      expect(deletion.message).toContain("impact changed")
      expect(update.message).toContain("funnel is archived")
    })
  )
})
