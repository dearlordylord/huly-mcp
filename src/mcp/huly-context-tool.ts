import { Schema } from "effect"
import type { SanitizedHulyRuntimeConfigContext } from "../config/config.js"
import type { GetHulyContextResult } from "../domain/schemas/index.js"
import { Count, NonEmptyString } from "../domain/schemas/index.js"
import { VERSION } from "../version.js"
import { DEFAULT_HTTP_PORT } from "./http-transport.js"
import { createToolOutputSchema, hulyContextToolOutputSchema } from "./tool-output-schema.js"
import { CATEGORY_NAMES, type ToolRegistry, toolRegistry } from "./tools/index.js"

const NPM_PACKAGE_NAME = "@firfi/huly-mcp"
export const VERSION_TOOL_NAME = "get_version"
export const GET_HULY_CONTEXT_TOOL_NAME = "get_huly_context"

type BuiltinToolName = typeof VERSION_TOOL_NAME | typeof GET_HULY_CONTEXT_TOOL_NAME

const emptyInputSchema: {
  readonly type: "object"
  readonly properties: Record<string, never>
  readonly additionalProperties: false
} = { type: "object", properties: {}, additionalProperties: false }

export const VersionToolResultSchema = Schema.Struct({
  current: NonEmptyString,
  latest: NonEmptyString
})

export const versionToolDefinition = {
  name: VERSION_TOOL_NAME,
  description: "Returns the current version of this Huly MCP server and the latest version available on npm.",
  inputSchema: emptyInputSchema,
  outputSchema: createToolOutputSchema(VersionToolResultSchema),
  annotations: {
    title: "Get Version",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true
  }
}

export const getHulyContextToolDefinition = {
  name: GET_HULY_CONTEXT_TOOL_NAME,
  description:
    "Returns sanitized runtime and configuration context for this Huly MCP session, including package version, transport, auth mode, Huly URL origin/host, workspace, timeout, and toolset filtering. Does not connect to Huly. Secret values such as tokens, passwords, and credential headers are never returned.",
  inputSchema: emptyInputSchema,
  outputSchema: hulyContextToolOutputSchema,
  annotations: {
    title: "Get Huly Context",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false
  }
}

interface ToolsetFilterSummary {
  readonly enabledCategories: ReadonlySet<string> | undefined
  readonly requestedCategories: ReadonlyArray<string>
  readonly ignoredCategories: ReadonlyArray<string>
}

export const parseToolsets = (
  raw: string | undefined,
  writeError: (message: string) => void
): ToolsetFilterSummary => {
  if (raw === undefined || raw.trim() === "") {
    return {
      enabledCategories: undefined,
      requestedCategories: [],
      ignoredCategories: []
    }
  }
  const requested = raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
  const parsed = requested.reduce<{
    readonly enabledCategories: ReadonlyArray<string>
    readonly ignoredCategories: ReadonlyArray<string>
  }>((acc, category) => {
    if (CATEGORY_NAMES.has(category)) {
      return {
        ...acc,
        enabledCategories: [...acc.enabledCategories, category]
      }
    }

    writeError(
      `Warning: unknown toolset category "${category}", ignoring. Valid categories: ${[...CATEGORY_NAMES].join(", ")}`
    )
    return {
      ...acc,
      ignoredCategories: [...acc.ignoredCategories, category]
    }
  }, {
    enabledCategories: [],
    ignoredCategories: []
  })
  const enabled = new Set(parsed.enabledCategories)

  return {
    enabledCategories: enabled.size > 0 ? enabled : undefined,
    requestedCategories: requested,
    ignoredCategories: parsed.ignoredCategories
  }
}

const builtinToolNames: ReadonlyArray<BuiltinToolName> = [VERSION_TOOL_NAME, GET_HULY_CONTEXT_TOOL_NAME]

const nonEmptyOrDefault = (value: string | undefined, fallback: string): string => {
  const trimmed = value?.trim()
  return trimmed === undefined || trimmed === "" ? fallback : trimmed
}

export const buildHulyContext = (
  config: {
    readonly transport: "stdio" | "http"
    readonly httpPort?: number
    readonly httpHost?: string
  },
  registry: ToolRegistry,
  toolsetSummary: ToolsetFilterSummary,
  runtimeConfig: SanitizedHulyRuntimeConfigContext
): GetHulyContextResult => ({
  package: {
    name: NPM_PACKAGE_NAME,
    version: nonEmptyOrDefault(VERSION, "0.0.0-dev")
  },
  transport: {
    type: config.transport,
    ...(config.transport === "http"
      ? {
        http: {
          host: nonEmptyOrDefault(config.httpHost, "127.0.0.1"),
          port: config.httpPort ?? DEFAULT_HTTP_PORT
        }
      }
      : {})
  },
  huly: runtimeConfig.huly,
  auth: runtimeConfig.auth,
  configSources: runtimeConfig.configSources,
  toolsets: {
    filteringActive: toolsetSummary.enabledCategories !== undefined,
    requestedCategories: toolsetSummary.requestedCategories,
    enabledCategories: toolsetSummary.enabledCategories === undefined ? [] : [...toolsetSummary.enabledCategories],
    ignoredCategories: toolsetSummary.ignoredCategories,
    availableCategories: [...CATEGORY_NAMES],
    visibleRegisteredToolCount: Count.make(registry.definitions.length),
    totalRegisteredToolCount: Count.make(toolRegistry.definitions.length),
    builtinTools: builtinToolNames
  }
})
