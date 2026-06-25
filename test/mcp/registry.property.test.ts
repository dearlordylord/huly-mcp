import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js"
import { Schema } from "effect"
import * as fc from "fast-check"
import { describe, expect, it } from "vitest"

import { createToolOutputSchema } from "../../src/mcp/tool-output-schema.js"
import {
  CATEGORY_NAMES,
  createFilteredRegistry,
  createScopedRegistry,
  toolRegistry
} from "../../src/mcp/tools/index.js"
import {
  createToolDefinition,
  isNoArgumentTool,
  makeToolCategory,
  makeToolName,
  requiresArgumentsObject,
  resolveAnnotations,
  type ToolDefinition
} from "../../src/mcp/tools/registry.js"
import { propertyTestParameters } from "../helpers/property.js"

const knownCategories = [...CATEGORY_NAMES]
const knownToolNames = toolRegistry.definitions.map((tool) => tool.name)
const knownCategoryArbitrary = fc.constantFrom(...knownCategories)
const knownToolNameArbitrary = fc.constantFrom(...knownToolNames)
const unknownCategoryArbitrary = fc.stringMatching(/^[a-z][a-z0-9_-]{1,24}$/).map(makeToolCategory).filter(
  (category) => !CATEGORY_NAMES.has(category)
)
const unknownToolNameArbitrary = fc.stringMatching(/^[a-z][a-z0-9_]{1,32}$/).map(makeToolName).filter(
  (name) => !toolRegistry.tools.has(name)
)

const wordArbitrary = fc.stringMatching(/^[a-z][a-z0-9]{0,10}$/)
const toolNameArbitrary = fc.array(wordArbitrary, { minLength: 1, maxLength: 5 }).map((parts) => parts.join("_"))
const requiredArbitrary = fc.array(fc.stringMatching(/^[a-z][a-z0-9_]{0,12}$/), { maxLength: 4 })
const unionSchemaArbitrary = fc.record({ required: requiredArbitrary }, { requiredKeys: [] })

const deriveTitle = (name: string): string =>
  name.split("_").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ")

const annotationKeys = [
  "destructiveHint",
  "idempotentHint",
  "openWorldHint",
  "readOnlyHint",
  "title"
] satisfies ReadonlyArray<keyof ToolAnnotations>

const prefixDefaults = [
  {
    prefixes: ["list_", "get_", "search_", "fulltext_", "download_", "preview_"],
    defaults: { destructiveHint: false, idempotentHint: true, openWorldHint: false, readOnlyHint: true }
  },
  {
    prefixes: ["create_", "add_", "upload_", "send_", "log_"],
    defaults: { destructiveHint: false, idempotentHint: false, openWorldHint: false, readOnlyHint: false }
  },
  {
    prefixes: [
      "update_",
      "edit_",
      "set_",
      "pin_",
      "unpin_",
      "mark_",
      "archive_",
      "start_",
      "stop_",
      "save_",
      "unsave_",
      "remove_",
      "move_"
    ],
    defaults: { destructiveHint: false, idempotentHint: true, openWorldHint: false, readOnlyHint: false }
  },
  {
    prefixes: ["delete_"],
    defaults: { destructiveHint: true, idempotentHint: true, openWorldHint: false, readOnlyHint: false }
  },
  {
    prefixes: ["custom_"],
    defaults: { destructiveHint: true, idempotentHint: false, openWorldHint: false, readOnlyHint: false }
  }
] satisfies ReadonlyArray<{
  readonly defaults: Omit<ToolAnnotations, "title">
  readonly prefixes: ReadonlyArray<string>
}>

const prefixCaseArbitrary = fc.constantFrom(
  ...prefixDefaults.flatMap(({ defaults, prefixes }) => prefixes.map((prefix) => ({ defaults, prefix })))
)

const toolDefinition = (name: string, inputSchema: object, annotations?: ToolAnnotations): ToolDefinition => ({
  ...createToolDefinition({
    name,
    description: "generated test tool",
    inputSchema,
    outputSchema: createToolOutputSchema(Schema.Struct({ generated: Schema.Boolean })),
    category: "generated"
  }),
  ...(annotations !== undefined && { annotations })
})

describe("createFilteredRegistry properties", () => {
  it("preserves registry order and map membership for any requested category set", () => {
    fc.assert(
      fc.property(
        fc.array(fc.oneof(knownCategoryArbitrary, unknownCategoryArbitrary), { maxLength: 12 }),
        (categories) => {
          const requested = new Set(categories)
          const filtered = createFilteredRegistry(requested)
          const expectedDefinitions = toolRegistry.definitions.filter((tool) => requested.has(tool.category))

          expect(filtered.definitions).toEqual(expectedDefinitions)
          expect([...filtered.tools.keys()]).toEqual(expectedDefinitions.map((tool) => tool.name))
          for (const tool of filtered.definitions) {
            expect(requested.has(tool.category)).toBe(true)
            expect(filtered.tools.get(tool.name)).toBe(tool)
          }
        }
      ),
      propertyTestParameters
    )
  })

  it("returns an empty registry when all requested categories are invalid", () => {
    fc.assert(
      fc.property(fc.array(unknownCategoryArbitrary, { maxLength: 12 }), (categories) => {
        const filtered = createFilteredRegistry(new Set(categories))

        expect(filtered.definitions).toEqual([])
        expect(filtered.tools.size).toBe(0)
      }),
      propertyTestParameters
    )
  })
})

describe("createScopedRegistry properties", () => {
  it("returns the full registry when filtering is inactive", () => {
    fc.assert(
      fc.property(
        fc.array(fc.oneof(knownCategoryArbitrary, unknownCategoryArbitrary), { maxLength: 12 }),
        fc.array(fc.oneof(knownToolNameArbitrary, unknownToolNameArbitrary), { maxLength: 12 }),
        (categories, toolNames) => {
          const scoped = createScopedRegistry({
            filteringActive: false,
            categories: new Set(categories),
            toolNames: new Set(toolNames)
          })

          expect(scoped).toBe(toolRegistry)
        }
      ),
      propertyTestParameters
    )
  })

  it("preserves registry order and always returns a subset when filtering is active", () => {
    fc.assert(
      fc.property(
        fc.array(fc.oneof(knownCategoryArbitrary, unknownCategoryArbitrary), { maxLength: 12 }),
        fc.array(fc.oneof(knownToolNameArbitrary, unknownToolNameArbitrary), { maxLength: 12 }),
        (categories, toolNames) => {
          const requestedCategories = new Set(categories)
          const requestedToolNames = new Set(toolNames)
          const scoped = createScopedRegistry({
            filteringActive: true,
            categories: requestedCategories,
            toolNames: requestedToolNames
          })
          const expected = toolRegistry.definitions.filter((tool) =>
            requestedCategories.has(tool.category) || requestedToolNames.has(tool.name)
          )

          expect(scoped.definitions).toEqual(expected)
          expect([...scoped.tools.keys()]).toEqual(expected.map((tool) => tool.name))
          for (const tool of scoped.definitions) {
            expect(toolRegistry.tools.get(tool.name)).toBe(tool)
          }
        }
      ),
      propertyTestParameters
    )
  })
})

describe("tool argument schema properties", () => {
  it("requires an arguments object exactly when direct or union required fields are present", () => {
    fc.assert(
      fc.property(
        requiredArbitrary,
        fc.array(unionSchemaArbitrary, { maxLength: 4 }),
        fc.array(unionSchemaArbitrary, { maxLength: 4 }),
        (required, anyOf, oneOf) => {
          const inputSchema = { required, anyOf, oneOf }
          const expected = required.length > 0
            || anyOf.some((schema) => (schema.required?.length ?? 0) > 0)
            || oneOf.some((schema) => (schema.required?.length ?? 0) > 0)

          expect(requiresArgumentsObject(toolDefinition("generated_tool", inputSchema))).toBe(expected)
        }
      ),
      propertyTestParameters
    )
  })

  it("classifies no-argument tools by empty properties and additionalProperties false", () => {
    fc.assert(
      fc.property(
        fc.dictionary(fc.stringMatching(/^[a-z][a-z0-9_]{0,12}$/), fc.anything()),
        fc.option(fc.boolean(), { nil: undefined }),
        (properties, additionalProperties) => {
          const inputSchema = {
            properties,
            ...(additionalProperties !== undefined && { additionalProperties })
          }

          expect(isNoArgumentTool(toolDefinition("generated_tool", inputSchema))).toBe(
            Object.keys(properties).length === 0 && additionalProperties === false
          )
        }
      ),
      propertyTestParameters
    )
  })

  it("classifies empty Effect Struct union schemas and actual registry no-arg tools", () => {
    fc.assert(
      fc.property(fc.boolean(), (useOneOf) => {
        const inputSchema = {
          [useOneOf ? "oneOf" : "anyOf"]: [{ type: "object" }, { type: "array" }]
        }

        expect(isNoArgumentTool(toolDefinition("generated_empty_struct", inputSchema))).toBe(true)
        expect(requiresArgumentsObject(toolDefinition("generated_empty_struct", inputSchema))).toBe(false)
      }),
      propertyTestParameters
    )

    const listProjectTypes = toolRegistry.tools.get(makeToolName("list_project_types"))

    expect(listProjectTypes).toBeDefined()
    if (listProjectTypes !== undefined) {
      expect(isNoArgumentTool(listProjectTypes)).toBe(true)
      expect(requiresArgumentsObject(listProjectTypes)).toBe(false)
    }
  })

  it("does not classify union schemas with declared fields as no-argument tools", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("anyOf", "oneOf"),
        fc.array(fc.array(fc.stringMatching(/^[a-z][a-z0-9_]{0,12}$/), { minLength: 1, maxLength: 4 }), {
          minLength: 1,
          maxLength: 4
        }),
        (unionKey, requiredGroups) => {
          const inputSchema = {
            [unionKey]: [
              { type: "object" },
              ...requiredGroups.map((required) => ({
                properties: Object.fromEntries(required.map((key) => [key, { type: "string" }])),
                required
              }))
            ]
          }

          expect(isNoArgumentTool(toolDefinition("generated_union", inputSchema))).toBe(
            requiredGroups.every((required) => required.length === 0)
          )
        }
      ),
      propertyTestParameters
    )
  })

  it("does not classify scalar or underspecified union variants as no-argument tools", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("anyOf", "oneOf"),
        fc.array(
          fc.oneof(
            fc.record({ type: fc.constantFrom("string", "number", "boolean", "null") }),
            fc.constant({})
          ),
          { minLength: 1, maxLength: 4 }
        ),
        (unionKey, variants) => {
          expect(isNoArgumentTool(toolDefinition("generated_union", { [unionKey]: variants }))).toBe(false)
        }
      ),
      propertyTestParameters
    )
  })
})

describe("resolveAnnotations properties", () => {
  it("is stable, defaulted, and gives explicit annotations precedence", () => {
    fc.assert(
      fc.property(
        prefixCaseArbitrary,
        toolNameArbitrary,
        fc.record(
          {
            destructiveHint: fc.boolean(),
            idempotentHint: fc.boolean(),
            openWorldHint: fc.boolean(),
            readOnlyHint: fc.boolean(),
            title: fc.string({ maxLength: 32 })
          },
          { requiredKeys: [] }
        ),
        ({ defaults, prefix }, suffix, annotations) => {
          const tool = toolDefinition(`${prefix}${suffix}`, {}, annotations)
          const resolved = resolveAnnotations(tool)

          expect(resolveAnnotations(tool)).toEqual(resolved)
          expect(resolved).toEqual({ ...resolved, ...annotations })
          for (const key of annotationKeys) {
            if (annotations[key] !== undefined) {
              expect(resolved[key]).toBe(annotations[key])
            }
          }
          if (annotations.title === undefined) {
            expect(resolved.title).toBe(deriveTitle(tool.name))
          }
          expect(resolved.destructiveHint).toBe(annotations.destructiveHint ?? defaults.destructiveHint)
          expect(resolved.idempotentHint).toBe(annotations.idempotentHint ?? defaults.idempotentHint)
          expect(resolved.openWorldHint).toBe(annotations.openWorldHint ?? defaults.openWorldHint)
          expect(resolved.readOnlyHint).toBe(annotations.readOnlyHint ?? defaults.readOnlyHint)
        }
      ),
      propertyTestParameters
    )
  })
})
