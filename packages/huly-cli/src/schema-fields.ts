import type { CliOptionName, CliSchemaFieldName } from "./catalog-types.js"

export interface FieldSpec {
  readonly fieldName: CliSchemaFieldName
  readonly schema: unknown
}

const MAX_SCHEMA_REF_DEPTH = 8

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const variantValues = (schema: Record<string, unknown>): ReadonlyArray<unknown> =>
  ["allOf", "anyOf", "oneOf"].flatMap((key) => (Array.isArray(schema[key]) ? schema[key] : []))

export const fieldNameToOptionName = (fieldName: CliSchemaFieldName): CliOptionName =>
  fieldName
    .replaceAll("_", "-")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase()

const collectPropertyRecords = (rootSchema: object, schema: unknown, depth = 0): Array<Record<string, unknown>> => {
  if (depth > MAX_SCHEMA_REF_DEPTH) return []
  if (!isRecord(schema)) return []

  const resolved = resolveLocalRef(rootSchema, schema)
  if (resolved !== schema) return collectPropertyRecords(rootSchema, resolved, depth + 1)

  const records: Array<Record<string, unknown>> = []
  if (isRecord(schema.properties)) {
    records.push(schema.properties)
  }

  for (const variant of variantValues(schema)) {
    records.push(...collectPropertyRecords(rootSchema, variant, depth + 1))
  }

  return records
}

export const collectFieldSpecs = (schema: object): ReadonlyMap<CliOptionName, FieldSpec> => {
  const fields = new Map<CliOptionName, FieldSpec>()
  for (const properties of collectPropertyRecords(schema, schema)) {
    for (const [fieldName, fieldSchema] of Object.entries(properties)) {
      const optionName = fieldNameToOptionName(fieldName)
      const existing = fields.get(optionName)
      fields.set(optionName, {
        fieldName,
        schema: existing === undefined ? fieldSchema : { anyOf: [existing.schema, fieldSchema] }
      })
    }
  }
  return fields
}

const localRefName = (ref: string): string | undefined => {
  const prefix = "#/$defs/"
  if (!ref.startsWith(prefix)) return undefined
  return decodeURIComponent(ref.slice(prefix.length)).replaceAll("~1", "/").replaceAll("~0", "~")
}

const resolveLocalRef = (rootSchema: object, schema: unknown): unknown => {
  if (!isRecord(schema) || typeof schema.$ref !== "string" || !isRecord(rootSchema)) return schema
  const name = localRefName(schema.$ref)
  if (name === undefined || !isRecord(rootSchema.$defs)) return schema
  return rootSchema.$defs[name] ?? schema
}

const directRequiredFieldNames = (schema: Record<string, unknown>): ReadonlySet<string> =>
  new Set(
    Array.isArray(schema.required) ? schema.required.filter((name): name is string => typeof name === "string") : []
  )

const intersectSets = (sets: ReadonlyArray<ReadonlySet<string>>): ReadonlySet<string> => {
  const [first, ...rest] = sets
  return first === undefined ? new Set() : new Set([...first].filter((name) => rest.every((set) => set.has(name))))
}

const commonUnionRequiredNames = (schema: Record<string, unknown>, rootSchema: object): ReadonlySet<string> => {
  const unions = ["anyOf", "oneOf"].flatMap((key) => (Array.isArray(schema[key]) ? [schema[key]] : []))
  return new Set(
    unions.flatMap((variants) => [
      ...intersectSets(variants.map((variant) => requiredFieldNamesFor(variant, rootSchema)))
    ])
  )
}

const requiredFieldNamesFor = (
  schema: unknown,
  rootSchema: object = isRecord(schema) ? schema : {}
): ReadonlySet<string> => {
  if (!isRecord(schema)) return new Set()
  const resolved = resolveLocalRef(rootSchema, schema)
  if (!isRecord(resolved)) return new Set()
  const required = new Set(directRequiredFieldNames(resolved))
  const allOf = Array.isArray(resolved.allOf) ? resolved.allOf : []
  for (const name of allOf.flatMap((variant) => [...requiredFieldNamesFor(variant, rootSchema)])) required.add(name)
  for (const name of commonUnionRequiredNames(resolved, rootSchema)) required.add(name)
  return required
}

export const collectRequiredFieldNames = (schema: object): ReadonlySet<string> => requiredFieldNamesFor(schema, schema)

const directUnionAlternatives = (schema: Record<string, unknown>): ReadonlyArray<unknown> | undefined => {
  for (const variantKey of ["anyOf", "oneOf"]) {
    const variants = schema[variantKey]
    if (Array.isArray(variants) && variants.length > 1) return variants
  }
  return undefined
}

const findFieldUnionAlternatives = (
  schema: unknown,
  fieldName: string
): ReadonlyArray<ReadonlySet<string>> | undefined => {
  if (!isRecord(schema)) return undefined
  const direct = directUnionAlternatives(schema)
  if (direct !== undefined) {
    const requiredSets = direct.map((variant) => requiredFieldNamesFor(variant, schema))
    const present = requiredSets.filter((required) => required.has(fieldName)).length
    if (present > 0 && present < requiredSets.length) return requiredSets
  }
  const allOf = Array.isArray(schema.allOf) ? schema.allOf : []
  for (const variant of allOf) {
    const nested = findFieldUnionAlternatives(variant, fieldName)
    if (nested !== undefined) return nested
  }
  return undefined
}

const unionAlternativesDescription = (rootSchema: object, fieldName: string): string | undefined => {
  const alternatives = findFieldUnionAlternatives(rootSchema, fieldName)
  if (alternatives === undefined) return undefined
  const shared = intersectSets(alternatives)
  const choices = alternatives.map((required) => [...required].filter((name) => !shared.has(name)))
  if (choices.some((choice) => choice.length === 0)) return undefined
  return `Choose one input alternative: ${choices.map((choice) => `{ ${choice.join(", ")} }`).join(" | ")}.`
}

const directSchemaTypeMatches = (schema: Record<string, unknown>, typeName: string): boolean =>
  schema.type === typeName || (Array.isArray(schema.type) && schema.type.includes(typeName))

const variantSchemaTypeMatches = (
  rootSchema: object,
  schema: Record<string, unknown>,
  typeName: string,
  depth: number
): boolean =>
  ["allOf", "anyOf", "oneOf"].some((variantKey) => {
    const variants = schema[variantKey]
    return (
      Array.isArray(variants) && variants.some((variant) => schemaHasType(rootSchema, variant, typeName, depth + 1))
    )
  })

const schemaHasType = (rootSchema: object, schema: unknown, typeName: string, depth = 0): boolean => {
  if (depth > MAX_SCHEMA_REF_DEPTH || !isRecord(schema)) return false
  const resolved = resolveLocalRef(rootSchema, schema)
  if (!isRecord(resolved)) return false

  return directSchemaTypeMatches(resolved, typeName) || variantSchemaTypeMatches(rootSchema, resolved, typeName, depth)
}

const directSchemaMayAcceptString = (schema: Record<string, unknown>): boolean => {
  if (schema.type !== undefined && !directSchemaTypeMatches(schema, "string")) return false
  if (schema.const !== undefined && typeof schema.const !== "string") return false
  if (Array.isArray(schema.enum) && !schema.enum.some((literal) => typeof literal === "string")) return false
  return true
}

const allOfMayAcceptString = (rootSchema: object, schema: Record<string, unknown>, depth: number): boolean => {
  const variants = schema.allOf
  return !Array.isArray(variants) || variants.every((variant) => schemaMayAcceptString(rootSchema, variant, depth + 1))
}

const unionMayAcceptString = (
  rootSchema: object,
  schema: Record<string, unknown>,
  variantKey: "anyOf" | "oneOf",
  depth: number
): boolean => {
  const variants = schema[variantKey]
  return !Array.isArray(variants) || variants.some((variant) => schemaMayAcceptString(rootSchema, variant, depth + 1))
}

const compositionsMayAcceptString = (rootSchema: object, schema: Record<string, unknown>, depth: number): boolean =>
  allOfMayAcceptString(rootSchema, schema, depth) &&
  unionMayAcceptString(rootSchema, schema, "anyOf", depth) &&
  unionMayAcceptString(rootSchema, schema, "oneOf", depth)

const schemaMayAcceptString = (rootSchema: object, schema: unknown, depth = 0): boolean => {
  if (depth > MAX_SCHEMA_REF_DEPTH || !isRecord(schema)) return false
  const resolved = resolveLocalRef(rootSchema, schema)
  if (!isRecord(resolved) || !directSchemaMayAcceptString(resolved)) return false
  if (resolved !== schema) return schemaMayAcceptString(rootSchema, resolved, depth + 1)
  return compositionsMayAcceptString(rootSchema, resolved, depth)
}

export const fieldAcceptsBoolean = (rootSchema: object, field: FieldSpec): boolean =>
  schemaHasType(rootSchema, field.schema, "boolean")

export const fieldAcceptsNull = (rootSchema: object, field: FieldSpec): boolean =>
  schemaHasType(rootSchema, field.schema, "null")

export const fieldAcceptsNumber = (rootSchema: object, field: FieldSpec): boolean =>
  schemaHasType(rootSchema, field.schema, "integer") || schemaHasType(rootSchema, field.schema, "number")

export const fieldAcceptsString = (rootSchema: object, field: FieldSpec): boolean =>
  schemaHasType(rootSchema, field.schema, "string")

export const fieldAcceptsJson = (rootSchema: object, field: FieldSpec): boolean =>
  schemaHasType(rootSchema, field.schema, "array") || schemaHasType(rootSchema, field.schema, "object")

export const fieldUsesBooleanOption = (rootSchema: object, field: FieldSpec): boolean =>
  fieldAcceptsBoolean(rootSchema, field) &&
  !fieldAcceptsString(rootSchema, field) &&
  !fieldAcceptsNumber(rootSchema, field) &&
  !fieldAcceptsJson(rootSchema, field)

const firstVariantDescription = (
  rootSchema: object,
  schema: Record<string, unknown>,
  depth: number
): string | undefined => {
  for (const variantKey of ["allOf", "anyOf", "oneOf"]) {
    const variants = schema[variantKey]
    if (!Array.isArray(variants)) continue
    for (const variant of variants) {
      const description = schemaDescription(rootSchema, variant, depth + 1)
      if (description !== undefined) return description
    }
  }
  return undefined
}

const schemaDescription = (rootSchema: object, schema: unknown, depth = 0): string | undefined => {
  if (depth > MAX_SCHEMA_REF_DEPTH || !isRecord(schema)) return undefined
  if (typeof schema.description === "string") return schema.description
  const resolved = resolveLocalRef(rootSchema, schema)
  if (!isRecord(resolved)) return undefined
  return typeof resolved.description === "string"
    ? resolved.description
    : firstVariantDescription(rootSchema, resolved, depth)
}

const fieldSchemaDescription = (rootSchema: object, field: FieldSpec): string | undefined =>
  schemaDescription(rootSchema, field.schema)

interface FieldConstraints {
  readonly defaults: Set<string>
  readonly literals: Set<string>
  readonly shapes: Set<string>
  readonly types: Set<string>
}

const emptyFieldConstraints = (): FieldConstraints => ({
  defaults: new Set(),
  literals: new Set(),
  shapes: new Set(),
  types: new Set()
})

const encodedLiteral = (value: unknown): string | undefined => {
  const encoded = JSON.stringify(value)
  return typeof encoded === "string" ? encoded : undefined
}

const addTypeConstraints = (schema: Record<string, unknown>, constraints: FieldConstraints): void => {
  const types = Array.isArray(schema.type) ? schema.type : [schema.type]
  for (const typeName of types) if (typeof typeName === "string" && typeName !== "null") constraints.types.add(typeName)
}

const addLiteralConstraints = (schema: Record<string, unknown>, constraints: FieldConstraints): void => {
  const literals = Array.isArray(schema.enum) ? schema.enum : schema.const === undefined ? [] : [schema.const]
  for (const literal of literals) {
    const encoded = encodedLiteral(literal)
    if (encoded !== undefined) constraints.literals.add(encoded)
  }
}

const addScalarConstraints = (schema: Record<string, unknown>, constraints: FieldConstraints): void => {
  const encodedDefault = encodedLiteral(schema.default)
  if (encodedDefault !== undefined) constraints.defaults.add(encodedDefault)
}

const addShapeConstraints = (schema: Record<string, unknown>, constraints: FieldConstraints): void => {
  const required = Array.isArray(schema.required)
    ? schema.required.filter((name): name is string => typeof name === "string")
    : []
  if (required.length > 0) constraints.shapes.add(`{ ${required.join(", ")} }`)
}

const addDirectConstraints = (schema: Record<string, unknown>, constraints: FieldConstraints): void => {
  addTypeConstraints(schema, constraints)
  addLiteralConstraints(schema, constraints)
  addScalarConstraints(schema, constraints)
  addShapeConstraints(schema, constraints)
}

const collectVariantConstraints = (
  rootSchema: object,
  schema: Record<string, unknown>,
  constraints: FieldConstraints,
  depth: number
): void => {
  for (const variantKey of ["allOf", "anyOf", "oneOf"]) {
    const variants = schema[variantKey]
    if (!Array.isArray(variants)) continue
    for (const variant of variants) collectFieldConstraints(rootSchema, variant, constraints, depth + 1)
  }
}

const collectFieldConstraints = (
  rootSchema: object,
  schema: unknown,
  constraints: FieldConstraints,
  depth = 0
): void => {
  if (depth > MAX_SCHEMA_REF_DEPTH || !isRecord(schema)) return
  const resolved = resolveLocalRef(rootSchema, schema)
  if (!isRecord(resolved)) return
  addDirectConstraints(resolved, constraints)
  if (resolved !== schema) collectFieldConstraints(rootSchema, resolved, constraints, depth + 1)
  collectVariantConstraints(rootSchema, resolved, constraints, depth)
}

const joinedConstraint = (label: string, values: ReadonlySet<string>): string | undefined =>
  values.size === 0 ? undefined : `${label}: ${[...values].join(" | ")}.`

const directPatterns = (schema: Record<string, unknown>): ReadonlyArray<string> =>
  typeof schema.pattern === "string" ? [schema.pattern] : []

const allOfPatterns = (rootSchema: object, schema: Record<string, unknown>, depth: number): ReadonlyArray<string> =>
  (Array.isArray(schema.allOf) ? schema.allOf : []).flatMap((variant) => [
    ...collectUniversalPatterns(rootSchema, variant, depth + 1)
  ])

const sharedUnionPatterns = (
  rootSchema: object,
  schema: Record<string, unknown>,
  depth: number
): ReadonlyArray<string> =>
  ["anyOf", "oneOf"].flatMap((variantKey) => {
    const variants = schema[variantKey]
    if (!Array.isArray(variants) || variants.length === 0) return []
    const stringVariants = variants.filter((variant) => schemaMayAcceptString(rootSchema, variant, depth + 1))
    if (stringVariants.length === 0) return []
    return [...intersectSets(stringVariants.map((variant) => collectUniversalPatterns(rootSchema, variant, depth + 1)))]
  })

const collectUniversalPatterns = (rootSchema: object, schema: unknown, depth = 0): ReadonlySet<string> => {
  if (depth > MAX_SCHEMA_REF_DEPTH || !isRecord(schema)) return new Set()
  const resolved = resolveLocalRef(rootSchema, schema)
  if (!isRecord(resolved)) return new Set()
  return new Set([
    ...directPatterns(resolved),
    ...allOfPatterns(rootSchema, resolved, depth),
    ...sharedUnionPatterns(rootSchema, resolved, depth)
  ])
}

export const fieldOptionDescription = (rootSchema: object, field: FieldSpec): string => {
  const description = fieldSchemaDescription(rootSchema, field)
  const constraints = emptyFieldConstraints()
  collectFieldConstraints(rootSchema, field.schema, constraints)
  const allowed = joinedConstraint("Allowed values", constraints.literals)
  const types = joinedConstraint("Type", constraints.types)
  const patterns = joinedConstraint("Pattern", collectUniversalPatterns(rootSchema, field.schema))
  const shapes = joinedConstraint("JSON shape alternatives", constraints.shapes)
  const defaults = joinedConstraint("Default", constraints.defaults)
  const unionAlternatives = unionAlternativesDescription(rootSchema, field.fieldName)
  const json = fieldAcceptsJson(rootSchema, field) ? "Pass arrays or objects as JSON." : undefined
  const nullable = fieldAcceptsNull(rootSchema, field) ? "Pass null to clear the field." : undefined
  return [description, allowed, types, patterns, shapes, defaults, unionAlternatives, json, nullable]
    .filter((part) => part !== undefined)
    .join(" ")
}
