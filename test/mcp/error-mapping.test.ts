import { describe, it, expect } from "vitest"
import { Cause, Effect, Exit, ParseResult, Schema } from "effect"
import {
  mapDomainErrorToMcp,
  mapParseErrorToMcp,
  mapCauseToMcp,
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
      it("maps IssueNotFoundError with descriptive message", () => {
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

      // test-revizorro: approved
      it("maps ProjectNotFoundError with descriptive message", () => {
        const error = new ProjectNotFoundError({ identifier: "MISSING" })
        const response = mapDomainErrorToMcp(error)

        expect(response.isError).toBe(true)
        expect(response._meta?.errorCode).toBe(McpErrorCode.InvalidParams)
        expect(response.content[0].text).toBe("Project 'MISSING' not found")
      })

      // test-revizorro: approved
      it("maps InvalidStatusError with descriptive message", () => {
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

      // test-revizorro: approved
      it("maps PersonNotFoundError with descriptive message", () => {
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
    })

    describe("InternalError errors (-32603)", () => {
      // test-revizorro: approved
      it("maps HulyConnectionError with sanitized message", () => {
        const error = new HulyConnectionError({ message: "Network timeout" })
        const response = mapDomainErrorToMcp(error)

        expect(response.isError).toBe(true)
        expect(response._meta?.errorCode).toBe(McpErrorCode.InternalError)
        expect(response.content[0].text).toBe("Connection error: Network timeout")
      })

      // test-revizorro: approved [Sanitization uses word boundary /\bauth\b/i, so "Authentication" is not matched - only standalone "auth" triggers sanitization]
      it("maps HulyAuthError with sanitized message", () => {
        // "Authentication" in prefix doesn't trigger sanitization because /\bauth\b/i uses word boundaries
        const error = new HulyAuthError({ message: "Login failed" })
        const response = mapDomainErrorToMcp(error)

        expect(response.isError).toBe(true)
        expect(response._meta?.errorCode).toBe(McpErrorCode.InternalError)
        expect(response.content[0].text).toBe("Authentication error: Login failed")
      })

      // test-revizorro: approved
      it("sanitizes HulyAuthError messages containing sensitive keywords", () => {
        // "Invalid credentials" contains "credential" which should be sanitized
        const error = new HulyAuthError({ message: "Invalid credentials" })
        const response = mapDomainErrorToMcp(error)

        expect(response.isError).toBe(true)
        expect(response._meta?.errorCode).toBe(McpErrorCode.InternalError)
        expect(response.content[0].text).toBe(
          "An error occurred while processing the request"
        )
      })

      // test-revizorro: approved
      it("maps HulyError with sanitized message", () => {
        const error = new HulyError({ message: "Something went wrong" })
        const response = mapDomainErrorToMcp(error)

        expect(response.isError).toBe(true)
        expect(response._meta?.errorCode).toBe(McpErrorCode.InternalError)
        expect(response.content[0].text).toBe("Something went wrong")
      })
    })

    describe("sensitive information sanitization", () => {
      // test-revizorro: approved
      it("sanitizes messages containing password", () => {
        const error = new HulyError({ message: "Invalid password for user" })
        const response = mapDomainErrorToMcp(error)

        expect(response.content[0].text).toBe(
          "An error occurred while processing the request"
        )
      })

      // test-revizorro: approved
      it("sanitizes messages containing token", () => {
        const error = new HulyConnectionError({
          message: "Token expired: abc123",
        })
        const response = mapDomainErrorToMcp(error)

        expect(response.content[0].text).toBe(
          "An error occurred while processing the request"
        )
      })

      // test-revizorro: approved
      it("sanitizes messages containing api_key", () => {
        const error = new HulyAuthError({
          message: "api_key invalid: sk-xxx",
        })
        const response = mapDomainErrorToMcp(error)

        expect(response.content[0].text).toBe(
          "An error occurred while processing the request"
        )
      })

      // test-revizorro: approved
      it("sanitizes messages containing secret", () => {
        const error = new HulyError({
          message: "client_secret mismatch",
        })
        const response = mapDomainErrorToMcp(error)

        expect(response.content[0].text).toBe(
          "An error occurred while processing the request"
        )
      })

      // test-revizorro: approved
      it("sanitizes case-insensitively", () => {
        const error = new HulyError({
          message: "BEARER token invalid",
        })
        const response = mapDomainErrorToMcp(error)

        expect(response.content[0].text).toBe(
          "An error occurred while processing the request"
        )
      })
    })
  })

  describe("mapParseErrorToMcp", () => {
    // test-revizorro: approved
    it("maps parse error with tool name prefix", async () => {
      const TestSchema = Schema.Struct({
        name: Schema.String,
        age: Schema.Number,
      })

      const result = await Effect.runPromiseExit(
        Schema.decodeUnknown(TestSchema)({ name: 123 })
      )

      if (result._tag === "Failure") {
        const cause = result.cause
        if (cause._tag === "Fail") {
          const response = mapParseErrorToMcp(
            cause.error as ParseResult.ParseError,
            "create_issue"
          )

          expect(response.isError).toBe(true)
          expect(response._meta?.errorCode).toBe(McpErrorCode.InvalidParams)
          expect(response.content[0].text).toContain(
            "Invalid parameters for create_issue"
          )
        }
      }
    })

    // test-revizorro: approved
    it("maps parse error without tool name", async () => {
      const TestSchema = Schema.Struct({
        name: Schema.String,
      })

      const result = await Effect.runPromiseExit(
        Schema.decodeUnknown(TestSchema)({})
      )

      if (result._tag === "Failure") {
        const cause = result.cause
        if (cause._tag === "Fail") {
          const response = mapParseErrorToMcp(
            cause.error as ParseResult.ParseError
          )

          expect(response.isError).toBe(true)
          expect(response._meta?.errorCode).toBe(McpErrorCode.InvalidParams)
          expect(response.content[0].text).toContain("Invalid parameters:")
        }
      }
    })
  })

  describe("mapCauseToMcp", () => {
    describe("Fail cause", () => {
      // test-revizorro: approved
      it("handles HulyDomainError in Fail cause", () => {
        const error = new IssueNotFoundError({
          identifier: "TEST-1",
          project: "TEST",
        })
        const cause = Cause.fail(error)
        const response = mapCauseToMcp(cause)

        expect(response.isError).toBe(true)
        expect(response._meta?.errorCode).toBe(McpErrorCode.InvalidParams)
        expect(response.content[0].text).toBe(
          "Issue 'TEST-1' not found in project 'TEST'"
        )
      })

      // test-revizorro: approved
      it("handles ParseError in Fail cause", async () => {
        const TestSchema = Schema.Struct({ x: Schema.Number })
        const result = await Effect.runPromiseExit(
          Schema.decodeUnknown(TestSchema)({ x: "not a number" })
        )

        expect(Exit.isFailure(result)).toBe(true)
        if (result._tag === "Failure") {
          const response = mapCauseToMcp(result.cause, "test_tool")

          expect(response.isError).toBe(true)
          expect(response._meta?.errorCode).toBe(McpErrorCode.InvalidParams)
          expect(response.content[0].text).toContain("Invalid parameters")
        }
      })

      // test-revizorro: approved
      it("handles unknown error in Fail cause with sanitized message", () => {
        const error = { message: "Custom error" }
        const cause = Cause.fail(error)
        const response = mapCauseToMcp(cause)

        expect(response.isError).toBe(true)
        expect(response._meta?.errorCode).toBe(McpErrorCode.InternalError)
        expect(response.content[0].text).toBe("Custom error")
      })

      // test-revizorro: approved
      it("sanitizes sensitive unknown errors", () => {
        const error = { message: "Token abc123 is invalid" }
        const cause = Cause.fail(error)
        const response = mapCauseToMcp(cause)

        expect(response.content[0].text).toBe(
          "An error occurred while processing the request"
        )
      })
    })

    describe("Die cause", () => {
      // test-revizorro: approved
      it("returns generic internal error without exposing defect", () => {
        const defect = new Error("Stack trace with sensitive info")
        const cause = Cause.die(defect)
        const response = mapCauseToMcp(cause)

        expect(response.isError).toBe(true)
        expect(response._meta?.errorCode).toBe(McpErrorCode.InternalError)
        expect(response.content[0].text).toBe("Internal server error")
        // Ensure no stack trace or sensitive info
        expect(response.content[0].text).not.toContain("Stack trace")
      })
    })

    describe("Interrupt cause", () => {
      // test-revizorro: approved
      it("returns operation interrupted message", () => {
        const cause = Cause.interrupt("fiber-1" as unknown as Cause.Cause<never>["_tag"] extends "Interrupt" ? Parameters<typeof Cause.interrupt>[0] : never)
        const response = mapCauseToMcp(cause as Cause.Cause<never>)

        expect(response.isError).toBe(true)
        expect(response._meta?.errorCode).toBe(McpErrorCode.InternalError)
        expect(response.content[0].text).toBe("Operation was interrupted")
      })
    })

    describe("Empty cause", () => {
      // test-revizorro: scheduled
      it("returns generic error for empty cause", () => {
        const cause = Cause.empty
        const response = mapCauseToMcp(cause)

        expect(response.isError).toBe(true)
        expect(response._meta?.errorCode).toBe(McpErrorCode.InternalError)
        expect(response.content[0].text).toBe("An unexpected error occurred")
      })
    })

    describe("Sequential cause", () => {
      // test-revizorro: approved
      it("extracts first meaningful error from sequential cause", () => {
        const error1 = new ProjectNotFoundError({ identifier: "PROJ" })
        const error2 = new IssueNotFoundError({
          identifier: "X",
          project: "Y",
        })
        const cause = Cause.sequential(Cause.fail(error1), Cause.fail(error2))
        const response = mapCauseToMcp(cause)

        expect(response.isError).toBe(true)
        expect(response._meta?.errorCode).toBe(McpErrorCode.InvalidParams)
        expect(response.content[0].text).toBe("Project 'PROJ' not found")
      })
    })

    describe("Parallel cause", () => {
      // test-revizorro: approved
      it("extracts first meaningful error from parallel cause", () => {
        const error1 = new InvalidStatusError({ status: "bad", project: "P" })
        const error2 = new HulyConnectionError({ message: "timeout" })
        const cause = Cause.parallel(Cause.fail(error1), Cause.fail(error2))
        const response = mapCauseToMcp(cause)

        expect(response.isError).toBe(true)
        // First error should be extracted
        expect(response.content[0].text).toBe(
          "Invalid status 'bad' for project 'P'"
        )
      })
    })
  })

  describe("createSuccessResponse", () => {
    // test-revizorro: approved
    it("creates success response with JSON content", () => {
      const result = { issues: [{ id: 1, title: "Test" }] }
      const response = createSuccessResponse(result)

      expect(response.isError).toBeUndefined()
      expect(response.content[0].type).toBe("text")
      expect(JSON.parse(response.content[0].text)).toEqual(result)
    })

    // test-revizorro: approved
    it("formats JSON with indentation", () => {
      const result = { a: 1, b: 2 }
      const response = createSuccessResponse(result)

      expect(response.content[0].text).toContain("\n")
      expect(response.content[0].text).toBe(JSON.stringify(result, null, 2))
    })
  })

  describe("createUnknownToolError", () => {
    // test-revizorro: approved
    it("creates error response for unknown tool", () => {
      const response = createUnknownToolError("bogus_tool")

      expect(response.isError).toBe(true)
      expect(response._meta?.errorCode).toBe(McpErrorCode.InvalidParams)
      expect(response.content[0].text).toBe("Unknown tool: bogus_tool")
    })
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
      it(`sanitizes messages containing '${pattern}'`, () => {
        const error = new HulyError({ message })
        const response = mapDomainErrorToMcp(error)

        expect(response.content[0].text).not.toContain("some_value_123")
        expect(response.content[0].text).toBe(
          "An error occurred while processing the request"
        )
      })
    }

    // test-revizorro: approved
    it("does not expose stack traces in Die cause", () => {
      const defect = new Error("Error at /path/to/file.ts:123")
      defect.stack = `Error: Error at /path/to/file.ts:123
    at Object.<anonymous> (/path/to/file.ts:123:45)
    at Module._compile (internal/modules/cjs/loader.js:1085:14)`

      const cause = Cause.die(defect)
      const response = mapCauseToMcp(cause)

      expect(response.content[0].text).not.toContain("/path/to")
      expect(response.content[0].text).not.toContain("stack")
      expect(response.content[0].text).not.toContain("Module._compile")
    })
  })
})
