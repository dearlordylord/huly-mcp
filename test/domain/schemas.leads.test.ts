import { describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { expect } from "vitest"
import {
  FunnelSummarySchema,
  getLeadParamsJsonSchema,
  LeadDetailSchema,
  LeadSummarySchema,
  listFunnelsParamsJsonSchema,
  listLeadsParamsJsonSchema,
  parseGetLeadParams,
  parseListFunnelsParams,
  parseListLeadsParams
} from "../../src/domain/schemas/leads.js"

type JsonSchemaObject = {
  $schema?: string
  type?: string
  required?: Array<string>
  properties?: Record<string, { description?: string }>
}

describe("Lead Schemas", () => {
  describe("FunnelSummarySchema", () => {
    it.effect("accepts valid funnel summary", () =>
      Effect.gen(function*() {
        const result = yield* Schema.decodeUnknown(FunnelSummarySchema)({
          identifier: "funnel-1",
          name: "Sales Pipeline",
          description: "Main sales funnel",
          archived: false
        })
        expect(result.identifier).toBe("funnel-1")
        expect(result.name).toBe("Sales Pipeline")
        expect(result.archived).toBe(false)
      }))

    it.effect("accepts funnel without description", () =>
      Effect.gen(function*() {
        const result = yield* Schema.decodeUnknown(FunnelSummarySchema)({
          identifier: "funnel-2",
          name: "Lead Funnel",
          archived: true
        })
        expect(result.description).toBeUndefined()
        expect(result.archived).toBe(true)
      }))
  })

  describe("LeadSummarySchema", () => {
    it.effect("accepts valid lead summary", () =>
      Effect.gen(function*() {
        const result = yield* Schema.decodeUnknown(LeadSummarySchema)({
          identifier: "lead-1",
          title: "Big Deal",
          status: "Negotiation",
          assignee: "Doe,Jane",
          customer: "Acme Corp",
          modifiedOn: 1700000000000
        })
        expect(result.identifier).toBe("LEAD-1")
        expect(result.title).toBe("Big Deal")
        expect(result.status).toBe("Negotiation")
      }))

    it.effect("accepts minimal lead summary", () =>
      Effect.gen(function*() {
        const result = yield* Schema.decodeUnknown(LeadSummarySchema)({
          identifier: "LEAD-2",
          title: "Quick Lead",
          status: "Incoming"
        })
        expect(result.assignee).toBeUndefined()
        expect(result.customer).toBeUndefined()
      }))
  })

  describe("LeadDetailSchema", () => {
    it.effect("accepts full lead detail", () =>
      Effect.gen(function*() {
        const result = yield* Schema.decodeUnknown(LeadDetailSchema)({
          identifier: "LEAD-1",
          title: "Enterprise Deal",
          description: "# Big opportunity\n\nLots of potential.",
          status: "OfferPreparing",
          assignee: "Doe,Jane",
          customer: "Acme Corp",
          funnel: "funnel-1",
          funnelName: "Sales",
          modifiedOn: 1700000000000,
          createdOn: 1699000000000
        })
        expect(result.description).toContain("Big opportunity")
        expect(result.funnel).toBe("funnel-1")
        expect(result.funnelName).toBe("Sales")
      }))
  })

  describe("ListFunnelsParams", () => {
    it.effect("accepts empty params", () =>
      Effect.gen(function*() {
        const result = yield* parseListFunnelsParams({})
        expect(result).toBeDefined()
      }))

    it.effect("accepts includeArchived", () =>
      Effect.gen(function*() {
        const result = yield* parseListFunnelsParams({ includeArchived: true })
        expect(result.includeArchived).toBe(true)
      }))

    it.effect("accepts limit", () =>
      Effect.gen(function*() {
        const result = yield* parseListFunnelsParams({ limit: 10 })
        expect(result.limit).toBe(10)
      }))

    it("generates valid JSON schema", () => {
      const schema = listFunnelsParamsJsonSchema as JsonSchemaObject
      expect(schema.type).toBe("object")
    })
  })

  describe("ListLeadsParams", () => {
    it.effect("requires funnel", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(parseListLeadsParams({}))
        expect(error._tag).toBe("ParseError")
      }))

    it.effect("accepts funnel with filters", () =>
      Effect.gen(function*() {
        const result = yield* parseListLeadsParams({
          funnel: "funnel-1",
          status: "Negotiation",
          titleSearch: "enterprise"
        })
        expect(result.funnel).toBe("funnel-1")
        expect(result.status).toBe("Negotiation")
        expect(result.titleSearch).toBe("enterprise")
      }))

    it.effect("accepts assignee as a display name", () =>
      Effect.gen(function*() {
        const result = yield* parseListLeadsParams({
          funnel: "funnel-1",
          assignee: "Braeden Bihag"
        })
        expect(result.assignee).toBe("Braeden Bihag")
      }))

    it("generates valid JSON schema", () => {
      const schema = listLeadsParamsJsonSchema as JsonSchemaObject
      expect(schema.type).toBe("object")
      expect(schema.required).toContain("funnel")
    })
  })

  describe("GetLeadParams", () => {
    it.effect("requires funnel and identifier", () =>
      Effect.gen(function*() {
        const result = yield* parseGetLeadParams({
          funnel: "funnel-1",
          identifier: "lead-1"
        })
        expect(result.funnel).toBe("funnel-1")
        expect(result.identifier).toBe("LEAD-1")
      }))

    it.effect("rejects malformed identifier", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(parseGetLeadParams({ funnel: "funnel-1", identifier: "banana" }))
        expect(error._tag).toBe("ParseError")
      }))

    it.effect("rejects missing funnel", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(parseGetLeadParams({ identifier: "LEAD-1" }))
        expect(error._tag).toBe("ParseError")
      }))

    it.effect("rejects missing identifier", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(parseGetLeadParams({ funnel: "funnel-1" }))
        expect(error._tag).toBe("ParseError")
      }))

    it("generates valid JSON schema", () => {
      const schema = getLeadParamsJsonSchema as JsonSchemaObject
      expect(schema.type).toBe("object")
      expect(schema.required).toContain("funnel")
      expect(schema.required).toContain("identifier")
    })
  })
})
