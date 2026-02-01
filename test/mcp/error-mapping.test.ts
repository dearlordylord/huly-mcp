import { describe, it } from "@effect/vitest"
import { expect } from "vitest"
import { Cause, Effect, ParseResult, Schema } from "effect"
import {
  mapDomainErrorToMcp,
  mapParseErrorToMcp,
  mapDomainCauseToMcp,
  mapParseCauseToMcp,
  createSuccessResponse,
  createUnknownToolError,
} from "../../src/mcp/error-mapping.js"
import {
  HulyError,
  HulyConnectionError,
  HulyAuthError,
  IssueNotFoundError,
  ProjectNotFoundError,
  InvalidStatusError,
  PersonNotFoundError,
  McpErrorCode,
} from "../../src/huly/errors.js"

describe("Error Mapping to MCP", () => {
  describe("mapDomainErrorToMcp", () => {
    describe("InvalidParams errors (-32602)", () => {
      // test-revizorro: approved
      it.effect("maps IssueNotFoundError with descriptive message", () =>
        Effect.gen(function* () {
          const error = new IssueNotFoundError({
            identifier: "HULY-123",
            project: "HULY",
          })
          const response = mapDomainErrorToMcp(error)

          expect(response.isError).toBe(true)
          expect(response._meta?.errorCode).toBe(McpErrorCode.InvalidParams)
          expect(response.content[0].text).toBe(
            "Issue 'HULY-123' not found in project 'HULY'"
          )
        })
      )

      // test-revizorro: approved
      it.effect("maps ProjectNotFoundError with descriptive message", () =>
        Effect.gen(function* () {
          const error = new ProjectNotFoundError({ identifier: "MISSING" })
          const response = mapDomainErrorToMcp(error)

          expect(response.isError).toBe(true)
          expect(response._meta?.errorCode).toBe(McpErrorCode.InvalidParams)
          expect(response.content[0].text).toBe("Project 'MISSING' not found")
        })
      )

      // test-revizorro: approved
      it.effect("maps InvalidStatusError with descriptive message", () =>
        Effect.gen(function* () {
          const error = new InvalidStatusError({
            status: "bogus",
            project: "HULY",
          })
          const response = mapDomainErrorToMcp(error)

          expect(response.isError).toBe(true)
          expect(response._meta?.errorCode).toBe(McpErrorCode.InvalidParams)
          expect(response.content[0].text).toBe(
            "Invalid status 'bogus' for project 'HULY'"
          )
        })
      )

      // test-revizorro: approved
      it.effect("maps PersonNotFoundError with descriptive message", () =>
        Effect.gen(function* () {
          const error = new PersonNotFoundError({
            identifier: "john@example.com",
          })
          const response = mapDomainErrorToMcp(error)

          expect(response.isError).toBe(true)
          expect(response._meta?.errorCode).toBe(McpErrorCode.InvalidParams)
          expect(response.content[0].text).toBe(
            "Person 'john@example.com' not found"
          )
        })
      )
    })

    describe("InternalError errors (-32603)", () => {
      // test-revizorro: approved
      it.effect("maps HulyConnectionError with sanitized message", () =>
        Effect.gen(function* () {
          const error = new HulyConnectionError({ message: "Network timeout" })
          const response = mapDomainErrorToMcp(error)

          expect(response.isError).toBe(true)
          expect(response._meta?.errorCode).toBe(McpErrorCode.InternalError)
          expect(response.content[0].text).toBe("Connection error: Network timeout")
        })
      )

      // test-revizorro: approved [Sanitization uses word boundary /\bauth\b/i, so "Authentication" is not matched - only standalone "auth" triggers sanitization]
      it.effect("maps HulyAuthError with sanitized message", () =>
        Effect.gen(function* () {
          // "Authentication" in prefix doesn't trigger sanitization because /\bauth\b/i uses word boundaries
          const error = new HulyAuthError({ message: "Login failed" })
          const response = mapDomainErrorToMcp(error)

          expect(response.isError).toBe(true)
          expect(response._meta?.errorCode).toBe(McpErrorCode.InternalError)
          expect(response.content[0].text).toBe("Authentication error: Login failed")
        })
      )

      // test-revizorro: approved
      it.effect("sanitizes HulyAuthError messages containing sensitive keywords", () =>
        Effect.gen(function* () {
          // "Invalid credentials" contains "credential" which should be sanitized
          const error = new HulyAuthError({ message: "Invalid credentials" })
          const response = mapDomainErrorToMcp(error)

          expect(response.isError).toBe(true)
          expect(response._meta?.errorCode).toBe(McpErrorCode.InternalError)
          expect(response.content[0].text).toBe(
            "An error occurred while processing the request"
          )
        })
      )

      // test-revizorro: approved
      it.effect("maps HulyError with sanitized message", () =>
        Effect.gen(function* () {
          const error = new HulyError({ message: "Something went wrong" })
          const response = mapDomainErrorToMcp(error)

          expect(response.isError).toBe(true)
          expect(response._meta?.errorCode).toBe(McpErrorCode.InternalError)
          expect(response.content[0].text).toBe("Something went wrong")
        })
      )
    })

    describe("sensitive information sanitization", () => {
      // test-revizorro: approved
      it.effect("sanitizes messages containing password", () =>
        Effect.gen(function* () {
          const error = new HulyError({ message: "Invalid password for user" })
          const response = mapDomainErrorToMcp(error)

          expect(response.content[0].text).toBe(
            "An error occurred while processing the request"
          )
        })
      )

      // test-revizorro: approved
      it.effect("sanitizes messages containing token", () =>
        Effect.gen(function* () {
          const error = new HulyConnectionError({
            message: "Token expired: abc123",
          })
          const response = mapDomainErrorToMcp(error)

          expect(response.content[0].text).toBe(
            "An error occurred while processing the request"
          )
        })
      )

      // test-revizorro: approved
      it.effect("sanitizes messages containing api_key", () =>
        Effect.gen(function* () {
          const error = new HulyAuthError({
            message: "api_key invalid: sk-xxx",
          })
          const response = mapDomainErrorToMcp(error)

          expect(response.content[0].text).toBe(
            "An error occurred while processing the request"
          )
        })
      )

      // test-revizorro: approved
      it.effect("sanitizes messages containing secret", () =>
        Effect.gen(function* () {
          const error = new HulyError({
            message: "client_secret mismatch",
          })
          const response = mapDomainErrorToMcp(error)

          expect(response.content[0].text).toBe(
            "An error occurred while processing the request"
          )
        })
      )

      // test-revizorro: approved
      it.effect("sanitizes case-insensitively", () =>
        Effect.gen(function* () {
          const error = new HulyError({
            message: "BEARER token invalid",
          })
          const response = mapDomainErrorToMcp(error)

          expect(response.content[0].text).toBe(
            "An error occurred while processing the request"
          )
        })
      )
    })
  })

  describe("mapParseErrorToMcp", () => {
    // test-revizorro: approved
    it.effect("maps parse error with tool name prefix", () =>
      Effect.gen(function* () {
        const TestSchema = Schema.Struct({
          name: Schema.String,
          age: Schema.Number,
        })

        const error = yield* Effect.flip(
          Schema.decodeUnknown(TestSchema)({ name: 123 })
        )

        const response = mapParseErrorToMcp(
          error as ParseResult.ParseError,
          "create_issue"
        )

        expect(response.isError).toBe(true)
        expect(response._meta?.errorCode).toBe(McpErrorCode.InvalidParams)
        expect(response.content[0].text).toContain(
          "Invalid parameters for create_issue"
        )
      })
    )

    // test-revizorro: approved
    it.effect("maps parse error without tool name", () =>
      Effect.gen(function* () {
        const TestSchema = Schema.Struct({
          name: Schema.String,
        })

        const error = yield* Effect.flip(
          Schema.decodeUnknown(TestSchema)({})
        )

        const response = mapParseErrorToMcp(
          error as ParseResult.ParseError
        )

        expect(response.isError).toBe(true)
        expect(response._meta?.errorCode).toBe(McpErrorCode.InvalidParams)
        expect(response.content[0].text).toContain("Invalid parameters:")
      })
    )
  })

  describe("mapDomainCauseToMcp", () => {
    describe("Fail cause", () => {
      it.effect("handles HulyDomainError in Fail cause", () =>
        Effect.gen(function* () {
          const error = new IssueNotFoundError({
            identifier: "TEST-1",
            project: "TEST",
          })
          const cause = Cause.fail(error)
          const response = mapDomainCauseToMcp(cause)

          expect(response.isError).toBe(true)
          expect(response._meta?.errorCode).toBe(McpErrorCode.InvalidParams)
          expect(response.content[0].text).toBe(
            "Issue 'TEST-1' not found in project 'TEST'"
          )
        })
      )
    })

    describe("Die cause", () => {
      it.effect("returns generic internal error without exposing defect", () =>
        Effect.gen(function* () {
          const defect = new Error("Stack trace with sensitive info")
          const cause = Cause.die(defect)
          const response = mapDomainCauseToMcp(cause as Cause.Cause<HulyError>)

          expect(response.isError).toBe(true)
          expect(response._meta?.errorCode).toBe(McpErrorCode.InternalError)
          expect(response.content[0].text).toBe("Internal server error")
          expect(response.content[0].text).not.toContain("Stack trace")
        })
      )
    })

    describe("Interrupt cause", () => {
      it.effect("returns operation interrupted message", () =>
        Effect.gen(function* () {
          const cause = Cause.interrupt("fiber-1" as unknown as Cause.Cause<never>["_tag"] extends "Interrupt" ? Parameters<typeof Cause.interrupt>[0] : never)
          const response = mapDomainCauseToMcp(cause as Cause.Cause<HulyError>)

          expect(response.isError).toBe(true)
          expect(response._meta?.errorCode).toBe(McpErrorCode.InternalError)
          expect(response.content[0].text).toBe("Operation was interrupted")
        })
      )
    })

    describe("Empty cause", () => {
      it.effect("returns generic error for empty cause", () =>
        Effect.gen(function* () {
          const cause = Cause.empty
          const response = mapDomainCauseToMcp(cause as Cause.Cause<HulyError>)

          expect(response.isError).toBe(true)
          expect(response._meta?.errorCode).toBe(McpErrorCode.InternalError)
          expect(response.content[0].text).toBe("An unexpected error occurred")
        })
      )
    })

    describe("Sequential cause", () => {
      it.effect("extracts first meaningful error from sequential cause", () =>
        Effect.gen(function* () {
          const error1 = new ProjectNotFoundError({ identifier: "PROJ" })
          const error2 = new IssueNotFoundError({
            identifier: "X",
            project: "Y",
          })
          const cause = Cause.sequential(Cause.fail(error1), Cause.fail(error2))
          const response = mapDomainCauseToMcp(cause)

          expect(response.isError).toBe(true)
          expect(response._meta?.errorCode).toBe(McpErrorCode.InvalidParams)
          expect(response.content[0].text).toBe("Project 'PROJ' not found")
        })
      )
    })

    describe("Parallel cause", () => {
      it.effect("extracts first meaningful error from parallel cause", () =>
        Effect.gen(function* () {
          const error1 = new InvalidStatusError({ status: "bad", project: "P" })
          const error2 = new HulyConnectionError({ message: "timeout" })
          const cause = Cause.parallel(Cause.fail(error1), Cause.fail(error2))
          const response = mapDomainCauseToMcp(cause)

          expect(response.isError).toBe(true)
          expect(response.content[0].text).toBe(
            "Invalid status 'bad' for project 'P'"
          )
        })
      )
    })
  })

  describe("mapParseCauseToMcp", () => {
    describe("Fail cause", () => {
      it.effect("handles ParseError in Fail cause", () =>
        Effect.gen(function* () {
          const TestSchema = Schema.Struct({ x: Schema.Number })
          const error = yield* Effect.flip(
            Schema.decodeUnknown(TestSchema)({ x: "not a number" })
          )

          const cause = Cause.fail(error)
          const response = mapParseCauseToMcp(cause, "test_tool")

          expect(response.isError).toBe(true)
          expect(response._meta?.errorCode).toBe(McpErrorCode.InvalidParams)
          expect(response.content[0].text).toContain("Invalid parameters")
        })
      )
    })

    describe("Die cause", () => {
      it.effect("returns generic internal error without exposing defect", () =>
        Effect.gen(function* () {
          const defect = new Error("Stack trace with sensitive info")
          const cause = Cause.die(defect)
          const response = mapParseCauseToMcp(cause as Cause.Cause<ParseResult.ParseError>)

          expect(response.isError).toBe(true)
          expect(response._meta?.errorCode).toBe(McpErrorCode.InternalError)
          expect(response.content[0].text).toBe("Internal server error")
        })
      )
    })

    describe("Interrupt cause", () => {
      it.effect("returns operation interrupted message", () =>
        Effect.gen(function* () {
          const cause = Cause.interrupt("fiber-1" as unknown as Cause.Cause<never>["_tag"] extends "Interrupt" ? Parameters<typeof Cause.interrupt>[0] : never)
          const response = mapParseCauseToMcp(cause as Cause.Cause<ParseResult.ParseError>)

          expect(response.isError).toBe(true)
          expect(response._meta?.errorCode).toBe(McpErrorCode.InternalError)
          expect(response.content[0].text).toBe("Operation was interrupted")
        })
      )
    })

    describe("Empty cause", () => {
      it.effect("returns generic error for empty cause", () =>
        Effect.gen(function* () {
          const cause = Cause.empty
          const response = mapParseCauseToMcp(cause as Cause.Cause<ParseResult.ParseError>)

          expect(response.isError).toBe(true)
          expect(response._meta?.errorCode).toBe(McpErrorCode.InternalError)
          expect(response.content[0].text).toBe("An unexpected error occurred")
        })
      )
    })
  })

  describe("createSuccessResponse", () => {
    // test-revizorro: approved
    it.effect("creates success response with JSON content", () =>
      Effect.gen(function* () {
        const result = { issues: [{ id: 1, title: "Test" }] }
        const response = createSuccessResponse(result)

        expect(response.isError).toBeUndefined()
        expect(response.content[0].type).toBe("text")
        expect(JSON.parse(response.content[0].text)).toEqual(result)
      })
    )

    // test-revizorro: approved
    it.effect("formats JSON with indentation", () =>
      Effect.gen(function* () {
        const result = { a: 1, b: 2 }
        const response = createSuccessResponse(result)

        expect(response.content[0].text).toContain("\n")
        expect(response.content[0].text).toBe(JSON.stringify(result, null, 2))
      })
    )
  })

  describe("createUnknownToolError", () => {
    // test-revizorro: approved
    it.effect("creates error response for unknown tool", () =>
      Effect.gen(function* () {
        const response = createUnknownToolError("bogus_tool")

        expect(response.isError).toBe(true)
        expect(response._meta?.errorCode).toBe(McpErrorCode.InvalidParams)
        expect(response.content[0].text).toBe("Unknown tool: bogus_tool")
      })
    )
  })

  describe("security: no sensitive data leakage", () => {
    // Test patterns that should trigger sanitization
    const sensitivePatterns = [
      { pattern: "password", message: "Error with password: some_value_123" },
      { pattern: "token", message: "Error with token: some_value_123" },
      { pattern: "secret", message: "Error with secret: some_value_123" },
      { pattern: "credential", message: "Error with credential: some_value_123" },
      { pattern: "api_key", message: "Error with api_key: some_value_123" },
      { pattern: "apikey", message: "Error with apikey: some_value_123" },
      { pattern: "auth", message: "Error with auth: some_value_123" },
      { pattern: "bearer", message: "Error with bearer: some_value_123" },
      { pattern: "jwt", message: "Error with jwt: some_value_123" },
      { pattern: "session_id", message: "Error with session_id: some_value_123" },
      { pattern: "cookie", message: "Error with cookie: some_value_123" },
    ]

    for (const { pattern, message } of sensitivePatterns) {
      // test-revizorro: approved
      it.effect(`sanitizes messages containing '${pattern}'`, () =>
        Effect.gen(function* () {
          const error = new HulyError({ message })
          const response = mapDomainErrorToMcp(error)

          expect(response.content[0].text).not.toContain("some_value_123")
          expect(response.content[0].text).toBe(
            "An error occurred while processing the request"
          )
        })
      )
    }

    it.effect("does not expose stack traces in Die cause", () =>
      Effect.gen(function* () {
        const defect = new Error("Error at /path/to/file.ts:123")
        defect.stack = `Error: Error at /path/to/file.ts:123
    at Object.<anonymous> (/path/to/file.ts:123:45)
    at Module._compile (internal/modules/cjs/loader.js:1085:14)`

        const cause = Cause.die(defect)
        const response = mapDomainCauseToMcp(cause as Cause.Cause<HulyError>)

        expect(response.content[0].text).not.toContain("/path/to")
        expect(response.content[0].text).not.toContain("stack")
        expect(response.content[0].text).not.toContain("Module._compile")
      })
    )
  })
})
