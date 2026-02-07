import { describe, it } from "@effect/vitest"
import { expect } from "vitest"
import { Effect, Schema } from "effect"
import {
  IssuePrioritySchema,
  IssuePriorityValues,
  LabelSchema,
  PersonRefSchema,
  ProjectSummarySchema,
  makeJsonSchema,
  parseIssue,
  parseIssueSummary,
  parseProject,
  parseListIssuesParams,
  parseGetIssueParams,
  parseCreateIssueParams,
  parseUpdateIssueParams,
  parseAddLabelParams,
  parseListProjectsParams,
  parseListTeamspacesParams,
  parseListDocumentsParams,
  parseGetDocumentParams,
  parseCreateDocumentParams,
  parseUpdateDocumentParams,
  parseDeleteDocumentParams,
  listIssuesParamsJsonSchema,
  listProjectsParamsJsonSchema,
  getIssueParamsJsonSchema,
  createIssueParamsJsonSchema,
  updateIssueParamsJsonSchema,
  addLabelParamsJsonSchema,
  listTeamspacesParamsJsonSchema,
  listDocumentsParamsJsonSchema,
  getDocumentParamsJsonSchema,
  createDocumentParamsJsonSchema,
  updateDocumentParamsJsonSchema,
  deleteDocumentParamsJsonSchema,
  TeamspaceSummarySchema,
  DocumentSummarySchema,
  DocumentSchema,
  type CreateIssueParams,
  type UpdateIssueParams,
  TimeSpendReportSchema,
  TimeReportSummarySchema,
  parseLogTimeParams,
  parseGetTimeReportParams,
  parseListTimeSpendReportsParams,
  parseStartTimerParams,
  parseStopTimerParams,
  logTimeParamsJsonSchema,
  getTimeReportParamsJsonSchema,
  startTimerParamsJsonSchema,
  stopTimerParamsJsonSchema,
} from "../../src/domain/schemas.js"

// Helper type for JSON Schema assertions
type JsonSchemaObject = {
  $schema?: string
  type?: string
  required?: string[]
  properties?: Record<string, { description?: string }>
}

describe("Domain Schemas", () => {
  describe("IssuePrioritySchema", () => {
        it.effect("accepts valid priorities", () =>
      Effect.gen(function* () {
        for (const priority of IssuePriorityValues) {
          const result = yield* Schema.decodeUnknown(IssuePrioritySchema)(priority)
          expect(result).toBe(priority)
        }
      })
    )

        it.effect("rejects invalid priority", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(
          Schema.decodeUnknown(IssuePrioritySchema)("invalid")
        )
        expect(error._tag).toBe("ParseError")
      })
    )

  })

  describe("LabelSchema", () => {
        it.effect("parses label with title only", () =>
      Effect.gen(function* () {
        const result = yield* Schema.decodeUnknown(LabelSchema)({ title: "bug" })
        expect(result).toEqual({ title: "bug" })
      })
    )

        it.effect("parses label with title and color", () =>
      Effect.gen(function* () {
        const result = yield* Schema.decodeUnknown(LabelSchema)({ title: "feature", color: 5 })
        expect(result).toEqual({ title: "feature", color: 5 })
      })
    )

        it.effect("rejects empty title", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(
          Schema.decodeUnknown(LabelSchema)({ title: "  " })
        )
        expect(error._tag).toBe("ParseError")
      })
    )
  })

  describe("PersonRefSchema", () => {
        it.effect("parses with id only", () =>
      Effect.gen(function* () {
        const result = yield* Schema.decodeUnknown(PersonRefSchema)({ id: "person-123" })
        expect(result).toEqual({ id: "person-123" })
      })
    )

        it.effect("parses with all fields", () =>
      Effect.gen(function* () {
        const result = yield* Schema.decodeUnknown(PersonRefSchema)({
          id: "person-123",
          name: "John Doe",
          email: "john@example.com",
        })
        expect(result).toEqual({
          id: "person-123",
          name: "John Doe",
          email: "john@example.com",
        })
      })
    )
  })

  describe("ProjectSummarySchema", () => {
        it.effect("parses minimal project", () =>
      Effect.gen(function* () {
        const result = yield* Schema.decodeUnknown(ProjectSummarySchema)({
          identifier: "HULY",
          name: "Huly Project",
          archived: false,
        })
        expect(result).toEqual({
          identifier: "HULY",
          name: "Huly Project",
          archived: false,
        })
      })
    )

        it.effect("parses with description", () =>
      Effect.gen(function* () {
        const result = yield* Schema.decodeUnknown(ProjectSummarySchema)({
          identifier: "HULY",
          name: "Huly Project",
          description: "Main project",
          archived: false,
        })
        expect(result.identifier).toBe("HULY")
        expect(result.name).toBe("Huly Project")
        expect(result.description).toBe("Main project")
        expect(result.archived).toBe(false)
      })
    )
  })

  describe("ProjectSchema", () => {
        it.effect("parses full project", () =>
      Effect.gen(function* () {
        const result = yield* parseProject({
          identifier: "HULY",
          name: "Huly Project",
          description: "Main project",
          defaultStatus: "Open",
          statuses: ["Open", "In Progress", "Done"],
        })
        expect(result.identifier).toBe("HULY")
        expect(result.statuses).toEqual(["Open", "In Progress", "Done"])
      })
    )
  })

  describe("IssueSummarySchema", () => {
        it.effect("parses minimal issue summary", () =>
      Effect.gen(function* () {
        const result = yield* parseIssueSummary({
          identifier: "HULY-123",
          title: "Fix bug",
          status: "Open",
        })
        expect(result).toEqual({
          identifier: "HULY-123",
          title: "Fix bug",
          status: "Open",
        })
      })
    )

        it.effect("parses with all optional fields", () =>
      Effect.gen(function* () {
        const result = yield* parseIssueSummary({
          identifier: "HULY-123",
          title: "Fix bug",
          status: "Open",
          priority: "high",
          assignee: "john@example.com",
          modifiedOn: 1706500000000,
        })
        expect(result.priority).toBe("high")
        expect(result.assignee).toBe("john@example.com")
        expect(result.modifiedOn).toBe(1706500000000)
      })
    )
  })

  describe("IssueSchema", () => {
        it.effect("parses minimal issue", () =>
      Effect.gen(function* () {
        const result = yield* parseIssue({
          identifier: "HULY-123",
          title: "Fix bug",
          status: "Open",
          project: "HULY",
        })
        expect(result.identifier).toBe("HULY-123")
        expect(result.project).toBe("HULY")
      })
    )

        it.effect("parses full issue", () =>
      Effect.gen(function* () {
        const result = yield* parseIssue({
          identifier: "HULY-123",
          title: "Fix bug",
          description: "# Description\n\nFix the bug",
          status: "Open",
          priority: "urgent",
          assignee: "john@example.com",
          assigneeRef: { id: "person-1", name: "John" },
          labels: [{ title: "bug", color: 1 }],
          project: "HULY",
          modifiedOn: 1706500000000,
          createdOn: 1706400000000,
          dueDate: 1706600000000,
          estimation: 3600000,
        })
        expect(result.identifier).toBe("HULY-123")
        expect(result.title).toBe("Fix bug")
        expect(result.description).toBe("# Description\n\nFix the bug")
        expect(result.status).toBe("Open")
        expect(result.priority).toBe("urgent")
        expect(result.assignee).toBe("john@example.com")
        expect(result.assigneeRef?.name).toBe("John")
        expect(result.labels).toHaveLength(1)
        expect(result.project).toBe("HULY")
        expect(result.modifiedOn).toBe(1706500000000)
        expect(result.createdOn).toBe(1706400000000)
        expect(result.dueDate).toBe(1706600000000)
        expect(result.estimation).toBe(3600000)
      })
    )

        it.effect("handles null dueDate", () =>
      Effect.gen(function* () {
        const result = yield* parseIssue({
          identifier: "HULY-123",
          title: "Fix bug",
          status: "Open",
          project: "HULY",
          dueDate: null,
        })
        expect(result.dueDate).toBeNull()
      })
    )

  })

  describe("ListIssuesParamsSchema", () => {
        it.effect("parses minimal params", () =>
      Effect.gen(function* () {
        const result = yield* parseListIssuesParams({ project: "HULY" })
        expect(result).toEqual({ project: "HULY" })
      })
    )

        it.effect("parses with all options", () =>
      Effect.gen(function* () {
        const result = yield* parseListIssuesParams({
          project: "HULY",
          status: "Open",
          assignee: "john@example.com",
          limit: 50,
        })
        expect(result.project).toBe("HULY")
        expect(result.status).toBe("Open")
        expect(result.assignee).toBe("john@example.com")
        expect(result.limit).toBe(50)
      })
    )

        it.effect("rejects negative limit", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(
          parseListIssuesParams({ project: "HULY", limit: -1 })
        )
        expect(error._tag).toBe("ParseError")
      })
    )

        it.effect("rejects non-integer limit", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(
          parseListIssuesParams({ project: "HULY", limit: 10.5 })
        )
        expect(error._tag).toBe("ParseError")
      })
    )
  })

  describe("GetIssueParamsSchema", () => {
        it.effect("parses valid params", () =>
      Effect.gen(function* () {
        const result = yield* parseGetIssueParams({ project: "HULY", identifier: "HULY-123" })
        expect(result).toEqual({ project: "HULY", identifier: "HULY-123" })
      })
    )

        it.effect("rejects missing identifier", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(
          parseGetIssueParams({ project: "HULY" })
        )
        expect(error._tag).toBe("ParseError")
      })
    )
  })

  describe("CreateIssueParamsSchema", () => {
        it.effect("parses minimal params", () =>
      Effect.gen(function* () {
        const result = yield* parseCreateIssueParams({ project: "HULY", title: "New issue" })
        expect(result).toEqual({ project: "HULY", title: "New issue" })
      })
    )

        it.effect("parses with all options", () =>
      Effect.gen(function* () {
        const result = yield* parseCreateIssueParams({
          project: "HULY",
          title: "New issue",
          description: "Details here",
          priority: "high",
          assignee: "john@example.com",
          status: "Open",
        })
        expect(result.project).toBe("HULY")
        expect(result.title).toBe("New issue")
        expect(result.description).toBe("Details here")
        expect(result.priority).toBe("high")
        expect(result.assignee).toBe("john@example.com")
        expect(result.status).toBe("Open")
      })
    )

        it.effect("rejects empty title", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(
          parseCreateIssueParams({ project: "HULY", title: "   " })
        )
        expect(error._tag).toBe("ParseError")
      })
    )
  })

  describe("UpdateIssueParamsSchema", () => {
        it.effect("parses minimal params", () =>
      Effect.gen(function* () {
        const result = yield* parseUpdateIssueParams({ project: "HULY", identifier: "HULY-123" })
        expect(result).toEqual({ project: "HULY", identifier: "HULY-123" })
      })
    )

        it.effect("parses with update fields", () =>
      Effect.gen(function* () {
        const result = yield* parseUpdateIssueParams({
          project: "HULY",
          identifier: "HULY-123",
          title: "Updated title",
          priority: "low",
          assignee: null,
        })
        expect(result.title).toBe("Updated title")
        expect(result.assignee).toBeNull()
      })
    )
  })

  describe("AddLabelParamsSchema", () => {
        it.effect("parses valid params", () =>
      Effect.gen(function* () {
        const result = yield* parseAddLabelParams({
          project: "HULY",
          identifier: "HULY-123",
          label: "bug",
        })
        expect(result).toEqual({
          project: "HULY",
          identifier: "HULY-123",
          label: "bug",
        })
      })
    )

        it.effect("rejects empty label", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(
          parseAddLabelParams({
            project: "HULY",
            identifier: "HULY-123",
            label: "  ",
          })
        )
        expect(error._tag).toBe("ParseError")
      })
    )
  })

  describe("ListProjectsParamsSchema", () => {
    it.effect("parses empty params", () =>
      Effect.gen(function* () {
        const result = yield* parseListProjectsParams({})
        expect(result).toEqual({})
      })
    )

    it.effect("parses with all options", () =>
      Effect.gen(function* () {
        const result = yield* parseListProjectsParams({
          includeArchived: true,
          limit: 25,
        })
        expect(result).toEqual({
          includeArchived: true,
          limit: 25,
        })
      })
    )

    it.effect("rejects negative limit", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(
          parseListProjectsParams({ limit: -1 })
        )
        expect(error._tag).toBe("ParseError")
      })
    )

    it.effect("rejects non-integer limit", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(
          parseListProjectsParams({ limit: 10.5 })
        )
        expect(error._tag).toBe("ParseError")
      })
    )

    it.effect("rejects zero limit", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(
          parseListProjectsParams({ limit: 0 })
        )
        expect(error._tag).toBe("ParseError")
      })
    )
  })

  describe("JSON Schema Generation", () => {
        it.effect("generates JSON Schema for ListIssuesParams", () =>
      Effect.gen(function* () {
        const schema = listIssuesParamsJsonSchema as JsonSchemaObject
        expect(schema.$schema).toBe("http://json-schema.org/draft-07/schema#")
        expect(schema.type).toBe("object")
        expect(schema.required).toContain("project")
      })
    )

    it.effect("generates JSON Schema for ListProjectsParams", () =>
      Effect.gen(function* () {
        const schema = listProjectsParamsJsonSchema as JsonSchemaObject
        expect(schema.$schema).toBe("http://json-schema.org/draft-07/schema#")
        expect(schema.type).toBe("object")
        // No required fields for list_projects (empty array or undefined)
        expect(schema.required?.length ?? 0).toBe(0)
        expect(schema.properties).toHaveProperty("includeArchived")
        expect(schema.properties).toHaveProperty("limit")
      })
    )

        it.effect("generates JSON Schema for GetIssueParams", () =>
      Effect.gen(function* () {
        const schema = getIssueParamsJsonSchema as JsonSchemaObject
        expect(schema.type).toBe("object")
        expect(schema.required).toContain("project")
        expect(schema.required).toContain("identifier")
      })
    )

        it.effect("generates JSON Schema for CreateIssueParams", () =>
      Effect.gen(function* () {
        const schema = createIssueParamsJsonSchema as JsonSchemaObject
        expect(schema.type).toBe("object")
        expect(schema.required).toContain("project")
        expect(schema.required).toContain("title")
        expect(schema.properties).toHaveProperty("description")
        expect(schema.properties).toHaveProperty("priority")
        expect(schema.properties).toHaveProperty("assignee")
        expect(schema.properties).toHaveProperty("status")
      })
    )

        it.effect("generates JSON Schema for UpdateIssueParams", () =>
      Effect.gen(function* () {
        const schema = updateIssueParamsJsonSchema as JsonSchemaObject
        expect(schema.type).toBe("object")
        expect(schema.required).toContain("project")
        expect(schema.required).toContain("identifier")
      })
    )

        it.effect("generates JSON Schema for AddLabelParams", () =>
      Effect.gen(function* () {
        const schema = addLabelParamsJsonSchema as JsonSchemaObject
        expect(schema.type).toBe("object")
        expect(schema.required).toContain("project")
        expect(schema.required).toContain("identifier")
        expect(schema.required).toContain("label")
      })
    )

        it.effect("makeJsonSchema works with any schema", () =>
      Effect.gen(function* () {
        const customSchema = Schema.Struct({
          name: Schema.String,
          age: Schema.Number,
        })
        const jsonSchema = makeJsonSchema(customSchema) as JsonSchemaObject
        expect(jsonSchema.type).toBe("object")
        expect(jsonSchema.required).toContain("name")
        expect(jsonSchema.required).toContain("age")
      })
    )

        it.effect("schema is valid JSON Schema draft-07", () =>
      Effect.gen(function* () {
        const schema = createIssueParamsJsonSchema as JsonSchemaObject
        expect(schema.$schema).toBe("http://json-schema.org/draft-07/schema#")
        expect(schema.type).toBe("object")
        // additionalProperties should be false for strict validation
        expect((schema as Record<string, unknown>).additionalProperties).toBe(false)
      })
    )
  })

  describe("Type Extraction", () => {
        it.effect("CreateIssueParams type is correctly extracted", () =>
      Effect.gen(function* () {
        const params: CreateIssueParams = {
          project: "TEST",
          title: "New Issue",
          priority: "medium",
        }
        expect(params.title).toBe("New Issue")
      })
    )

        it.effect("UpdateIssueParams type is correctly extracted", () =>
      Effect.gen(function* () {
        const params: UpdateIssueParams = {
          project: "TEST",
          identifier: "TEST-1",
          title: "Updated",
        }
        expect(params.title).toBe("Updated")
      })
    )
  })

  // --- Document Schema Tests ---

  describe("TeamspaceSummarySchema", () => {
    it.effect("parses minimal teamspace", () =>
      Effect.gen(function* () {
        const result = yield* Schema.decodeUnknown(TeamspaceSummarySchema)({
          id: "ts-1",
          name: "My Docs",
          archived: false,
          private: false,
        })
        expect(result).toEqual({
          id: "ts-1",
          name: "My Docs",
          archived: false,
          private: false,
        })
      })
    )

    it.effect("parses with description", () =>
      Effect.gen(function* () {
        const result = yield* Schema.decodeUnknown(TeamspaceSummarySchema)({
          id: "ts-1",
          name: "My Docs",
          description: "Team documentation",
          archived: false,
          private: true,
        })
        expect(result.description).toBe("Team documentation")
        expect(result.private).toBe(true)
      })
    )
  })

  describe("DocumentSummarySchema", () => {
    it.effect("parses minimal document summary", () =>
      Effect.gen(function* () {
        const result = yield* Schema.decodeUnknown(DocumentSummarySchema)({
          id: "doc-1",
          title: "Getting Started",
          teamspace: "My Docs",
        })
        expect(result).toEqual({
          id: "doc-1",
          title: "Getting Started",
          teamspace: "My Docs",
        })
      })
    )

    it.effect("parses with modifiedOn", () =>
      Effect.gen(function* () {
        const result = yield* Schema.decodeUnknown(DocumentSummarySchema)({
          id: "doc-1",
          title: "Getting Started",
          teamspace: "My Docs",
          modifiedOn: 1706500000000,
        })
        expect(result.modifiedOn).toBe(1706500000000)
      })
    )
  })

  describe("DocumentSchema", () => {
    it.effect("parses minimal document", () =>
      Effect.gen(function* () {
        const result = yield* Schema.decodeUnknown(DocumentSchema)({
          id: "doc-1",
          title: "Getting Started",
          teamspace: "My Docs",
        })
        expect(result.id).toBe("doc-1")
        expect(result.title).toBe("Getting Started")
        expect(result.content).toBeUndefined()
      })
    )

    it.effect("parses full document", () =>
      Effect.gen(function* () {
        const result = yield* Schema.decodeUnknown(DocumentSchema)({
          id: "doc-1",
          title: "Getting Started",
          content: "# Welcome\n\nThis is the content.",
          teamspace: "My Docs",
          modifiedOn: 1706500000000,
          createdOn: 1706400000000,
        })
        expect(result.content).toBe("# Welcome\n\nThis is the content.")
        expect(result.modifiedOn).toBe(1706500000000)
        expect(result.createdOn).toBe(1706400000000)
      })
    )
  })

  describe("ListTeamspacesParamsSchema", () => {
    it.effect("parses empty params", () =>
      Effect.gen(function* () {
        const result = yield* parseListTeamspacesParams({})
        expect(result).toEqual({})
      })
    )

    it.effect("parses with all options", () =>
      Effect.gen(function* () {
        const result = yield* parseListTeamspacesParams({
          includeArchived: true,
          limit: 25,
        })
        expect(result.includeArchived).toBe(true)
        expect(result.limit).toBe(25)
      })
    )

    it.effect("rejects limit over 200", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(
          parseListTeamspacesParams({ limit: 201 })
        )
        expect(error._tag).toBe("ParseError")
      })
    )
  })

  describe("ListDocumentsParamsSchema", () => {
    it.effect("parses minimal params", () =>
      Effect.gen(function* () {
        const result = yield* parseListDocumentsParams({ teamspace: "My Docs" })
        expect(result).toEqual({ teamspace: "My Docs" })
      })
    )

    it.effect("parses with limit", () =>
      Effect.gen(function* () {
        const result = yield* parseListDocumentsParams({
          teamspace: "My Docs",
          limit: 100,
        })
        expect(result.limit).toBe(100)
      })
    )

    it.effect("rejects empty teamspace", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(
          parseListDocumentsParams({ teamspace: "  " })
        )
        expect(error._tag).toBe("ParseError")
      })
    )
  })

  describe("GetDocumentParamsSchema", () => {
    it.effect("parses valid params", () =>
      Effect.gen(function* () {
        const result = yield* parseGetDocumentParams({
          teamspace: "My Docs",
          document: "Getting Started",
        })
        expect(result.teamspace).toBe("My Docs")
        expect(result.document).toBe("Getting Started")
      })
    )

    it.effect("rejects missing document", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(
          parseGetDocumentParams({ teamspace: "My Docs" })
        )
        expect(error._tag).toBe("ParseError")
      })
    )
  })

  describe("CreateDocumentParamsSchema", () => {
    it.effect("parses minimal params", () =>
      Effect.gen(function* () {
        const result = yield* parseCreateDocumentParams({
          teamspace: "My Docs",
          title: "New Document",
        })
        expect(result.teamspace).toBe("My Docs")
        expect(result.title).toBe("New Document")
        expect(result.content).toBeUndefined()
      })
    )

    it.effect("parses with content", () =>
      Effect.gen(function* () {
        const result = yield* parseCreateDocumentParams({
          teamspace: "My Docs",
          title: "New Document",
          content: "# Introduction\n\nSome content here.",
        })
        expect(result.content).toBe("# Introduction\n\nSome content here.")
      })
    )

    it.effect("rejects empty title", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(
          parseCreateDocumentParams({
            teamspace: "My Docs",
            title: "   ",
          })
        )
        expect(error._tag).toBe("ParseError")
      })
    )
  })

  describe("UpdateDocumentParamsSchema", () => {
    it.effect("parses minimal params", () =>
      Effect.gen(function* () {
        const result = yield* parseUpdateDocumentParams({
          teamspace: "My Docs",
          document: "Getting Started",
        })
        expect(result.teamspace).toBe("My Docs")
        expect(result.document).toBe("Getting Started")
      })
    )

    it.effect("parses with update fields", () =>
      Effect.gen(function* () {
        const result = yield* parseUpdateDocumentParams({
          teamspace: "My Docs",
          document: "Getting Started",
          title: "Updated Title",
          content: "Updated content",
        })
        expect(result.title).toBe("Updated Title")
        expect(result.content).toBe("Updated content")
      })
    )
  })

  describe("DeleteDocumentParamsSchema", () => {
    it.effect("parses valid params", () =>
      Effect.gen(function* () {
        const result = yield* parseDeleteDocumentParams({
          teamspace: "My Docs",
          document: "Old Document",
        })
        expect(result.teamspace).toBe("My Docs")
        expect(result.document).toBe("Old Document")
      })
    )
  })

  describe("Document JSON Schema Generation", () => {
    it.effect("generates JSON Schema for ListTeamspacesParams", () =>
      Effect.gen(function* () {
        const schema = listTeamspacesParamsJsonSchema as JsonSchemaObject
        expect(schema.$schema).toBe("http://json-schema.org/draft-07/schema#")
        expect(schema.type).toBe("object")
        expect(schema.properties).toHaveProperty("includeArchived")
        expect(schema.properties).toHaveProperty("limit")
      })
    )

    it.effect("generates JSON Schema for ListDocumentsParams", () =>
      Effect.gen(function* () {
        const schema = listDocumentsParamsJsonSchema as JsonSchemaObject
        expect(schema.type).toBe("object")
        expect(schema.required).toContain("teamspace")
      })
    )

    it.effect("generates JSON Schema for GetDocumentParams", () =>
      Effect.gen(function* () {
        const schema = getDocumentParamsJsonSchema as JsonSchemaObject
        expect(schema.type).toBe("object")
        expect(schema.required).toContain("teamspace")
        expect(schema.required).toContain("document")
      })
    )

    it.effect("generates JSON Schema for CreateDocumentParams", () =>
      Effect.gen(function* () {
        const schema = createDocumentParamsJsonSchema as JsonSchemaObject
        expect(schema.type).toBe("object")
        expect(schema.required).toContain("teamspace")
        expect(schema.required).toContain("title")
        expect(schema.properties).toHaveProperty("content")
      })
    )

    it.effect("generates JSON Schema for UpdateDocumentParams", () =>
      Effect.gen(function* () {
        const schema = updateDocumentParamsJsonSchema as JsonSchemaObject
        expect(schema.type).toBe("object")
        expect(schema.required).toContain("teamspace")
        expect(schema.required).toContain("document")
      })
    )

    it.effect("generates JSON Schema for DeleteDocumentParams", () =>
      Effect.gen(function* () {
        const schema = deleteDocumentParamsJsonSchema as JsonSchemaObject
        expect(schema.type).toBe("object")
        expect(schema.required).toContain("teamspace")
        expect(schema.required).toContain("document")
      })
    )
  })

  // --- Time Schema Tests ---

  describe("TimeSpendReportSchema", () => {
    it.effect("parses valid time report", () =>
      Effect.gen(function* () {
        const result = yield* Schema.decodeUnknown(TimeSpendReportSchema)({
          id: "report-1",
          identifier: "TEST-1",
          value: 30,
          description: "Worked on feature",
        })
        expect(result.id).toBe("report-1")
        expect(result.identifier).toBe("TEST-1")
        expect(result.value).toBe(30)
        expect(result.description).toBe("Worked on feature")
      })
    )

    it.effect("parses with optional employee", () =>
      Effect.gen(function* () {
        const result = yield* Schema.decodeUnknown(TimeSpendReportSchema)({
          id: "report-1",
          identifier: "TEST-1",
          employee: "John Doe",
          value: 60,
          description: "Bug fix",
        })
        expect(result.employee).toBe("John Doe")
      })
    )

    it.effect("parses with optional date", () =>
      Effect.gen(function* () {
        const result = yield* Schema.decodeUnknown(TimeSpendReportSchema)({
          id: "report-1",
          identifier: "TEST-1",
          date: 1706500000000,
          value: 45,
          description: "Review",
        })
        expect(result.date).toBe(1706500000000)
      })
    )
  })

  describe("TimeReportSummarySchema", () => {
    it.effect("parses valid summary", () =>
      Effect.gen(function* () {
        const result = yield* Schema.decodeUnknown(TimeReportSummarySchema)({
          identifier: "TEST-1",
          totalTime: 120,
          reports: [],
        })
        expect(result.identifier).toBe("TEST-1")
        expect(result.totalTime).toBe(120)
        expect(result.reports).toHaveLength(0)
      })
    )

    it.effect("parses with estimation and remainingTime", () =>
      Effect.gen(function* () {
        const result = yield* Schema.decodeUnknown(TimeReportSummarySchema)({
          identifier: "TEST-1",
          totalTime: 60,
          estimation: 120,
          remainingTime: 60,
          reports: [],
        })
        expect(result.estimation).toBe(120)
        expect(result.remainingTime).toBe(60)
      })
    )
  })

  describe("LogTimeParamsSchema", () => {
    it.effect("parses minimal params", () =>
      Effect.gen(function* () {
        const result = yield* parseLogTimeParams({
          project: "TEST",
          identifier: "TEST-1",
          value: 30,
        })
        expect(result.project).toBe("TEST")
        expect(result.identifier).toBe("TEST-1")
        expect(result.value).toBe(30)
      })
    )

    it.effect("parses with description", () =>
      Effect.gen(function* () {
        const result = yield* parseLogTimeParams({
          project: "TEST",
          identifier: "TEST-1",
          value: 45,
          description: "Worked on feature",
        })
        expect(result.description).toBe("Worked on feature")
      })
    )

    it.effect("rejects non-positive value", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(
          parseLogTimeParams({
            project: "TEST",
            identifier: "TEST-1",
            value: 0,
          })
        )
        expect(error._tag).toBe("ParseError")
      })
    )

    it.effect("rejects negative value", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(
          parseLogTimeParams({
            project: "TEST",
            identifier: "TEST-1",
            value: -10,
          })
        )
        expect(error._tag).toBe("ParseError")
      })
    )
  })

  describe("GetTimeReportParamsSchema", () => {
    it.effect("parses valid params", () =>
      Effect.gen(function* () {
        const result = yield* parseGetTimeReportParams({
          project: "TEST",
          identifier: "TEST-1",
        })
        expect(result.project).toBe("TEST")
        expect(result.identifier).toBe("TEST-1")
      })
    )

    it.effect("rejects empty project", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(
          parseGetTimeReportParams({
            project: "  ",
            identifier: "TEST-1",
          })
        )
        expect(error._tag).toBe("ParseError")
      })
    )
  })

  describe("ListTimeSpendReportsParamsSchema", () => {
    it.effect("parses empty params", () =>
      Effect.gen(function* () {
        const result = yield* parseListTimeSpendReportsParams({})
        expect(result).toEqual({})
      })
    )

    it.effect("parses with all options", () =>
      Effect.gen(function* () {
        const result = yield* parseListTimeSpendReportsParams({
          project: "TEST",
          from: 1706400000000,
          to: 1706500000000,
          limit: 100,
        })
        expect(result.project).toBe("TEST")
        expect(result.from).toBe(1706400000000)
        expect(result.to).toBe(1706500000000)
        expect(result.limit).toBe(100)
      })
    )

    it.effect("rejects limit over 200", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(
          parseListTimeSpendReportsParams({ limit: 201 })
        )
        expect(error._tag).toBe("ParseError")
      })
    )
  })

  describe("StartTimerParamsSchema", () => {
    it.effect("parses valid params", () =>
      Effect.gen(function* () {
        const result = yield* parseStartTimerParams({
          project: "TEST",
          identifier: "TEST-1",
        })
        expect(result.project).toBe("TEST")
        expect(result.identifier).toBe("TEST-1")
      })
    )
  })

  describe("StopTimerParamsSchema", () => {
    it.effect("parses valid params", () =>
      Effect.gen(function* () {
        const result = yield* parseStopTimerParams({
          project: "TEST",
          identifier: "TEST-1",
        })
        expect(result.project).toBe("TEST")
        expect(result.identifier).toBe("TEST-1")
      })
    )
  })

  describe("Time JSON Schema Generation", () => {
    it.effect("generates JSON Schema for LogTimeParams", () =>
      Effect.gen(function* () {
        const schema = logTimeParamsJsonSchema as JsonSchemaObject
        expect(schema.$schema).toBe("http://json-schema.org/draft-07/schema#")
        expect(schema.type).toBe("object")
        expect(schema.required).toContain("project")
        expect(schema.required).toContain("identifier")
        expect(schema.required).toContain("value")
      })
    )

    it.effect("generates JSON Schema for GetTimeReportParams", () =>
      Effect.gen(function* () {
        const schema = getTimeReportParamsJsonSchema as JsonSchemaObject
        expect(schema.type).toBe("object")
        expect(schema.required).toContain("project")
        expect(schema.required).toContain("identifier")
      })
    )

    it.effect("generates JSON Schema for StartTimerParams", () =>
      Effect.gen(function* () {
        const schema = startTimerParamsJsonSchema as JsonSchemaObject
        expect(schema.type).toBe("object")
        expect(schema.required).toContain("project")
        expect(schema.required).toContain("identifier")
      })
    )

    it.effect("generates JSON Schema for StopTimerParams", () =>
      Effect.gen(function* () {
        const schema = stopTimerParamsJsonSchema as JsonSchemaObject
        expect(schema.type).toBe("object")
        expect(schema.required).toContain("project")
        expect(schema.required).toContain("identifier")
      })
    )
  })
})
