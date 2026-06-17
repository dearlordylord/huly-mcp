import { describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { expect } from "vitest"

import {
  addChatMessageAttachmentParamsJsonSchema,
  listChatMessageAttachmentsParamsJsonSchema,
  parseAddChatMessageAttachmentParams,
  parseListChatMessageAttachmentsParams,
  parseUpdateChatMessageAttachmentParams,
  withChatMessageAttachmentTargetVariantDescriptions
} from "../../src/domain/schemas/chat-message-attachments.js"

type JsonSchemaRecord = {
  readonly [key: string]: unknown
}

const asRecord = (value: unknown): JsonSchemaRecord => {
  expect(typeof value).toBe("object")
  expect(value).not.toBeNull()
  // Runtime assertions above establish this JSON Schema fragment is a non-null object.
  return value as JsonSchemaRecord
}

const propertySchema = (schema: unknown, property: string): JsonSchemaRecord =>
  asRecord(asRecord(asRecord(schema).properties)[property])

const targetVariant = (schema: unknown, kind: string): JsonSchemaRecord => {
  const target = propertySchema(schema, "target")
  const variants = asRecord(target).anyOf
  expect(Array.isArray(variants)).toBe(true)
  const variant = (variants as ReadonlyArray<unknown>).find((entry) => {
    const kindEnum = asRecord(propertySchema(entry, "kind")).enum
    return Array.isArray(kindEnum) && kindEnum.includes(kind)
  })
  expect(variant).toBeDefined()
  return asRecord(variant)
}

describe("chat message attachment schemas", () => {
  it.effect("accepts all chat attachment target kinds", () =>
    Effect.gen(function*() {
      const channel = yield* parseListChatMessageAttachmentsParams({
        target: { kind: "channel_message", channel: "general", messageId: "msg-1" }
      })
      const dm = yield* parseListChatMessageAttachmentsParams({
        target: { kind: "dm_message", dm: "dm-1", messageId: "msg-2" }
      })
      const reply = yield* parseListChatMessageAttachmentsParams({
        target: { kind: "thread_reply", channel: "general", messageId: "msg-1", replyId: "reply-1" }
      })

      expect(channel.target.kind).toBe("channel_message")
      expect(dm.target.kind).toBe("dm_message")
      expect(reply.target.kind).toBe("thread_reply")
    }))

  it.effect("rejects empty target locators", () =>
    Effect.gen(function*() {
      const channel = yield* Effect.flip(parseListChatMessageAttachmentsParams({
        target: { kind: "channel_message", channel: " ", messageId: "msg-1" }
      }))
      const dm = yield* Effect.flip(parseListChatMessageAttachmentsParams({
        target: { kind: "dm_message", dm: "", messageId: "msg-2" }
      }))
      const reply = yield* Effect.flip(parseListChatMessageAttachmentsParams({
        target: { kind: "thread_reply", channel: "general", messageId: "msg-1", replyId: "" }
      }))

      expect(channel._tag).toBe("ParseError")
      expect(dm._tag).toBe("ParseError")
      expect(reply._tag).toBe("ParseError")
    }))

  it.effect("requires exactly one upload source", () =>
    Effect.gen(function*() {
      const missing = yield* Effect.flip(parseAddChatMessageAttachmentParams({
        target: { kind: "channel_message", channel: "general", messageId: "msg-1" },
        filename: "log.txt",
        contentType: "text/plain"
      }))
      const multiple = yield* Effect.flip(parseAddChatMessageAttachmentParams({
        target: { kind: "channel_message", channel: "general", messageId: "msg-1" },
        filename: "log.txt",
        contentType: "text/plain",
        filePath: "/tmp/log.txt",
        data: "bG9n"
      }))
      const parsed = yield* parseAddChatMessageAttachmentParams({
        target: { kind: "channel_message", channel: "general", messageId: "msg-1" },
        filename: "log.txt",
        contentType: "text/plain",
        data: "bG9n"
      })

      expect(missing._tag).toBe("ParseError")
      expect(multiple._tag).toBe("ParseError")
      expect(parsed.data).toBe("bG9n")
    }))

  it.effect("rejects no-op attachment metadata updates", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(parseUpdateChatMessageAttachmentParams({
        target: { kind: "dm_message", dm: "dm-1", messageId: "msg-2" },
        attachmentId: "attachment-1"
      }))
      const parsed = yield* parseUpdateChatMessageAttachmentParams({
        target: { kind: "dm_message", dm: "dm-1", messageId: "msg-2" },
        attachmentId: "attachment-1",
        pinned: false
      })

      expect(error._tag).toBe("ParseError")
      expect(parsed.pinned).toBe(false)
    }))

  it("exports LLM-first target JSON schema descriptions and add-tool metadata", () => {
    const channelTarget = targetVariant(listChatMessageAttachmentsParamsJsonSchema, "channel_message")
    const dmTarget = targetVariant(listChatMessageAttachmentsParamsJsonSchema, "dm_message")
    const replyTarget = targetVariant(listChatMessageAttachmentsParamsJsonSchema, "thread_reply")

    expect(propertySchema(channelTarget, "channel").description).toContain("Channel name or ID")
    expect(propertySchema(dmTarget, "dm").description).toContain("participant display name")
    expect(propertySchema(replyTarget, "replyId").description).toContain("thread reply ID")
    expect(asRecord(addChatMessageAttachmentParamsJsonSchema).title).toBe("AddChatMessageAttachmentParams")
    expect(asRecord(addChatMessageAttachmentParamsJsonSchema).description).toContain("Provide exactly one")
  })

  it("leaves unsupported target JSON schema shapes unchanged", () => {
    const arraySchema: object = []
    const noProperties = {}
    const noTarget = { properties: {} }
    const noAnyOf = { properties: { target: {} } }
    const nonObjectVariant = { properties: { target: { anyOf: ["not-an-object"] } } }

    expect(withChatMessageAttachmentTargetVariantDescriptions(arraySchema)).toBe(arraySchema)
    expect(withChatMessageAttachmentTargetVariantDescriptions(noProperties)).toBe(noProperties)
    expect(withChatMessageAttachmentTargetVariantDescriptions(noTarget)).toBe(noTarget)
    expect(withChatMessageAttachmentTargetVariantDescriptions(noAnyOf)).toBe(noAnyOf)
    expect(withChatMessageAttachmentTargetVariantDescriptions(nonObjectVariant)).toEqual(nonObjectVariant)
  })
})
