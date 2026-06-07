import { describe, it } from "@effect/vitest"
import type { ParseResult } from "effect"
import { Cause, Effect, Schema } from "effect"
import { expect } from "vitest"
import { AssociationName } from "../../src/domain/schemas/generic-associations.js"
import { ProcessId } from "../../src/domain/schemas/processes.js"
import {
  AssociationId,
  CardId,
  Count,
  DocId,
  MasterTagId,
  NonEmptyString,
  ObjectClassName,
  RelationId
} from "../../src/domain/schemas/shared.js"
import {
  AssociationIdentifierAmbiguousError,
  AssociationNotFoundError,
  CalendarNotAccessibleError,
  DirectMessageIdentifierAmbiguousError,
  DirectMessageNotFoundError,
  DocumentContentCorruptedError,
  FileFetchError,
  FileNotFoundError,
  FileUploadError,
  FunnelNotFoundError,
  GenericObjectIdentifierAmbiguousError,
  GenericObjectLocatorInvalidError,
  GenericObjectNotFoundError,
  HulyAuthError,
  HulyConnectionError,
  HulyError,
  InvalidContactProviderError,
  InvalidFileDataError,
  InvalidStatusError,
  IssueNotFoundError,
  LeadNotFoundError,
  OrganizationIdentifierAmbiguousError,
  OrganizationNotFoundError,
  PersonIdentifierAmbiguousError,
  PersonNotFoundError,
  ProcessCardIdentifierAmbiguousError,
  ProcessCardNotFoundError,
  ProcessIdentifierAmbiguousError,
  ProcessMasterTagAmbiguousError,
  ProcessMasterTagNotFoundError,
  ProcessNotFoundError,
  ProjectNotFoundError,
  RelationEndpointClassMismatchError,
  RelationIdentifierAmbiguousError,
  RelationMutationUnsupportedError,
  RelationNotFoundError
} from "../../src/huly/errors.js"
import {
  createSuccessResponse,
  createUnknownToolError,
  mapDomainCauseToMcp,
  mapDomainErrorToMcp,
  mapParseCauseToMcp,
  mapParseErrorToMcp,
  McpErrorCode,
  toMcpResponse
} from "../../src/mcp/error-mapping.js"
import { funnelIdentifier, funnelReference, leadIdentifier } from "../helpers/brands.js"

describe("Error Mapping to MCP", () => {
  describe("mapDomainErrorToMcp", () => {
    describe("InvalidParams errors (-32602)", () => {
      it.effect("maps IssueNotFoundError with no errorTag", () =>
        Effect.gen(function*() {
          const error = new IssueNotFoundError({
            identifier: "HULY-123",
            project: "HULY"
          })
          const response = mapDomainErrorToMcp(error)

          expect(response.isError).toBe(true)
          expect(response._meta.errorCode).toBe(McpErrorCode.InvalidParams)
          expect(response._meta.errorTag).toBeUndefined()
          expect(response.content[0].text).toBe(
            "Issue 'HULY-123' not found in project 'HULY'"
          )
        }))

      it.effect("maps ProjectNotFoundError with descriptive message", () =>
        Effect.gen(function*() {
          const error = new ProjectNotFoundError({ identifier: "MISSING" })
          const response = mapDomainErrorToMcp(error)

          expect(response.isError).toBe(true)
          expect(response._meta.errorCode).toBe(McpErrorCode.InvalidParams)
          expect(response.content[0].text).toBe("Project 'MISSING' not found")
        }))

      it.effect("maps InvalidStatusError with descriptive message", () =>
        Effect.gen(function*() {
          const error = new InvalidStatusError({
            status: "bogus",
            project: "HULY"
          })
          const response = mapDomainErrorToMcp(error)

          expect(response.isError).toBe(true)
          expect(response._meta.errorCode).toBe(McpErrorCode.InvalidParams)
          expect(response.content[0].text).toBe(
            "Invalid status 'bogus' for project 'HULY'"
          )
        }))

      it.effect("maps PersonNotFoundError with descriptive message", () =>
        Effect.gen(function*() {
          const error = new PersonNotFoundError({
            identifier: "john@example.com"
          })
          const response = mapDomainErrorToMcp(error)

          expect(response.isError).toBe(true)
          expect(response._meta.errorCode).toBe(McpErrorCode.InvalidParams)
          expect(response.content[0].text).toBe(
            "Person 'john@example.com' not found"
          )
        }))

      it.effect("maps PersonIdentifierAmbiguousError with descriptive message", () =>
        Effect.gen(function*() {
          const error = new PersonIdentifierAmbiguousError({
            identifier: "Smith,Bill",
            matches: Count.make(2)
          })
          const response = mapDomainErrorToMcp(error)

          expect(response.isError).toBe(true)
          expect(response._meta.errorCode).toBe(McpErrorCode.InvalidParams)
          expect(response.content[0].text).toBe(
            "Person identifier 'Smith,Bill' matched 2 people; use an exact email address instead"
          )
        }))

      it.effect("maps OrganizationNotFoundError with descriptive message", () =>
        Effect.gen(function*() {
          const error = new OrganizationNotFoundError({ identifier: "Acme" })
          const response = mapDomainErrorToMcp(error)

          expect(response.isError).toBe(true)
          expect(response._meta.errorCode).toBe(McpErrorCode.InvalidParams)
          expect(response.content[0].text).toBe("Organization 'Acme' not found")
        }))

      it.effect("maps OrganizationIdentifierAmbiguousError with descriptive message", () =>
        Effect.gen(function*() {
          const error = new OrganizationIdentifierAmbiguousError({
            identifier: "Acme",
            matches: Count.make(2)
          })
          const response = mapDomainErrorToMcp(error)

          expect(response.isError).toBe(true)
          expect(response._meta.errorCode).toBe(McpErrorCode.InvalidParams)
          expect(response.content[0].text).toBe(
            "Organization identifier 'Acme' matched 2 organizations; use the organization ID instead"
          )
        }))

      it.effect("maps InvalidContactProviderError with descriptive message", () =>
        Effect.gen(function*() {
          const error = new InvalidContactProviderError({ provider: "fax" })
          const response = mapDomainErrorToMcp(error)

          expect(response.isError).toBe(true)
          expect(response._meta.errorCode).toBe(McpErrorCode.InvalidParams)
          expect(response.content[0].text).toBe("Invalid contact provider: 'fax'")
        }))

      it.effect("maps InvalidFileDataError with descriptive message", () =>
        Effect.gen(function*() {
          const error = new InvalidFileDataError({
            message: "Invalid base64 encoding"
          })
          const response = mapDomainErrorToMcp(error)

          expect(response.isError).toBe(true)
          expect(response._meta.errorCode).toBe(McpErrorCode.InvalidParams)
          expect(response.content[0].text).toBe("Invalid base64 encoding")
        }))

      it.effect("maps FileNotFoundError with descriptive message", () =>
        Effect.gen(function*() {
          const error = new FileNotFoundError({
            filePath: "/path/to/missing.txt"
          })
          const response = mapDomainErrorToMcp(error)

          expect(response.isError).toBe(true)
          expect(response._meta.errorCode).toBe(McpErrorCode.InvalidParams)
          expect(response.content[0].text).toContain("/path/to/missing.txt")
        }))

      it.effect("maps FunnelNotFoundError with descriptive message", () =>
        Effect.gen(function*() {
          const error = new FunnelNotFoundError({ identifier: funnelReference("sales") })
          const response = mapDomainErrorToMcp(error)

          expect(response.isError).toBe(true)
          expect(response._meta.errorCode).toBe(McpErrorCode.InvalidParams)
          expect(response.content[0].text).toBe("Funnel 'sales' not found")
        }))

      it.effect("maps LeadNotFoundError with descriptive message", () =>
        Effect.gen(function*() {
          const error = new LeadNotFoundError({
            identifier: leadIdentifier("LEAD-9"),
            funnel: funnelIdentifier("funnel-1")
          })
          const response = mapDomainErrorToMcp(error)

          expect(response.isError).toBe(true)
          expect(response._meta.errorCode).toBe(McpErrorCode.InvalidParams)
          expect(response.content[0].text).toBe("Lead 'LEAD-9' not found in funnel 'funnel-1'")
        }))

      it.effect("maps CalendarNotAccessibleError with descriptive message", () =>
        Effect.gen(function*() {
          const error = new CalendarNotAccessibleError({ calendarId: "cal-9" })
          const response = mapDomainErrorToMcp(error)

          expect(response.isError).toBe(true)
          expect(response._meta.errorCode).toBe(McpErrorCode.InvalidParams)
          expect(response.content[0].text).toBe("Calendar 'cal-9' not found or not accessible")
        }))

      it.effect("maps DirectMessageNotFoundError with descriptive message", () =>
        Effect.gen(function*() {
          const error = new DirectMessageNotFoundError({ identifier: "Kerr,Shannon" })
          const response = mapDomainErrorToMcp(error)

          expect(response.isError).toBe(true)
          expect(response._meta.errorCode).toBe(McpErrorCode.InvalidParams)
          expect(response._meta.errorTag).toBeUndefined()
          expect(response.content[0].text).toBe("Direct message 'Kerr,Shannon' not found")
        }))

      it.effect("maps DirectMessageIdentifierAmbiguousError with descriptive message", () =>
        Effect.gen(function*() {
          const error = new DirectMessageIdentifierAmbiguousError({
            identifier: "Kerr,Shannon",
            matches: Count.make(2)
          })
          const response = mapDomainErrorToMcp(error)

          expect(response.isError).toBe(true)
          expect(response._meta.errorCode).toBe(McpErrorCode.InvalidParams)
          expect(response._meta.errorTag).toBeUndefined()
          expect(response.content[0].text).toBe(
            "Direct message 'Kerr,Shannon' is ambiguous (2 matches); use the DM _id"
          )
        }))

      it.effect("maps process lookup errors with descriptive messages", () =>
        Effect.gen(function*() {
          const processCandidate = {
            id: ProcessId.make("process-approval"),
            name: NonEmptyString.make("Approval"),
            masterTagId: MasterTagId.make("card:class:Document"),
            masterTagName: NonEmptyString.make("Document")
          }
          const masterTagCandidate = {
            id: MasterTagId.make("card:class:Document"),
            name: NonEmptyString.make("Document")
          }
          const cardCandidate = {
            id: CardId.make("card-1"),
            title: NonEmptyString.make("Contract")
          }
          const errors = [
            new ProcessNotFoundError({
              identifier: "Missing",
              candidates: [processCandidate]
            }),
            new ProcessIdentifierAmbiguousError({
              identifier: "Approval",
              candidates: [processCandidate]
            }),
            new ProcessMasterTagNotFoundError({ identifier: "Contract" }),
            new ProcessMasterTagAmbiguousError({
              identifier: "Document",
              candidates: [masterTagCandidate]
            }),
            new ProcessCardIdentifierAmbiguousError({
              identifier: "Contract",
              candidates: [cardCandidate]
            }),
            new ProcessCardNotFoundError({ identifier: "Missing Card" })
          ]

          for (const error of errors) {
            const response = mapDomainErrorToMcp(error)

            expect(response.isError).toBe(true)
            expect(response._meta.errorCode).toBe(McpErrorCode.InvalidParams)
            expect(response._meta.errorTag).toBeUndefined()
            expect(response.content[0].text).toBe(error.message)
          }
        }))

      it.effect("maps generic association and relation lookup errors with descriptive messages", () =>
        Effect.gen(function*() {
          const errors = [
            new AssociationNotFoundError({ identifier: "relates" }),
            new AssociationIdentifierAmbiguousError({
              identifier: "relates",
              candidates: [{ id: AssociationId.make("assoc-1"), name: AssociationName.make("relates") }]
            }),
            new RelationNotFoundError({ identifier: "rel-1" }),
            new RelationIdentifierAmbiguousError({
              identifier: "assoc-1/source/target",
              relationIds: [RelationId.make("rel-1")]
            }),
            new RelationMutationUnsupportedError({
              associationId: AssociationId.make("assoc-1"),
              reason: "not validated"
            }),
            new RelationEndpointClassMismatchError({
              field: "source",
              expectedClass: "tracker:class:Issue",
              actualClass: "document:class:Document"
            }),
            new GenericObjectIdentifierAmbiguousError({
              field: "target",
              identifier: "Spec",
              candidates: [{
                id: DocId.make("doc-1"),
                class: ObjectClassName.make("document:class:Document"),
                display: "Spec"
              }]
            }),
            new GenericObjectLocatorInvalidError({
              field: "source",
              reason: "raw object locator requires class"
            }),
            new GenericObjectNotFoundError({
              field: "target",
              identifier: "missing-doc",
              class: "document:class:Document"
            })
          ]

          for (const error of errors) {
            const response = mapDomainErrorToMcp(error)

            expect(response.isError).toBe(true)
            expect(response._meta.errorCode).toBe(McpErrorCode.InvalidParams)
            expect(response._meta.errorTag).toBeUndefined()
            expect(response.content[0].text).toBe(error.message)
          }
        }))

      it.effect("maps DocumentContentCorruptedError with repair instruction", () =>
        Effect.gen(function*() {
          const error = new DocumentContentCorruptedError({
            identifier: "Spec",
            causeMessage: "missing markup blob"
          })
          const response = mapDomainErrorToMcp(error)

          expect(response.isError).toBe(true)
          expect(response._meta.errorCode).toBe(McpErrorCode.InvalidParams)
          expect(response._meta.errorTag).toBeUndefined()
          expect(response.content[0].text).toBe(
            "Document content is unreadable or corrupted. Use edit_document with the full content field to replace and repair it."
          )
        }))
    })

    describe("InternalError errors (-32603)", () => {
      it.effect("maps HulyConnectionError with errorTag", () =>
        Effect.gen(function*() {
          const error = new HulyConnectionError({ message: "Network timeout" })
          const response = mapDomainErrorToMcp(error)

          expect(response.isError).toBe(true)
          expect(response._meta.errorCode).toBe(McpErrorCode.InternalError)
          expect(response._meta.errorTag).toBe("HulyConnectionError")
          expect(response.content[0].text).toBe("Connection error: Network timeout")
        }))

      it.effect("maps HulyAuthError with errorTag", () =>
        Effect.gen(function*() {
          const error = new HulyAuthError({ message: "Login failed" })
          const response = mapDomainErrorToMcp(error)

          expect(response.isError).toBe(true)
          expect(response._meta.errorCode).toBe(McpErrorCode.InternalError)
          expect(response._meta.errorTag).toBe("HulyAuthError")
          expect(response.content[0].text).toBe("Authentication error: Login failed")
        }))

      it.effect("maps HulyError with errorTag", () =>
        Effect.gen(function*() {
          const error = new HulyError({ message: "Something went wrong" })
          const response = mapDomainErrorToMcp(error)

          expect(response.isError).toBe(true)
          expect(response._meta.errorCode).toBe(McpErrorCode.InternalError)
          expect(response._meta.errorTag).toBe("HulyError")
          expect(response.content[0].text).toBe("Something went wrong")
        }))

      it.effect("maps FileUploadError with errorTag", () =>
        Effect.gen(function*() {
          const error = new FileUploadError({
            message: "Storage quota exceeded"
          })
          const response = mapDomainErrorToMcp(error)

          expect(response.isError).toBe(true)
          expect(response._meta.errorCode).toBe(McpErrorCode.InternalError)
          expect(response._meta.errorTag).toBe("FileUploadError")
          expect(response.content[0].text).toBe(
            "File upload error: Storage quota exceeded"
          )
        }))

      it.effect("maps FileFetchError with errorTag", () =>
        Effect.gen(function*() {
          const error = new FileFetchError({
            fileUrl: "https://example.com/file.png",
            reason: "404 Not Found"
          })
          const response = mapDomainErrorToMcp(error)

          expect(response.isError).toBe(true)
          expect(response._meta.errorCode).toBe(McpErrorCode.InternalError)
          expect(response._meta.errorTag).toBe("FileFetchError")
          expect(response.content[0].text).toContain("https://example.com/file.png")
          expect(response.content[0].text).toContain("404 Not Found")
        }))
    })
  })

  describe("mapParseErrorToMcp", () => {
    it.effect("maps parse error with tool name prefix", () =>
      Effect.gen(function*() {
        const TestSchema = Schema.Struct({
          name: Schema.String,
          age: Schema.Number
        })

        const error = yield* Effect.flip(
          Schema.decodeUnknown(TestSchema)({ name: 123 })
        )

        const response = mapParseErrorToMcp(
          error,
          "create_issue"
        )

        expect(response.isError).toBe(true)
        expect(response._meta.errorCode).toBe(McpErrorCode.InvalidParams)
        expect(response.content[0].text).toContain(
          "Invalid parameters for create_issue"
        )
      }))

    it.effect("maps parse error without tool name", () =>
      Effect.gen(function*() {
        const TestSchema = Schema.Struct({
          name: Schema.String
        })

        const error = yield* Effect.flip(
          Schema.decodeUnknown(TestSchema)({})
        )

        const response = mapParseErrorToMcp(
          error
        )

        expect(response.isError).toBe(true)
        expect(response._meta.errorCode).toBe(McpErrorCode.InvalidParams)
        expect(response.content[0].text).toContain("Invalid parameters:")
      }))
  })

  describe("mapDomainCauseToMcp", () => {
    describe("Fail cause", () => {
      it.effect("handles HulyDomainError in Fail cause", () =>
        Effect.gen(function*() {
          const error = new IssueNotFoundError({
            identifier: "TEST-1",
            project: "TEST"
          })
          const cause = Cause.fail(error)
          const response = mapDomainCauseToMcp(cause)

          expect(response.isError).toBe(true)
          expect(response._meta.errorCode).toBe(McpErrorCode.InvalidParams)
          expect(response.content[0].text).toBe(
            "Issue 'TEST-1' not found in project 'TEST'"
          )
        }))
    })

    describe("Die cause", () => {
      it.effect("returns UnexpectedError errorTag for defects", () =>
        Effect.gen(function*() {
          const cause = Cause.die(new Error("boom"))
          const response = mapDomainCauseToMcp(cause as Cause.Cause<HulyError>)

          expect(response.isError).toBe(true)
          expect(response._meta.errorCode).toBe(McpErrorCode.InternalError)
          expect(response._meta.errorTag).toBe("UnexpectedError")
          expect(response.content[0].text).toBe("An unexpected error occurred")
        }))
    })

    describe("Empty cause", () => {
      it.effect("returns generic error for empty cause", () =>
        Effect.gen(function*() {
          const cause = Cause.empty
          const response = mapDomainCauseToMcp(cause as Cause.Cause<HulyError>)

          expect(response.isError).toBe(true)
          expect(response._meta.errorCode).toBe(McpErrorCode.InternalError)
          expect(response.content[0].text).toBe("An unexpected error occurred")
        }))
    })

    describe("Sequential cause", () => {
      it.effect("extracts first meaningful error from sequential cause", () =>
        Effect.gen(function*() {
          const error1 = new ProjectNotFoundError({ identifier: "PROJ" })
          const error2 = new IssueNotFoundError({
            identifier: "X",
            project: "Y"
          })
          const cause = Cause.sequential(Cause.fail(error1), Cause.fail(error2))
          const response = mapDomainCauseToMcp(cause)

          expect(response.isError).toBe(true)
          expect(response._meta.errorCode).toBe(McpErrorCode.InvalidParams)
          expect(response.content[0].text).toBe("Project 'PROJ' not found")
        }))
    })

    describe("Parallel cause", () => {
      it.effect("extracts first meaningful error from parallel cause", () =>
        Effect.gen(function*() {
          const error1 = new InvalidStatusError({ status: "bad", project: "P" })
          const error2 = new HulyConnectionError({ message: "timeout" })
          const cause = Cause.parallel(Cause.fail(error1), Cause.fail(error2))
          const response = mapDomainCauseToMcp(cause)

          expect(response.isError).toBe(true)
          expect(response._meta.errorCode).toBe(McpErrorCode.InvalidParams)
          expect(response.content[0].text).toBe(
            "Invalid status 'bad' for project 'P'"
          )
        }))
    })
  })

  describe("mapParseCauseToMcp", () => {
    describe("Fail cause", () => {
      it.effect("handles ParseError in Fail cause", () =>
        Effect.gen(function*() {
          const TestSchema = Schema.Struct({ x: Schema.Number })
          const error = yield* Effect.flip(
            Schema.decodeUnknown(TestSchema)({ x: "not a number" })
          )

          const cause = Cause.fail(error)
          const response = mapParseCauseToMcp(cause, "test_tool")

          expect(response.isError).toBe(true)
          expect(response._meta.errorCode).toBe(McpErrorCode.InvalidParams)
          expect(response.content[0].text).toContain("Invalid parameters")
        }))
    })

    describe("Empty cause", () => {
      it.effect("returns generic error for empty cause", () =>
        Effect.gen(function*() {
          const cause = Cause.empty
          const response = mapParseCauseToMcp(cause as Cause.Cause<ParseResult.ParseError>)

          expect(response.isError).toBe(true)
          expect(response._meta.errorCode).toBe(McpErrorCode.InternalError)
          expect(response.content[0].text).toBe("An unexpected error occurred")
        }))
    })
  })

  describe("createSuccessResponse", () => {
    it.effect("creates success response with JSON content", () =>
      Effect.gen(function*() {
        const result = { issues: [{ id: 1, title: "Test" }] }
        const response = createSuccessResponse(result)

        expect(response.isError).toBeUndefined()
        expect(response.content[0].type).toBe("text")
        expect(JSON.parse(response.content[0].text)).toEqual(result)
      }))

    it.effect("formats JSON as compact single-line", () =>
      Effect.gen(function*() {
        const result = { a: 1, b: 2 }
        const response = createSuccessResponse(result)

        expect(response.content[0].text).not.toContain("\n")
        expect(response.content[0].text).toBe(JSON.stringify(result))
      }))
  })

  describe("createUnknownToolError", () => {
    it.effect("creates error response for unknown tool with errorTag", () =>
      Effect.gen(function*() {
        const response = createUnknownToolError("bogus_tool")

        expect(response.isError).toBe(true)
        expect(response._meta.errorCode).toBe(McpErrorCode.InvalidParams)
        expect(response._meta.errorTag).toBe("UnknownTool")
        expect(response.content[0].text).toBe("Unknown tool: bogus_tool")
      }))
  })

  describe("toMcpResponse", () => {
    it.effect("strips _meta from error response", () =>
      Effect.gen(function*() {
        const response = createUnknownToolError("bogus_tool")
        const wire = toMcpResponse(response)

        expect(wire).not.toHaveProperty("_meta")
        expect(wire.isError).toBe(true)
        expect(wire.content[0].text).toBe("Unknown tool: bogus_tool")
      }))

    it.effect("strips _meta from success response", () =>
      Effect.gen(function*() {
        const response = createSuccessResponse({ ok: true })
        const wire = toMcpResponse(response)

        expect(wire).not.toHaveProperty("_meta")
        expect(wire.isError).toBeUndefined()
      }))
  })
})
