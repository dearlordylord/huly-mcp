import { Schema } from "effect"

type JsonSchemaPropertyDescriptions = Readonly<Partial<Record<string, string>>>

const JsonSchemaRecordSchema = Schema.Record({ key: Schema.String, value: Schema.Unknown })

type JsonSchemaRecord = Schema.Schema.Type<typeof JsonSchemaRecordSchema>

export const parseJsonSchemaRecord = (value: unknown): JsonSchemaRecord | undefined => {
  try {
    return Schema.decodeUnknownSync(JsonSchemaRecordSchema)(value)
  } catch {
    return undefined
  }
}

export const withJsonSchemaPropertyDescriptions = (
  schema: object,
  descriptions: JsonSchemaPropertyDescriptions
): object => {
  const properties = parseJsonSchemaRecord(parseJsonSchemaRecord(schema)?.properties)
  if (properties === undefined) return schema
  return {
    ...schema,
    properties: Object.fromEntries(
      Object.entries(properties).map(([key, value]) => {
        const description = descriptions[key]
        const property = parseJsonSchemaRecord(value)
        return [
          key,
          description === undefined || property === undefined ? value : { ...property, description }
        ]
      })
    )
  }
}

export const withExactlyOneRequired = <K extends string>(
  schema: object,
  fields: ReadonlyArray<K>
): object => ({
  ...schema,
  oneOf: fields.map((field) => ({ required: [field] }))
})
