import { Ajv } from "ajv"
import { Schema } from "effect"
import { describe, expect, it } from "vitest"
import { createToolOutputSchema } from "../../mcp/tool-output-schema-core.js"

import {
  parseJsonSchemaRecord,
  toDraft07EmptyObjectJsonSchema,
  toDraft07JsonSchema,
  withExactlyOneRequired,
  withJsonSchemaPropertyDescriptions,
  withJsonSchemaUnionPropertyDescriptions
} from "./json-schema.js"

const expectRecord = (value: unknown): { readonly [x: string | symbol]: unknown } => {
  const record = parseJsonSchemaRecord(value)
  if (record === undefined) {
    throw new Error("Expected record")
  }
  return record
}

const getProperty = (schema: unknown, property: string): unknown => {
  const record = expectRecord(schema)
  const properties = expectRecord(record.properties)
  return properties[property]
}

const getDescription = (schema: unknown, property: string): unknown => {
  const field = getProperty(schema, property)
  return parseJsonSchemaRecord(field)?.description
}

describe("JSON schema helpers", () => {
  it("adds property descriptions inside anyOf branches", () => {
    const schema = { anyOf: [{ type: "object", properties: { id: { type: "string" } } }] }
    expect(withJsonSchemaUnionPropertyDescriptions(schema, { id: "Identifier" })).toEqual({
      anyOf: [{ type: "object", properties: { id: { type: "string", description: "Identifier" } } }]
    })
  })

  it("leaves malformed union members and property values unchanged", () => {
    const schema = { anyOf: [null, { type: "object", properties: { id: null } }] }

    expect(withJsonSchemaUnionPropertyDescriptions(schema, { id: "Identifier" })).toEqual(schema)
    expect(withJsonSchemaUnionPropertyDescriptions({ type: "string" }, { id: "Identifier" })).toEqual({
      type: "string"
    })
    expect(withJsonSchemaUnionPropertyDescriptions([], { id: "Identifier" })).toEqual([])
  })

  it("returns schemas without object properties unchanged", () => {
    const schema = { type: "string" }

    expect(withJsonSchemaPropertyDescriptions(schema, { product: "Product locator." })).toBe(schema)
  })

  it("adds configured property descriptions without inventing custom ones", () => {
    const jsonSchema = withJsonSchemaPropertyDescriptions(
      { type: "object", properties: { product: { type: "string" }, custom: { type: "string" } } },
      { product: "Product locator." }
    )

    expect(getDescription(jsonSchema, "product")).toBe("Product locator.")
    expect(getDescription(jsonSchema, "custom")).toBeUndefined()
  })

  it("adds oneOf requirements for exactly one required field", () => {
    const jsonSchema = withExactlyOneRequired({ type: "object" }, ["filePath", "fileUrl", "data"])

    expect(expectRecord(jsonSchema).oneOf).toEqual([
      { required: ["filePath"] },
      { required: ["fileUrl"] },
      { required: ["data"] }
    ])
  })
})

describe("toDraft07JsonSchema", () => {
  it("emits a strict empty object without empty definitions", () => {
    expect(toDraft07EmptyObjectJsonSchema(Schema.Struct({}))).toEqual({
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "object",
      properties: {},
      additionalProperties: false
    })
  })

  it("retains definitions when projecting a strict empty object", () => {
    const Shared = Schema.String.annotate({ identifier: "EmptyProjectionShared" })
    const projected = toDraft07EmptyObjectJsonSchema(Schema.Struct({ value: Shared }))

    expect(projected).toHaveProperty("$defs.EmptyProjectionShared")
    expect(projected.properties).toEqual({})
  })

  it("handles authored definition-root refs and fixed empty tuples", () => {
    expect(toDraft07JsonSchema(Schema.String.annotate({ jsonSchema: { $ref: "#/definitions" } }))).toHaveProperty(
      "$ref",
      "#/definitions"
    )
    expect(toDraft07JsonSchema(Schema.Tuple([]))).toMatchObject({ type: "array", items: false })
  })

  it("restores descriptions through homogeneous unions and array elements", () => {
    const described = Schema.String.annotate({ description: "Shared description." })
    const schema = toDraft07JsonSchema(
      Schema.Struct({
        homogeneous: Schema.Union([
          described,
          Schema.Literal("fixed").annotate({ description: "Shared description." })
        ]),
        values: Schema.Array(described)
      })
    )

    expect(getDescription(schema, "homogeneous")).toBe("Shared description.")
    expect(expectRecord(getProperty(schema, "values")).items).toMatchObject({ description: "Shared description." })
  })

  it("keeps repeated scalar constraints conjunctive", () => {
    const schema = toDraft07JsonSchema(
      Schema.String.pipe(Schema.check(Schema.isPattern(/^a/)), Schema.check(Schema.isPattern(/z$/)))
    )

    expect(schema).toMatchObject({ type: "string", pattern: "^a", allOf: [{ pattern: "z$" }] })
  })

  it("does not flatten unsafe, malformed, or conflicting authored allOf members", () => {
    const cases = [{ allOf: [null] }, { allOf: [{ type: "string" }] }, { allOf: [{ minLength: 1 }], minLength: 2 }]

    for (const jsonSchema of cases) {
      expect(toDraft07JsonSchema(Schema.String.annotate({ jsonSchema }))).toMatchObject({ allOf: jsonSchema.allOf })
    }
  })

  it("does not promote one union member description to the whole property", () => {
    const schema = toDraft07JsonSchema(
      Schema.Struct({
        value: Schema.Union([
          Schema.String.annotate({ description: "string choice" }),
          Schema.Number.annotate({ description: "number choice" })
        ])
      })
    )

    expect(getProperty(schema, "value")).not.toHaveProperty("description")
  })

  it("preserves authored JSON Schema constraints nested inside an optional field", () => {
    const AuthoredChoice = Schema.String.annotate({
      description: "A documented choice.",
      jsonSchema: { type: "string", enum: ["one", "two"] }
    })
    const schema = toDraft07JsonSchema(Schema.Struct({ choice: Schema.optional(AuthoredChoice) }))
    const choice = getProperty(schema, "choice")

    expect(choice).toMatchObject({
      anyOf: [{ type: "string", enum: ["one", "two"], description: "A documented choice." }, { type: "null" }]
    })
  })

  const SharedCode = Schema.String.annotate({ identifier: "AdapterFixtureCode", description: "Stable fixture code." })
  const InputFixture = Schema.Struct({
    code: SharedCode,
    pair: Schema.Tuple([Schema.String, Schema.Number]),
    filePath: Schema.optionalKey(Schema.String.annotate({ description: "Read from a local file." })),
    fileUrl: Schema.optionalKey(Schema.String.annotate({ description: "Read from a URL." }))
  }).annotate({ description: "Representative tool input." })
  const SharedResult = Schema.Struct({ code: SharedCode }).annotate({ identifier: "AdapterFixtureResult" })
  const OutputFixture = Schema.Struct({ result: SharedResult, values: Schema.Array(Schema.String) }).annotate({
    description: "Representative tool result."
  })

  it("preserves the MCP root and definitions shape while Effect lowers Draft-07 tuples and refs", () => {
    const schema = toDraft07JsonSchema(InputFixture)
    const pair = getProperty(schema, "pair")

    expect(schema).toMatchObject({
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "object",
      description: "Representative tool input.",
      required: ["code", "pair"],
      additionalProperties: false,
      $defs: { AdapterFixtureCode: { type: "string", description: "Stable fixture code." } }
    })
    expect(getProperty(schema, "code")).toEqual({
      allOf: [{ $ref: "#/$defs/AdapterFixtureCode" }],
      description: "Stable fixture code."
    })
    expect(pair).toEqual(expect.objectContaining({ type: "array", items: expect.any(Array), minItems: 2, maxItems: 2 }))
    expect(pair).not.toHaveProperty("prefixItems")
    expect(schema).not.toHaveProperty("definitions")
    expect(getDescription(schema, "filePath")).toBe("Read from a local file.")
  })

  it("passes input and output schemas through an external Draft-07 validator", () => {
    // The authored oneOf branches intentionally require properties declared on
    // their parent object, which is valid Draft-07 but trips Ajv's optional
    // strictRequired lint.
    const ajv = new Ajv({ strict: true, strictRequired: false })
    const generatedInput = toDraft07JsonSchema(InputFixture)
    const generatedProperties = expectRecord(expectRecord(generatedInput).properties)
    const authoredInput = withExactlyOneRequired(
      { ...generatedInput, properties: { ...generatedProperties, forbidden: false } },
      ["filePath", "fileUrl"]
    )
    const validateInput = ajv.compile(authoredInput)
    const wrappedOutput = createToolOutputSchema(OutputFixture)
    const validateOutput = ajv.compile(wrappedOutput)

    expect(authoredInput).toMatchObject({
      additionalProperties: false,
      oneOf: [{ required: ["filePath"] }, { required: ["fileUrl"] }]
    })
    expect(validateInput({ code: "A", pair: ["left", 1], filePath: "/tmp/a" })).toBe(true)
    expect(validateInput({ code: "A", pair: ["left", 1] })).toBe(false)
    expect(validateInput({ code: "A", pair: ["left", 1], filePath: "a", fileUrl: "https://x" })).toBe(false)
    expect(validateInput({ code: "A", pair: ["left"], filePath: "a" })).toBe(false)
    expect(validateInput({ code: "A", pair: ["left", 1], filePath: "a", extra: true })).toBe(false)
    expect(validateInput({ code: "A", pair: ["left", 1], filePath: "a", forbidden: true })).toBe(false)
    expect(wrappedOutput).toHaveProperty("$defs.AdapterFixtureCode")
    expect(JSON.stringify(wrappedOutput)).not.toContain("#/definitions/")
    expect(validateOutput({ result: { result: { code: "A" }, values: ["one", "two"] } })).toBe(true)
    expect(validateOutput({ result: { result: { code: 1 }, values: ["one"] } })).toBe(false)
  })
})
