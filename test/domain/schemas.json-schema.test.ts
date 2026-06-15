import { describe, it } from "@effect/vitest"
import { expect } from "vitest"

import { withJsonSchemaPropertyDescriptions } from "../../src/domain/schemas/json-schema.js"

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
      properties: {
        name: { type: "string" },
        count: { type: "number" },
        passthrough: true
      }
    }

    expect(withJsonSchemaPropertyDescriptions(schema, { name: "Name" })).toEqual({
      type: "object",
      properties: {
        name: { type: "string", description: "Name" },
        count: { type: "number" },
        passthrough: true
      }
    })
  })
})
