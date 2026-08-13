import { describe, expect, it } from "vitest"

import { createRequestAdmission } from "../../src/mcp/request-admission.js"

describe("request admission", () => {
  it("quiesces synchronously and resolves when every accepted request releases", async () => {
    const admission = createRequestAdmission()
    const first = admission.enter()
    const second = admission.enter()

    expect(first).not.toBeNull()
    expect(second).not.toBeNull()

    const drained = admission.quiesce()
    expect(admission.enter()).toBeNull()

    first?.release()
    first?.release()
    let settled = false
    void drained.then(() => {
      settled = true
    })
    await Promise.resolve()
    expect(settled).toBe(false)

    second?.release()
    await expect(drained).resolves.toBeUndefined()
  })

  it("drains immediately when no request is active", async () => {
    const admission = createRequestAdmission()

    await expect(admission.quiesce()).resolves.toBeUndefined()
    expect(admission.enter()).toBeNull()
  })
})
