import { Predicate } from "effect"
import { describe, expect, it } from "vitest"

import { withExactlyOneRequired, withJsonSchemaPropertyDescriptions } from "./json-schema.js"

const expectRecord = (value: unknown): { readonly [x: string | symbol]: unknown } => {
  if (!Predicate.isRecord(value)) {
    throw new Error("Expected record")
  }
  return value
}

const getProperty = (schema: unknown, property: string): unknown => {
  const record = expectRecord(schema)
  const properties = expectRecord(record.properties)
  return properties[property]
}

const getDescription = (schema: unknown, property: string): unknown => {
  const field = getProperty(schema, property)
  return Predicate.isRecord(field) ? field.description : undefined
}

describe("JSON schema helpers", () => {
  it("returns schemas without object properties unchanged", () => {
    const schema = { type: "string" }

    expect(withJsonSchemaPropertyDescriptions(schema, { product: "Product locator." })).toBe(schema)
  })

  it("adds configured property descriptions without inventing custom ones", () => {
    const jsonSchema = withJsonSchemaPropertyDescriptions(
      {
        type: "object",
        properties: {
          product: { type: "string" },
          custom: { type: "string" }
        }
      },
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
