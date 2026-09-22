import { describe, it } from "@effect/vitest"
import { Schema } from "effect"
import { expect } from "vitest"

import { toDraft07JsonSchema, withJsonSchemaPropertyDescriptions } from "../../src/domain/schemas/json-schema.js"

describe("JSON schema helpers", () => {
  it("returns non-record schema objects unchanged", () => {
    const schema: object = []

    expect(withJsonSchemaPropertyDescriptions(schema, { name: "Name" })).toBe(schema)
  })

  it("returns schemas without record properties unchanged", () => {
    const schema = { type: "string" }

    expect(withJsonSchemaPropertyDescriptions(schema, { name: "Name" })).toBe(schema)
  })

  it("adds descriptions only to matching object properties", () => {
    const schema = {
      type: "object",
      properties: { name: { type: "string" }, count: { type: "number" }, passthrough: true }
    }

    expect(withJsonSchemaPropertyDescriptions(schema, { name: "Name" })).toEqual({
      type: "object",
      properties: { name: { type: "string", description: "Name" }, count: { type: "number" }, passthrough: true }
    })
  })

  it("preserves external references and non-flattenable authored allOf members", () => {
    const externalRef = toDraft07JsonSchema(
      Schema.Unknown.annotate({ jsonSchema: { $ref: "https://schemas.example/tool.json" } })
    )
    const repeatedConstraints = toDraft07JsonSchema(
      Schema.String.pipe(
        Schema.check(Schema.isPattern(/^a/)),
        Schema.check(Schema.isPattern(/b/)),
        Schema.check(Schema.isPattern(/z$/))
      )
    )
    const nonRecordMember = toDraft07JsonSchema(Schema.String.annotate({ jsonSchema: { allOf: [null] } }))

    expect(externalRef.$ref).toBe("https://schemas.example/tool.json")
    expect(repeatedConstraints).toMatchObject({ pattern: "^a", allOf: [{ pattern: "b" }, { pattern: "z$" }] })
    expect(nonRecordMember.allOf).toEqual([null])
  })

  it("retains authored properties that have no matching Effect field", () => {
    const schema = toDraft07JsonSchema(
      Schema.Struct({ known: Schema.String }).annotate({
        jsonSchema: { properties: { known: { type: "string" }, extra: { type: "number" } } }
      })
    )

    expect(schema.properties).toEqual({ known: { type: "string" }, extra: { type: "number" } })
  })
})
