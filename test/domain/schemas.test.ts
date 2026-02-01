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
  listIssuesParamsJsonSchema,
  listProjectsParamsJsonSchema,
  getIssueParamsJsonSchema,
  createIssueParamsJsonSchema,
  updateIssueParamsJsonSchema,
  addLabelParamsJsonSchema,
  type CreateIssueParams,
  type UpdateIssueParams,
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
    // test-revizorro: approved
    it.effect("accepts valid priorities", () =>
      Effect.gen(function* () {
        for (const priority of IssuePriorityValues) {
          const result = yield* Schema.decodeUnknown(IssuePrioritySchema)(priority)
          expect(result).toBe(priority)
        }
      })
    )

    // test-revizorro: approved
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
    // test-revizorro: approved
    it.effect("parses label with title only", () =>
      Effect.gen(function* () {
        const result = yield* Schema.decodeUnknown(LabelSchema)({ title: "bug" })
        expect(result).toEqual({ title: "bug" })
      })
    )

    // test-revizorro: approved
    it.effect("parses label with title and color", () =>
      Effect.gen(function* () {
        const result = yield* Schema.decodeUnknown(LabelSchema)({ title: "feature", color: 5 })
        expect(result).toEqual({ title: "feature", color: 5 })
      })
    )

    // test-revizorro: approved
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
    // test-revizorro: approved
    it.effect("parses with id only", () =>
      Effect.gen(function* () {
        const result = yield* Schema.decodeUnknown(PersonRefSchema)({ id: "person-123" })
        expect(result).toEqual({ id: "person-123" })
      })
    )

    // test-revizorro: approved
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
    // test-revizorro: approved
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

    // test-revizorro: approved
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
    // test-revizorro: approved
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
    // test-revizorro: approved
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

    // test-revizorro: approved
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
    // test-revizorro: approved
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

    // test-revizorro: approved
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

    // test-revizorro: approved
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
    // test-revizorro: approved
    it.effect("parses minimal params", () =>
      Effect.gen(function* () {
        const result = yield* parseListIssuesParams({ project: "HULY" })
        expect(result).toEqual({ project: "HULY" })
      })
    )

    // test-revizorro: approved
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

    // test-revizorro: approved
    it.effect("rejects negative limit", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(
          parseListIssuesParams({ project: "HULY", limit: -1 })
        )
        expect(error._tag).toBe("ParseError")
      })
    )

    // test-revizorro: approved
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
    // test-revizorro: approved
    it.effect("parses valid params", () =>
      Effect.gen(function* () {
        const result = yield* parseGetIssueParams({ project: "HULY", identifier: "HULY-123" })
        expect(result).toEqual({ project: "HULY", identifier: "HULY-123" })
      })
    )

    // test-revizorro: approved
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
    // test-revizorro: approved
    it.effect("parses minimal params", () =>
      Effect.gen(function* () {
        const result = yield* parseCreateIssueParams({ project: "HULY", title: "New issue" })
        expect(result).toEqual({ project: "HULY", title: "New issue" })
      })
    )

    // test-revizorro: approved
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

    // test-revizorro: approved
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
    // test-revizorro: approved
    it.effect("parses minimal params", () =>
      Effect.gen(function* () {
        const result = yield* parseUpdateIssueParams({ project: "HULY", identifier: "HULY-123" })
        expect(result).toEqual({ project: "HULY", identifier: "HULY-123" })
      })
    )

    // test-revizorro: approved
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
    // test-revizorro: approved
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

    // test-revizorro: approved
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
    // test-revizorro: approved
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

    // test-revizorro: approved
    it.effect("generates JSON Schema for GetIssueParams", () =>
      Effect.gen(function* () {
        const schema = getIssueParamsJsonSchema as JsonSchemaObject
        expect(schema.type).toBe("object")
        expect(schema.required).toContain("project")
        expect(schema.required).toContain("identifier")
      })
    )

    // test-revizorro: approved
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

    // test-revizorro: approved
    it.effect("generates JSON Schema for UpdateIssueParams", () =>
      Effect.gen(function* () {
        const schema = updateIssueParamsJsonSchema as JsonSchemaObject
        expect(schema.type).toBe("object")
        expect(schema.required).toContain("project")
        expect(schema.required).toContain("identifier")
      })
    )

    // test-revizorro: approved
    it.effect("generates JSON Schema for AddLabelParams", () =>
      Effect.gen(function* () {
        const schema = addLabelParamsJsonSchema as JsonSchemaObject
        expect(schema.type).toBe("object")
        expect(schema.required).toContain("project")
        expect(schema.required).toContain("identifier")
        expect(schema.required).toContain("label")
      })
    )

    // test-revizorro: approved
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

    // test-revizorro: approved
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
    // test-revizorro: approved
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

    // test-revizorro: approved
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
})
