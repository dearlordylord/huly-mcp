import { describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { expect } from "vitest"
import {
  ChannelSchema,
  ChannelSummarySchema,
  createChannelParamsJsonSchema,
  deleteChannelParamsJsonSchema,
  DirectMessageSummarySchema,
  getChannelParamsJsonSchema,
  listChannelMessagesParamsJsonSchema,
  listChannelsParamsJsonSchema,
  listDirectMessagesParamsJsonSchema,
  MessageSummarySchema,
  parseCreateChannelParams,
  parseDeleteChannelParams,
  parseGetChannelParams,
  parseListChannelMessagesParams,
  parseListChannelsParams,
  parseListDirectMessagesParams,
  parseSendChannelMessageParams,
  parseUpdateChannelParams,
  sendChannelMessageParamsJsonSchema,
  updateChannelParamsJsonSchema
} from "../../src/domain/schemas.js"

type JsonSchemaObject = {
  $schema?: string
  type?: string
  required?: Array<string>
  properties?: Record<string, { description?: string }>
}

describe("Channel Domain Schemas", () => {
  describe("ChannelSummarySchema", () => {
    // test-revizorro: approved
    it.effect("parses minimal channel summary", () =>
      Effect.gen(function*() {
        const result = yield* Schema.decodeUnknown(ChannelSummarySchema)({
          id: "channel-1",
          name: "general",
          private: false,
          archived: false
        })
        expect(result).toEqual({
          id: "channel-1",
          name: "general",
          private: false,
          archived: false
        })
      }))

    // test-revizorro: approved
    it.effect("parses with all optional fields", () =>
      Effect.gen(function*() {
        const result = yield* Schema.decodeUnknown(ChannelSummarySchema)({
          id: "channel-1",
          name: "general",
          topic: "General discussion",
          private: true,
          archived: false,
          members: 5,
          messages: 100,
          modifiedOn: 1706500000000
        })
        expect(result.topic).toBe("General discussion")
        expect(result.members).toBe(5)
        expect(result.messages).toBe(100)
        expect(result.modifiedOn).toBe(1706500000000)
      }))

    // test-revizorro: approved
    it.effect("rejects empty id", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          Schema.decodeUnknown(ChannelSummarySchema)({
            id: "  ",
            name: "general",
            private: false,
            archived: false
          })
        )
        expect(error._tag).toBe("ParseError")
      }))
  })

  describe("ChannelSchema", () => {
    // test-revizorro: approved
    it.effect("parses minimal channel", () =>
      Effect.gen(function*() {
        const result = yield* Schema.decodeUnknown(ChannelSchema)({
          id: "channel-1",
          name: "general",
          private: false,
          archived: false
        })
        expect(result.id).toBe("channel-1")
        expect(result.name).toBe("general")
        expect(result.description).toBeUndefined()
      }))

    // test-revizorro: approved
    it.effect("parses full channel", () =>
      Effect.gen(function*() {
        const result = yield* Schema.decodeUnknown(ChannelSchema)({
          id: "channel-1",
          name: "development",
          topic: "Dev discussions",
          description: "Channel for development team",
          private: true,
          archived: false,
          members: ["John", "Jane"],
          messages: 50,
          modifiedOn: 1706500000000,
          createdOn: 1706400000000
        })
        expect(result.topic).toBe("Dev discussions")
        expect(result.description).toBe("Channel for development team")
        expect(result.members).toEqual(["John", "Jane"])
        expect(result.createdOn).toBe(1706400000000)
      }))
  })

  describe("MessageSummarySchema", () => {
    // test-revizorro: scheduled
    it.effect("parses minimal message", () =>
      Effect.gen(function*() {
        const result = yield* Schema.decodeUnknown(MessageSummarySchema)({
          id: "msg-1",
          body: "Hello world"
        })
        expect(result.id).toBe("msg-1")
        expect(result.body).toBe("Hello world")
      }))

    // test-revizorro: suspect | Incomplete assertions: provides 8 fields but only validates 2 (sender, replies). Missing validation of senderId, timestamps, etc.
    it.effect("parses full message", () =>
      Effect.gen(function*() {
        const result = yield* Schema.decodeUnknown(MessageSummarySchema)({
          id: "msg-1",
          body: "Hello world",
          sender: "John Doe",
          senderId: "person-1",
          createdOn: 1706500000000,
          modifiedOn: 1706500000000,
          editedOn: 1706510000000,
          replies: 3
        })
        expect(result.sender).toBe("John Doe")
        expect(result.replies).toBe(3)
      }))
  })

  describe("DirectMessageSummarySchema", () => {
    // test-revizorro: approved
    it.effect("parses minimal DM", () =>
      Effect.gen(function*() {
        const result = yield* Schema.decodeUnknown(DirectMessageSummarySchema)({
          id: "dm-1",
          participants: ["Alice", "Bob"]
        })
        expect(result.id).toBe("dm-1")
        expect(result.participants).toEqual(["Alice", "Bob"])
      }))

    // test-revizorro: approved
    it.effect("parses full DM", () =>
      Effect.gen(function*() {
        const result = yield* Schema.decodeUnknown(DirectMessageSummarySchema)({
          id: "dm-1",
          participants: ["Alice", "Bob"],
          participantIds: ["person-1", "person-2"],
          messages: 25,
          modifiedOn: 1706500000000
        })
        expect(result.participantIds).toEqual(["person-1", "person-2"])
        expect(result.messages).toBe(25)
      }))
  })

  describe("ListChannelsParamsSchema", () => {
    // test-revizorro: approved
    it.effect("parses empty params", () =>
      Effect.gen(function*() {
        const result = yield* parseListChannelsParams({})
        expect(result).toEqual({})
      }))

    // test-revizorro: approved
    it.effect("parses with all options", () =>
      Effect.gen(function*() {
        const result = yield* parseListChannelsParams({
          includeArchived: true,
          limit: 25
        })
        expect(result.includeArchived).toBe(true)
        expect(result.limit).toBe(25)
      }))

    // test-revizorro: approved
    it.effect("rejects limit over 200", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          parseListChannelsParams({ limit: 201 })
        )
        expect(error._tag).toBe("ParseError")
      }))

    // test-revizorro: approved
    it.effect("rejects negative limit", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          parseListChannelsParams({ limit: -1 })
        )
        expect(error._tag).toBe("ParseError")
      }))

    // test-revizorro: approved
    it.effect("rejects non-integer limit", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          parseListChannelsParams({ limit: 10.5 })
        )
        expect(error._tag).toBe("ParseError")
      }))

    // test-revizorro: scheduled
    it.effect("rejects zero limit", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          parseListChannelsParams({ limit: 0 })
        )
        expect(error._tag).toBe("ParseError")
      }))
  })

  describe("GetChannelParamsSchema", () => {
    // test-revizorro: approved
    it.effect("parses valid params", () =>
      Effect.gen(function*() {
        const result = yield* parseGetChannelParams({ channel: "general" })
        expect(result).toEqual({ channel: "general" })
      }))

    // test-revizorro: approved
    it.effect("trims whitespace", () =>
      Effect.gen(function*() {
        const result = yield* parseGetChannelParams({ channel: "  general  " })
        expect(result.channel).toBe("general")
      }))

    // test-revizorro: approved
    it.effect("rejects empty channel", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          parseGetChannelParams({ channel: "  " })
        )
        expect(error._tag).toBe("ParseError")
      }))

    // test-revizorro: scheduled
    it.effect("rejects missing channel", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          parseGetChannelParams({})
        )
        expect(error._tag).toBe("ParseError")
      }))
  })

  describe("CreateChannelParamsSchema", () => {
    // test-revizorro: scheduled
    it.effect("parses minimal params", () =>
      Effect.gen(function*() {
        const result = yield* parseCreateChannelParams({ name: "new-channel" })
        expect(result).toEqual({ name: "new-channel" })
      }))

    // test-revizorro: approved
    it.effect("parses with topic and private", () =>
      Effect.gen(function*() {
        const result = yield* parseCreateChannelParams({
          name: "new-channel",
          topic: "Channel topic",
          private: true
        })
        expect(result.name).toBe("new-channel")
        expect(result.topic).toBe("Channel topic")
        expect(result.private).toBe(true)
      }))

    // test-revizorro: approved
    it.effect("rejects empty name", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          parseCreateChannelParams({ name: "   " })
        )
        expect(error._tag).toBe("ParseError")
      }))
  })

  describe("UpdateChannelParamsSchema", () => {
    // test-revizorro: approved
    it.effect("parses minimal params", () =>
      Effect.gen(function*() {
        const result = yield* parseUpdateChannelParams({ channel: "general" })
        expect(result).toEqual({ channel: "general" })
      }))

    // test-revizorro: suspect | Missing assertion for 'channel' field; validates 2 of 3 required input fields
    it.effect("parses with update fields", () =>
      Effect.gen(function*() {
        const result = yield* parseUpdateChannelParams({
          channel: "general",
          name: "new-name",
          topic: "Updated topic"
        })
        expect(result.name).toBe("new-name")
        expect(result.topic).toBe("Updated topic")
      }))

    // test-revizorro: approved
    it.effect("rejects empty channel", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          parseUpdateChannelParams({ channel: "  " })
        )
        expect(error._tag).toBe("ParseError")
      }))
  })

  describe("DeleteChannelParamsSchema", () => {
    // test-revizorro: approved
    it.effect("parses valid params", () =>
      Effect.gen(function*() {
        const result = yield* parseDeleteChannelParams({ channel: "old-channel" })
        expect(result).toEqual({ channel: "old-channel" })
      }))

    // test-revizorro: approved
    it.effect("rejects empty channel", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          parseDeleteChannelParams({ channel: "" })
        )
        expect(error._tag).toBe("ParseError")
      }))
  })

  describe("ListChannelMessagesParamsSchema", () => {
    // test-revizorro: approved
    it.effect("parses minimal params", () =>
      Effect.gen(function*() {
        const result = yield* parseListChannelMessagesParams({ channel: "general" })
        expect(result).toEqual({ channel: "general" })
      }))

    // test-revizorro: approved
    it.effect("parses with limit", () =>
      Effect.gen(function*() {
        const result = yield* parseListChannelMessagesParams({
          channel: "general",
          limit: 100
        })
        expect(result.limit).toBe(100)
      }))

    // test-revizorro: approved
    it.effect("rejects empty channel", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          parseListChannelMessagesParams({ channel: "  " })
        )
        expect(error._tag).toBe("ParseError")
      }))
  })

  describe("SendChannelMessageParamsSchema", () => {
    // test-revizorro: approved
    it.effect("parses valid params", () =>
      Effect.gen(function*() {
        const result = yield* parseSendChannelMessageParams({
          channel: "general",
          body: "Hello everyone!"
        })
        expect(result.channel).toBe("general")
        expect(result.body).toBe("Hello everyone!")
      }))

    // test-revizorro: approved
    it.effect("rejects empty body", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          parseSendChannelMessageParams({
            channel: "general",
            body: "  "
          })
        )
        expect(error._tag).toBe("ParseError")
      }))

    // test-revizorro: approved
    it.effect("rejects empty channel", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          parseSendChannelMessageParams({
            channel: "  ",
            body: "Hello"
          })
        )
        expect(error._tag).toBe("ParseError")
      }))
  })

  describe("ListDirectMessagesParamsSchema", () => {
    // test-revizorro: approved
    it.effect("parses empty params", () =>
      Effect.gen(function*() {
        const result = yield* parseListDirectMessagesParams({})
        expect(result).toEqual({})
      }))

    // test-revizorro: scheduled
    it.effect("parses with limit", () =>
      Effect.gen(function*() {
        const result = yield* parseListDirectMessagesParams({ limit: 25 })
        expect(result.limit).toBe(25)
      }))
  })

  describe("Channel JSON Schema Generation", () => {
    // test-revizorro: approved
    it.effect("generates JSON Schema for ListChannelsParams", () =>
      Effect.gen(function*() {
        const schema = listChannelsParamsJsonSchema as JsonSchemaObject
        expect(schema.$schema).toBe("http://json-schema.org/draft-07/schema#")
        expect(schema.type).toBe("object")
        expect(schema.properties).toHaveProperty("includeArchived")
        expect(schema.properties).toHaveProperty("limit")
      }))

    // test-revizorro: approved
    it.effect("generates JSON Schema for GetChannelParams", () =>
      Effect.gen(function*() {
        const schema = getChannelParamsJsonSchema as JsonSchemaObject
        expect(schema.type).toBe("object")
        expect(schema.required).toContain("channel")
      }))

    // test-revizorro: approved
    it.effect("generates JSON Schema for CreateChannelParams without members", () =>
      Effect.gen(function*() {
        const schema = createChannelParamsJsonSchema as JsonSchemaObject
        expect(schema.type).toBe("object")
        expect(schema.required).toContain("name")
        expect(schema.properties).toHaveProperty("topic")
        expect(schema.properties).toHaveProperty("private")
        expect(schema.properties).not.toHaveProperty("members")
      }))

    // test-revizorro: approved
    it.effect("generates JSON Schema for UpdateChannelParams", () =>
      Effect.gen(function*() {
        const schema = updateChannelParamsJsonSchema as JsonSchemaObject
        expect(schema.type).toBe("object")
        expect(schema.required).toContain("channel")
        expect(schema.properties).toHaveProperty("name")
        expect(schema.properties).toHaveProperty("topic")
      }))

    // test-revizorro: approved
    it.effect("generates JSON Schema for DeleteChannelParams", () =>
      Effect.gen(function*() {
        const schema = deleteChannelParamsJsonSchema as JsonSchemaObject
        expect(schema.type).toBe("object")
        expect(schema.required).toContain("channel")
      }))

    // test-revizorro: approved
    it.effect("generates JSON Schema for ListChannelMessagesParams", () =>
      Effect.gen(function*() {
        const schema = listChannelMessagesParamsJsonSchema as JsonSchemaObject
        expect(schema.type).toBe("object")
        expect(schema.required).toContain("channel")
        expect(schema.properties).toHaveProperty("limit")
      }))

    // test-revizorro: approved
    it.effect("generates JSON Schema for SendChannelMessageParams", () =>
      Effect.gen(function*() {
        const schema = sendChannelMessageParamsJsonSchema as JsonSchemaObject
        expect(schema.type).toBe("object")
        expect(schema.required).toContain("channel")
        expect(schema.required).toContain("body")
      }))

    // test-revizorro: suspect | Only validates 3 of 5 expected assertions: missing validation that limit is optional and that no required fields exist
    it.effect("generates JSON Schema for ListDirectMessagesParams", () =>
      Effect.gen(function*() {
        const schema = listDirectMessagesParamsJsonSchema as JsonSchemaObject
        expect(schema.$schema).toBe("http://json-schema.org/draft-07/schema#")
        expect(schema.type).toBe("object")
        expect(schema.properties).toHaveProperty("limit")
      }))
  })
})
