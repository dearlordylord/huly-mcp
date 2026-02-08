import { describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { expect } from "vitest"
import {
  createMilestoneParamsJsonSchema,
  deleteMilestoneParamsJsonSchema,
  getMilestoneParamsJsonSchema,
  listMilestonesParamsJsonSchema,
  MilestoneStatusSchema,
  MilestoneStatusValues,
  parseCreateMilestoneParams,
  parseDeleteMilestoneParams,
  parseGetMilestoneParams,
  parseListMilestonesParams,
  parseMilestone,
  parseMilestoneSummary,
  parseSetIssueMilestoneParams,
  parseUpdateMilestoneParams,
  setIssueMilestoneParamsJsonSchema,
  updateMilestoneParamsJsonSchema
} from "../../../src/domain/schemas.js"

type JsonSchemaObject = {
  $schema?: string
  type?: string
  required?: Array<string>
  properties?: Record<string, { description?: string }>
}

describe("Milestone Schemas", () => {
  describe("MilestoneStatusSchema", () => {
    // test-revizorro: approved
    it.effect("accepts all valid statuses", () =>
      Effect.gen(function*() {
        for (const status of MilestoneStatusValues) {
          const result = yield* Schema.decodeUnknown(MilestoneStatusSchema)(status)
          expect(result).toBe(status)
        }
      }))

    // test-revizorro: approved
    it.effect("rejects invalid status", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          Schema.decodeUnknown(MilestoneStatusSchema)("invalid")
        )
        expect(error._tag).toBe("ParseError")
      }))

    // test-revizorro: approved
    it.effect("rejects empty string", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          Schema.decodeUnknown(MilestoneStatusSchema)("")
        )
        expect(error._tag).toBe("ParseError")
      }))
  })

  describe("MilestoneSummarySchema", () => {
    // test-revizorro: approved
    it.effect("parses minimal milestone summary", () =>
      Effect.gen(function*() {
        const result = yield* parseMilestoneSummary({
          id: "milestone-1",
          label: "Sprint 1",
          status: "planned",
          targetDate: 1706500000000
        })
        expect(result).toEqual({
          id: "milestone-1",
          label: "Sprint 1",
          status: "planned",
          targetDate: 1706500000000
        })
      }))

    // test-revizorro: approved
    it.effect("parses with modifiedOn", () =>
      Effect.gen(function*() {
        const result = yield* parseMilestoneSummary({
          id: "milestone-1",
          label: "Sprint 1",
          status: "in-progress",
          targetDate: 1706500000000,
          modifiedOn: 1706400000000
        })
        expect(result.modifiedOn).toBe(1706400000000)
      }))

    // test-revizorro: approved
    it.effect("rejects missing id", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          parseMilestoneSummary({
            label: "Sprint 1",
            status: "planned",
            targetDate: 1706500000000
          })
        )
        expect(error._tag).toBe("ParseError")
      }))

    // test-revizorro: approved
    it.effect("rejects empty id", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          parseMilestoneSummary({
            id: "  ",
            label: "Sprint 1",
            status: "planned",
            targetDate: 1706500000000
          })
        )
        expect(error._tag).toBe("ParseError")
      }))

    // test-revizorro: approved
    it.effect("rejects invalid status", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          parseMilestoneSummary({
            id: "milestone-1",
            label: "Sprint 1",
            status: "invalid",
            targetDate: 1706500000000
          })
        )
        expect(error._tag).toBe("ParseError")
      }))

    // test-revizorro: approved
    it.effect("rejects negative targetDate", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          parseMilestoneSummary({
            id: "milestone-1",
            label: "Sprint 1",
            status: "planned",
            targetDate: -1
          })
        )
        expect(error._tag).toBe("ParseError")
      }))
  })

  describe("MilestoneSchema", () => {
    // test-revizorro: suspect | incomplete assertions: missing status and targetDate verification despite being required fields
    it.effect("parses minimal milestone", () =>
      Effect.gen(function*() {
        const result = yield* parseMilestone({
          id: "milestone-1",
          label: "Sprint 1",
          status: "planned",
          targetDate: 1706500000000,
          project: "HULY"
        })
        expect(result.id).toBe("milestone-1")
        expect(result.label).toBe("Sprint 1")
        expect(result.project).toBe("HULY")
      }))

    // test-revizorro: approved
    it.effect("parses full milestone", () =>
      Effect.gen(function*() {
        const result = yield* parseMilestone({
          id: "milestone-1",
          label: "Sprint 1",
          description: "First sprint of the project",
          status: "in-progress",
          targetDate: 1706500000000,
          project: "HULY",
          modifiedOn: 1706400000000,
          createdOn: 1706300000000
        })
        expect(result.id).toBe("milestone-1")
        expect(result.label).toBe("Sprint 1")
        expect(result.description).toBe("First sprint of the project")
        expect(result.status).toBe("in-progress")
        expect(result.targetDate).toBe(1706500000000)
        expect(result.project).toBe("HULY")
        expect(result.modifiedOn).toBe(1706400000000)
        expect(result.createdOn).toBe(1706300000000)
      }))

    // test-revizorro: approved
    it.effect("description is optional", () =>
      Effect.gen(function*() {
        const result = yield* parseMilestone({
          id: "milestone-1",
          label: "Sprint 1",
          status: "completed",
          targetDate: 1706500000000,
          project: "HULY"
        })
        expect(result.description).toBeUndefined()
      }))

    // test-revizorro: approved
    it.effect("rejects empty project", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          parseMilestone({
            id: "milestone-1",
            label: "Sprint 1",
            status: "planned",
            targetDate: 1706500000000,
            project: "  "
          })
        )
        expect(error._tag).toBe("ParseError")
      }))
  })

  describe("ListMilestonesParamsSchema", () => {
    // test-revizorro: approved
    it.effect("parses minimal params", () =>
      Effect.gen(function*() {
        const result = yield* parseListMilestonesParams({ project: "HULY" })
        expect(result).toEqual({ project: "HULY" })
      }))

    // test-revizorro: approved
    it.effect("parses with limit", () =>
      Effect.gen(function*() {
        const result = yield* parseListMilestonesParams({
          project: "HULY",
          limit: 25
        })
        expect(result.project).toBe("HULY")
        expect(result.limit).toBe(25)
      }))

    // test-revizorro: approved
    it.effect("rejects empty project", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          parseListMilestonesParams({ project: "  " })
        )
        expect(error._tag).toBe("ParseError")
      }))

    // test-revizorro: approved
    it.effect("rejects missing project", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          parseListMilestonesParams({})
        )
        expect(error._tag).toBe("ParseError")
      }))

    // test-revizorro: approved
    it.effect("rejects negative limit", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          parseListMilestonesParams({ project: "HULY", limit: -1 })
        )
        expect(error._tag).toBe("ParseError")
      }))

    // test-revizorro: approved
    it.effect("rejects zero limit", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          parseListMilestonesParams({ project: "HULY", limit: 0 })
        )
        expect(error._tag).toBe("ParseError")
      }))

    // test-revizorro: approved
    it.effect("rejects non-integer limit", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          parseListMilestonesParams({ project: "HULY", limit: 10.5 })
        )
        expect(error._tag).toBe("ParseError")
      }))

    // test-revizorro: approved
    it.effect("rejects limit over 200", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          parseListMilestonesParams({ project: "HULY", limit: 201 })
        )
        expect(error._tag).toBe("ParseError")
      }))

    // test-revizorro: approved
    it.effect("trims project whitespace", () =>
      Effect.gen(function*() {
        const result = yield* parseListMilestonesParams({ project: "  HULY  " })
        expect(result.project).toBe("HULY")
      }))
  })

  describe("GetMilestoneParamsSchema", () => {
    // test-revizorro: approved
    it.effect("parses valid params", () =>
      Effect.gen(function*() {
        const result = yield* parseGetMilestoneParams({
          project: "HULY",
          milestone: "Sprint 1"
        })
        expect(result.project).toBe("HULY")
        expect(result.milestone).toBe("Sprint 1")
      }))

    // test-revizorro: suspect | incomplete assertions: missing project field verification
    it.effect("parses with milestone ID", () =>
      Effect.gen(function*() {
        const result = yield* parseGetMilestoneParams({
          project: "HULY",
          milestone: "6789abcd"
        })
        expect(result.milestone).toBe("6789abcd")
      }))

    // test-revizorro: approved
    it.effect("rejects missing milestone", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          parseGetMilestoneParams({ project: "HULY" })
        )
        expect(error._tag).toBe("ParseError")
      }))

    // test-revizorro: approved
    it.effect("rejects empty milestone", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          parseGetMilestoneParams({ project: "HULY", milestone: "  " })
        )
        expect(error._tag).toBe("ParseError")
      }))

    // test-revizorro: approved
    it.effect("trims both fields", () =>
      Effect.gen(function*() {
        const result = yield* parseGetMilestoneParams({
          project: "  HULY  ",
          milestone: "  Sprint 1  "
        })
        expect(result.project).toBe("HULY")
        expect(result.milestone).toBe("Sprint 1")
      }))
  })

  describe("CreateMilestoneParamsSchema", () => {
    // test-revizorro: approved
    it.effect("parses minimal params", () =>
      Effect.gen(function*() {
        const result = yield* parseCreateMilestoneParams({
          project: "HULY",
          label: "Sprint 1",
          targetDate: 1706500000000
        })
        expect(result.project).toBe("HULY")
        expect(result.label).toBe("Sprint 1")
        expect(result.targetDate).toBe(1706500000000)
      }))

    // test-revizorro: suspect | incomplete assertions: missing project, label, and targetDate field verification
    it.effect("parses with description", () =>
      Effect.gen(function*() {
        const result = yield* parseCreateMilestoneParams({
          project: "HULY",
          label: "Sprint 1",
          description: "First sprint of Q1",
          targetDate: 1706500000000
        })
        expect(result.description).toBe("First sprint of Q1")
      }))

    // test-revizorro: approved
    it.effect("rejects empty label", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          parseCreateMilestoneParams({
            project: "HULY",
            label: "  ",
            targetDate: 1706500000000
          })
        )
        expect(error._tag).toBe("ParseError")
      }))

    // test-revizorro: approved
    it.effect("rejects missing targetDate", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          parseCreateMilestoneParams({
            project: "HULY",
            label: "Sprint 1"
          })
        )
        expect(error._tag).toBe("ParseError")
      }))

    // test-revizorro: approved
    it.effect("rejects negative targetDate", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          parseCreateMilestoneParams({
            project: "HULY",
            label: "Sprint 1",
            targetDate: -1
          })
        )
        expect(error._tag).toBe("ParseError")
      }))

    // test-revizorro: approved
    it.effect("rejects non-integer targetDate", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          parseCreateMilestoneParams({
            project: "HULY",
            label: "Sprint 1",
            targetDate: 1706500000000.5
          })
        )
        expect(error._tag).toBe("ParseError")
      }))
  })

  describe("UpdateMilestoneParamsSchema", () => {
    // test-revizorro: approved
    it.effect("parses minimal params (no updates)", () =>
      Effect.gen(function*() {
        const result = yield* parseUpdateMilestoneParams({
          project: "HULY",
          milestone: "Sprint 1"
        })
        expect(result.project).toBe("HULY")
        expect(result.milestone).toBe("Sprint 1")
      }))

    // test-revizorro: approved
    it.effect("parses with label update", () =>
      Effect.gen(function*() {
        const result = yield* parseUpdateMilestoneParams({
          project: "HULY",
          milestone: "Sprint 1",
          label: "Sprint 1 - Updated"
        })
        expect(result.label).toBe("Sprint 1 - Updated")
      }))

    // test-revizorro: suspect | incomplete assertions: missing project and milestone field verification
    it.effect("parses with description update", () =>
      Effect.gen(function*() {
        const result = yield* parseUpdateMilestoneParams({
          project: "HULY",
          milestone: "Sprint 1",
          description: "Updated description"
        })
        expect(result.description).toBe("Updated description")
      }))

    // test-revizorro: suspect | incomplete assertions: missing project and milestone field verification
    it.effect("parses with targetDate update", () =>
      Effect.gen(function*() {
        const result = yield* parseUpdateMilestoneParams({
          project: "HULY",
          milestone: "Sprint 1",
          targetDate: 1706600000000
        })
        expect(result.targetDate).toBe(1706600000000)
      }))

    // test-revizorro: suspect | incomplete assertions: missing project and milestone field verification
    it.effect("parses with status update", () =>
      Effect.gen(function*() {
        const result = yield* parseUpdateMilestoneParams({
          project: "HULY",
          milestone: "Sprint 1",
          status: "completed"
        })
        expect(result.status).toBe("completed")
      }))

    // test-revizorro: approved
    it.effect("parses with all updates", () =>
      Effect.gen(function*() {
        const result = yield* parseUpdateMilestoneParams({
          project: "HULY",
          milestone: "Sprint 1",
          label: "Sprint 1 Final",
          description: "Completed sprint",
          targetDate: 1706700000000,
          status: "completed"
        })
        expect(result.label).toBe("Sprint 1 Final")
        expect(result.description).toBe("Completed sprint")
        expect(result.targetDate).toBe(1706700000000)
        expect(result.status).toBe("completed")
      }))

    // test-revizorro: approved
    it.effect("rejects invalid status", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          parseUpdateMilestoneParams({
            project: "HULY",
            milestone: "Sprint 1",
            status: "invalid"
          })
        )
        expect(error._tag).toBe("ParseError")
      }))

    // test-revizorro: approved
    it.effect("rejects empty label update", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          parseUpdateMilestoneParams({
            project: "HULY",
            milestone: "Sprint 1",
            label: "  "
          })
        )
        expect(error._tag).toBe("ParseError")
      }))
  })

  describe("SetIssueMilestoneParamsSchema", () => {
    // test-revizorro: approved
    it.effect("parses with milestone assignment", () =>
      Effect.gen(function*() {
        const result = yield* parseSetIssueMilestoneParams({
          project: "HULY",
          identifier: "HULY-123",
          milestone: "Sprint 1"
        })
        expect(result.project).toBe("HULY")
        expect(result.identifier).toBe("HULY-123")
        expect(result.milestone).toBe("Sprint 1")
      }))

    // test-revizorro: approved
    it.effect("parses with null to clear milestone", () =>
      Effect.gen(function*() {
        const result = yield* parseSetIssueMilestoneParams({
          project: "HULY",
          identifier: "HULY-123",
          milestone: null
        })
        expect(result.milestone).toBeNull()
      }))

    // test-revizorro: approved
    it.effect("rejects missing milestone field", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          parseSetIssueMilestoneParams({
            project: "HULY",
            identifier: "HULY-123"
          })
        )
        expect(error._tag).toBe("ParseError")
      }))

    // test-revizorro: approved
    it.effect("rejects empty identifier", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          parseSetIssueMilestoneParams({
            project: "HULY",
            identifier: "  ",
            milestone: "Sprint 1"
          })
        )
        expect(error._tag).toBe("ParseError")
      }))

    // test-revizorro: approved
    it.effect("trims identifier and project", () =>
      Effect.gen(function*() {
        const result = yield* parseSetIssueMilestoneParams({
          project: "  HULY  ",
          identifier: "  HULY-123  ",
          milestone: "Sprint 1"
        })
        expect(result.project).toBe("HULY")
        expect(result.identifier).toBe("HULY-123")
      }))
  })

  describe("DeleteMilestoneParamsSchema", () => {
    // test-revizorro: approved
    it.effect("parses valid params", () =>
      Effect.gen(function*() {
        const result = yield* parseDeleteMilestoneParams({
          project: "HULY",
          milestone: "Sprint 1"
        })
        expect(result.project).toBe("HULY")
        expect(result.milestone).toBe("Sprint 1")
      }))

    // test-revizorro: approved
    it.effect("rejects empty project", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          parseDeleteMilestoneParams({
            project: "  ",
            milestone: "Sprint 1"
          })
        )
        expect(error._tag).toBe("ParseError")
      }))

    // test-revizorro: approved
    it.effect("rejects empty milestone", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          parseDeleteMilestoneParams({
            project: "HULY",
            milestone: "  "
          })
        )
        expect(error._tag).toBe("ParseError")
      }))
  })

  describe("JSON Schema Generation", () => {
    // test-revizorro: approved
    it.effect("generates JSON Schema for ListMilestonesParams", () =>
      Effect.gen(function*() {
        const schema = listMilestonesParamsJsonSchema as JsonSchemaObject
        expect(schema.$schema).toBe("http://json-schema.org/draft-07/schema#")
        expect(schema.type).toBe("object")
        expect(schema.required).toContain("project")
        expect(schema.properties).toHaveProperty("limit")
      }))

    // test-revizorro: approved
    it.effect("generates JSON Schema for GetMilestoneParams", () =>
      Effect.gen(function*() {
        const schema = getMilestoneParamsJsonSchema as JsonSchemaObject
        expect(schema.type).toBe("object")
        expect(schema.required).toContain("project")
        expect(schema.required).toContain("milestone")
      }))

    // test-revizorro: approved
    it.effect("generates JSON Schema for CreateMilestoneParams", () =>
      Effect.gen(function*() {
        const schema = createMilestoneParamsJsonSchema as JsonSchemaObject
        expect(schema.type).toBe("object")
        expect(schema.required).toContain("project")
        expect(schema.required).toContain("label")
        expect(schema.required).toContain("targetDate")
        expect(schema.properties).toHaveProperty("description")
      }))

    // test-revizorro: approved
    it.effect("generates JSON Schema for UpdateMilestoneParams", () =>
      Effect.gen(function*() {
        const schema = updateMilestoneParamsJsonSchema as JsonSchemaObject
        expect(schema.type).toBe("object")
        expect(schema.required).toContain("project")
        expect(schema.required).toContain("milestone")
        expect(schema.properties).toHaveProperty("label")
        expect(schema.properties).toHaveProperty("description")
        expect(schema.properties).toHaveProperty("targetDate")
        expect(schema.properties).toHaveProperty("status")
      }))

    // test-revizorro: approved
    it.effect("generates JSON Schema for SetIssueMilestoneParams", () =>
      Effect.gen(function*() {
        const schema = setIssueMilestoneParamsJsonSchema as JsonSchemaObject
        expect(schema.type).toBe("object")
        expect(schema.required).toContain("project")
        expect(schema.required).toContain("identifier")
        expect(schema.required).toContain("milestone")
      }))

    // test-revizorro: approved
    it.effect("generates JSON Schema for DeleteMilestoneParams", () =>
      Effect.gen(function*() {
        const schema = deleteMilestoneParamsJsonSchema as JsonSchemaObject
        expect(schema.type).toBe("object")
        expect(schema.required).toContain("project")
        expect(schema.required).toContain("milestone")
      }))

    // test-revizorro: approved
    it.effect("all JSON schemas use draft-07", () =>
      Effect.gen(function*() {
        const schemas = [
          listMilestonesParamsJsonSchema,
          getMilestoneParamsJsonSchema,
          createMilestoneParamsJsonSchema,
          updateMilestoneParamsJsonSchema,
          setIssueMilestoneParamsJsonSchema,
          deleteMilestoneParamsJsonSchema
        ] as Array<JsonSchemaObject>

        for (const schema of schemas) {
          expect(schema.$schema).toBe("http://json-schema.org/draft-07/schema#")
        }
      }))

    // test-revizorro: suspect | Tests for additionalProperties: false but schemas don't set it (missing jsonSchema annotations like in shared.ts EmptyParamsSchema)
    it.effect("all JSON schemas have additionalProperties false", () =>
      Effect.gen(function*() {
        // eslint-disable-next-line no-restricted-syntax -- tuple type doesn't overlap with Array<Record<string, unknown>>
        const schemas = [
          listMilestonesParamsJsonSchema,
          getMilestoneParamsJsonSchema,
          createMilestoneParamsJsonSchema,
          updateMilestoneParamsJsonSchema,
          setIssueMilestoneParamsJsonSchema,
          deleteMilestoneParamsJsonSchema
        ] as unknown as Array<Record<string, unknown>>

        for (const schema of schemas) {
          expect(schema.additionalProperties).toBe(false)
        }
      }))
  })
})
