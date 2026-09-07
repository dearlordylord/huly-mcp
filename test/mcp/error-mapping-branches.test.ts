import { describe, it } from "@effect/vitest"
import { Cause, Effect, Schema } from "effect"
import { expect } from "vitest"
import { createSuccessResponse, mapParseCauseToMcp, McpErrorCode } from "../../src/mcp/error-mapping.js"
import { assertAt } from "../../src/utils/assertions.js"

describe("Error Mapping Branch Coverage", () => {
  describe("mapParseCauseToMcp - combined cause with SchemaError", () => {
    it.effect("extracts the first SchemaError from a combined cause", () =>
      Effect.gen(function* () {
        const TestSchema = Schema.Struct({ x: Schema.Number })
        const error1 = yield* Effect.flip(Schema.decodeUnknownEffect(TestSchema)({ x: "bad" }))
        const error2 = yield* Effect.flip(Schema.decodeUnknownEffect(TestSchema)({ x: "also bad" }))

        const cause = Cause.combine(Cause.fail(error1), Cause.fail(error2))
        const response = mapParseCauseToMcp(cause, "test_tool")

        expect(response.isError).toBe(true)
        expect(response._meta.errorCode).toBe(McpErrorCode.InvalidParams)
        expect(assertAt(response.content, 0).text).toContain("Invalid parameters for test_tool")
      })
    )
  })

  describe("mapParseCauseToMcp - heterogeneous combined cause", () => {
    it.effect("preserves SchemaError reason order across schemas", () =>
      Effect.gen(function* () {
        const TestSchema1 = Schema.Struct({ a: Schema.String })
        const TestSchema2 = Schema.Struct({ b: Schema.Number })
        const error1 = yield* Effect.flip(Schema.decodeUnknownEffect(TestSchema1)({ a: 123 }))
        const error2 = yield* Effect.flip(Schema.decodeUnknownEffect(TestSchema2)({ b: "nope" }))

        const cause = Cause.combine(Cause.fail(error1), Cause.fail(error2))
        const response = mapParseCauseToMcp(cause, "parallel_tool")

        expect(response.isError).toBe(true)
        expect(response._meta.errorCode).toBe(McpErrorCode.InvalidParams)
        expect(assertAt(response.content, 0).text).toContain("Invalid parameters for parallel_tool")
      })
    )
  })

  describe("mapParseCauseToMcp - defect cause", () => {
    it.effect("returns a generic error without defect details", () =>
      Effect.sync(function () {
        const cause = Cause.die(new Error("unexpected"))
        const response = mapParseCauseToMcp(cause)

        expect(response.isError).toBe(true)
        expect(response._meta.errorCode).toBe(McpErrorCode.InternalError)
        expect(response._meta.errorTag).toBe("UnexpectedError")
        expect(assertAt(response.content, 0).text).toBe("An unexpected error occurred")
      })
    )

    // Interruption is not a fault worth classifying, so it stays untagged.
    it.effect("leaves an interrupt cause untagged", () =>
      Effect.sync(function () {
        const response = mapParseCauseToMcp(Cause.interrupt())

        expect(response.isError).toBe(true)
        expect(response._meta.errorCode).toBe(McpErrorCode.InternalError)
        expect(response._meta.errorTag).toBeUndefined()
      })
    )
  })

  describe("createSuccessResponse - non-serializable result (encodeJsonText line 218)", () => {
    it.effect('falls back to the literal "null" text when JSON.stringify yields undefined', () =>
      Effect.sync(function () {
        // JSON.stringify(undefined) returns undefined, exercising the non-string branch.
        const response = createSuccessResponse(undefined)

        expect(assertAt(response.content, 0).text).toBe("null")
        expect(response.structuredContent).toEqual({ result: undefined })
      })
    )
  })
})
