import { JsonSchema, Schema, SchemaAST } from "effect"

const DRAFT_07_DEFINITIONS_REF = "#/definitions"
const MCP_DEFINITIONS_REF = "#/$defs"

const restoreMcpDefinitionRef = (ref: string): string =>
  ref === DRAFT_07_DEFINITIONS_REF || ref.startsWith(`${DRAFT_07_DEFINITIONS_REF}/`)
    ? `${MCP_DEFINITIONS_REF}${ref.slice(DRAFT_07_DEFINITIONS_REF.length)}`
    : ref

const JsonSchemaObjectSchema = Schema.Record(Schema.String, Schema.Json)
const JsonArraySchema = Schema.Array(Schema.Json)

type JsonSchemaObject = Schema.Schema.Type<typeof JsonSchemaObjectSchema>

const parseJsonObject = (value: unknown): JsonSchemaObject | undefined => {
  try {
    return Schema.decodeUnknownSync(JsonSchemaObjectSchema)(value)
  } catch {
    return undefined
  }
}

const restoreMcpDefinitionRefsInJson = (value: Schema.Json): Schema.Json => {
  if (Array.isArray(value)) {
    return Schema.decodeUnknownSync(JsonArraySchema)(value).map(restoreMcpDefinitionRefsInJson)
  }
  if (typeof value !== "object" || value === null) return value

  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [
      key,
      key === "$ref" && typeof nested === "string"
        ? restoreMcpDefinitionRef(nested)
        : restoreMcpDefinitionRefsInJson(nested)
    ])
  )
}

const restoreMcpDefinitionRefs = (schema: JsonSchema.JsonSchema): JsonSchemaObject => {
  const parsed = Schema.decodeUnknownSync(JsonSchemaObjectSchema)(schema)
  return Object.fromEntries(
    Object.entries(parsed).map(([key, value]) => [
      key,
      key === "$ref" && typeof value === "string"
        ? restoreMcpDefinitionRef(value)
        : restoreMcpDefinitionRefsInJson(value)
    ])
  )
}

const FLATTENABLE_ALLOF_KEYS = new Set([
  "description",
  "exclusiveMaximum",
  "exclusiveMinimum",
  "format",
  "maxItems",
  "maxLength",
  "maximum",
  "minItems",
  "minLength",
  "minimum",
  "multipleOf",
  "pattern",
  "title",
  "uniqueItems"
])

const flattenScalarAllOf = (value: Schema.Json): Schema.Json => {
  if (Array.isArray(value)) return Schema.decodeUnknownSync(JsonArraySchema)(value).map(flattenScalarAllOf)
  if (typeof value !== "object" || value === null) return value
  const record = Schema.decodeUnknownSync(JsonSchemaObjectSchema)(value)
  const recursivelyNormalized = Object.fromEntries(
    Object.entries(record).map(([key, nested]) => [key, flattenScalarAllOf(nested)])
  )
  const allOf = recursivelyNormalized.allOf
  if (!Array.isArray(allOf)) return recursivelyNormalized
  const members = Schema.decodeUnknownSync(JsonArraySchema)(allOf).map(parseJsonObject)
  if (
    members.some(
      (member) => member === undefined || Object.keys(member).some((key) => !FLATTENABLE_ALLOF_KEYS.has(key))
    )
  ) {
    return recursivelyNormalized
  }
  const memberKeys = members.flatMap((member) => (member === undefined ? [] : Object.keys(member)))
  if (new Set(memberKeys).size !== memberKeys.length) return recursivelyNormalized
  const merged = Object.assign({}, ...members)
  if (Object.keys(merged).some((key) => key in recursivelyNormalized && recursivelyNormalized[key] !== merged[key])) {
    return recursivelyNormalized
  }
  const withoutAllOf = Object.fromEntries(Object.entries(recursivelyNormalized).filter(([key]) => key !== "allOf"))
  return { ...withoutAllOf, ...merged }
}

const annotatedAstDescription = (ast: SchemaAST.AST): string | undefined => {
  const contextDescription = ast.context === undefined ? undefined : ast.context.annotations?.description
  const direct = contextDescription === undefined ? ast.annotations?.description : contextDescription
  return typeof direct === "string" ? direct : undefined
}

const checkedAstDescription = (ast: SchemaAST.AST): string | undefined => {
  const checks = ast.checks === undefined ? [] : ast.checks
  const matchingCheck = checks.find((check) => typeof check.annotations?.description === "string")
  const checkDescription = matchingCheck === undefined ? undefined : matchingCheck.annotations?.description
  return typeof checkDescription === "string" ? checkDescription : undefined
}

const directAstDescription = (ast: SchemaAST.AST): string | undefined =>
  annotatedAstDescription(ast) ?? checkedAstDescription(ast)

const astDescription = (ast: SchemaAST.AST): string | undefined => {
  const direct = directAstDescription(ast)
  if (direct !== undefined) return direct
  if (SchemaAST.isUnion(ast)) {
    const members = ast.types.filter((member) => !SchemaAST.isUndefined(member))
    const descriptions = members
      .map(astDescription)
      .filter((description): description is string => description !== undefined)
    if (members.length === 1) return descriptions[0]
    if (descriptions.length === members.length && new Set(descriptions).size === 1) return descriptions[0]
  }
  return undefined
}

const astAuthoredJsonSchema = (ast: SchemaAST.AST): JsonSchemaObject | undefined => {
  const annotation = ast.context?.annotations?.jsonSchema ?? ast.annotations?.jsonSchema
  return parseJsonObject(annotation)
}

const restoreUnionDescriptions = (ast: SchemaAST.Union, record: JsonSchemaObject): Schema.Json => {
  if (!Array.isArray(record.anyOf)) return record
  const members = ast.types.filter((member) => !SchemaAST.isUndefined(member))
  const anyOf = Schema.decodeUnknownSync(JsonArraySchema)(record.anyOf)
  return {
    ...record,
    anyOf: anyOf.map((member, index) => {
      const astMember = members[index]
      return astMember === undefined ? member : restoreAstPropertyDescriptions(astMember, member)
    })
  }
}

const restorePropertyDescription = (propertyAst: SchemaAST.AST, property: Schema.Json): Schema.Json => {
  const restored = restoreAstPropertyDescriptions(propertyAst, property)
  const record = parseJsonObject(restored)
  const description = astDescription(propertyAst)
  if (description === undefined || record === undefined) return restored
  return record.$ref === undefined
    ? { ...record, description: record.description ?? description }
    : { allOf: [{ $ref: record.$ref }], description }
}

const restoreObjectDescriptions = (ast: SchemaAST.Objects, record: JsonSchemaObject): Schema.Json => {
  const properties = record.properties === undefined ? undefined : parseJsonObject(record.properties)
  if (properties === undefined) return record
  const signatures = new Map(ast.propertySignatures.map((signature) => [signature.name, signature.type]))
  return {
    ...record,
    properties: Object.fromEntries(
      Object.entries(properties).map(([key, property]) => {
        const propertyAst = signatures.get(key)
        return [key, propertyAst === undefined ? property : restorePropertyDescription(propertyAst, property)]
      })
    )
  }
}

const restoreArrayDescriptions = (ast: SchemaAST.Arrays, record: JsonSchemaObject): Schema.Json => {
  if (record.items === undefined) return record
  const elementAst = ast.rest[0] ?? ast.elements[0]
  return elementAst === undefined
    ? record
    : { ...record, items: restoreAstPropertyDescriptions(elementAst, record.items) }
}

const restoreAstPropertyDescriptions = (ast: SchemaAST.AST, jsonSchema: Schema.Json): Schema.Json => {
  const record = parseJsonObject(jsonSchema)
  if (record === undefined) return jsonSchema
  const authored = astAuthoredJsonSchema(ast)
  const restoredRecord = authored === undefined ? record : { ...record, ...authored }
  if (SchemaAST.isUnion(ast)) return restoreUnionDescriptions(ast, restoredRecord)
  if (SchemaAST.isObjects(ast)) return restoreObjectDescriptions(ast, restoredRecord)

  if (SchemaAST.isArrays(ast)) return restoreArrayDescriptions(ast, restoredRecord)

  return restoredRecord
}

/**
 * Converts the encoded side of an Effect Schema to the Draft-07 document shape
 * exposed by MCP. Effect owns dialect conversion; this adapter only restores
 * the existing MCP `$defs` packaging after Draft-07 conversion.
 */
export const toDraft07JsonSchema = (schema: Schema.Constraint): JsonSchema.JsonSchema => {
  const draft07 = JsonSchema.toDocumentDraft07(Schema.toJsonSchemaDocument(schema, { onExcessProperty: "error" }))
  const definitions = Object.fromEntries(
    Object.entries(draft07.definitions).map(([name, definition]) => [name, restoreMcpDefinitionRefs(definition)])
  )

  const document = flattenScalarAllOf({
    $schema: JsonSchema.META_SCHEMA_URI_DRAFT_07,
    ...restoreMcpDefinitionRefs(draft07.schema),
    ...(Object.keys(definitions).length === 0 ? {} : { $defs: definitions })
  })
  return Schema.decodeUnknownSync(JsonSchemaObjectSchema)(restoreAstPropertyDescriptions(schema.ast, document))
}

export const toDraft07EmptyObjectJsonSchema = (schema: Schema.Constraint): JsonSchema.JsonSchema => {
  const converted = toDraft07JsonSchema(schema)
  const definitions = parseJsonSchemaRecord(converted.$defs)
  return {
    $schema: converted.$schema,
    ...(definitions === undefined ? {} : { $defs: definitions }),
    type: "object",
    properties: {},
    additionalProperties: false
  }
}

type JsonSchemaPropertyDescriptions = Readonly<Partial<Record<string, string>>>

const JsonSchemaRecordSchema = Schema.Record(Schema.String, Schema.Unknown)

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
        return [key, description === undefined || property === undefined ? value : { ...property, description }]
      })
    )
  }
}

export const withJsonSchemaUnionPropertyDescriptions = (
  schema: object,
  descriptions: JsonSchemaPropertyDescriptions
): object => {
  const parsed = parseJsonSchemaRecord(schema)
  if (parsed === undefined || !Array.isArray(parsed.anyOf)) return schema
  return {
    ...parsed,
    anyOf: parsed.anyOf.map((member) => {
      const record = parseJsonSchemaRecord(member)
      return record === undefined ? member : withJsonSchemaPropertyDescriptions(record, descriptions)
    })
  }
}

export const withExactlyOneRequired = <K extends string>(schema: object, fields: ReadonlyArray<K>): object => ({
  ...schema,
  oneOf: fields.map((field) => ({ required: [field] }))
})
