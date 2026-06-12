import { describe, it } from "@effect/vitest"
import { Effect, Either, Schema } from "effect"
import { expect } from "vitest"

import {
  DEFAULT_EXTERNAL_CHANNEL_MESSAGE_LIMIT,
  ExternalChannelMessageProviderValues,
  ListExternalChannelMessagesParamsSchema,
  ListExternalChannelMessagesResultSchema
} from "../../domain/schemas/external-channel-messages.js"
import { ChannelIdentifier } from "../../domain/schemas/shared.js"
import { channelTools } from "../../mcp/tools/channels.js"
import { listExternalChannelMessages } from "./external-channel-messages.js"

const decodeParams = Schema.decodeUnknownEither(ListExternalChannelMessagesParamsSchema)
const decodeResult = Schema.decodeUnknownEither(ListExternalChannelMessagesResultSchema)

describe("external channel messages", () => {
  it("validates the assessed external providers", () => {
    expect(Either.isRight(decodeParams({ provider: "gmail", channel: "Inbox", limit: 10 }))).toBe(true)
    expect(Either.isRight(decodeParams({ provider: "telegram", channel: "Ops" }))).toBe(true)
  })

  it("validates bounded limits", () => {
    expect(Either.isRight(decodeParams({ provider: "gmail", channel: "Inbox", limit: 200 }))).toBe(true)
    expect(Either.isLeft(decodeParams({ provider: "gmail", channel: "Inbox", limit: 201 }))).toBe(true)
    expect(Either.isLeft(decodeParams({ provider: "gmail", channel: "Inbox", limit: 0 }))).toBe(true)
  })

  it("accepts channel name and ID locators as a single locator field", () => {
    expect(Either.isRight(decodeParams({ provider: "gmail", channel: "Inbox" }))).toBe(true)
    expect(Either.isRight(decodeParams({ provider: "telegram", channel: "67d2a937b7bca552e9a87df3" }))).toBe(true)
  })

  it("rejects providers outside the assessed compatibility set", () => {
    expect(Either.isLeft(decodeParams({ provider: "email", channel: "Inbox" }))).toBe(true)
    expect(Either.isLeft(decodeParams({ provider: "slack", channel: "Ops" }))).toBe(true)
  })

  it("validates normalized supported message result shape", () => {
    const result = decodeResult({
      supported: true,
      provider: "gmail",
      channel: "Inbox",
      limit: 1,
      messages: [{
        id: "external-message-1",
        subject: "Build status",
        bodyPreview: "Build completed",
        sender: "ci@example.com",
        senderId: "ci",
        createdOn: 1,
        modifiedOn: 2,
        url: "https://example.com/message/external-message-1"
      }]
    })

    expect(Either.isRight(result)).toBe(true)
  })

  it("rejects empty present external message text fields", () => {
    const baseMessage = {
      id: "external-message-1",
      bodyPreview: "Build completed"
    }

    expect(Either.isLeft(decodeResult({
      supported: true,
      provider: "gmail",
      channel: "Inbox",
      limit: 1,
      messages: [{ ...baseMessage, subject: "" }]
    }))).toBe(true)
    expect(Either.isLeft(decodeResult({
      supported: true,
      provider: "gmail",
      channel: "Inbox",
      limit: 1,
      messages: [{ ...baseMessage, sender: "   " }]
    }))).toBe(true)
    expect(Either.isLeft(decodeResult({
      supported: true,
      provider: "telegram",
      channel: "Ops",
      limit: 1,
      messages: [{ ...baseMessage, senderId: "" }]
    }))).toBe(true)
  })

  it("rejects impossible unsupported result states", () => {
    expect(Either.isLeft(decodeResult({
      supported: false,
      provider: "gmail",
      channel: "Inbox",
      limit: 5,
      messages: [{
        id: "fake-message",
        bodyPreview: "Fake data"
      }]
    }))).toBe(true)

    expect(Either.isLeft(decodeResult({
      supported: false,
      provider: "telegram",
      channel: "Ops",
      limit: 5,
      messages: []
    }))).toBe(true)
  })

  it("registers the MCP tool with the external message schema", () => {
    const tool = channelTools.find(({ name }) => name === "list_external_channel_messages")

    expect(tool?.inputSchema).toBeDefined()
    expect(tool?.description).toContain("supported=false")
    expect(tool?.description).toContain("never sends")
  })

  it.effect("returns normalized unsupported results for package-incompatible providers", () =>
    Effect.gen(function*() {
      for (const provider of ExternalChannelMessageProviderValues) {
        const result = yield* listExternalChannelMessages({
          provider,
          channel: ChannelIdentifier.make("Inbox"),
          limit: 5
        })

        expect(result).toMatchObject({
          provider,
          channel: "Inbox",
          limit: 5,
          supported: false,
          messages: []
        })
        if (!result.supported) {
          expect(result.unsupportedReason).toContain("package-incompatible")
          expect(result.unsupportedReason).toContain("@hcengineering/contact")
          expect(result.unsupportedReason).toContain("Huly Gmail or Telegram message SDK")
        }
      }
    }))

  it.effect("uses a safe default limit and preserves the channel locator", () =>
    Effect.gen(function*() {
      const result = yield* listExternalChannelMessages({
        provider: "telegram",
        channel: ChannelIdentifier.make("67d2a937b7bca552e9a87df3")
      })

      expect(result.limit).toBe(DEFAULT_EXTERNAL_CHANNEL_MESSAGE_LIMIT)
      expect(result.channel).toBe("67d2a937b7bca552e9a87df3")
      expect(result.messages).toEqual([])
    }))
})
