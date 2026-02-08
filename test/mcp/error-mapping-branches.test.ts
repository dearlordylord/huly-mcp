import { describe, it } from "@effect/vitest"
import { Cause, Effect, Schema } from "effect"
import type { ParseResult } from "effect"
import { expect } from "vitest"
import { mapParseCauseToMcp, McpErrorCode } from "../../src/mcp/error-mapping.js"

describe("Error Mapping Branch Coverage", () => {
  describe("mapParseCauseToMcp - Sequential cause with ParseError (line 148)", () => {
    // test-revizorro: approved
    it.effect("extracts first ParseError from sequential cause", () =>
      Effect.gen(function*() {
        const TestSchema = Schema.Struct({ x: Schema.Number })
        const error1 = yield* Effect.flip(
          Schema.decodeUnknown(TestSchema)({ x: "bad" })
        )
        const error2 = yield* Effect.flip(
          Schema.decodeUnknown(TestSchema)({ x: "also bad" })
        )

        const cause = Cause.sequential(Cause.fail(error1), Cause.fail(error2))

        // This is not a simple Fail cause, so isFailType returns false.
        // It falls through to Cause.failures() which finds errors.
        // This hits line 148: return mapParseErrorToMcp(failures[0], toolName)
        const response = mapParseCauseToMcp(cause, "test_tool")

        expect(response.isError).toBe(true)
        expect(response._meta.errorCode).toBe(McpErrorCode.InvalidParams)
        expect(response.content[0].text).toContain("Invalid parameters for test_tool")
      }))
  })

  describe("mapParseCauseToMcp - Parallel cause with ParseError (line 148)", () => {
    // test-revizorro: approved
    it.effect("extracts first ParseError from parallel cause", () =>
      Effect.gen(function*() {
        const TestSchema1 = Schema.Struct({ a: Schema.String })
        const TestSchema2 = Schema.Struct({ b: Schema.Number })
        const error1 = yield* Effect.flip(
          Schema.decodeUnknown(TestSchema1)({ a: 123 })
        )
        const error2 = yield* Effect.flip(
          Schema.decodeUnknown(TestSchema2)({ b: "nope" })
        )

        const cause = Cause.parallel(Cause.fail(error1), Cause.fail(error2))
        const response = mapParseCauseToMcp(cause, "parallel_tool")

        expect(response.isError).toBe(true)
        expect(response._meta.errorCode).toBe(McpErrorCode.InvalidParams)
        expect(response.content[0].text).toContain("Invalid parameters for parallel_tool")
      }))
  })

  describe("mapParseCauseToMcp - Die cause (no failures, line 151)", () => {
    // test-revizorro: approved
    it.effect("returns generic error for Die cause (no ParseErrors)", () =>
      Effect.gen(function*() {
        const cause = Cause.die(new Error("unexpected"))
        const response = mapParseCauseToMcp(cause as Cause.Cause<ParseResult.ParseError>)

        expect(response.isError).toBe(true)
        expect(response._meta.errorCode).toBe(McpErrorCode.InternalError)
        expect(response.content[0].text).toBe("An unexpected error occurred")
      }))
  })
})
