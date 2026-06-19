import { describe } from "@effect/vitest"
import * as fc from "fast-check"
import { expect, it } from "vitest"

import type { McpInputSchema } from "../../src/mcp/input-schema-compat.js"
import { toClientCompatibleInputSchema } from "../../src/mcp/input-schema-compat.js"
import { collectJsonSchemaDefinitions } from "../../src/mcp/json-schema-refs.js"
import { assertAt } from "../../src/utils/assertions.js"
import { propertyTestParameters } from "../helpers/property.js"

const ROOT_COMPOSITION_KEYS = ["anyOf", "oneOf", "allOf"] as const

const identifierArbitrary = fc.stringMatching(/^[a-z][a-z0-9]{0,8}$/)

const leafSchemaFor = (key: string, origin: string): Record<string, unknown> => ({
  type: "string",
  description: `generated field ${origin}:${key}`
})

const objectFromKeys = (keys: ReadonlyArray<string>, origin: string): Record<string, unknown> =>
  Object.fromEntries(keys.map((key) => [key, leafSchemaFor(key, origin)]))

const defsFromKeys = (keys: ReadonlyArray<string>, origin: string): Record<string, unknown> =>
  Object.fromEntries(keys.map((key) => [`${key}Def`, { type: "object", title: `${origin}:${key} definition` }]))

interface CompositionNode {
  readonly properties: ReadonlyArray<string>
  readonly defs: ReadonlyArray<string>
  readonly children: ReadonlyArray<CompositionNode>
}

const compositionNodeArbitrary = (depth: number): fc.Arbitrary<CompositionNode> =>
  fc.record({
    properties: fc.uniqueArray(identifierArbitrary, { maxLength: 3 }),
    defs: fc.uniqueArray(identifierArbitrary, { maxLength: 3 }),
    children: depth <= 0 ? fc.constant([]) : fc.array(compositionNodeArbitrary(depth - 1), { maxLength: 3 })
  })

const nodeToSchema = (node: CompositionNode, index: number, origin = `branch-${index}`): Record<string, unknown> => {
  const compositionKey = assertAt(ROOT_COMPOSITION_KEYS, index % ROOT_COMPOSITION_KEYS.length)

  return {
    properties: objectFromKeys(node.properties, origin),
    $defs: defsFromKeys(node.defs, origin),
    ...(node.children.length === 0
      ? {}
      : {
        [compositionKey]: node.children.map((child, childIndex) =>
          nodeToSchema(child, childIndex, `${origin}.${childIndex}`)
        )
      })
  }
}

const generatedSchemaArbitrary: fc.Arbitrary<McpInputSchema> = fc.record({
  title: fc.string({ maxLength: 40 }),
  description: fc.string({ maxLength: 80 }),
  additionalProperties: fc.boolean(),
  rootProperties: fc.uniqueArray(identifierArbitrary, { maxLength: 3 }),
  rootDefs: fc.uniqueArray(identifierArbitrary, { maxLength: 3 }),
  required: fc.uniqueArray(identifierArbitrary, { maxLength: 3 }),
  branches: fc.array(compositionNodeArbitrary(3), { minLength: 1, maxLength: 4 })
}).map(({ additionalProperties, branches, description, required, rootDefs, rootProperties, title }) => ({
  type: "object",
  title,
  description,
  additionalProperties,
  required,
  properties: objectFromKeys(rootProperties, "root"),
  $defs: defsFromKeys(rootDefs, "root"),
  anyOf: branches.slice(0, 1).map((branch, index) => nodeToSchema(branch, index)),
  oneOf: branches.slice(1, 3).map((branch, index) => nodeToSchema(branch, index)),
  allOf: branches.slice(3).map((branch, index) => nodeToSchema(branch, index))
}))

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const compositionBranches = (schema: Record<string, unknown>): ReadonlyArray<Record<string, unknown>> =>
  ROOT_COMPOSITION_KEYS.flatMap((key) => {
    const value = schema[key]
    return Array.isArray(value) ? value.filter(isRecord) : []
  })

const descendants = (schema: Record<string, unknown>): ReadonlyArray<Record<string, unknown>> => [
  schema,
  ...compositionBranches(schema).flatMap(descendants)
]

const expectedMergedField = (schema: McpInputSchema, field: "properties" | "$defs"): Record<string, unknown> =>
  descendants(schema)
    .map((descendant) => descendant[field])
    .reduce<Record<string, unknown>>(
      (merged, value) => isRecord(value) ? { ...value, ...merged } : merged,
      {}
    )

describe("toClientCompatibleInputSchema properties", () => {
  it("removes root composition, recursively merges fields, preserves root metadata, and is idempotent", () => {
    fc.assert(
      fc.property(generatedSchemaArbitrary, (schema) => {
        const sanitized = toClientCompatibleInputSchema(schema)
        const sanitizedAgain = toClientCompatibleInputSchema(sanitized)

        expect(sanitized.anyOf).toBeUndefined()
        expect(sanitized.oneOf).toBeUndefined()
        expect(sanitized.allOf).toBeUndefined()
        expect(sanitized.type).toBe("object")
        expect(sanitized.title).toBe(schema.title)
        expect(sanitized.description).toBe(schema.description)
        expect(sanitized.additionalProperties).toBe(schema.additionalProperties)
        expect(sanitized.required).toEqual(schema.required)
        expect(sanitizedAgain).toEqual(sanitized)

        const properties = isRecord(sanitized.properties) ? sanitized.properties : {}
        const defs = isRecord(sanitized.$defs) ? sanitized.$defs : {}

        expect(properties).toEqual(expectedMergedField(schema, "properties"))
        expect(defs).toEqual(collectJsonSchemaDefinitions(schema) ?? {})
      }),
      propertyTestParameters
    )
  })
})
