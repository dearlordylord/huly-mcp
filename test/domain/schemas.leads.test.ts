import { describe, it } from "@effect/vitest"
import { Effect, Exit, Schema } from "effect"
import { expect } from "vitest"
import {
  createLeadParamsJsonSchema,
  CreateLeadResultSchema,
  deleteLeadParamsJsonSchema,
  FunnelSummarySchema,
  getLeadParamsJsonSchema,
  LeadDetailSchema,
  LeadSummarySchema,
  listFunnelsParamsJsonSchema,
  listLeadsParamsJsonSchema,
  makePersonCustomerParamsJsonSchema,
  parseCreateLeadParams,
  parseDeleteLeadParams,
  parseGetLeadParams,
  parseListFunnelsParams,
  parseListLeadsParams,
  parseMakePersonCustomerParams,
  parseMoveLeadParams,
  parseUpdateLeadParams,
  updateLeadParamsJsonSchema
} from "../../src/domain/schemas/leads.js"
import { LeadMutationDocumentSchema } from "../../src/domain/schemas/leads-mutations.js"

const JsonSchemaObjectSchema = Schema.Struct({
  type: Schema.optional(Schema.String),
  anyOf: Schema.optional(Schema.Array(Schema.Unknown)),
  required: Schema.optional(Schema.Array(Schema.String)),
  properties: Schema.optional(
    Schema.Record(Schema.String, Schema.Struct({ description: Schema.optional(Schema.String) }))
  )
})
type JsonSchemaObject = Schema.Schema.Type<typeof JsonSchemaObjectSchema>

const leadDetailInput = () => ({
  id: "lead-id",
  identifier: "LEAD-1",
  number: 1,
  title: "Enterprise Deal",
  description: "# Big opportunity\n\nLots of potential.",
  customerDescription: "# Customer context",
  startDate: 1700000000000,
  dueDate: null,
  status: "OfferPreparing",
  assignee: "Doe,Jane",
  customer: "Acme Corp",
  customerId: "customer-id",
  customerType: "organization",
  taskType: "lead:taskType:Lead",
  rank: "0|hzzzzz:",
  completed: false,
  comments: 0,
  attachments: 0,
  labels: 0,
  funnel: "funnel-1",
  funnelName: "Sales",
  modifiedOn: 1700000000000,
  modifiedBy: "person-1",
  createdOn: 1699000000000,
  unsupportedFields: [
    { field: "parents", reason: "The published Lead and Task contracts do not define a stable parents field." },
    {
      field: "collection",
      reason:
        "AttachedDoc collection is an internal storage discriminator; funnel and customer projections expose its stable meaning."
    }
  ]
})

const expectJsonSchemaObject = (value: unknown): JsonSchemaObject =>
  Schema.decodeUnknownSync(JsonSchemaObjectSchema)(value)

describe("Lead Schemas", () => {
  it.effect("decodes the schema-owned native lead mutation boundary", () =>
    Effect.gen(function* () {
      const result = yield* Schema.decodeUnknownEffect(LeadMutationDocumentSchema)({
        _id: "lead-document-1",
        _class: "lead:class:Lead",
        space: "funnel-1",
        modifiedBy: "person-1",
        modifiedOn: 1700000000000,
        title: "Qualified opportunity",
        identifier: "lead-7",
        status: "status-incoming",
        kind: "task-type-lead",
        assignee: null,
        description: "markup-ref-1",
        startDate: null,
        dueDate: 1700000000000,
        attachedTo: "person-1",
        attachedToClass: "contact:class:Person",
        collection: "leads",
        comments: 2,
        attachments: 1,
        labels: 3
      })

      expect(result.identifier).toBe("LEAD-7")
      expect(result.description).toBe("markup-ref-1")
      expect(result.labels).toBe(3)
    })
  )

  describe("FunnelSummarySchema", () => {
    it.effect("accepts valid funnel summary", () =>
      Effect.gen(function* () {
        const result = yield* Schema.decodeUnknownEffect(FunnelSummarySchema)({
          identifier: "funnel-1",
          name: "Sales Pipeline",
          description: "Main sales funnel",
          archived: false
        })
        expect(result.identifier).toBe("funnel-1")
        expect(result.name).toBe("Sales Pipeline")
        expect(result.archived).toBe(false)
      })
    )

    it.effect("accepts funnel without description", () =>
      Effect.gen(function* () {
        const result = yield* Schema.decodeUnknownEffect(FunnelSummarySchema)({
          identifier: "funnel-2",
          name: "Lead Funnel",
          archived: true
        })
        expect(result.description).toBeUndefined()
        expect(result.archived).toBe(true)
      })
    )
  })

  describe("LeadSummarySchema", () => {
    it.effect("accepts valid lead summary", () =>
      Effect.gen(function* () {
        const result = yield* Schema.decodeUnknownEffect(LeadSummarySchema)({
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
      })
    )

    it.effect("accepts minimal lead summary", () =>
      Effect.gen(function* () {
        const result = yield* Schema.decodeUnknownEffect(LeadSummarySchema)({
          identifier: "LEAD-2",
          title: "Quick Lead",
          status: "Incoming"
        })
        expect(result.assignee).toBeUndefined()
        expect(result.customer).toBeUndefined()
      })
    )
  })

  describe("LeadDetailSchema", () => {
    it.effect("accepts full lead detail", () =>
      Effect.gen(function* () {
        const result = yield* Schema.decodeUnknownEffect(LeadDetailSchema)(leadDetailInput())
        expect(result.description).toContain("Big opportunity")
        expect(result.customerDescription).toBe("# Customer context")
        expect(result.startDate).toBe(1700000000000)
        expect(result.dueDate).toBeNull()
        expect(result.funnel).toBe("funnel-1")
        expect(result.funnelName).toBe("Sales")
      })
    )

    it.effect("rejects impossible customer classifications and empty unsupported classifications", () =>
      Effect.gen(function* () {
        const impossibleCustomer = yield* Effect.exit(
          Schema.decodeUnknownEffect(LeadDetailSchema)({ ...leadDetailInput(), customerType: "unresolved" })
        )
        const emptyUnsupported = yield* Effect.exit(
          Schema.decodeUnknownEffect(LeadDetailSchema)({ ...leadDetailInput(), unsupportedFields: [] })
        )

        expect(Exit.isFailure(impossibleCustomer)).toBe(true)
        expect(Exit.isFailure(emptyUnsupported)).toBe(true)
      })
    )
  })

  describe("ListFunnelsParams", () => {
    it.effect("accepts empty params", () =>
      Effect.gen(function* () {
        const result = yield* parseListFunnelsParams({})
        expect(result).toBeDefined()
      })
    )

    it.effect("accepts includeArchived", () =>
      Effect.gen(function* () {
        const result = yield* parseListFunnelsParams({ includeArchived: true })
        expect(result.includeArchived).toBe(true)
      })
    )

    it.effect("accepts limit", () =>
      Effect.gen(function* () {
        const result = yield* parseListFunnelsParams({ limit: 10 })
        expect(result.limit).toBe(10)
      })
    )

    it("generates valid JSON schema", () => {
      const schema = expectJsonSchemaObject(listFunnelsParamsJsonSchema)
      expect(schema.type).toBe("object")
    })
  })

  describe("ListLeadsParams", () => {
    it.effect("requires funnel", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(parseListLeadsParams({}))
        expect(error._tag).toBe("SchemaError")
      })
    )

    it.effect("accepts funnel with filters", () =>
      Effect.gen(function* () {
        const result = yield* parseListLeadsParams({
          funnel: "funnel-1",
          status: "Negotiation",
          titleSearch: "enterprise"
        })
        expect(result.funnel).toBe("funnel-1")
        expect(result.status).toBe("Negotiation")
        expect(result.titleSearch).toBe("enterprise")
      })
    )

    it.effect("accepts assignee as a display name", () =>
      Effect.gen(function* () {
        const result = yield* parseListLeadsParams({ funnel: "funnel-1", assignee: "Braeden Bihag" })
        expect(result.assignee).toBe("Braeden Bihag")
      })
    )

    it("generates valid JSON schema", () => {
      const schema = expectJsonSchemaObject(listLeadsParamsJsonSchema)
      expect(schema.type).toBe("object")
      expect(schema.required).toContain("funnel")
    })
  })

  describe("GetLeadParams", () => {
    it.effect("requires funnel and identifier", () =>
      Effect.gen(function* () {
        const result = yield* parseGetLeadParams({ funnel: "funnel-1", identifier: "lead-1" })
        expect(result.funnel).toBe("funnel-1")
        expect(result.identifier).toBe("LEAD-1")
      })
    )

    it.effect("rejects malformed identifier", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(parseGetLeadParams({ funnel: "funnel-1", identifier: "banana" }))
        expect(error._tag).toBe("SchemaError")
      })
    )

    it.effect("rejects missing funnel", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(parseGetLeadParams({ identifier: "LEAD-1" }))
        expect(error._tag).toBe("SchemaError")
      })
    )

    it.effect("rejects missing identifier", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(parseGetLeadParams({ funnel: "funnel-1" }))
        expect(error._tag).toBe("SchemaError")
      })
    )

    it("generates valid JSON schema", () => {
      const schema = expectJsonSchemaObject(getLeadParamsJsonSchema)
      expect(schema.type).toBe("object")
      expect(schema.required).toContain("funnel")
      expect(schema.required).toContain("identifier")
    })
  })

  describe("CreateLeadParams", () => {
    it.effect("parses a person customer locator and optional workflow fields", () =>
      Effect.gen(function* () {
        const result = yield* parseCreateLeadParams({
          funnel: "Sales",
          customer: { kind: "person", identifier: "alex@example.com" },
          title: "Enterprise renewal",
          description: "See [the account](ref://workspace/contact:person:alex).",
          assignee: "Owner,Alex",
          status: "Negotiation",
          taskType: "Lead"
        })

        expect(result.customer).toEqual({ kind: "person", identifier: "alex@example.com" })
        expect(result.title).toBe("Enterprise renewal")
        expect(result.taskType).toBe("Lead")
      })
    )

    it.effect("parses an organization customer locator by stable ID", () =>
      Effect.gen(function* () {
        const result = yield* parseCreateLeadParams({
          funnel: "funnel-1",
          customer: { kind: "organization", identifier: "organization-1" },
          title: "Account expansion"
        })

        expect(result.customer).toEqual({ kind: "organization", identifier: "organization-1" })
      })
    )

    it.effect("rejects empty titles and inline customer data", () =>
      Effect.gen(function* () {
        const emptyTitle = yield* Effect.flip(
          parseCreateLeadParams({
            funnel: "funnel-1",
            customer: { kind: "person", identifier: "person-1" },
            title: "   "
          })
        )
        const inlineCustomer = yield* Effect.flip(
          parseCreateLeadParams({
            funnel: "funnel-1",
            customer: { kind: "organization", identifier: "org-1", name: "New organization" },
            title: "New lead"
          })
        )

        expect(emptyTitle._tag).toBe("SchemaError")
        expect(inlineCustomer._tag).toBe("SchemaError")
      })
    )

    it.effect("accepts the schema-owned create result", () =>
      Effect.gen(function* () {
        const result = yield* Schema.decodeUnknownEffect(CreateLeadResultSchema)({
          leadId: "lead-document-1",
          identifier: "LEAD-42"
        })

        expect(result).toEqual({ leadId: "lead-document-1", identifier: "LEAD-42" })
      })
    )

    it("generates an LLM-readable JSON schema", () => {
      const schema = expectJsonSchemaObject(createLeadParamsJsonSchema)
      expect(schema.required).toEqual(expect.arrayContaining(["funnel", "customer", "title"]))
      expect(schema.properties?.customer?.description).toMatch(/existing/i)
    })
  })

  describe("Lead mutation params", () => {
    it.effect("distinguishes omitted fields from explicit null clears", () =>
      Effect.gen(function* () {
        const omitted = yield* parseUpdateLeadParams({ funnel: "funnel-1", identifier: "LEAD-1", title: "Updated" })
        const cleared = yield* parseUpdateLeadParams({ funnel: "funnel-1", identifier: "LEAD-1", description: null })

        expect(omitted).not.toHaveProperty("description")
        expect(cleared).toHaveProperty("description", null)
      })
    )

    it.effect("requires a real update field and rejects unknown fields", () =>
      Effect.gen(function* () {
        const empty = yield* Effect.flip(parseUpdateLeadParams({ funnel: "funnel-1", identifier: "LEAD-1" }))
        const unknown = yield* Effect.flip(
          parseUpdateLeadParams({ funnel: "funnel-1", identifier: "LEAD-1", title: "Updated", unknown: true })
        )

        expect(empty._tag).toBe("SchemaError")
        expect(unknown._tag).toBe("SchemaError")
      })
    )

    it.effect("parses destination and impact-safe deletion variants", () =>
      Effect.gen(function* () {
        const move = yield* parseMoveLeadParams({
          funnel: "source",
          identifier: "LEAD-2",
          destinationFunnel: "destination"
        })
        const preview = yield* parseDeleteLeadParams({ funnel: "source", identifier: "LEAD-2" })
        const execute = yield* parseDeleteLeadParams({
          funnel: "source",
          identifier: "LEAD-2",
          execute: true,
          expectedComments: 0,
          expectedAttachments: 1,
          expectedLabels: 0
        })

        expect(move.destinationFunnel).toBe("destination")
        expect(preview.execute).toBeUndefined()
        expect(execute.execute).toBe(true)
      })
    )

    it.effect("requires expected counts for destructive execution", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(
          parseDeleteLeadParams({ funnel: "source", identifier: "LEAD-2", execute: true })
        )
        expect(error._tag).toBe("SchemaError")
      })
    )

    it.effect("parses standalone person customer promotion", () =>
      Effect.gen(function* () {
        const result = yield* parseMakePersonCustomerParams({ identifier: "person@example.com" })
        expect(result.identifier).toBe("person@example.com")
      })
    )

    it("describes nullable and exact mutation contracts in JSON schemas", () => {
      const update = expectJsonSchemaObject(updateLeadParamsJsonSchema)
      const deleteSchema = expectJsonSchemaObject(deleteLeadParamsJsonSchema)
      const customer = expectJsonSchemaObject(makePersonCustomerParamsJsonSchema)
      expect(update.properties?.description?.description).toContain("null clears")
      expect(deleteSchema.anyOf).toBeDefined()
      expect(customer.properties?.identifier?.description).toContain("exact email address")
    })
  })
})
