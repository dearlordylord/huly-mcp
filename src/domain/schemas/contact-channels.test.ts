import { Effect, Either, Schema } from "effect"
import { describe, expect, it } from "vitest"

import {
  AddPersonChannelParamsSchema,
  ContactChannelProviderSchema,
  ContactChannelProviderValues,
  parseAddPersonChannelParams,
  parseRemovePersonChannelParams,
  parseUpdatePersonChannelParams,
  RemovePersonChannelParamsSchema,
  UpdatePersonChannelParamsSchema
} from "./contact-channels.js"

describe("Contact Channel Schemas", () => {
  describe("ContactChannelProviderSchema", () => {
    it("accepts every supported provider label", () => {
      for (const provider of ContactChannelProviderValues) {
        expect(Schema.decodeUnknownSync(ContactChannelProviderSchema)(provider)).toBe(provider)
      }
    })

    it("rejects unsupported provider labels", () => {
      const result = Schema.decodeUnknownEither(ContactChannelProviderSchema)("fax")
      expect(Either.isLeft(result)).toBe(true)
    })
  })

  describe("AddPersonChannelParamsSchema", () => {
    it("accepts a non-email provider with a non-empty value", () => {
      const result = Schema.decodeUnknownSync(AddPersonChannelParamsSchema)({
        person: "person-1",
        provider: "github",
        value: "octocat"
      })

      expect(result).toEqual({ person: "person-1", provider: "github", value: "octocat" })
    })

    it("rejects empty values", () => {
      const result = Effect.runSync(
        Effect.either(parseAddPersonChannelParams({ person: "person-1", provider: "phone", value: "" }))
      )
      expect(Either.isLeft(result)).toBe(true)
    })

    it("rejects invalid email provider values", () => {
      const result = Effect.runSync(
        Effect.either(parseAddPersonChannelParams({ person: "person-1", provider: "email", value: "not-email" }))
      )
      expect(Either.isLeft(result)).toBe(true)
    })
  })

  describe("UpdatePersonChannelParamsSchema", () => {
    it("requires at least one replacement field", () => {
      const result = Schema.decodeUnknownEither(UpdatePersonChannelParamsSchema)({
        person: "person-1",
        channelId: "channel-1"
      })
      expect(Either.isLeft(result)).toBe(true)
    })

    it("accepts channelId locator with newValue", () => {
      const result = Schema.decodeUnknownSync(UpdatePersonChannelParamsSchema)({
        person: "person-1",
        channelId: "channel-1",
        newValue: "+15551234"
      })
      expect(result).toEqual({ person: "person-1", channelId: "channel-1", newValue: "+15551234" })
    })

    it("accepts provider plus value locator with newProvider", () => {
      const result = Schema.decodeUnknownSync(UpdatePersonChannelParamsSchema)({
        person: "person-1",
        provider: "phone",
        value: "+15551234",
        newProvider: "telegram"
      })
      expect(result).toEqual({
        person: "person-1",
        provider: "phone",
        value: "+15551234",
        newProvider: "telegram"
      })
    })

    it("rejects missing and mixed locators", () => {
      const missing = Effect.runSync(
        Effect.either(parseUpdatePersonChannelParams({ person: "person-1", newValue: "x" }))
      )
      const mixed = Effect.runSync(
        Effect.either(
          parseUpdatePersonChannelParams({
            person: "person-1",
            channelId: "channel-1",
            provider: "phone",
            newValue: "x"
          })
        )
      )
      const incomplete = Effect.runSync(
        Effect.either(parseUpdatePersonChannelParams({ person: "person-1", provider: "phone", newValue: "x" }))
      )

      expect(Either.isLeft(missing)).toBe(true)
      expect(Either.isLeft(mixed)).toBe(true)
      expect(Either.isLeft(incomplete)).toBe(true)
    })

    it("rejects invalid target email values", () => {
      const result = Effect.runSync(
        Effect.either(
          parseUpdatePersonChannelParams({
            person: "person-1",
            channelId: "channel-1",
            newProvider: "email",
            newValue: "not-email"
          })
        )
      )
      expect(Either.isLeft(result)).toBe(true)
    })
  })

  describe("RemovePersonChannelParamsSchema", () => {
    it("accepts exactly one locator shape", () => {
      expect(
        Schema.decodeUnknownSync(RemovePersonChannelParamsSchema)({ person: "person-1", channelId: "channel-1" })
      ).toEqual({ person: "person-1", channelId: "channel-1" })

      expect(
        Schema.decodeUnknownSync(RemovePersonChannelParamsSchema)({
          person: "person-1",
          provider: "homepage",
          value: "https://example.com"
        })
      ).toEqual({ person: "person-1", provider: "homepage", value: "https://example.com" })
    })

    it("rejects neither locator and both locator shapes", () => {
      const neither = Effect.runSync(
        Effect.either(parseRemovePersonChannelParams({ person: "person-1" }))
      )
      const both = Effect.runSync(
        Effect.either(
          parseRemovePersonChannelParams({
            person: "person-1",
            channelId: "channel-1",
            provider: "homepage",
            value: "https://example.com"
          })
        )
      )

      expect(Either.isLeft(neither)).toBe(true)
      expect(Either.isLeft(both)).toBe(true)
    })
  })
})
