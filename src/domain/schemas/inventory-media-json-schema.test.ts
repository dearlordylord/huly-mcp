import { Schema } from "effect"
import { describe, expect, it } from "vitest"

import { inventoryMediaJsonSchema, withExactlyOneInventoryMediaFileSource } from "./inventory-media-json-schema.js"
import { parseJsonSchemaRecord } from "./json-schema.js"

const getProperty = (schema: unknown, property: string): unknown => {
  return parseJsonSchemaRecord(parseJsonSchemaRecord(schema)?.properties)?.[property]
}

const getDescription = (schema: unknown, property: string): unknown => {
  const field = getProperty(schema, property)
  return parseJsonSchemaRecord(field)?.description
}

describe("Inventory media JSON schema helpers", () => {
  it("adds known Inventory media field descriptions without inventing custom ones", () => {
    const jsonSchema = inventoryMediaJsonSchema(Schema.Struct({
      product: Schema.String,
      custom: Schema.String
    }))

    expect(getDescription(jsonSchema, "product")).toContain("Inventory product ID or exact product name")
    expect(getDescription(jsonSchema, "custom")).toBeUndefined()
  })

  it("adds oneOf requirements for exactly one media file source", () => {
    const jsonSchema = withExactlyOneInventoryMediaFileSource({ type: "object" })

    expect(parseJsonSchemaRecord(jsonSchema)?.oneOf).toEqual([
      { required: ["filePath"] },
      { required: ["fileUrl"] },
      { required: ["data"] }
    ])
  })
})
