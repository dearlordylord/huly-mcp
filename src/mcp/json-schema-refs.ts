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
