import { Effect } from "effect"
import { describe, expect, it } from "vitest"

import {
  parseRemovePersonChannelParams,
  parseUpdatePersonChannelParams
} from "../../src/domain/schemas/contact-channels.js"

describe("contact channel schemas", () => {
  it("accepts each exact channel locator form", () => {
    expect(
      Effect.runSync(
        parseRemovePersonChannelParams({ person: "person-1", provider: "email", value: "person@example.com" })
      )
    ).toMatchObject({ provider: "email", value: "person@example.com" })
    expect(
      Effect.runSync(
        parseUpdatePersonChannelParams({ person: "person-1", channelId: "channel-1", newValue: "updated" })
      )
    ).toMatchObject({ channelId: "channel-1", newValue: "updated" })
  })

  it("rejects partial provider/value locators", () => {
    expect(() => Effect.runSync(parseRemovePersonChannelParams({ person: "person-1", provider: "phone" }))).toThrow(
      "exactly one channel locator"
    )
  })
})
