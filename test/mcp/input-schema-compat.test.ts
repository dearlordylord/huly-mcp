import { describe } from "@effect/vitest"
import { expect, it } from "vitest"

import type { McpInputSchema } from "../../src/mcp/input-schema-compat.js"
import { toClientCompatibleInputSchema } from "../../src/mcp/input-schema-compat.js"

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const expectRecord = (value: unknown): Record<string, unknown> => {
  if (!isRecord(value)) {
    throw new Error("Expected record")
  }
  return value
}

describe("toClientCompatibleInputSchema", () => {
  it("removes root composition while keeping branch-required constraints runtime-only", () => {
    const schema: McpInputSchema = {
      type: "object",
      required: ["project"],
      properties: {
        project: { type: "string" }
      },
      oneOf: [
        {
          required: ["issueIdentifier"],
          properties: {
            issueIdentifier: { type: "string" }
          },
          $defs: {
            IssueIdentifier: { type: "string" }
          },
          anyOf: [
            {
              required: ["document"],
              properties: {
                document: { type: "string" }
              },
              $defs: {
                DocumentIdentifier: { type: "string" }
              }
            }
          ]
        }
      ],
      allOf: [
        {
          properties: {
            limit: { type: "integer" }
          }
        }
      ]
    }

    const sanitized = toClientCompatibleInputSchema(schema)
    const properties = expectRecord(sanitized.properties)
    const defs = expectRecord(sanitized.$defs)

    expect(sanitized.type).toBe("object")
    expect(sanitized.oneOf).toBeUndefined()
    expect(sanitized.anyOf).toBeUndefined()
    expect(sanitized.allOf).toBeUndefined()
    expect(sanitized.required).toEqual(["project"])
    expect(sanitized.required).not.toContain("issueIdentifier")
    expect(sanitized.required).not.toContain("document")
    expect(properties.project).toBeDefined()
    expect(properties.issueIdentifier).toBeDefined()
    expect(properties.document).toBeDefined()
    expect(properties.limit).toBeDefined()
    expect(defs.IssueIdentifier).toBeDefined()
    expect(defs.DocumentIdentifier).toBeDefined()
  })
})
