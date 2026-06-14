import { Schema } from "effect"
import { describe, expect, it } from "vitest"

import { inventoryMediaJsonSchema, withExactlyOneInventoryMediaFileSource } from "./inventory-media-json-schema.js"

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const getProperty = (schema: unknown, property: string): unknown => {
  if (!isRecord(schema) || !isRecord(schema.properties)) return undefined
  return schema.properties[property]
}

const getDescription = (schema: unknown, property: string): unknown => {
  const field = getProperty(schema, property)
  return isRecord(field) ? field.description : undefined
}

describe("Inventory media JSON schema helpers", () => {
  it("returns schemas without object properties unchanged", () => {
    const jsonSchema = inventoryMediaJsonSchema(Schema.String)

    expect(isRecord(jsonSchema) ? jsonSchema.properties : undefined).toBeUndefined()
  })

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

    expect(isRecord(jsonSchema) ? jsonSchema.oneOf : undefined).toEqual([
      { required: ["filePath"] },
      { required: ["fileUrl"] },
      { required: ["data"] }
    ])
  })
})
