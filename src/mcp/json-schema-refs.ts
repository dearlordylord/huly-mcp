const isJsonObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const mergeDefinitionRecords = (
  definitions: ReadonlyArray<Record<string, unknown> | undefined>
): Record<string, unknown> | undefined => {
  const merged = definitions.reduce<Record<string, unknown>>(
    (acc, definition) => definition === undefined ? acc : { ...acc, ...definition },
    {}
  )
  return Object.keys(merged).length > 0 ? merged : undefined
}

export const collectJsonSchemaDefinitions = (value: unknown): Record<string, unknown> | undefined => {
  if (Array.isArray(value)) {
    return mergeDefinitionRecords(value.map(collectJsonSchemaDefinitions))
  }
  if (!isJsonObject(value)) return undefined

  const ownDefinitions = isJsonObject(value.$defs) ? value.$defs : undefined
  const nestedDefinitions = Object.entries(value)
    .filter(([key]) => key !== "$defs")
    .map(([, nested]) => collectJsonSchemaDefinitions(nested))

  return mergeDefinitionRecords([...nestedDefinitions, ownDefinitions])
}

export const omitJsonSchemaDocumentMetadata = (schema: object): Record<string, unknown> =>
  Object.fromEntries(Object.entries(schema).filter(([key]) => key !== "$defs" && key !== "$schema"))

const EFFECT_PSEUDO_ID_PREFIX = "/schemas/"

const isCollidingSchemaId = (key: string, value: unknown): boolean =>
  key === "$id" && typeof value === "string" && value.startsWith(EFFECT_PSEUDO_ID_PREFIX)

/**
 * Effect's JSON Schema encoder tags inline `unknown`/`any`/empty-struct nodes with a fixed
 * `$id` such as `/schemas/unknown` or `/schemas/{}`. Those ids repeat across many tools, so a
 * client that dereferences `$id`/`$ref` across the aggregated tool set sees a single id resolve
 * to more than one schema and rejects the whole server (observed: opencode loads 0 tools). The
 * ids are self-identifying inline nodes that nothing `$ref`s, so removing them clears the
 * collision without changing validation.
 */
export const stripCollidingSchemaIds = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stripCollidingSchemaIds)
  if (!isJsonObject(value)) return value
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key, nested]) => !isCollidingSchemaId(key, nested))
      .map(([key, nested]) => [key, stripCollidingSchemaIds(nested)])
  )
}

export const stripCollidingSchemaIdsRecord = (record: Record<string, unknown>): Record<string, unknown> => {
  const stripped = stripCollidingSchemaIds(record)
  return isJsonObject(stripped) ? stripped : record
}

export const stripCollidingSchemaIdsProperties = (
  properties: Record<string, object>
): Record<string, object> =>
  Object.fromEntries(
    Object.entries(properties).map(([key, value]) => {
      const stripped = stripCollidingSchemaIds(value)
      return [key, isJsonObject(stripped) ? stripped : value]
    })
  )
