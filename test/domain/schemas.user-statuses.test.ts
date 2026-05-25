import { describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { expect } from "vitest"

import {
  listUserStatusesParamsJsonSchema,
  parseListUserStatusesParams
} from "../../src/domain/schemas/user-statuses.js"

type JsonSchemaObject = {
  readonly type?: string
  readonly required?: ReadonlyArray<string>
  readonly properties?: Record<string, unknown>
}

describe("User status schemas", () => {
  it.effect("accepts empty params", () =>
    Effect.gen(function*() {
      const result = yield* parseListUserStatusesParams({})
      expect(result).toEqual({})
    }))

  it.effect("accepts online filter", () =>
    Effect.gen(function*() {
      const result = yield* parseListUserStatusesParams({ online: true })
      expect(result.online).toBe(true)
    }))

  it.effect("accepts user filter", () =>
    Effect.gen(function*() {
      const result = yield* parseListUserStatusesParams({ user: "account-uuid-1" })
      expect(result.user).toBe("account-uuid-1")
    }))

  it.effect("rejects empty user filter", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(parseListUserStatusesParams({ user: "" }))
      expect(error._tag).toBe("ParseError")
    }))

  it("generates an MCP-compatible JSON schema", () => {
    const schema = listUserStatusesParamsJsonSchema as JsonSchemaObject

    expect(schema.type).toBe("object")
    expect(schema.required ?? []).toEqual([])
    expect(schema.properties).toHaveProperty("online")
    expect(schema.properties).toHaveProperty("user")
    expect(schema.properties).toHaveProperty("limit")
  })
})
