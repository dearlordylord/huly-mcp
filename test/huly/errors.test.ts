import { describe, it } from "@effect/vitest"
import { expect } from "vitest"
import { Effect, Match } from "effect"
import {
  HulyError,
  HulyConnectionError,
  HulyAuthError,
  IssueNotFoundError,
  ProjectNotFoundError,
  InvalidStatusError,
  PersonNotFoundError,
  McpErrorCode,
  getMcpErrorCode,
  type HulyDomainError,
} from "../../src/huly/errors.js"

describe("Huly Errors", () => {
  describe("HulyError", () => {
    // test-revizorro: approved
    it.effect("creates with message", () =>
      Effect.gen(function* () {
        const error = new HulyError({ message: "Something went wrong" })
        expect(error._tag).toBe("HulyError")
        expect(error.message).toBe("Something went wrong")
        expect(error.mcpErrorCode).toBe(McpErrorCode.InternalError)
      })
    )

    // test-revizorro: approved
    it.effect("creates with cause", () =>
      Effect.gen(function* () {
        const cause = new Error("underlying error")
        const error = new HulyError({ message: "Wrapped error", cause })
        expect(error.cause).toBe(cause)
      })
    )
  })

  describe("HulyConnectionError", () => {
    // test-revizorro: approved
    it.effect("creates with message", () =>
      Effect.gen(function* () {
        const error = new HulyConnectionError({ message: "Connection failed" })
        expect(error._tag).toBe("HulyConnectionError")
        expect(error.message).toBe("Connection failed")
        expect(error.mcpErrorCode).toBe(McpErrorCode.InternalError)
      })
    )

    // test-revizorro: approved
    it.effect("creates with cause", () =>
      Effect.gen(function* () {
        const cause = new Error("network timeout")
        const error = new HulyConnectionError({ message: "Connection failed", cause })
        expect(error.cause).toBe(cause)
      })
    )
  })

  describe("HulyAuthError", () => {
    // test-revizorro: approved
    it.effect("creates with message", () =>
      Effect.gen(function* () {
        const error = new HulyAuthError({ message: "Invalid credentials" })
        expect(error._tag).toBe("HulyAuthError")
        expect(error.message).toBe("Invalid credentials")
        expect(error.mcpErrorCode).toBe(McpErrorCode.InternalError)
      })
    )
  })

  describe("IssueNotFoundError", () => {
    // test-revizorro: approved
    it.effect("creates with identifier and project", () =>
      Effect.gen(function* () {
        const error = new IssueNotFoundError({ identifier: "HULY-123", project: "HULY" })
        expect(error._tag).toBe("IssueNotFoundError")
        expect(error.identifier).toBe("HULY-123")
        expect(error.project).toBe("HULY")
        expect(error.mcpErrorCode).toBe(McpErrorCode.InvalidParams)
      })
    )

    // test-revizorro: approved
    it.effect("generates message from fields", () =>
      Effect.gen(function* () {
        const error = new IssueNotFoundError({ identifier: "HULY-123", project: "HULY" })
        expect(error.message).toBe("Issue 'HULY-123' not found in project 'HULY'")
      })
    )
  })

  describe("ProjectNotFoundError", () => {
    // test-revizorro: approved
    it.effect("creates with identifier", () =>
      Effect.gen(function* () {
        const error = new ProjectNotFoundError({ identifier: "MISSING" })
        expect(error._tag).toBe("ProjectNotFoundError")
        expect(error.identifier).toBe("MISSING")
        expect(error.mcpErrorCode).toBe(McpErrorCode.InvalidParams)
      })
    )

    // test-revizorro: approved
    it.effect("generates message from fields", () =>
      Effect.gen(function* () {
        const error = new ProjectNotFoundError({ identifier: "MISSING" })
        expect(error.message).toBe("Project 'MISSING' not found")
      })
    )
  })

  describe("InvalidStatusError", () => {
    // test-revizorro: approved
    it.effect("creates with status and project", () =>
      Effect.gen(function* () {
        const error = new InvalidStatusError({ status: "bogus", project: "HULY" })
        expect(error._tag).toBe("InvalidStatusError")
        expect(error.status).toBe("bogus")
        expect(error.project).toBe("HULY")
        expect(error.mcpErrorCode).toBe(McpErrorCode.InvalidParams)
      })
    )

    // test-revizorro: approved
    it.effect("generates message from fields", () =>
      Effect.gen(function* () {
        const error = new InvalidStatusError({ status: "bogus", project: "HULY" })
        expect(error.message).toBe("Invalid status 'bogus' for project 'HULY'")
      })
    )
  })

  describe("getMcpErrorCode", () => {
    // test-revizorro: approved
    it.effect("returns InvalidParams for domain errors", () =>
      Effect.gen(function* () {
        expect(getMcpErrorCode(new IssueNotFoundError({ identifier: "X", project: "Y" }))).toBe(
          McpErrorCode.InvalidParams
        )
        expect(getMcpErrorCode(new ProjectNotFoundError({ identifier: "X" }))).toBe(
          McpErrorCode.InvalidParams
        )
        expect(getMcpErrorCode(new InvalidStatusError({ status: "X", project: "Y" }))).toBe(
          McpErrorCode.InvalidParams
        )
      })
    )

    // test-revizorro: approved
    it.effect("returns InternalError for infrastructure errors", () =>
      Effect.gen(function* () {
        expect(getMcpErrorCode(new HulyError({ message: "X" }))).toBe(McpErrorCode.InternalError)
        expect(getMcpErrorCode(new HulyConnectionError({ message: "X" }))).toBe(
          McpErrorCode.InternalError
        )
        expect(getMcpErrorCode(new HulyAuthError({ message: "X" }))).toBe(McpErrorCode.InternalError)
      })
    )
  })

  describe("Effect integration", () => {
    // test-revizorro: approved
    it.effect("errors are yieldable", () =>
      Effect.gen(function* () {
        const program = Effect.gen(function* () {
          return yield* new IssueNotFoundError({ identifier: "HULY-1", project: "TEST" })
        })

        const error = yield* Effect.flip(program)
        expect(error._tag).toBe("IssueNotFoundError")
      })
    )

    // test-revizorro: approved
    it.effect("can pattern match with catchTag", () =>
      Effect.gen(function* () {
        const program = Effect.gen(function* () {
          return yield* new IssueNotFoundError({ identifier: "HULY-1", project: "TEST" })
        }).pipe(
          Effect.catchTag("IssueNotFoundError", (e) =>
            Effect.succeed(`Recovered: ${e.identifier}`)
          )
        )

        const result = yield* program
        expect(result).toBe("Recovered: HULY-1")
      })
    )

    // test-revizorro: approved
    it.effect("can pattern match with Match", () =>
      Effect.gen(function* () {
        const matchError = Match.type<HulyDomainError>().pipe(
          Match.tag("IssueNotFoundError", (e) => `issue:${e.identifier}`),
          Match.tag("ProjectNotFoundError", (e) => `project:${e.identifier}`),
          Match.tag("InvalidStatusError", (e) => `status:${e.status}`),
          Match.tag("PersonNotFoundError", (e) => `person:${e.identifier}`),
          Match.tag("HulyConnectionError", () => "connection"),
          Match.tag("HulyAuthError", () => "auth"),
          Match.tag("HulyError", () => "generic"),
          Match.exhaustive
        )

        expect(matchError(new IssueNotFoundError({ identifier: "X", project: "Y" }))).toBe("issue:X")
        expect(matchError(new ProjectNotFoundError({ identifier: "Z" }))).toBe("project:Z")
        expect(matchError(new InvalidStatusError({ status: "bad", project: "P" }))).toBe("status:bad")
        expect(matchError(new PersonNotFoundError({ identifier: "john@example.com" }))).toBe("person:john@example.com")
        expect(matchError(new HulyConnectionError({ message: "fail" }))).toBe("connection")
        expect(matchError(new HulyAuthError({ message: "denied" }))).toBe("auth")
        expect(matchError(new HulyError({ message: "oops" }))).toBe("generic")
      })
    )
  })
})
