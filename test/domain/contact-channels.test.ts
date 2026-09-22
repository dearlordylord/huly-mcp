import { Effect } from "effect"
import { describe, expect, it } from "vitest"

import {
  parseAddOrganizationChannelParams,
  parseAddPersonChannelParams,
  parseRemoveOrganizationChannelParams,
  parseRemovePersonChannelParams,
  parseUpdateOrganizationChannelParams,
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
    expect(() => Effect.runSync(parseRemovePersonChannelParams({ person: "person-1", value: "+1 555 0100" }))).toThrow(
      "exactly one channel locator"
    )
  })

  it("validates email values while accepting provider-specific non-email text", () => {
    expect(
      Effect.runSync(parseAddPersonChannelParams({ person: "person-1", provider: "phone", value: "+1 555 0100" }))
    ).toMatchObject({ provider: "phone", value: "+1 555 0100" })
    expect(() =>
      Effect.runSync(parseAddPersonChannelParams({ person: "person-1", provider: "email", value: "not-an-email" }))
    ).toThrow("valid email addresses")
    expect(() =>
      Effect.runSync(parseRemovePersonChannelParams({ person: "person-1", provider: "email", value: "not-an-email" }))
    ).toThrow("valid email addresses")
  })

  it("validates the effective provider and value after a person channel update", () => {
    expect(
      Effect.runSync(
        parseUpdatePersonChannelParams({
          person: "person-1",
          provider: "phone",
          value: "+1 555 0100",
          newValue: "+1 555 0199"
        })
      )
    ).toMatchObject({ provider: "phone", newValue: "+1 555 0199" })
    expect(() =>
      Effect.runSync(
        parseUpdatePersonChannelParams({
          person: "person-1",
          provider: "phone",
          value: "+1 555 0100",
          newProvider: "email",
          newValue: "not-an-email"
        })
      )
    ).toThrow("valid email addresses")
    expect(() =>
      Effect.runSync(parseUpdatePersonChannelParams({ person: "person-1", provider: "phone", value: "+1 555 0100" }))
    ).toThrow("At least one update field")
    expect(() =>
      Effect.runSync(
        parseUpdatePersonChannelParams({
          person: "person-1",
          provider: "email",
          value: "person@example.com",
          newValue: "not-an-email"
        })
      )
    ).toThrow("valid email addresses")
  })

  it("applies the same locator and email rules to organization channels", () => {
    expect(
      Effect.runSync(
        parseAddOrganizationChannelParams({
          organizationId: "organization-1",
          provider: "email",
          value: "team@example.com"
        })
      )
    ).toMatchObject({ provider: "email", value: "team@example.com" })
    expect(
      Effect.runSync(
        parseUpdateOrganizationChannelParams({
          organizationId: "organization-1",
          provider: "phone",
          value: "+1 555 0100",
          newValue: "+1 555 0199"
        })
      )
    ).toMatchObject({ provider: "phone", newValue: "+1 555 0199" })
    expect(
      Effect.runSync(
        parseUpdateOrganizationChannelParams({
          organizationId: "organization-1",
          channelId: "channel-1",
          newProvider: "phone"
        })
      )
    ).toMatchObject({ channelId: "channel-1", newProvider: "phone" })
    expect(
      Effect.runSync(parseRemoveOrganizationChannelParams({ organizationId: "organization-1", channelId: "channel-1" }))
    ).toMatchObject({ channelId: "channel-1" })
    expect(() =>
      Effect.runSync(
        parseRemoveOrganizationChannelParams({
          organizationId: "organization-1",
          provider: "email",
          value: "not-an-email"
        })
      )
    ).toThrow("valid email addresses")
  })
})
