import { Effect, Result, Schema } from "effect"
import { describe, expect, it } from "vitest"

import { addObjectCollaboratorParamsJsonSchema } from "./collaborators.js"
import { toDraft07JsonSchema } from "./json-schema.js"
import {
  AddOrganizationChannelParamsSchema,
  createOrganizationParamsJsonSchema,
  parseAddOrganizationChannelParams
} from "./contact-organizations.js"
import {
  CreatePersonParamsSchema,
  createPersonParamsJsonSchema,
  EmployeeLocatorSchema,
  GetPersonParamsSchema,
  getPersonParamsJsonSchema,
  ListPersonsParamsSchema,
  listPersonsParamsJsonSchema,
  parseCreatePersonParams,
  parseGetPersonParams,
  parseListPersonsParams,
  parseSetEmployeePositionParams,
  setEmployeePositionParamsJsonSchema,
  SetEmployeePositionParamsSchema,
  updatePersonParamsJsonSchema,
  UpdatePersonParamsSchema
} from "./contacts.js"

type JsonSchemaObject = {
  readonly anyOf?: ReadonlyArray<{ readonly required?: ReadonlyArray<string> }>
  readonly oneOf?: ReadonlyArray<{ readonly required?: ReadonlyArray<string> }>
  readonly properties?: Readonly<Record<string, { readonly description?: string }>>
}

const expectJsonSchemaObject = (schema: unknown): JsonSchemaObject => {
  if (typeof schema === "object" && schema !== null) return schema
  throw new Error("Expected JSON schema object")
}

describe("Contact Schemas", () => {
  it("preserves LLM-facing property descriptions in public schemas", () => {
    const listSchema = expectJsonSchemaObject(listPersonsParamsJsonSchema)
    const createSchema = expectJsonSchemaObject(createPersonParamsJsonSchema)
    const collaboratorSchema = expectJsonSchemaObject(addObjectCollaboratorParamsJsonSchema)
    const organizationSchema = expectJsonSchemaObject(createOrganizationParamsJsonSchema)
    expect(listSchema.properties?.nameSearch?.description).toContain("name substring")
    expect(createSchema.properties?.firstName?.description).toBe("First name")
    expect(collaboratorSchema.properties?.member?.description).toContain("account UUID")
    expect(organizationSchema.properties?.name?.description).toBe("Organization name")
    expect(getPersonParamsJsonSchema).toMatchObject({
      anyOf: [
        { properties: { personId: { description: "Person ID" } } },
        { properties: { email: { description: "Person email address" } } }
      ]
    })
  })

  describe("ListPersonsParamsSchema", () => {
    it("accepts empty object", () => {
      const result = Schema.decodeUnknownSync(ListPersonsParamsSchema)({})
      expect(result).toEqual({})
    })

    it("accepts valid limit", () => {
      const result = Schema.decodeUnknownSync(ListPersonsParamsSchema)({ limit: 50 })
      expect(result).toEqual({ limit: 50 })
    })

    it("rejects limit over 200", () => {
      const result = Effect.runSync(Effect.result(parseListPersonsParams({ limit: 201 })))
      expect(Result.isFailure(result)).toBe(true)
    })

    it("rejects zero limit", () => {
      const result = Effect.runSync(Effect.result(parseListPersonsParams({ limit: 0 })))
      expect(Result.isFailure(result)).toBe(true)
    })

    it("rejects negative limit", () => {
      const result = Effect.runSync(Effect.result(parseListPersonsParams({ limit: -1 })))
      expect(Result.isFailure(result)).toBe(true)
    })
  })

  describe("GetPersonParamsSchema", () => {
    it("accepts personId", () => {
      const result = Schema.decodeUnknownSync(GetPersonParamsSchema)({ personId: "abc123" })
      expect(result).toEqual({ personId: "abc123" })
    })

    it("accepts email", () => {
      const result = Schema.decodeUnknownSync(GetPersonParamsSchema)({ email: "test@example.com" })
      expect(result).toEqual({ email: "test@example.com" })
    })

    it("prefers personId when both are provided", () => {
      const result = Schema.decodeUnknownSync(GetPersonParamsSchema)({ personId: "abc123", email: "test@example.com" })
      expect(result).toEqual({ personId: "abc123" })
    })

    it("rejects empty object (requires at least one identifier)", () => {
      const result = Effect.runSync(Effect.result(parseGetPersonParams({})))
      expect(Result.isFailure(result)).toBe(true)
    })

    it("trims personId whitespace", () => {
      const result = Schema.decodeUnknownSync(GetPersonParamsSchema)({ personId: "  abc123  " })
      expect(result).toEqual({ personId: "abc123" })
    })

    it("rejects whitespace-only personId", () => {
      const result = Effect.runSync(Effect.result(parseGetPersonParams({ personId: "   " })))
      expect(Result.isFailure(result)).toBe(true)
    })

    it("rejects email without @", () => {
      const result = Effect.runSync(Effect.result(parseGetPersonParams({ email: "invalid" })))
      expect(Result.isFailure(result)).toBe(true)
    })
  })

  describe("CreatePersonParamsSchema", () => {
    it("accepts valid person with required fields", () => {
      const result = Schema.decodeUnknownSync(CreatePersonParamsSchema)({ firstName: "John", lastName: "Doe" })
      expect(result).toEqual({ firstName: "John", lastName: "Doe" })
    })

    it("accepts all optional fields", () => {
      const result = Schema.decodeUnknownSync(CreatePersonParamsSchema)({
        firstName: "John",
        lastName: "Doe",
        email: "john@example.com",
        city: "NYC"
      })
      expect(result).toEqual({ firstName: "John", lastName: "Doe", email: "john@example.com", city: "NYC" })
    })

    it("trims firstName and lastName", () => {
      const result = Schema.decodeUnknownSync(CreatePersonParamsSchema)({ firstName: "  John  ", lastName: "  Doe  " })
      expect(result).toEqual({ firstName: "John", lastName: "Doe" })
    })

    it("rejects empty firstName", () => {
      const result = Effect.runSync(Effect.result(parseCreatePersonParams({ firstName: "", lastName: "Doe" })))
      expect(Result.isFailure(result)).toBe(true)
    })

    it("rejects empty lastName", () => {
      const result = Effect.runSync(Effect.result(parseCreatePersonParams({ firstName: "John", lastName: "" })))
      expect(Result.isFailure(result)).toBe(true)
    })

    it("rejects whitespace-only firstName", () => {
      const result = Effect.runSync(Effect.result(parseCreatePersonParams({ firstName: "   ", lastName: "Doe" })))
      expect(Result.isFailure(result)).toBe(true)
    })

    it("rejects missing required fields", () => {
      const result = Effect.runSync(Effect.result(parseCreatePersonParams({})))
      expect(Result.isFailure(result)).toBe(true)
    })
  })

  describe("UpdatePersonParamsSchema", () => {
    it("rejects personId only and advertises update-field requirement in JSON Schema", () => {
      const result = Schema.decodeUnknownResult(UpdatePersonParamsSchema)({ personId: "abc123" })
      expect(result._tag).toBe("Failure")

      const jsonSchema = expectJsonSchemaObject(updatePersonParamsJsonSchema)
      expect(jsonSchema.anyOf).toEqual(
        expect.arrayContaining([{ required: ["firstName"] }, { required: ["lastName"] }, { required: ["city"] }])
      )
    })

    it("accepts city as null (to clear)", () => {
      const result = Schema.decodeUnknownSync(UpdatePersonParamsSchema)({ personId: "abc123", city: null })
      expect(result).toEqual({ personId: "abc123", city: null })
    })

    it("accepts city as string", () => {
      const result = Schema.decodeUnknownSync(UpdatePersonParamsSchema)({ personId: "abc123", city: "London" })
      expect(result).toEqual({ personId: "abc123", city: "London" })
    })

    it("accepts firstName update", () => {
      const result = Schema.decodeUnknownSync(UpdatePersonParamsSchema)({ personId: "abc123", firstName: "Jane" })
      expect(result).toEqual({ personId: "abc123", firstName: "Jane" })
    })

    it("rejects empty firstName in update", () => {
      const result = Effect.runSync(
        Effect.result(Schema.decodeUnknownEffect(UpdatePersonParamsSchema)({ personId: "abc123", firstName: "" }))
      )
      expect(Result.isFailure(result)).toBe(true)
    })
  })

  describe("SetEmployeePositionParamsSchema", () => {
    it("requires a position so omission cannot be confused with clearing", () => {
      const missingPosition = Schema.decodeUnknownResult(SetEmployeePositionParamsSchema)({
        employee: { id: "employee-1" }
      })
      expect(missingPosition._tag).toBe("Failure")

      const clear = Schema.decodeUnknownSync(SetEmployeePositionParamsSchema)({
        employee: { id: "employee-1" },
        position: null
      })
      expect(clear).toEqual({ employee: { id: "employee-1" }, position: null })
    })

    it("documents exact locator resolution and the required position field", () => {
      const jsonSchema = expectJsonSchemaObject(setEmployeePositionParamsJsonSchema)
      expect(jsonSchema.properties?.employee?.description).toContain("exact email address")
      expect(jsonSchema.properties?.position?.description).toContain("clear")
      expect(jsonSchema).toMatchObject({ required: ["employee", "position"] })
    })

    it("accepts one structured locator modality", () => {
      const result = Effect.runSync(
        parseSetEmployeePositionParams({ employee: { name: "Jane Smith" }, position: " Engineering Lead " })
      )
      expect(result).toEqual({ employee: { name: "Jane Smith" }, position: " Engineering Lead " })
    })

    it("rejects combined locator modalities at the schema boundary", () => {
      const result = Effect.runSync(
        Effect.result(
          parseSetEmployeePositionParams({
            employee: { id: "employee-1", email: "jane@example.com" },
            position: "Engineering Lead"
          })
        )
      )
      expect(Result.isFailure(result)).toBe(true)
    })

    it("rejects the legacy primitive locator shape", () => {
      const result = Schema.decodeUnknownResult(SetEmployeePositionParamsSchema)({
        employee: "employee-1",
        position: null
      })
      expect(result._tag).toBe("Failure")
    })

    it("advertises one-of locator fields in JSON Schema", () => {
      const schema = expectJsonSchemaObject(toDraft07JsonSchema(EmployeeLocatorSchema))
      expect(schema).toMatchObject({ oneOf: [{ required: ["id"] }, { required: ["email"] }, { required: ["name"] }] })
    })
  })

  describe("AddOrganizationChannelParamsSchema", () => {
    it("accepts supported organization channel provider", () => {
      const result = Schema.decodeUnknownSync(AddOrganizationChannelParamsSchema)({
        organizationId: "org-1",
        provider: "whatsapp",
        value: "+15551234"
      })
      expect(result).toEqual({ organizationId: "org-1", provider: "whatsapp", value: "+15551234" })
    })

    it("rejects unsupported organization channel provider", () => {
      const result = Effect.runSync(
        Effect.result(
          parseAddOrganizationChannelParams({ organizationId: "org-1", provider: "fax", value: "555-1234" })
        )
      )
      expect(Result.isFailure(result)).toBe(true)
    })
  })
})
