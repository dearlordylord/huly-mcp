import { Schema } from "effect"
import { describe, expect, it } from "vitest"

import { ToolWarningCodeSchema } from "../../src/domain/schemas/tool-warnings.js"
import { createToolOutputSchema, hulyContextToolOutputSchema } from "../../src/mcp/tool-output-schema.js"

describe("createToolOutputSchema", () => {
  it("derives the warning code enum from ToolWarningCodeSchema", () => {
    expect(createToolOutputSchema(Schema.String)).toMatchObject({
      properties: {
        warnings: {
          items: {
            properties: {
              code: {
                enum: [...ToolWarningCodeSchema.literals]
              }
            }
          }
        }
      }
    })
  })
})

describe("hulyContextToolOutputSchema", () => {
  it("keeps Effect-generated JSON Schema definitions at the MCP output schema root", () => {
    const resultSchema = hulyContextToolOutputSchema.properties?.result

    expect(hulyContextToolOutputSchema).toHaveProperty(["$defs", "NonEmptyTrimmedString"])
    expect(resultSchema).toEqual(expect.objectContaining({ type: "object" }))
    expect(resultSchema).not.toHaveProperty("$defs")
    expect(resultSchema).not.toHaveProperty("$schema")
    expect(JSON.stringify(resultSchema)).toContain("\"$ref\":\"#/$defs/NonEmptyTrimmedString\"")
  })
})
