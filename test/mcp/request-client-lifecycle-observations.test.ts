import { describe, expect, it } from "vitest"

import type { HttpAdmissionObservation } from "../../src/mcp/http-admission-observations.js"
import { createRequestClientLifecycle } from "../../src/mcp/request-client-lifecycle.js"
import { subscribeHttpAdmissionObservations } from "../helpers/http-admission-observations.js"

describe("request-client lifecycle observations", () => {
  it("reports one successful acquisition for concurrent resolvers and closes the acquired resource once", async () => {
    const observations: HttpAdmissionObservation[] = []
    const errors: unknown[] = []
    const unsubscribe = subscribeHttpAdmissionObservations(
      (observation) => observations.push(observation),
      (error) => errors.push(error)
    )
    const bundle = Symbol("clients")
    let closes = 0
    const lifecycle = createRequestClientLifecycle(() =>
      Promise.resolve({
        bundle,
        close: () => {
          closes++
        }
      })
    )
    try {
      const first = lifecycle.resolve()
      const second = lifecycle.resolve()
      await expect(Promise.all([first, second])).resolves.toEqual([bundle, bundle])
      await lifecycle.close()
      await lifecycle.close()
      expect(closes).toBe(1)
      expect(observations.filter(({ _tag }) => _tag === "RequestClientLifecycle_acquireSettles")).toEqual([
        { _tag: "RequestClientLifecycle_acquireSettles", rejected: false }
      ])
      expect(observations.filter(({ _tag }) => _tag === "RequestClientLifecycle_leaseCloseSettles")).toEqual([
        { _tag: "RequestClientLifecycle_leaseCloseSettles", failed: false }
      ])
      expect(errors).toEqual([])
    } finally {
      unsubscribe()
    }
  })

  it("reports failed acquisition without serializing the error or inventing an acquired resource", async () => {
    const observations: HttpAdmissionObservation[] = []
    const errors: unknown[] = []
    const unsubscribe = subscribeHttpAdmissionObservations(
      (observation) => observations.push(observation),
      (error) => errors.push(error)
    )
    const failure = new Error("sensitive-acquisition-token")
    const lifecycle = createRequestClientLifecycle(() => Promise.reject(failure))
    try {
      await expect(lifecycle.resolve()).rejects.toBe(failure)
      await lifecycle.close()
      expect(observations.filter(({ _tag }) => _tag === "RequestClientLifecycle_acquireSettles")).toEqual([
        { _tag: "RequestClientLifecycle_acquireSettles", rejected: true }
      ])
      expect(observations.some(({ _tag }) => _tag === "RequestClientLifecycle_leaseCloseSettles")).toBe(false)
      expect(JSON.stringify(observations)).not.toContain(failure.message)
      expect(errors).toEqual([])
    } finally {
      unsubscribe()
    }
  })
})
