export interface FieldSpec {
  readonly fieldName: string
  readonly schema: unknown
}

const MAX_SCHEMA_REF_DEPTH = 8

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const fieldNameToOptionName = (fieldName: string): string =>
  fieldName
    .replaceAll("_", "-")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase()

const collectPropertyRecords = (schema: unknown): Array<Record<string, unknown>> => {
  if (!isRecord(schema)) return []

  const records: Array<Record<string, unknown>> = []
  if (isRecord(schema.properties)) {
    records.push(schema.properties)
  }

  for (const variantKey of ["allOf", "anyOf", "oneOf"]) {
    const variants = schema[variantKey]
    if (Array.isArray(variants)) {
      for (const variant of variants) {
        records.push(...collectPropertyRecords(variant))
      }
    }
  }

  return records
}

export const collectFieldSpecs = (schema: object): ReadonlyMap<string, FieldSpec> => {
  const fields = new Map<string, FieldSpec>()
  for (const properties of collectPropertyRecords(schema)) {
    for (const [fieldName, fieldSchema] of Object.entries(properties)) {
      fields.set(fieldNameToOptionName(fieldName), { fieldName, schema: fieldSchema })
    }
  }
  return fields
}

const localRefName = (ref: string): string | undefined => {
  const prefix = "#/$defs/"
  if (!ref.startsWith(prefix)) return undefined
  return decodeURIComponent(ref.slice(prefix.length))
}

const resolveLocalRef = (rootSchema: object, schema: unknown): unknown => {
  if (!isRecord(schema) || typeof schema.$ref !== "string" || !isRecord(rootSchema)) return schema
  const name = localRefName(schema.$ref)
  if (name === undefined || !isRecord(rootSchema.$defs)) return schema
  return rootSchema.$defs[name] ?? schema
}

const schemaHasType = (
  rootSchema: object,
  schema: unknown,
  typeName: string,
  depth = 0
): boolean => {
  if (depth > MAX_SCHEMA_REF_DEPTH || !isRecord(schema)) return false
  const resolved = resolveLocalRef(rootSchema, schema)
  if (!isRecord(resolved)) return false

  if (resolved.type === typeName) return true
  if (Array.isArray(resolved.type) && resolved.type.includes(typeName)) return true

  for (const variantKey of ["allOf", "anyOf", "oneOf"]) {
    const variants = resolved[variantKey]
    if (
      Array.isArray(variants) && variants.some((variant) => schemaHasType(rootSchema, variant, typeName, depth + 1))
    ) {
      return true
    }
  }

  return false
}

export const fieldAcceptsBoolean = (rootSchema: object, field: FieldSpec): boolean =>
  schemaHasType(rootSchema, field.schema, "boolean")

export const fieldAcceptsNull = (rootSchema: object, field: FieldSpec): boolean =>
  schemaHasType(rootSchema, field.schema, "null")

export const fieldAcceptsNumber = (rootSchema: object, field: FieldSpec): boolean =>
  schemaHasType(rootSchema, field.schema, "integer")
  || schemaHasType(rootSchema, field.schema, "number")

export const fieldAcceptsString = (rootSchema: object, field: FieldSpec): boolean =>
  schemaHasType(rootSchema, field.schema, "string")

export const fieldAcceptsJson = (rootSchema: object, field: FieldSpec): boolean =>
  schemaHasType(rootSchema, field.schema, "array")
  || schemaHasType(rootSchema, field.schema, "object")
