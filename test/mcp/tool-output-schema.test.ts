import { describe, expect, it } from "vitest"

import { ToolWarningCodeSchema } from "../../src/domain/schemas/tool-warnings.js"
import { defaultToolOutputSchema } from "../../src/mcp/tool-output-schema.js"

describe("defaultToolOutputSchema", () => {
  it("derives the warning code enum from ToolWarningCodeSchema", () => {
    expect(defaultToolOutputSchema).toMatchObject({
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
