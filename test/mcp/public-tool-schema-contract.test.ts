import { Ajv } from "ajv"
import { Schema } from "effect"
import { describe, expect, it } from "vitest"

import { parseJsonSchemaRecord } from "../../src/domain/schemas/json-schema.js"
import { getHulyContextToolDefinition, versionToolDefinition } from "../../src/mcp/huly-context-tool.js"
import { proxyToolDefinitions } from "../../src/mcp/proxy-tools.js"
import { toolRegistry } from "../../src/mcp/tools/index.js"

const DRAFT_07_URI = "http://json-schema.org/draft-07/schema#"

const PublicToolSchema = Schema.Struct({
  name: Schema.NonEmptyString,
  inputSchema: Schema.Record(Schema.String, Schema.Unknown),
  outputSchema: Schema.Record(Schema.String, Schema.Unknown)
})

const decodeJsonPointerToken = (token: string): string => token.replaceAll("~1", "/").replaceAll("~0", "~")

const localDefinitionName = (ref: string): string | undefined => {
  if (!ref.startsWith("#/$defs/")) return undefined
  const token = ref.slice("#/$defs/".length).split("/")[0]
  return decodeJsonPointerToken(Schema.decodeUnknownSync(Schema.String)(token))
}

const inspectSchema = (value: unknown, definitions: Readonly<Record<string, unknown>>, path: string): void => {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => inspectSchema(entry, definitions, `${path}/${index}`))
    return
  }
  const record = parseJsonSchemaRecord(value)
  if (record === undefined) return
  if (Object.hasOwn(record, "prefixItems")) throw new Error(`${path} contains non-Draft-07 prefixItems.`)
  const ref = record.$ref
  if (typeof ref === "string") {
    if (ref.startsWith("#/definitions/")) throw new Error(`${path} contains an unrestored Draft-07 definition ref.`)
    const definition = localDefinitionName(ref)
    if (definition !== undefined && !Object.hasOwn(definitions, definition)) {
      throw new Error(`${path} contains unresolved local ref ${ref}.`)
    }
  }
  Object.entries(record).forEach(([key, child]) => inspectSchema(child, definitions, `${path}/${key}`))
}

const compileSchemaDocument = (
  ajv: Ajv,
  toolName: string,
  surface: "input" | "output",
  schema: Readonly<Record<string, unknown>>
): void => {
  if (schema.$schema !== DRAFT_07_URI) {
    throw new Error(`${toolName} ${surface} schema must declare ${DRAFT_07_URI}.`)
  }
  const definitions = parseJsonSchemaRecord(schema.$defs) ?? {}
  inspectSchema(schema, definitions, `${toolName}/${surface}`)
  try {
    ajv.compile(schema)
  } catch (error) {
    throw new Error(`${toolName} ${surface} schema is not valid Draft-07.`, { cause: error })
  }
}

const compileToolCorpus = (input: unknown): number => {
  const tools = Schema.decodeUnknownSync(Schema.Array(PublicToolSchema))(input)
  const names = new Set<string>()
  const ajv = new Ajv({ allErrors: true, formats: { uuid: true }, strict: true, strictRequired: false })
  for (const tool of tools) {
    if (names.has(tool.name)) throw new Error(`Public tool corpus contains duplicate tool ${tool.name}.`)
    names.add(tool.name)
    compileSchemaDocument(ajv, tool.name, "input", tool.inputSchema)
    compileSchemaDocument(ajv, tool.name, "output", tool.outputSchema)
  }
  return tools.length
}

const publicToolCorpora = () => ({
  native: [...toolRegistry.definitions, versionToolDefinition, getHulyContextToolDefinition],
  proxy: [...proxyToolDefinitions, versionToolDefinition, getHulyContextToolDefinition]
})

describe("public tool JSON Schema contract", () => {
  it("strictly compiles every native and proxy schema as Draft-07", () => {
    const corpora = publicToolCorpora()

    expect(compileToolCorpus(corpora.native)).toBe(corpora.native.length)
    expect(compileToolCorpus(corpora.proxy)).toBe(corpora.proxy.length)
  }, 60_000)

  it("rejects duplicate tools, dialect leaks, and unresolved local definitions", () => {
    const validSchema = { $schema: DRAFT_07_URI, type: "object", properties: {}, additionalProperties: false }
    expect(() =>
      compileToolCorpus([
        { name: "duplicate", inputSchema: validSchema, outputSchema: validSchema },
        { name: "duplicate", inputSchema: validSchema, outputSchema: validSchema }
      ])
    ).toThrow("duplicate tool")
    expect(() =>
      compileToolCorpus([
        {
          name: "newer-dialect",
          inputSchema: { $schema: DRAFT_07_URI, type: "array", prefixItems: [] },
          outputSchema: validSchema
        }
      ])
    ).toThrow("prefixItems")
    expect(() =>
      compileToolCorpus([
        {
          name: "missing-ref",
          inputSchema: { $schema: DRAFT_07_URI, $ref: "#/$defs/Missing" },
          outputSchema: validSchema
        }
      ])
    ).toThrow("unresolved local ref")
    expect(() =>
      compileToolCorpus([
        {
          name: "legacy-ref",
          inputSchema: { $schema: DRAFT_07_URI, $ref: "#/definitions/Legacy" },
          outputSchema: validSchema
        }
      ])
    ).toThrow("unrestored Draft-07 definition ref")
    expect(() =>
      compileToolCorpus([{ name: "missing-dialect", inputSchema: { type: "string" }, outputSchema: validSchema }])
    ).toThrow("must declare")
    expect(() =>
      compileToolCorpus([
        {
          name: "invalid-draft07",
          inputSchema: { $schema: DRAFT_07_URI, type: "not-a-json-schema-type" },
          outputSchema: validSchema
        }
      ])
    ).toThrow("not valid Draft-07")
    expect(() =>
      compileToolCorpus([
        {
          name: "external-ref",
          inputSchema: { $schema: DRAFT_07_URI, $ref: "https://example.test/schema" },
          outputSchema: validSchema
        }
      ])
    ).toThrow("not valid Draft-07")
  })

  it("resolves escaped JSON Pointer definition names", () => {
    const schema = { $schema: DRAFT_07_URI, $defs: { "A/B~C": { type: "string" } }, $ref: "#/$defs/A~1B~0C" }

    expect(compileToolCorpus([{ name: "escaped", inputSchema: schema, outputSchema: schema }])).toBe(1)
  })
})
