import { describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { expect } from "vitest"
import {
  createChannelParamsJsonSchema,
  deleteChannelParamsJsonSchema,
  getChannelParamsJsonSchema,
  listChannelMessagesParamsJsonSchema,
  listChannelsParamsJsonSchema,
  listDirectMessagesParamsJsonSchema,
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
  anyOf?: Array<{ required?: Array<string> }>
  properties?: Record<string, { description?: string }>
}

const expectJsonSchemaObject = (schema: unknown): JsonSchemaObject => {
  if (typeof schema === "object" && schema !== null) return schema
  throw new Error("Expected JSON schema object")
}

describe("Channel Domain Schemas", () => {
  describe("ListChannelsParamsSchema", () => {
    it.effect("parses empty params", () =>
      Effect.gen(function*() {
        const result = yield* parseListChannelsParams({})
        expect(result).toEqual({})
      }))

    it.effect("parses with all options", () =>
      Effect.gen(function*() {
        const result = yield* parseListChannelsParams({
          includeArchived: true,
          limit: 25
        })
        expect(result.includeArchived).toBe(true)
        expect(result.limit).toBe(25)
      }))

    it.effect("rejects limit over 200", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          parseListChannelsParams({ limit: 201 })
        )
        expect(error._tag).toBe("ParseError")
      }))

    it.effect("rejects negative limit", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          parseListChannelsParams({ limit: -1 })
        )
        expect(error._tag).toBe("ParseError")
      }))

    it.effect("rejects non-integer limit", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          parseListChannelsParams({ limit: 10.5 })
        )
        expect(error._tag).toBe("ParseError")
      }))

    it.effect("rejects zero limit", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          parseListChannelsParams({ limit: 0 })
        )
        expect(error._tag).toBe("ParseError")
      }))
  })

  describe("GetChannelParamsSchema", () => {
    it.effect("parses valid params", () =>
      Effect.gen(function*() {
        const result = yield* parseGetChannelParams({ channel: "general" })
        expect(result).toEqual({ channel: "general" })
      }))

    it.effect("trims whitespace", () =>
      Effect.gen(function*() {
        const result = yield* parseGetChannelParams({ channel: "  general  " })
        expect(result.channel).toBe("general")
      }))

    it.effect("rejects empty channel", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          parseGetChannelParams({ channel: "  " })
        )
        expect(error._tag).toBe("ParseError")
      }))

    it.effect("rejects missing channel", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          parseGetChannelParams({})
        )
        expect(error._tag).toBe("ParseError")
      }))
  })

  describe("CreateChannelParamsSchema", () => {
    it.effect("parses minimal params", () =>
      Effect.gen(function*() {
        const result = yield* parseCreateChannelParams({ name: "new-channel" })
        expect(result).toEqual({ name: "new-channel" })
      }))

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

    it.effect("rejects empty name", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          parseCreateChannelParams({ name: "   " })
        )
        expect(error._tag).toBe("ParseError")
      }))
  })

  describe("UpdateChannelParamsSchema", () => {
    it.effect("parses minimal params and advertises update-field requirement in JSON Schema", () =>
      Effect.gen(function*() {
        const result = yield* parseUpdateChannelParams({ channel: "general" })
        expect(result).toEqual({ channel: "general" })

        const schema = expectJsonSchemaObject(updateChannelParamsJsonSchema)
        expect(schema.anyOf).toEqual(expect.arrayContaining([{ required: ["name"] }, { required: ["topic"] }]))
      }))

    it.effect("parses with update fields", () =>
      Effect.gen(function*() {
        const result = yield* parseUpdateChannelParams({
          channel: "general",
          name: "new-name",
          topic: "Updated topic"
        })
        expect(result.channel).toBe("general")
        expect(result.name).toBe("new-name")
        expect(result.topic).toBe("Updated topic")
      }))

    it.effect("rejects empty channel", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          parseUpdateChannelParams({ channel: "  " })
        )
        expect(error._tag).toBe("ParseError")
      }))
  })

  describe("DeleteChannelParamsSchema", () => {
    it.effect("parses valid params", () =>
      Effect.gen(function*() {
        const result = yield* parseDeleteChannelParams({ channel: "old-channel" })
        expect(result).toEqual({ channel: "old-channel" })
      }))

    it.effect("rejects empty channel", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          parseDeleteChannelParams({ channel: "" })
        )
        expect(error._tag).toBe("ParseError")
      }))
  })

  describe("ListChannelMessagesParamsSchema", () => {
    it.effect("parses minimal params", () =>
      Effect.gen(function*() {
        const result = yield* parseListChannelMessagesParams({ channel: "general" })
        expect(result).toEqual({ channel: "general" })
      }))

    it.effect("parses with limit", () =>
      Effect.gen(function*() {
        const result = yield* parseListChannelMessagesParams({
          channel: "general",
          limit: 100
        })
        expect(result.limit).toBe(100)
      }))

    it.effect("rejects empty channel", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          parseListChannelMessagesParams({ channel: "  " })
        )
        expect(error._tag).toBe("ParseError")
      }))
  })

  describe("SendChannelMessageParamsSchema", () => {
    it.effect("parses valid params", () =>
      Effect.gen(function*() {
        const result = yield* parseSendChannelMessageParams({
          channel: "general",
          body: "Hello everyone!"
        })
        expect(result.channel).toBe("general")
        expect(result.body).toBe("Hello everyone!")
      }))

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
    it.effect("parses empty params", () =>
      Effect.gen(function*() {
        const result = yield* parseListDirectMessagesParams({})
        expect(result).toEqual({})
      }))

    it.effect("parses with limit", () =>
      Effect.gen(function*() {
        const result = yield* parseListDirectMessagesParams({ limit: 25 })
        expect(result.limit).toBe(25)
      }))
  })

  describe("Channel JSON Schema Generation", () => {
    it.effect("generates JSON Schema for ListChannelsParams", () =>
      Effect.gen(function*() {
        const schema = listChannelsParamsJsonSchema as JsonSchemaObject
        expect(schema.$schema).toBe("http://json-schema.org/draft-07/schema#")
        expect(schema.type).toBe("object")
        expect(schema.properties).toHaveProperty("includeArchived")
        expect(schema.properties).toHaveProperty("limit")
      }))

    it.effect("generates JSON Schema for GetChannelParams", () =>
      Effect.gen(function*() {
        const schema = getChannelParamsJsonSchema as JsonSchemaObject
        expect(schema.type).toBe("object")
        expect(schema.required).toContain("channel")
      }))

    it.effect("generates JSON Schema for CreateChannelParams without members", () =>
      Effect.gen(function*() {
        const schema = createChannelParamsJsonSchema as JsonSchemaObject
        expect(schema.type).toBe("object")
        expect(schema.required).toContain("name")
        expect(schema.properties).toHaveProperty("topic")
        expect(schema.properties).toHaveProperty("private")
        expect(schema.properties).not.toHaveProperty("members")
      }))

    it.effect("generates JSON Schema for UpdateChannelParams", () =>
      Effect.gen(function*() {
        const schema = updateChannelParamsJsonSchema as JsonSchemaObject
        expect(schema.type).toBe("object")
        expect(schema.required).toContain("channel")
        expect(schema.properties).toHaveProperty("name")
        expect(schema.properties).toHaveProperty("topic")
      }))

    it.effect("generates JSON Schema for DeleteChannelParams", () =>
      Effect.gen(function*() {
        const schema = deleteChannelParamsJsonSchema as JsonSchemaObject
        expect(schema.type).toBe("object")
        expect(schema.required).toContain("channel")
      }))

    it.effect("generates JSON Schema for ListChannelMessagesParams", () =>
      Effect.gen(function*() {
        const schema = listChannelMessagesParamsJsonSchema as JsonSchemaObject
        expect(schema.type).toBe("object")
        expect(schema.required).toContain("channel")
        expect(schema.properties).toHaveProperty("limit")
      }))

    it.effect("generates JSON Schema for SendChannelMessageParams", () =>
      Effect.gen(function*() {
        const schema = sendChannelMessageParamsJsonSchema as JsonSchemaObject
        expect(schema.type).toBe("object")
        expect(schema.required).toContain("channel")
        expect(schema.required).toContain("body")
      }))

    it.effect("generates JSON Schema for ListDirectMessagesParams", () =>
      Effect.gen(function*() {
        const schema = listDirectMessagesParamsJsonSchema as JsonSchemaObject
        expect(schema.$schema).toBe("http://json-schema.org/draft-07/schema#")
        expect(schema.type).toBe("object")
        expect(schema.required).toEqual([])
        expect(schema.properties).toHaveProperty("limit")
      }))
  })
})
