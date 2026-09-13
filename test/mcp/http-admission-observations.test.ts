import { channel } from "node:diagnostics_channel"
import { describe, expect, it } from "vitest"

import {
  admissionObservationsEnabled,
  HTTP_ADMISSION_CHANNEL,
  type HttpAdmissionObservation,
  observeHttpAdmission
} from "../../src/mcp/http-admission-observations.js"
import { subscribeHttpAdmissionObservations } from "../helpers/http-admission-observations.js"
import { ORACLE_INFRASTRUCTURE_TAG } from "../helpers/test-tags.js"

describe("HTTP admission observations", { tags: [ORACLE_INFRASTRUCTURE_TAG] }, () => {
  it("does not evaluate deferred fields without a subscriber", () => {
    let evaluated = false
    expect(admissionObservationsEnabled()).toBe(false)
    observeHttpAdmission("RequestAdmission_enter", {
      admitted: () => {
        evaluated = true
        return true
      }
    })
    expect(evaluated).toBe(false)
  })

  it("delivers parsed events and releases the subscription", () => {
    const received: HttpAdmissionObservation[] = []
    const errors: unknown[] = []
    const unsubscribe = subscribeHttpAdmissionObservations(
      (observation) => received.push(observation),
      (error) => errors.push(error)
    )
    try {
      expect(admissionObservationsEnabled()).toBe(true)
      observeHttpAdmission("RequestAdmission_enter", { admitted: () => true })
      observeHttpAdmission("RequestLease_release", { active: 2 })
      observeHttpAdmission("createRequestAdmission", {})
      expect(received).toEqual([
        { _tag: "RequestAdmission_enter", admitted: true },
        { _tag: "RequestLease_release", active: 2 },
        { _tag: "createRequestAdmission" }
      ])
      expect(errors).toEqual([])
    } finally {
      unsubscribe()
    }
    expect(admissionObservationsEnabled()).toBe(false)
  })

  it("reports malformed messages and forwarding failures without uncaught subscriber errors", () => {
    const errors: unknown[] = []
    const failure = new Error("oracle unavailable")
    const unsubscribe = subscribeHttpAdmissionObservations(
      () => {
        throw failure
      },
      (error) => errors.push(error)
    )
    try {
      channel(HTTP_ADMISSION_CHANNEL).publish({ _tag: "RequestLease_release", active: -1 })
      expect(errors).toHaveLength(1)
      expect(errors[0]).toBeInstanceOf(Error)
      expect(() => observeHttpAdmission("RequestAdmission_enter", { admitted: false })).not.toThrow()
      expect(errors[1]).toBe(failure)
    } finally {
      unsubscribe()
    }
  })
})
