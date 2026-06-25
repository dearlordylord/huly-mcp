import type { ToolCategory, ToolName } from "./tools/registry.js"

interface ToolScopeToolDefinition {
  readonly name: ToolName
  readonly category: ToolCategory
}

interface ToolScopeRawEnv {
  // Raw environment values before CSV parsing and known-value resolution.
  readonly toolsets: string
  readonly tools: string
}

export interface ToolScopeSummary {
  readonly filteringActive: boolean
  readonly requestedToolsets: ReadonlyArray<string>
  readonly enabledToolsets: ReadonlyArray<ToolCategory>
  readonly ignoredToolsets: ReadonlyArray<string>
  readonly requestedTools: ReadonlyArray<string>
  readonly enabledTools: ReadonlyArray<ToolName>
  readonly ignoredTools: ReadonlyArray<string>
  readonly enabledCategories: ReadonlySet<ToolCategory>
  readonly enabledToolNames: ReadonlySet<ToolName>
  readonly availableCategories: ReadonlyArray<ToolCategory>
  readonly visibleRegisteredToolCount: number
  readonly totalRegisteredToolCount: number
}

const normalizeCsv = (raw: string): ReadonlyArray<string> => {
  const normalized = raw.split(",").map((part) => part.trim().toLowerCase()).filter((part) => part !== "")
  return [...new Set(normalized)]
}

const orderedCategories = (
  definitions: ReadonlyArray<ToolScopeToolDefinition>
): ReadonlyArray<ToolCategory> => [...new Set(definitions.map((definition) => definition.category))]

const knownValueMap = <T extends string>(values: ReadonlyArray<T>): ReadonlyMap<string, T> =>
  new Map(values.map((value) => [value, value]))

const resolveRequested = <T extends string>(
  requested: ReadonlyArray<string>,
  known: ReadonlyMap<string, T>,
  unknownMessage: (name: string) => string,
  writeError: (message: string) => void
): {
  readonly enabled: ReadonlyArray<T>
  readonly ignored: ReadonlyArray<string>
} =>
  requested.reduce<{
    readonly enabled: ReadonlyArray<T>
    readonly ignored: ReadonlyArray<string>
  }>((acc, name) => {
    const knownValue = known.get(name)
    if (knownValue !== undefined) {
      return {
        ...acc,
        enabled: [...acc.enabled, knownValue]
      }
    }

    writeError(unknownMessage(name))
    return {
      ...acc,
      ignored: [...acc.ignored, name]
    }
  }, {
    enabled: [],
    ignored: []
  })

export const resolveToolScope = (
  rawEnv: ToolScopeRawEnv,
  definitions: ReadonlyArray<ToolScopeToolDefinition>,
  writeError: (message: string) => void
): ToolScopeSummary => {
  const requestedToolsets = normalizeCsv(rawEnv.toolsets)
  const requestedTools = normalizeCsv(rawEnv.tools)
  const availableCategories = orderedCategories(definitions)
  const knownCategories = knownValueMap(availableCategories)
  const knownToolNames = knownValueMap(definitions.map((definition) => definition.name))

  const toolsets = resolveRequested(
    requestedToolsets,
    knownCategories,
    (category) =>
      `Warning: unknown toolset category "${category}", ignoring. Valid categories: ${availableCategories.join(", ")}`,
    writeError
  )
  const tools = resolveRequested(
    requestedTools,
    knownToolNames,
    (tool) => `Warning: unknown tool name "${tool}", ignoring.`,
    writeError
  )
  const filteringActive = requestedToolsets.length > 0 || requestedTools.length > 0
  const enabledCategories = new Set(toolsets.enabled)
  const enabledToolNames = new Set(tools.enabled)
  const visibleRegisteredToolCount = filteringActive
    ? definitions.filter((definition) =>
      enabledCategories.has(definition.category) || enabledToolNames.has(definition.name)
    ).length
    : definitions.length

  return {
    filteringActive,
    requestedToolsets,
    enabledToolsets: toolsets.enabled,
    ignoredToolsets: toolsets.ignored,
    requestedTools,
    enabledTools: tools.enabled,
    ignoredTools: tools.ignored,
    enabledCategories,
    enabledToolNames,
    availableCategories,
    visibleRegisteredToolCount,
    totalRegisteredToolCount: definitions.length
  }
}
