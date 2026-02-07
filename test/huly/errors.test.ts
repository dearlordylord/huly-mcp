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
  FileUploadError,
  InvalidFileDataError,
  FileNotFoundError,
  FileFetchError,
  type HulyDomainError,
} from "../../src/huly/errors.js"

describe("Huly Errors", () => {
  describe("HulyError", () => {
        it.effect("creates with message", () =>
      Effect.gen(function* () {
        const error = new HulyError({ message: "Something went wrong" })
        expect(error._tag).toBe("HulyError")
        expect(error.message).toBe("Something went wrong")
      })
    )

        it.effect("creates with cause", () =>
      Effect.gen(function* () {
        const cause = new Error("underlying error")
        const error = new HulyError({ message: "Wrapped error", cause })
        expect(error.cause).toBe(cause)
      })
    )
  })

  describe("HulyConnectionError", () => {
        it.effect("creates with message", () =>
      Effect.gen(function* () {
        const error = new HulyConnectionError({ message: "Connection failed" })
        expect(error._tag).toBe("HulyConnectionError")
        expect(error.message).toBe("Connection failed")
      })
    )

        it.effect("creates with cause", () =>
      Effect.gen(function* () {
        const cause = new Error("network timeout")
        const error = new HulyConnectionError({ message: "Connection failed", cause })
        expect(error.cause).toBe(cause)
      })
    )
  })

  describe("HulyAuthError", () => {
        it.effect("creates with message", () =>
      Effect.gen(function* () {
        const error = new HulyAuthError({ message: "Invalid credentials" })
        expect(error._tag).toBe("HulyAuthError")
        expect(error.message).toBe("Invalid credentials")
      })
    )
  })

  describe("IssueNotFoundError", () => {
        it.effect("creates with identifier and project", () =>
      Effect.gen(function* () {
        const error = new IssueNotFoundError({ identifier: "HULY-123", project: "HULY" })
        expect(error._tag).toBe("IssueNotFoundError")
        expect(error.identifier).toBe("HULY-123")
        expect(error.project).toBe("HULY")
      })
    )

        it.effect("generates message from fields", () =>
      Effect.gen(function* () {
        const error = new IssueNotFoundError({ identifier: "HULY-123", project: "HULY" })
        expect(error.message).toBe("Issue 'HULY-123' not found in project 'HULY'")
      })
    )
  })

  describe("ProjectNotFoundError", () => {
        it.effect("creates with identifier", () =>
      Effect.gen(function* () {
        const error = new ProjectNotFoundError({ identifier: "MISSING" })
        expect(error._tag).toBe("ProjectNotFoundError")
        expect(error.identifier).toBe("MISSING")
      })
    )

        it.effect("generates message from fields", () =>
      Effect.gen(function* () {
        const error = new ProjectNotFoundError({ identifier: "MISSING" })
        expect(error.message).toBe("Project 'MISSING' not found")
      })
    )
  })

  describe("InvalidStatusError", () => {
        it.effect("creates with status and project", () =>
      Effect.gen(function* () {
        const error = new InvalidStatusError({ status: "bogus", project: "HULY" })
        expect(error._tag).toBe("InvalidStatusError")
        expect(error.status).toBe("bogus")
        expect(error.project).toBe("HULY")
      })
    )

        it.effect("generates message from fields", () =>
      Effect.gen(function* () {
        const error = new InvalidStatusError({ status: "bogus", project: "HULY" })
        expect(error.message).toBe("Invalid status 'bogus' for project 'HULY'")
      })
    )
  })

  describe("FileUploadError", () => {
        it.effect("creates with message", () =>
      Effect.gen(function* () {
        const error = new FileUploadError({ message: "Storage quota exceeded" })
        expect(error._tag).toBe("FileUploadError")
        expect(error.message).toBe("Storage quota exceeded")
      })
    )

        it.effect("creates with cause", () =>
      Effect.gen(function* () {
        const cause = new Error("network error")
        const error = new FileUploadError({ message: "Upload failed", cause })
        expect(error.cause).toBe(cause)
      })
    )
  })

  describe("InvalidFileDataError", () => {
        it.effect("creates with message", () =>
      Effect.gen(function* () {
        const error = new InvalidFileDataError({ message: "Invalid base64 encoding" })
        expect(error._tag).toBe("InvalidFileDataError")
        expect(error.message).toBe("Invalid base64 encoding")
      })
    )
  })

  describe("FileNotFoundError", () => {
        it.effect("creates with filePath", () =>
      Effect.gen(function* () {
        const error = new FileNotFoundError({ filePath: "/tmp/missing.txt" })
        expect(error._tag).toBe("FileNotFoundError")
        expect(error.filePath).toBe("/tmp/missing.txt")
        expect(error.message).toBe("File not found: /tmp/missing.txt")
      })
    )
  })

  describe("FileFetchError", () => {
        it.effect("creates with fileUrl and reason", () =>
      Effect.gen(function* () {
        const error = new FileFetchError({ fileUrl: "https://example.com/img.png", reason: "404 Not Found" })
        expect(error._tag).toBe("FileFetchError")
        expect(error.fileUrl).toBe("https://example.com/img.png")
        expect(error.reason).toBe("404 Not Found")
        expect(error.message).toBe("Failed to fetch file from https://example.com/img.png: 404 Not Found")
      })
    )
  })

  describe("Effect integration", () => {
        it.effect("errors are yieldable", () =>
      Effect.gen(function* () {
        const program = Effect.gen(function* () {
          return yield* new IssueNotFoundError({ identifier: "HULY-1", project: "TEST" })
        })

        const error = yield* Effect.flip(program)
        expect(error._tag).toBe("IssueNotFoundError")
      })
    )

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

        it.effect("can pattern match with Match", () =>
      Effect.gen(function* () {
        const matchError = Match.type<HulyDomainError>().pipe(
          Match.tag("IssueNotFoundError", (e) => `issue:${e.identifier}`),
          Match.tag("ProjectNotFoundError", (e) => `project:${e.identifier}`),
          Match.tag("InvalidStatusError", (e) => `status:${e.status}`),
          Match.tag("PersonNotFoundError", (e) => `person:${e.identifier}`),
          Match.tag("FileUploadError", (e) => `upload:${e.message}`),
          Match.tag("InvalidFileDataError", (e) => `data:${e.message}`),
          Match.tag("FileNotFoundError", (e) => `notfound:${e.filePath}`),
          Match.tag("FileFetchError", (e) => `fetch:${e.fileUrl}`),
          Match.tag("HulyConnectionError", () => "connection"),
          Match.tag("HulyAuthError", () => "auth"),
          Match.tag("HulyError", () => "generic"),
          Match.exhaustive
        )

        expect(matchError(new IssueNotFoundError({ identifier: "X", project: "Y" }))).toBe("issue:X")
        expect(matchError(new ProjectNotFoundError({ identifier: "Z" }))).toBe("project:Z")
        expect(matchError(new InvalidStatusError({ status: "bad", project: "P" }))).toBe("status:bad")
        expect(matchError(new PersonNotFoundError({ identifier: "john@example.com" }))).toBe("person:john@example.com")
        expect(matchError(new FileUploadError({ message: "quota exceeded" }))).toBe("upload:quota exceeded")
        expect(matchError(new InvalidFileDataError({ message: "bad base64" }))).toBe("data:bad base64")
        expect(matchError(new FileNotFoundError({ filePath: "/path/to/file" }))).toBe("notfound:/path/to/file")
        expect(matchError(new FileFetchError({ fileUrl: "https://example.com/img.png", reason: "404" }))).toBe("fetch:https://example.com/img.png")
        expect(matchError(new HulyConnectionError({ message: "fail" }))).toBe("connection")
        expect(matchError(new HulyAuthError({ message: "denied" }))).toBe("auth")
        expect(matchError(new HulyError({ message: "oops" }))).toBe("generic")
      })
    )
  })
})
