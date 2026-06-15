import { Predicate } from "effect"

type JsonSchemaPropertyDescriptions = Readonly<Partial<Record<string, string>>>

export const withJsonSchemaPropertyDescriptions = (
  schema: object,
  descriptions: JsonSchemaPropertyDescriptions
): object => {
  const properties = Predicate.isRecord(schema) ? schema.properties : undefined
  if (!Predicate.isRecord(properties)) return schema
  return {
    ...schema,
    properties: Object.fromEntries(
      Object.entries(properties).map(([key, value]) => {
        const description = descriptions[key]
        return [
          key,
          description === undefined || !Predicate.isRecord(value) ? value : { ...value, description }
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
