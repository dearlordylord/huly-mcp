import { Schema } from "effect"

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
const UnknownRecordSchema = Schema.Record({ key: Schema.String, value: Schema.Unknown })
const UnknownArraySchema = Schema.Array(Schema.Unknown)
type UnknownRecord = Schema.Schema.Type<typeof UnknownRecordSchema>

const parseUnknownRecord = (value: unknown): UnknownRecord | undefined => {
  try {
    return Schema.decodeUnknownSync(UnknownRecordSchema)(value)
  } catch {
    return undefined
  }
}

const parseUnknownRecordArray = (value: unknown): ReadonlyArray<UnknownRecord> => {
  try {
    return Schema.decodeUnknownSync(UnknownArraySchema)(value).flatMap((item) => {
      const record = parseUnknownRecord(item)
      return record === undefined ? [] : [record]
    })
  } catch {
    return []
  }
}

const mergeObjectFields = (
  sources: ReadonlyArray<unknown>
): Record<string, unknown> | undefined => {
  const merged = sources.reduce<Record<string, unknown>>(
    (acc, source) => {
      const record = parseUnknownRecord(source)
      return record === undefined ? acc : { ...record, ...acc }
    },
    {}
  )
  return Object.keys(merged).length > 0 ? merged : undefined
}

const rootCompositionBranches = (schema: object): ReadonlyArray<Record<string, unknown>> =>
  [...ROOT_COMPOSITION_KEYS].flatMap((key) => {
    const branches = Reflect.get(schema, key)
    return parseUnknownRecordArray(branches)
  })

const schemaAndCompositionDescendants = (
  schema: object
): ReadonlyArray<object> => [
  schema,
  ...rootCompositionBranches(schema).flatMap(schemaAndCompositionDescendants)
]

const mergedSchemaField = (
  schema: object,
  field: ObjectSchemaField
): Record<string, unknown> | undefined =>
  mergeObjectFields(schemaAndCompositionDescendants(schema).map((branch) => Reflect.get(branch, field)))

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

  return {
    ...rootFields,
    type: "object",
    ...(properties === undefined ? {} : { properties }),
    ...(defs === undefined ? {} : { $defs: defs })
  } satisfies McpInputSchema
}
