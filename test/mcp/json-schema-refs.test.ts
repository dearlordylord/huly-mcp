import { describe } from "@effect/vitest"
import { expect, it } from "vitest"

import {
  stripCollidingSchemaIds,
  stripCollidingSchemaIdsProperties,
  stripCollidingSchemaIdsRecord
} from "../../src/mcp/json-schema-refs.js"

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const expectRecord = (value: unknown): Record<string, unknown> => {
  if (!isRecord(value)) throw new Error("Expected record")
  return value
}

describe("stripCollidingSchemaIds", () => {
  it("removes inline $id values under /schemas/ while keeping siblings and content", () => {
    const input = {
      type: "object",
      properties: {
        tx: { $id: "/schemas/unknown", title: "unknown", description: "opaque" }
      }
    }
    const out = expectRecord(stripCollidingSchemaIds(input))
    const props = expectRecord(out.properties)
    const tx = expectRecord(props.tx)
    expect(tx.$id).toBeUndefined()
    expect(tx.title).toBe("unknown")
    expect(tx.description).toBe("opaque")
  })

  it("strips /schemas/{} and recurses through arrays and nested objects", () => {
    const input = {
      anyOf: [
        { $id: "/schemas/%7B%7D", title: "{}" },
        { additionalProperties: { $id: "/schemas/unknown", title: "unknown" } }
      ]
    }
    const out = expectRecord(stripCollidingSchemaIds(input))
    expect(JSON.stringify(out)).not.toContain("/schemas/")
    expect(JSON.stringify(out)).toContain("\"title\":\"{}\"")
  })

  it("keeps $ref and non-/schemas $id untouched", () => {
    const input = {
      $id: "PositiveInteger",
      properties: { ref: { $ref: "#/$defs/Foo" }, keep: { $id: "https://example.com/x" } }
    }
    const out = expectRecord(stripCollidingSchemaIds(input))
    expect(out.$id).toBe("PositiveInteger")
    const props = expectRecord(out.properties)
    expect(expectRecord(props.ref).$ref).toBe("#/$defs/Foo")
    expect(expectRecord(props.keep).$id).toBe("https://example.com/x")
  })

  it("returns primitives and null unchanged", () => {
    expect(stripCollidingSchemaIds("x")).toBe("x")
    expect(stripCollidingSchemaIds(7)).toBe(7)
    expect(stripCollidingSchemaIds(null)).toBe(null)
  })
})

describe("stripCollidingSchemaIdsRecord", () => {
  it("strips a top-level colliding $id and returns a record", () => {
    const out = stripCollidingSchemaIdsRecord({ $id: "/schemas/unknown", type: "object" })
    expect(out.$id).toBeUndefined()
    expect(out.type).toBe("object")
  })
})

describe("stripCollidingSchemaIdsProperties", () => {
  it("strips nested colliding ids while preserving each property as an object", () => {
    const out = stripCollidingSchemaIdsProperties({
      a: { $id: "/schemas/unknown", title: "unknown" },
      b: { type: "string" }
    })
    expect(expectRecord(out.a).$id).toBeUndefined()
    expect(expectRecord(out.a).title).toBe("unknown")
    expect(expectRecord(out.b).type).toBe("string")
  })
})
