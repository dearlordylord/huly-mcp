import { describe, expect, it } from "vitest"

import { HOSTED_HULY_MIGRATION_WARNING } from "../../src/huly/unavailable-diagnostics.js"
import { createHostedHulyMigrationNoticeProvider, type ToolCallNoticeClaim } from "../../src/mcp/tool-call-notices.js"

const expectClaimed = (claim: ToolCallNoticeClaim): Extract<ToolCallNoticeClaim, { readonly _tag: "Claimed" }> => {
  expect(claim._tag).toBe("Claimed")
  if (claim._tag !== "Claimed") throw new Error("Expected a claimed tool-call notice")
  return claim
}

describe("createHostedHulyMigrationNoticeProvider", () => {
  it("does not claim a notice when no Huly origin is configured", () => {
    const provider = createHostedHulyMigrationNoticeProvider({
      delivery: "once",
      hulyOrigin: undefined
    })

    expect(provider.claim()).toEqual({ _tag: "None" })
  })

  it("does not claim a notice for a self-hosted Huly origin", () => {
    const provider = createHostedHulyMigrationNoticeProvider({
      delivery: "once",
      hulyOrigin: "https://huly.example.com"
    })

    expect(provider.claim()).toEqual({ _tag: "None" })
  })

  it("delivers the hosted-Huly notice once after a persistent-session claim completes", () => {
    const provider = createHostedHulyMigrationNoticeProvider({
      delivery: "once",
      hulyOrigin: "https://huly.app"
    })

    const first = expectClaimed(provider.claim())
    expect(first.warning).toEqual(HOSTED_HULY_MIGRATION_WARNING)
    expect(provider.claim()).toEqual({ _tag: "None" })

    first.delivered()
    first.delivered()
    first.release()

    expect(provider.claim()).toEqual({ _tag: "None" })
  })

  it("releases an incomplete persistent-session claim for the next tool call", () => {
    const provider = createHostedHulyMigrationNoticeProvider({
      delivery: "once",
      hulyOrigin: "https://huly.app"
    })

    expectClaimed(provider.claim()).release()

    expectClaimed(provider.claim()).delivered()
    expect(provider.claim()).toEqual({ _tag: "None" })
  })

  it("claims the hosted-Huly notice for every stateless HTTP request", () => {
    const provider = createHostedHulyMigrationNoticeProvider({
      delivery: "always",
      hulyOrigin: "https://huly.app"
    })

    const first = expectClaimed(provider.claim())
    first.release()
    expectClaimed(provider.claim()).delivered()
  })
})
