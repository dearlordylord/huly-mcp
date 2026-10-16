import { Option, Schema } from "effect"

import { collectJsonSchemaDefinitions } from "./json-schema-refs.js"

export interface McpInputSchema {
  readonly type: "object"
  readonly properties?: Record<string, unknown>
  readonly required?: ReadonlyArray<string>
  readonly $defs?: Record<string, unknown>
  readonly [key: string]: unknown
}

type ObjectSchemaField = "properties" | "$defs"

const ROOT_COMPOSITION_KEYS = new Set(["anyOf", "oneOf", "allOf"])
const LOCAL_DEFINITION_REF_PREFIX = "#/$defs/"
const MAX_SCHEMA_REF_DEPTH = 8
const UnknownRecordSchema = Schema.Record(Schema.String, Schema.Unknown)
const UnknownArraySchema = Schema.Array(Schema.Unknown)
type UnknownRecord = Schema.Schema.Type<typeof UnknownRecordSchema>

const decodeUnknownRecord = Schema.decodeUnknownOption(UnknownRecordSchema)
const decodeUnknownArray = Schema.decodeUnknownOption(UnknownArraySchema)

const parseUnknownRecord = (value: unknown): UnknownRecord | undefined =>
  value === undefined ? undefined : Option.getOrUndefined(decodeUnknownRecord(value))

const parseUnknownRecordArray = (value: unknown): ReadonlyArray<UnknownRecord> =>
  value === undefined
    ? []
    : Option.match(decodeUnknownArray(value), {
        onNone: () => [],
        onSome: (items) =>
          items.flatMap((item) => {
            const record = parseUnknownRecord(item)
            return record === undefined ? [] : [record]
          })
      })

const mergeObjectFields = (sources: ReadonlyArray<unknown>): Record<string, unknown> | undefined => {
  const merged = sources.reduce<Record<string, unknown>>((acc, source) => {
    const record = parseUnknownRecord(source)
    return record === undefined ? acc : { ...record, ...acc }
  }, {})
  return Object.keys(merged).length > 0 ? merged : undefined
}

const rootCompositionBranches = (schema: object): ReadonlyArray<Record<string, unknown>> =>
  [...ROOT_COMPOSITION_KEYS].flatMap((key) => {
    const branches = Reflect.get(schema, key)
    return parseUnknownRecordArray(branches)
  })

const decodeLocalDefinitionToken = (reference: string): string | undefined => {
  try {
    return decodeURIComponent(reference.slice(LOCAL_DEFINITION_REF_PREFIX.length))
      .replaceAll("~1", "/")
      .replaceAll("~0", "~")
  } catch {
    return undefined
  }
}

const rootReferencedSchema = (schema: object): Record<string, unknown> | undefined => {
  const reference = Reflect.get(schema, "$ref")
  const definitions = parseUnknownRecord(Reflect.get(schema, "$defs"))
  if (typeof reference !== "string" || !reference.startsWith(LOCAL_DEFINITION_REF_PREFIX)) return undefined
  if (definitions === undefined) return undefined
  const token = decodeLocalDefinitionToken(reference)
  return token === undefined ? undefined : parseUnknownRecord(definitions[token])
}

const schemaAndCompositionDescendants = (schema: object, depth = 0): ReadonlyArray<object> => {
  if (depth >= MAX_SCHEMA_REF_DEPTH) return [schema]
  const referenced = rootReferencedSchema(schema)
  const descendants = [...(referenced === undefined ? [] : [referenced]), ...rootCompositionBranches(schema)]
  return [schema, ...descendants.flatMap((branch) => schemaAndCompositionDescendants(branch, depth + 1))]
}

const mergedSchemaField = (schema: object, field: ObjectSchemaField): Record<string, unknown> | undefined =>
  mergeObjectFields(schemaAndCompositionDescendants(schema).map((branch) => Reflect.get(branch, field)))

const mergedRequired = (schema: object): ReadonlyArray<string> => {
  const referenced = rootReferencedSchema(schema)
  const rootSchemas = referenced === undefined ? [schema] : [schema, referenced]
  return [
    ...new Set(
      rootSchemas.flatMap((branch) => {
        const required = Reflect.get(branch, "required")
        return Array.isArray(required) ? required.filter((value): value is string => typeof value === "string") : []
      })
    )
  ]
}

/**
 * Some tool clients reject root-level schema composition. Branch-only required
 * constraints stay runtime-only because union branches represent alternatives.
 */
export const toClientCompatibleInputSchema = (schema: object): McpInputSchema => {
  const rootFields = Object.fromEntries(
    Object.entries(schema).filter(([key]) => key !== "type" && !ROOT_COMPOSITION_KEYS.has(key))
  )
  const properties = mergedSchemaField(schema, "properties")
  const defs = collectJsonSchemaDefinitions(schema)
  const required = mergedRequired(schema)

  return {
    ...rootFields,
    type: "object",
    ...(properties === undefined ? {} : { properties }),
    ...(required.length === 0 ? {} : { required }),
    ...(defs === undefined ? {} : { $defs: defs })
  } satisfies McpInputSchema
}
