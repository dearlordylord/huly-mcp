import { describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { expect } from "vitest"
import {
  addLabelParamsJsonSchema,
  cancelExecutionParamsJsonSchema,
  createDocumentParamsJsonSchema,
  createIssueParamsJsonSchema,
  deleteDocumentParamsJsonSchema,
  editDocumentParamsJsonSchema,
  getDocumentParamsJsonSchema,
  getIssueParamsJsonSchema,
  getTimeReportParamsJsonSchema,
  IssuePrioritySchema,
  IssuePriorityValues,
  LabelSchema,
  listDocumentsParamsJsonSchema,
  listIssuesParamsJsonSchema,
  listProjectsParamsJsonSchema,
  listTeamspacesParamsJsonSchema,
  logTimeParamsJsonSchema,
  parseAddLabelParams,
  parseCancelExecutionParams,
  parseCreateDocumentParams,
  parseCreateIssueParams,
  parseDeleteDocumentParams,
  parseEditDocumentParams,
  parseGetDocumentParams,
  parseGetIssueParams,
  parseGetTimeReportParams,
  parseIssue,
  parseIssueSummary,
  parseListDocumentsParams,
  parseListIssuesParams,
  parseListProjectsParams,
  parseListTeamspacesParams,
  parseListTimeSpendReportsParams,
  parseLogTimeParams,
  parseProject,
  parseStartProcessParams,
  parseStartTimerParams,
  parseStopTimerParams,
  parseUpdateCardParams,
  parseUpdateGuestSettingsParams,
  parseUpdateIssueParams,
  parseUpdateTestPlanParams,
  parseUpdateTestResultParams,
  parseUpdateTestRunParams,
  parseUpdateUserProfileParams,
  startProcessParamsJsonSchema,
  startTimerParamsJsonSchema,
  stopTimerParamsJsonSchema,
  updateCardParamsJsonSchema,
  updateGuestSettingsParamsJsonSchema,
  updateIssueParamsJsonSchema,
  updateTestPlanParamsJsonSchema,
  updateTestResultParamsJsonSchema,
  updateTestRunParamsJsonSchema,
  updateUserProfileParamsJsonSchema
} from "../../src/domain/schemas.js"
import { PersonRefSchema } from "../../src/domain/schemas/issues.js"
import { assertExists } from "../../src/utils/assertions.js"

// Helper type for JSON Schema assertions
type JsonSchemaObject = {
  $schema?: string
  type?: string
  required?: Array<string>
  anyOf?: Array<{ required?: Array<string> }>
  allOf?: Array<{
    if?: { required?: Array<string> }
    then?: { required?: Array<string> }
    not?: { anyOf?: Array<{ required?: Array<string> }> }
  }>
  properties?: Record<string, { description?: string; enum?: Array<string>; pattern?: string; type?: string }>
}

const isJsonSchemaObject = (schema: unknown): schema is JsonSchemaObject =>
  typeof schema === "object" && schema !== null

const expectJsonSchemaObject = (schema: unknown): JsonSchemaObject => {
  if (isJsonSchemaObject(schema)) return schema
  throw new Error("Expected JSON schema object")
}

const expectJsonSchemaProperties = (schema: JsonSchemaObject): NonNullable<JsonSchemaObject["properties"]> => {
  if (schema.properties !== undefined) return schema.properties
  throw new Error("Expected JSON schema properties")
}

describe("Domain Schemas", () => {
  describe("IssuePrioritySchema", () => {
    it.effect("accepts valid priorities", () =>
      Effect.gen(function*() {
        for (const priority of IssuePriorityValues) {
          const result = yield* Schema.decodeUnknown(IssuePrioritySchema)(priority)
          expect(result).toBe(priority)
        }
      }))

    it.effect("rejects invalid priority", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          Schema.decodeUnknown(IssuePrioritySchema)("invalid")
        )
        expect(error._tag).toBe("ParseError")
      }))

    it.effect("normalizes no_priority to no-priority", () =>
      Effect.gen(function*() {
        const result = yield* Schema.decodeUnknown(IssuePrioritySchema)("no_priority")
        expect(result).toBe("no-priority")
      }))

    it.effect("normalizes NoPriority to no-priority", () =>
      Effect.gen(function*() {
        const result = yield* Schema.decodeUnknown(IssuePrioritySchema)("NoPriority")
        expect(result).toBe("no-priority")
      }))

    it.effect("normalizes No Priority to no-priority", () =>
      Effect.gen(function*() {
        const result = yield* Schema.decodeUnknown(IssuePrioritySchema)("No Priority")
        expect(result).toBe("no-priority")
      }))

    it.effect("normalizes NO-PRIORITY to no-priority", () =>
      Effect.gen(function*() {
        const result = yield* Schema.decodeUnknown(IssuePrioritySchema)("NO-PRIORITY")
        expect(result).toBe("no-priority")
      }))

    it.effect("normalizes URGENT to urgent", () =>
      Effect.gen(function*() {
        const result = yield* Schema.decodeUnknown(IssuePrioritySchema)("URGENT")
        expect(result).toBe("urgent")
      }))

    it.effect("normalizes High to high", () =>
      Effect.gen(function*() {
        const result = yield* Schema.decodeUnknown(IssuePrioritySchema)("High")
        expect(result).toBe("high")
      }))

    it.effect("JSON schema preserves enum values", () =>
      Effect.gen(function*() {
        const schema = expectJsonSchemaObject(createIssueParamsJsonSchema)
        const priorityProp = schema.properties?.priority
        expect(priorityProp).toBeDefined()
        expect(priorityProp?.enum).toEqual(["urgent", "high", "medium", "low", "no-priority"])
      }))
  })

  describe("LabelSchema", () => {
    it.effect("parses label with title only", () =>
      Effect.gen(function*() {
        const result = yield* Schema.decodeUnknown(LabelSchema)({ title: "bug" })
        expect(result).toEqual({ title: "bug" })
      }))

    it.effect("parses label with title and color", () =>
      Effect.gen(function*() {
        const result = yield* Schema.decodeUnknown(LabelSchema)({ title: "feature", color: 5 })
        expect(result).toEqual({ title: "feature", color: 5 })
      }))

    it.effect("rejects empty title", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          Schema.decodeUnknown(LabelSchema)({ title: "  " })
        )
        expect(error._tag).toBe("ParseError")
      }))
  })

  describe("PersonRefSchema", () => {
    it.effect("parses with id only", () =>
      Effect.gen(function*() {
        const result = yield* Schema.decodeUnknown(PersonRefSchema)({ id: "person-123" })
        expect(result).toEqual({ id: "person-123" })
      }))

    it.effect("parses with all fields", () =>
      Effect.gen(function*() {
        const result = yield* Schema.decodeUnknown(PersonRefSchema)({
          id: "person-123",
          name: "John Doe",
          email: "john@example.com"
        })
        expect(result).toEqual({
          id: "person-123",
          name: "John Doe",
          email: "john@example.com"
        })
      }))
  })

  describe("Process write schemas", () => {
    it.effect("parses start_process params and exposes required JSON schema fields", () =>
      Effect.gen(function*() {
        const parsed = yield* parseStartProcessParams({
          process: "Approval",
          card: "Contract"
        })
        expect(parsed).toEqual({
          process: "Approval",
          card: "Contract"
        })

        const schema = startProcessParamsJsonSchema as JsonSchemaObject
        expect(schema.required).toEqual(["process", "card"])
        expect(schema.properties?.process).toBeDefined()
        expect(schema.properties?.card).toBeDefined()
      }))

    it.effect("parses cancel_execution params and exposes required JSON schema fields", () =>
      Effect.gen(function*() {
        const parsed = yield* parseCancelExecutionParams({
          execution: "execution-1"
        })
        expect(parsed).toEqual({
          execution: "execution-1"
        })

        const schema = cancelExecutionParamsJsonSchema as JsonSchemaObject
        expect(schema.required).toEqual(["execution"])
        expect(schema.properties?.execution).toBeDefined()
      }))
  })

  describe("ProjectSchema", () => {
    it.effect("parses full project", () =>
      Effect.gen(function*() {
        const result = yield* parseProject({
          identifier: "HULY",
          name: "Huly Project",
          description: "Main project",
          archived: false,
          defaultStatus: "Open",
          statuses: ["Open", "In Progress", "Done"]
        })
        expect(result.identifier).toBe("HULY")
        expect(result.name).toBe("Huly Project")
        expect(result.description).toBe("Main project")
        expect(result.archived).toBe(false)
        expect(result.defaultStatus).toBe("Open")
        expect(result.statuses).toEqual(["Open", "In Progress", "Done"])
      }))
  })

  describe("IssueSummarySchema", () => {
    it.effect("parses minimal issue summary", () =>
      Effect.gen(function*() {
        const result = yield* parseIssueSummary({
          issueId: "issue-123",
          identifier: "HULY-123",
          title: "Fix bug",
          status: "Open"
        })
        expect(result).toEqual({
          issueId: "issue-123",
          identifier: "HULY-123",
          title: "Fix bug",
          status: "Open"
        })
      }))

    it.effect("parses with all optional fields", () =>
      Effect.gen(function*() {
        const result = yield* parseIssueSummary({
          issueId: "issue-123",
          identifier: "HULY-123",
          title: "Fix bug",
          status: "Open",
          priority: "high",
          assignee: "john@example.com",
          modifiedOn: 1706500000000
        })
        expect(result.priority).toBe("high")
        expect(result.assignee).toBe("john@example.com")
        expect(result.modifiedOn).toBe(1706500000000)
      }))
  })

  describe("IssueSchema", () => {
    it.effect("parses minimal issue", () =>
      Effect.gen(function*() {
        const result = yield* parseIssue({
          issueId: "issue-123",
          identifier: "HULY-123",
          title: "Fix bug",
          status: "Open",
          project: "HULY"
        })
        expect(result.identifier).toBe("HULY-123")
        expect(result.title).toBe("Fix bug")
        expect(result.status).toBe("Open")
        expect(result.project).toBe("HULY")
      }))

    it.effect("parses full issue", () =>
      Effect.gen(function*() {
        const result = yield* parseIssue({
          issueId: "issue-123",
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
          estimation: 3600000
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
      }))

    it.effect("handles null dueDate", () =>
      Effect.gen(function*() {
        const result = yield* parseIssue({
          issueId: "issue-123",
          identifier: "HULY-123",
          title: "Fix bug",
          status: "Open",
          project: "HULY",
          dueDate: null
        })
        expect(result.dueDate).toBeNull()
      }))
  })

  describe("ListIssuesParamsSchema", () => {
    it.effect("parses minimal params", () =>
      Effect.gen(function*() {
        const result = yield* parseListIssuesParams({ project: "HULY" })
        expect(result).toEqual({ project: "HULY" })
      }))

    it.effect("parses with all options", () =>
      Effect.gen(function*() {
        const result = yield* parseListIssuesParams({
          project: "HULY",
          status: "Open",
          statusCategory: undefined,
          assignee: "john@example.com",
          limit: 50
        })
        expect(result.project).toBe("HULY")
        expect(result.status).toBe("Open")
        expect(result.statusCategory).toBeUndefined()
        expect(result.assignee).toBe("john@example.com")
        expect(result.limit).toBe(50)
      }))

    it.effect("parses statusCategory as a Huly workflow category", () =>
      Effect.gen(function*() {
        const result = yield* parseListIssuesParams({
          project: "HULY",
          statusCategory: "active"
        })
        expect(result.statusCategory).toBe("Active")
      }))

    it.effect("rejects invented statusCategory values", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          parseListIssuesParams({ project: "HULY", statusCategory: "open" })
        )
        expect(error._tag).toBe("ParseError")
      }))

    it.effect("rejects status and statusCategory together", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          parseListIssuesParams({ project: "HULY", status: "Open", statusCategory: "Active" })
        )
        expect(error._tag).toBe("ParseError")
      }))

    it.effect("rejects negative limit", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          parseListIssuesParams({ project: "HULY", limit: -1 })
        )
        expect(error._tag).toBe("ParseError")
      }))

    it.effect("rejects non-integer limit", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          parseListIssuesParams({ project: "HULY", limit: 10.5 })
        )
        expect(error._tag).toBe("ParseError")
      }))

    it.effect("accepts assignee as a display name (not just an email)", () =>
      Effect.gen(function*() {
        const result = yield* parseListIssuesParams({
          project: "HULY",
          assignee: "Braeden Bihag"
        })
        expect(result.assignee).toBe("Braeden Bihag")
      }))
  })

  describe("GetIssueParamsSchema", () => {
    it.effect("parses valid params", () =>
      Effect.gen(function*() {
        const result = yield* parseGetIssueParams({ project: "HULY", identifier: "HULY-123" })
        expect(result).toEqual({ project: "HULY", identifier: "HULY-123" })
      }))

    it.effect("rejects missing identifier", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          parseGetIssueParams({ project: "HULY" })
        )
        expect(error._tag).toBe("ParseError")
      }))
  })

  describe("CreateIssueParamsSchema", () => {
    it.effect("parses minimal params", () =>
      Effect.gen(function*() {
        const result = yield* parseCreateIssueParams({ project: "HULY", title: "New issue" })
        expect(result).toEqual({ project: "HULY", title: "New issue" })
      }))

    it.effect("parses with all options", () =>
      Effect.gen(function*() {
        const result = yield* parseCreateIssueParams({
          project: "HULY",
          title: "New issue",
          description: "Details here",
          priority: "high",
          assignee: "john@example.com",
          status: "Open"
        })
        expect(result.project).toBe("HULY")
        expect(result.title).toBe("New issue")
        expect(result.description).toBe("Details here")
        expect(result.priority).toBe("high")
        expect(result.assignee).toBe("john@example.com")
        expect(result.status).toBe("Open")
      }))

    it.effect("rejects empty title", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          parseCreateIssueParams({ project: "HULY", title: "   " })
        )
        expect(error._tag).toBe("ParseError")
      }))
  })

  describe("UpdateIssueParamsSchema", () => {
    it.effect("rejects minimal params and advertises update-field requirement in JSON Schema", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(parseUpdateIssueParams({ project: "HULY", identifier: "HULY-123" }))
        expect(error._tag).toBe("ParseError")

        const schema = expectJsonSchemaObject(updateIssueParamsJsonSchema)
        expect(schema.anyOf).toEqual(
          expect.arrayContaining([
            { required: ["title"] },
            { required: ["description"] },
            { required: ["priority"] },
            { required: ["assignee"] },
            { required: ["status"] },
            { required: ["taskType"] },
            { required: ["dueDate"] },
            { required: ["estimation"] }
          ])
        )
      }))

    it.effect("parses with update fields", () =>
      Effect.gen(function*() {
        const result = yield* parseUpdateIssueParams({
          project: "HULY",
          identifier: "HULY-123",
          title: "Updated title",
          priority: "low",
          assignee: null
        })
        expect(result.title).toBe("Updated title")
        expect(result.assignee).toBeNull()
      }))
  })

  describe("Other update schemas", () => {
    it.effect("card updates reject minimal params and advertise update-field requirement", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(parseUpdateCardParams({ cardSpace: "Cards", card: "Roadmap" }))
        expect(error._tag).toBe("ParseError")

        const schema = expectJsonSchemaObject(updateCardParamsJsonSchema)
        expect(schema.anyOf).toEqual(
          expect.arrayContaining([{ required: ["title"] }, { required: ["content"] }])
        )
      }))

    it.effect("workspace updates reject minimal params and advertise update-field requirement", () =>
      Effect.gen(function*() {
        const profileError = yield* Effect.flip(parseUpdateUserProfileParams({}))
        const guestSettingsError = yield* Effect.flip(parseUpdateGuestSettingsParams({}))
        expect(profileError._tag).toBe("ParseError")
        expect(guestSettingsError._tag).toBe("ParseError")

        const profileSchema = expectJsonSchemaObject(updateUserProfileParamsJsonSchema)
        expect(profileSchema.anyOf).toEqual(
          expect.arrayContaining([
            { required: ["bio"] },
            { required: ["city"] },
            { required: ["country"] },
            { required: ["website"] },
            { required: ["socialLinks"] },
            { required: ["isPublic"] }
          ])
        )

        const guestSettingsSchema = expectJsonSchemaObject(updateGuestSettingsParamsJsonSchema)
        expect(guestSettingsSchema.anyOf).toEqual(
          expect.arrayContaining([{ required: ["allowReadOnly"] }, { required: ["allowSignUp"] }])
        )
      }))

    it.effect("test-management updates reject minimal params and advertise update-field requirement", () =>
      Effect.gen(function*() {
        const planError = yield* Effect.flip(parseUpdateTestPlanParams({ project: "QA", plan: "Regression" }))
        const runError = yield* Effect.flip(parseUpdateTestRunParams({ project: "QA", run: "Nightly" }))
        const resultError = yield* Effect.flip(
          parseUpdateTestResultParams({ project: "QA", result: "Login result" })
        )
        expect(planError._tag).toBe("ParseError")
        expect(runError._tag).toBe("ParseError")
        expect(resultError._tag).toBe("ParseError")

        const planSchema = expectJsonSchemaObject(updateTestPlanParamsJsonSchema)
        expect(planSchema.anyOf).toEqual(
          expect.arrayContaining([{ required: ["name"] }, { required: ["description"] }])
        )

        const runSchema = expectJsonSchemaObject(updateTestRunParamsJsonSchema)
        expect(runSchema.anyOf).toEqual(
          expect.arrayContaining([
            { required: ["name"] },
            { required: ["description"] },
            { required: ["dueDate"] }
          ])
        )

        const resultSchema = expectJsonSchemaObject(updateTestResultParamsJsonSchema)
        expect(resultSchema.anyOf).toEqual(
          expect.arrayContaining([
            { required: ["status"] },
            { required: ["assignee"] },
            { required: ["description"] }
          ])
        )
      }))
  })

  describe("AddLabelParamsSchema", () => {
    it.effect("parses valid params", () =>
      Effect.gen(function*() {
        const result = yield* parseAddLabelParams({
          project: "HULY",
          identifier: "HULY-123",
          label: "bug"
        })
        expect(result).toEqual({
          project: "HULY",
          identifier: "HULY-123",
          label: "bug"
        })
      }))

    it.effect("rejects empty label", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          parseAddLabelParams({
            project: "HULY",
            identifier: "HULY-123",
            label: "  "
          })
        )
        expect(error._tag).toBe("ParseError")
      }))
  })

  describe("ListProjectsParamsSchema", () => {
    it.effect("parses empty params", () =>
      Effect.gen(function*() {
        const result = yield* parseListProjectsParams({})
        expect(result).toEqual({})
      }))

    it.effect("parses with all options", () =>
      Effect.gen(function*() {
        const result = yield* parseListProjectsParams({
          includeArchived: true,
          limit: 25
        })
        expect(result).toEqual({
          includeArchived: true,
          limit: 25
        })
      }))

    it.effect("rejects negative limit", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          parseListProjectsParams({ limit: -1 })
        )
        expect(error._tag).toBe("ParseError")
      }))

    it.effect("rejects non-integer limit", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          parseListProjectsParams({ limit: 10.5 })
        )
        expect(error._tag).toBe("ParseError")
      }))

    it.effect("rejects zero limit", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          parseListProjectsParams({ limit: 0 })
        )
        expect(error._tag).toBe("ParseError")
      }))
  })

  describe("JSON Schema Generation", () => {
    it.effect("generates JSON Schema for ListIssuesParams", () =>
      Effect.gen(function*() {
        const schema = expectJsonSchemaObject(listIssuesParamsJsonSchema)
        expect(schema.$schema).toBe("http://json-schema.org/draft-07/schema#")
        expect(schema.type).toBe("object")
        expect(schema.required).toContain("project")
      }))

    it.effect("generates JSON Schema for ListProjectsParams", () =>
      Effect.gen(function*() {
        const schema = expectJsonSchemaObject(listProjectsParamsJsonSchema)
        expect(schema.$schema).toBe("http://json-schema.org/draft-07/schema#")
        expect(schema.type).toBe("object")
        // No required fields for list_projects (empty array or undefined)
        expect(schema.required?.length ?? 0).toBe(0)
        expect(schema.properties).toHaveProperty("includeArchived")
        expect(schema.properties).toHaveProperty("limit")
      }))

    it.effect("generates JSON Schema for GetIssueParams", () =>
      Effect.gen(function*() {
        const schema = expectJsonSchemaObject(getIssueParamsJsonSchema)
        expect(schema.type).toBe("object")
        expect(schema.required).toContain("project")
        expect(schema.required).toContain("identifier")
      }))

    it.effect("generates JSON Schema for CreateIssueParams", () =>
      Effect.gen(function*() {
        const schema = expectJsonSchemaObject(createIssueParamsJsonSchema)
        expect(schema.type).toBe("object")
        expect(schema.required).toContain("project")
        expect(schema.required).toContain("title")
        expect(schema.properties).toHaveProperty("description")
        expect(schema.properties).toHaveProperty("priority")
        expect(schema.properties).toHaveProperty("assignee")
        expect(schema.properties).toHaveProperty("status")
        expect(schema.properties).toHaveProperty("parentIssue")
      }))

    it.effect("generates JSON Schema for UpdateIssueParams", () =>
      Effect.gen(function*() {
        const schema = expectJsonSchemaObject(updateIssueParamsJsonSchema)
        expect(schema.type).toBe("object")
        expect(schema.required).toContain("project")
        expect(schema.required).toContain("identifier")
      }))

    it.effect("generates JSON Schema for AddLabelParams", () =>
      Effect.gen(function*() {
        const schema = expectJsonSchemaObject(addLabelParamsJsonSchema)
        expect(schema.type).toBe("object")
        expect(schema.required).toContain("project")
        expect(schema.required).toContain("identifier")
        expect(schema.required).toContain("label")
      }))

    it.effect("schema is valid JSON Schema draft-07", () =>
      Effect.gen(function*() {
        const schema = expectJsonSchemaObject(createIssueParamsJsonSchema)
        expect(schema.$schema).toBe("http://json-schema.org/draft-07/schema#")
        expect(schema.type).toBe("object")
        // additionalProperties should be false for strict validation
        expect((schema as Record<string, unknown>).additionalProperties).toBe(false)
      }))
  })

  // --- Document Schema Tests ---

  describe("ListTeamspacesParamsSchema", () => {
    it.effect("parses empty params", () =>
      Effect.gen(function*() {
        const result = yield* parseListTeamspacesParams({})
        expect(result).toEqual({})
      }))

    it.effect("parses with all options", () =>
      Effect.gen(function*() {
        const result = yield* parseListTeamspacesParams({
          includeArchived: true,
          limit: 25
        })
        expect(result.includeArchived).toBe(true)
        expect(result.limit).toBe(25)
      }))

    it.effect("rejects limit over 200", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          parseListTeamspacesParams({ limit: 201 })
        )
        expect(error._tag).toBe("ParseError")
      }))
  })

  describe("ListDocumentsParamsSchema", () => {
    it.effect("parses minimal params", () =>
      Effect.gen(function*() {
        const result = yield* parseListDocumentsParams({ teamspace: "My Docs" })
        expect(result).toEqual({ teamspace: "My Docs" })
      }))

    it.effect("parses with limit", () =>
      Effect.gen(function*() {
        const result = yield* parseListDocumentsParams({
          teamspace: "My Docs",
          limit: 100
        })
        expect(result.limit).toBe(100)
      }))

    it.effect("rejects empty teamspace", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          parseListDocumentsParams({ teamspace: "  " })
        )
        expect(error._tag).toBe("ParseError")
      }))
  })

  describe("GetDocumentParamsSchema", () => {
    it.effect("parses valid params", () =>
      Effect.gen(function*() {
        const result = yield* parseGetDocumentParams({
          teamspace: "My Docs",
          document: "Getting Started"
        })
        expect(result.teamspace).toBe("My Docs")
        expect(result.document).toBe("Getting Started")
      }))

    it.effect("rejects missing document", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          parseGetDocumentParams({ teamspace: "My Docs" })
        )
        expect(error._tag).toBe("ParseError")
      }))
  })

  describe("CreateDocumentParamsSchema", () => {
    it.effect("parses minimal params", () =>
      Effect.gen(function*() {
        const result = yield* parseCreateDocumentParams({
          teamspace: "My Docs",
          title: "New Document"
        })
        expect(result.teamspace).toBe("My Docs")
        expect(result.title).toBe("New Document")
        expect(result.content).toBeUndefined()
      }))

    it.effect("parses with content", () =>
      Effect.gen(function*() {
        const result = yield* parseCreateDocumentParams({
          teamspace: "My Docs",
          title: "New Document",
          content: "# Introduction\n\nSome content here."
        })
        expect(result.content).toBe("# Introduction\n\nSome content here.")
      }))

    it.effect("rejects empty title", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          parseCreateDocumentParams({
            teamspace: "My Docs",
            title: "   "
          })
        )
        expect(error._tag).toBe("ParseError")
      }))
  })

  describe("EditDocumentParamsSchema", () => {
    it.effect("rejects minimal params and advertises edit-field requirement in JSON Schema", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          parseEditDocumentParams({
            teamspace: "My Docs",
            document: "Getting Started"
          })
        )
        expect(error._tag).toBe("ParseError")

        const schema = expectJsonSchemaObject(editDocumentParamsJsonSchema)
        expect(schema.anyOf).toEqual(
          expect.arrayContaining([
            { required: ["title"] },
            { required: ["content"] },
            { required: ["old_text", "new_text"] }
          ])
        )
        expect(schema.allOf).toEqual(
          expect.arrayContaining([
            {
              not: {
                anyOf: [
                  { required: ["content", "old_text"] },
                  { required: ["content", "new_text"] }
                ]
              }
            },
            { if: { required: ["old_text"] }, then: { required: ["new_text"] } },
            { if: { required: ["new_text"] }, then: { required: ["old_text"] } },
            { if: { required: ["replace_all"] }, then: { required: ["old_text", "new_text"] } }
          ])
        )
      }))

    it.effect("parses full replace mode", () =>
      Effect.gen(function*() {
        const result = yield* parseEditDocumentParams({
          teamspace: "My Docs",
          document: "Getting Started",
          title: "Updated Title",
          content: "Updated content"
        })
        expect(result.title).toBe("Updated Title")
        expect(result.content).toBe("Updated content")
      }))

    it.effect("parses search-and-replace mode", () =>
      Effect.gen(function*() {
        const result = yield* parseEditDocumentParams({
          teamspace: "My Docs",
          document: "Getting Started",
          old_text: "old stuff",
          new_text: "new stuff"
        })
        expect(result.old_text).toBe("old stuff")
        expect(result.new_text).toBe("new stuff")
      }))

    it.effect("parses search-and-replace with replace_all", () =>
      Effect.gen(function*() {
        const result = yield* parseEditDocumentParams({
          teamspace: "My Docs",
          document: "Getting Started",
          old_text: "foo",
          new_text: "bar",
          replace_all: true
        })
        expect(result.replace_all).toBe(true)
      }))

    it.effect("rejects replace_all outside search-and-replace mode", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          parseEditDocumentParams({
            teamspace: "My Docs",
            document: "Getting Started",
            title: "Updated",
            replace_all: true
          })
        )
        expect(error._tag).toBe("ParseError")
      }))

    it.effect("rejects content + old_text together", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          parseEditDocumentParams({
            teamspace: "My Docs",
            document: "Getting Started",
            content: "full replace",
            old_text: "partial",
            new_text: "edit"
          })
        )
        expect(error._tag).toBe("ParseError")
      }))

    it.effect("rejects old_text without new_text", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          parseEditDocumentParams({
            teamspace: "My Docs",
            document: "Getting Started",
            old_text: "something"
          })
        )
        expect(error._tag).toBe("ParseError")
      }))

    it.effect("rejects empty old_text", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          parseEditDocumentParams({
            teamspace: "My Docs",
            document: "Getting Started",
            old_text: "   ",
            new_text: "replacement"
          })
        )
        expect(error._tag).toBe("ParseError")
      }))
  })

  describe("DeleteDocumentParamsSchema", () => {
    it.effect("parses valid params", () =>
      Effect.gen(function*() {
        const result = yield* parseDeleteDocumentParams({
          teamspace: "My Docs",
          document: "Old Document"
        })
        expect(result.teamspace).toBe("My Docs")
        expect(result.document).toBe("Old Document")
      }))
  })

  describe("Document JSON Schema Generation", () => {
    it.effect("generates JSON Schema for ListTeamspacesParams", () =>
      Effect.gen(function*() {
        const schema = expectJsonSchemaObject(listTeamspacesParamsJsonSchema)
        expect(schema.$schema).toBe("http://json-schema.org/draft-07/schema#")
        expect(schema.type).toBe("object")
        expect(schema.properties).toHaveProperty("includeArchived")
        expect(schema.properties).toHaveProperty("limit")
      }))

    it.effect("generates JSON Schema for ListDocumentsParams", () =>
      Effect.gen(function*() {
        const schema = expectJsonSchemaObject(listDocumentsParamsJsonSchema)
        expect(schema.$schema).toBe("http://json-schema.org/draft-07/schema#")
        expect(schema.type).toBe("object")
        expect(schema.required).toContain("teamspace")
        expect(schema.properties).toHaveProperty("limit")
      }))

    it.effect("generates JSON Schema for GetDocumentParams", () =>
      Effect.gen(function*() {
        const schema = expectJsonSchemaObject(getDocumentParamsJsonSchema)
        expect(schema.type).toBe("object")
        expect(schema.required).toContain("teamspace")
        expect(schema.required).toContain("document")
      }))

    it.effect("generates JSON Schema for CreateDocumentParams", () =>
      Effect.gen(function*() {
        const schema = expectJsonSchemaObject(createDocumentParamsJsonSchema)
        expect(schema.type).toBe("object")
        expect(schema.required).toContain("teamspace")
        expect(schema.required).toContain("title")
        expect(schema.properties).toHaveProperty("content")
      }))

    it.effect("generates JSON Schema for EditDocumentParams", () =>
      Effect.gen(function*() {
        const schema = expectJsonSchemaObject(editDocumentParamsJsonSchema)
        const properties = expectJsonSchemaProperties(schema)
        expect(schema.type).toBe("object")
        expect(schema.required).toContain("teamspace")
        expect(schema.required).toContain("document")
        expect(properties).toHaveProperty("old_text")
        expect(properties).toHaveProperty("new_text")
        expect(properties).toHaveProperty("replace_all")
        expect(properties).toHaveProperty("content")
        expect(assertExists(properties.old_text).pattern).toBe("\\S")
      }))

    it.effect("generates JSON Schema for DeleteDocumentParams", () =>
      Effect.gen(function*() {
        const schema = expectJsonSchemaObject(deleteDocumentParamsJsonSchema)
        expect(schema.type).toBe("object")
        expect(schema.required).toContain("teamspace")
        expect(schema.required).toContain("document")
      }))
  })

  // --- Time Schema Tests ---

  describe("LogTimeParamsSchema", () => {
    it.effect("parses minimal params", () =>
      Effect.gen(function*() {
        const result = yield* parseLogTimeParams({
          project: "TEST",
          identifier: "TEST-1",
          value: 30
        })
        expect(result.project).toBe("TEST")
        expect(result.identifier).toBe("TEST-1")
        expect(result.value).toBe(30)
      }))

    it.effect("parses with description", () =>
      Effect.gen(function*() {
        const result = yield* parseLogTimeParams({
          project: "TEST",
          identifier: "TEST-1",
          value: 45,
          description: "Worked on feature"
        })
        expect(result.description).toBe("Worked on feature")
      }))

    it.effect("rejects non-positive value", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          parseLogTimeParams({
            project: "TEST",
            identifier: "TEST-1",
            value: 0
          })
        )
        expect(error._tag).toBe("ParseError")
      }))

    it.effect("rejects negative value", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          parseLogTimeParams({
            project: "TEST",
            identifier: "TEST-1",
            value: -10
          })
        )
        expect(error._tag).toBe("ParseError")
      }))
  })

  describe("GetTimeReportParamsSchema", () => {
    it.effect("parses valid params", () =>
      Effect.gen(function*() {
        const result = yield* parseGetTimeReportParams({
          project: "TEST",
          identifier: "TEST-1"
        })
        expect(result.project).toBe("TEST")
        expect(result.identifier).toBe("TEST-1")
      }))

    it.effect("rejects empty project", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          parseGetTimeReportParams({
            project: "  ",
            identifier: "TEST-1"
          })
        )
        expect(error._tag).toBe("ParseError")
      }))
  })

  describe("ListTimeSpendReportsParamsSchema", () => {
    it.effect("parses empty params", () =>
      Effect.gen(function*() {
        const result = yield* parseListTimeSpendReportsParams({})
        expect(result).toEqual({})
      }))

    it.effect("parses with all options", () =>
      Effect.gen(function*() {
        const result = yield* parseListTimeSpendReportsParams({
          project: "TEST",
          from: 1706400000000,
          to: 1706500000000,
          limit: 100
        })
        expect(result.project).toBe("TEST")
        expect(result.from).toBe(1706400000000)
        expect(result.to).toBe(1706500000000)
        expect(result.limit).toBe(100)
      }))

    it.effect("rejects limit over 200", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          parseListTimeSpendReportsParams({ limit: 201 })
        )
        expect(error._tag).toBe("ParseError")
      }))
  })

  describe("StartTimerParamsSchema", () => {
    it.effect("parses valid params", () =>
      Effect.gen(function*() {
        const result = yield* parseStartTimerParams({
          project: "TEST",
          identifier: "TEST-1"
        })
        expect(result.project).toBe("TEST")
        expect(result.identifier).toBe("TEST-1")
      }))
  })

  describe("StopTimerParamsSchema", () => {
    it.effect("parses valid params", () =>
      Effect.gen(function*() {
        const result = yield* parseStopTimerParams({
          project: "TEST",
          identifier: "TEST-1"
        })
        expect(result.project).toBe("TEST")
        expect(result.identifier).toBe("TEST-1")
      }))
  })

  describe("Time JSON Schema Generation", () => {
    it.effect("generates JSON Schema for LogTimeParams", () =>
      Effect.gen(function*() {
        const schema = expectJsonSchemaObject(logTimeParamsJsonSchema)
        expect(schema.$schema).toBe("http://json-schema.org/draft-07/schema#")
        expect(schema.type).toBe("object")
        expect(schema.required).toContain("project")
        expect(schema.required).toContain("identifier")
        expect(schema.required).toContain("value")
      }))

    it.effect("generates JSON Schema for GetTimeReportParams", () =>
      Effect.gen(function*() {
        const schema = expectJsonSchemaObject(getTimeReportParamsJsonSchema)
        expect(schema.type).toBe("object")
        expect(schema.required).toContain("project")
        expect(schema.required).toContain("identifier")
      }))

    it.effect("generates JSON Schema for StartTimerParams", () =>
      Effect.gen(function*() {
        const schema = expectJsonSchemaObject(startTimerParamsJsonSchema)
        expect(schema.type).toBe("object")
        expect(schema.required).toContain("project")
        expect(schema.required).toContain("identifier")
      }))

    it.effect("generates JSON Schema for StopTimerParams", () =>
      Effect.gen(function*() {
        const schema = expectJsonSchemaObject(stopTimerParamsJsonSchema)
        expect(schema.type).toBe("object")
        expect(schema.required).toContain("project")
        expect(schema.required).toContain("identifier")
      }))
  })
})
