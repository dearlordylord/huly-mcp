import type {
  CallToolResult,
  ListResourcesResult,
  ListResourceTemplatesResult,
  ListToolsResult,
  ReadResourceResult
} from "@modelcontextprotocol/sdk/types.js"
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js"
import { Cause, Chunk, Clock, Effect, Exit, Runtime, Schema } from "effect"

import { ConfigValidationError } from "../config/config.js"
import { type GetHulyContextResult, GetHulyContextResultSchema } from "../domain/schemas/index.js"
import type { ToolWarning } from "../domain/schemas/tool-warnings.js"
import { HulyClient } from "../huly/client.js"
import { Diagnostics, makeDiagnosticsScope } from "../huly/diagnostics.js"
import { HulyError } from "../huly/errors-base.js"
import type { HulyStorageClient } from "../huly/storage.js"
import type { WorkspaceClientOperations } from "../huly/workspace-client.js"
import type { TelemetryOperations } from "../telemetry/telemetry.js"
import { VERSION } from "../version.js"
import type { McpToolResponse } from "./error-mapping.js"
import { createSuccessResponse, createUnknownToolError, mapDomainErrorToMcp, toMcpResponse } from "./error-mapping.js"
import {
  GET_HULY_CONTEXT_TOOL_NAME,
  getHulyContextToolDefinition,
  VERSION_TOOL_NAME,
  versionToolDefinition,
  VersionToolResultSchema
} from "./huly-context-tool.js"
import { toClientCompatibleInputSchema } from "./input-schema-compat.js"
import { listResources, listResourceTemplates, readHulyResource } from "./resources.js"
import type { ToolRegistry } from "./tools/index.js"
import { resolveAnnotations } from "./tools/index.js"
import {
  createMissingArgumentsError,
  createUnexpectedArgumentsError,
  isEmptyArgumentsObject,
  isNoArgumentTool,
  requiresArgumentsObject
} from "./tools/registry.js"

export interface ClientBundle {
  readonly hulyClient: HulyClient["Type"]
  readonly storageClient: HulyStorageClient["Type"]
  readonly workspaceClient?: WorkspaceClientOperations
}

interface ToolCallRequest {
  readonly params: {
    readonly name: string
    readonly arguments?: unknown
  }
}

interface ResourceReadRequest {
  readonly params: {
    readonly uri: string
  }
}

type ListToolsProtocolResult = ListToolsResult

export interface McpProtocolHandlers {
  readonly listTools: () => Promise<ListToolsProtocolResult>
  readonly callTool: (request: ToolCallRequest) => Promise<CallToolResult>
  readonly listResources: () => Promise<ListResourcesResult>
  readonly listResourceTemplates: () => ListResourceTemplatesResult
  readonly readResource: (request: ResourceReadRequest) => Promise<ReadResourceResult>
  readonly serverDiscover: () => ServerDiscoverResult
  readonly drainInflight: () => Promise<void>
}

interface ServerDiscoverResult {
  readonly resultType: "complete"
  readonly supportedVersions: readonly ["2026-07-28"]
  readonly capabilities: {
    readonly tools: Record<string, never>
    readonly resources: Record<string, never>
  }
  readonly serverInfo: {
    readonly name: "huly-mcp"
    readonly version: string
  }
}

const DRAIN_POLL_MS = 50
const DRAIN_TIMEOUT_MS = 30_000
const NPM_FETCH_TIMEOUT_MS = 5_000
const NPM_PACKAGE_NAME = "@firfi/huly-mcp"

const computeOutputBytes = (response: McpToolResponse): number =>
  response.content.reduce((sum, c) => sum + c.text.length, 0)

const withResourceWarnings = (
  result: ReadResourceResult,
  warnings: ReadonlyArray<ToolWarning>
): ReadResourceResult =>
  warnings.length === 0
    ? result
    : {
      ...result,
      _meta: {
        ...result._meta,
        warnings
      }
    }

export const deriveEditMode = (name: string, args: unknown): string | undefined => {
  if (name !== "edit_document" || args === undefined) return undefined
  if (typeof args !== "object" || args === null || Array.isArray(args)) return undefined
  if ("old_text" in args) return "search_and_replace"
  if ("content" in args) return "full_replace"
  return "title_only"
}

const validateHulyContextResult = (value: unknown): GetHulyContextResult =>
  Schema.decodeUnknownSync(GetHulyContextResultSchema)(value)

const validateVersionToolResult = (value: unknown): Schema.Schema.Type<typeof VersionToolResultSchema> =>
  Schema.decodeUnknownSync(VersionToolResultSchema)(value)

/**
 * Injected wall-clock reader for telemetry timing and the drain-timeout loop. The live
 * implementation reads Effect's Clock so production code performs no direct wall-clock
 * reads; tests pass a deterministic stub through createMcpProtocolHandlers.
 */
export interface NowClock {
  readonly currentTimeMillis: () => number
}

export const liveNowClock: NowClock = {
  currentTimeMillis: () => Effect.runSync(Clock.currentTimeMillis)
}

const createDrainInflight = (getInflight: () => number, clock: NowClock): () => Promise<void> => () => {
  if (getInflight() <= 0) return Promise.resolve()
  return new Promise((resolve) => {
    const start = clock.currentTimeMillis()
    const check = () => {
      if (getInflight() <= 0 || clock.currentTimeMillis() - start > DRAIN_TIMEOUT_MS) {
        resolve()
      } else {
        setTimeout(check, DRAIN_POLL_MS)
      }
    }
    check()
  })
}

/**
 * Fetch the latest published npm version. The `fetch` implementation is injected
 * (defaulting to the global) so tests can supply a deterministic stub instead of
 * reaching the network — no mocks required.
 */
export const fetchLatestNpmVersion = async (fetchImpl: typeof fetch = fetch): Promise<string> => {
  try {
    const res = await fetchImpl(`https://registry.npmjs.org/${NPM_PACKAGE_NAME}/latest`, {
      signal: AbortSignal.timeout(NPM_FETCH_TIMEOUT_MS)
    })
    if (!res.ok) return "unknown"
    const data: unknown = await res.json()
    if (typeof data === "object" && data !== null && "version" in data && typeof data.version === "string") {
      return data.version
    }
    return "unknown"
  } catch {
    return "unknown"
  }
}

interface ProtocolObjectSchemaSource {
  readonly type: "object"
  readonly properties?: Record<string, unknown> | undefined
  readonly required?: ReadonlyArray<string> | undefined
  readonly [key: string]: unknown
}

type ProtocolObjectSchema = ListToolsResult["tools"][number]["inputSchema"]

const isObjectPropertyEntry = (entry: [string, unknown]): entry is [string, object] => {
  const value = entry[1]
  return typeof value === "object" && value !== null
}

const objectProperties = (properties: Record<string, unknown> | undefined): Record<string, object> | undefined => {
  if (properties === undefined) return undefined

  return Object.entries(properties).filter(isObjectPropertyEntry).reduce<Record<string, object>>(
    (acc, [key, value]) => ({ ...acc, [key]: value }),
    {}
  )
}

const toProtocolObjectSchema = (schema: ProtocolObjectSchemaSource): ProtocolObjectSchema => {
  const { properties, required, ...rest } = schema
  const convertedProperties = objectProperties(properties)
  return {
    ...rest,
    type: "object",
    ...(convertedProperties === undefined ? {} : { properties: convertedProperties }),
    ...(required === undefined ? {} : { required: [...required] })
  }
}

const createResourceClientResolutionError = (uri: string, _error: unknown): McpError =>
  new McpError(
    ErrorCode.InternalError,
    `Failed to initialize Huly clients while reading resource "${uri}". Verify Huly URL, workspace, and authentication configuration.`
  )

const createResourceListClientResolutionError = (_error: unknown): McpError =>
  new McpError(
    ErrorCode.InternalError,
    "Failed to initialize Huly clients while listing resources. Verify Huly URL, workspace, and authentication configuration."
  )

const isConfigValidationFailure = (error: unknown): boolean => {
  if (error instanceof ConfigValidationError) return true
  if (!Runtime.isFiberFailure(error)) return false

  return Chunk.toArray(Cause.failures(error[Runtime.FiberFailureCauseId])).some(
    (failure) => failure instanceof ConfigValidationError
  )
}

const shouldReturnEmptyResourceListOnClientResolutionFailure = (
  error: unknown,
  _getHulyContext: () => GetHulyContextResult
): boolean => isConfigValidationFailure(error)

const resolveResourceClientsOrThrow = async (
  resolveClients: () => Promise<ClientBundle>,
  mapError: (error: unknown) => McpError
): Promise<ClientBundle> => {
  try {
    return await resolveClients()
  } catch (e) {
    throw mapError(e)
  }
}

const throwResourceReadError = (uri: string, cause: Cause.Cause<McpError>): never => {
  const failures = Chunk.toArray(Cause.failures(cause))
  const failure = failures[0]
  if (failure instanceof McpError) throw failure
  throw new McpError(ErrorCode.InternalError, `Failed to read Huly resource "${uri}"`)
}

const throwResourceListError = (cause: Cause.Cause<McpError>): never => {
  const failures = Chunk.toArray(Cause.failures(cause))
  const failure = failures[0]
  if (failure instanceof McpError) throw failure
  throw new McpError(ErrorCode.InternalError, "Failed to list Huly resources")
}

export const createMcpProtocolHandlers = (
  resolveClients: () => Promise<ClientBundle>,
  telemetry: TelemetryOperations,
  registry: ToolRegistry,
  getHulyContext: () => GetHulyContextResult,
  clock: NowClock = liveNowClock,
  fetchLatestVersion: () => Promise<string> = fetchLatestNpmVersion
): McpProtocolHandlers => {
  let inflight = 0
  const drainInflight = createDrainInflight(() => inflight, clock)
  const enter = () => {
    inflight++
  }
  const leave = () => {
    inflight--
  }

  const listTools = async (): Promise<ListToolsProtocolResult> => {
    telemetry.firstListTools()
    return {
      tools: [
        versionToolDefinition,
        getHulyContextToolDefinition,
        ...registry.definitions.map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: toClientCompatibleInputSchema(tool.inputSchema),
          outputSchema: tool.outputSchema,
          annotations: resolveAnnotations(tool)
        }))
      ].map(tool => ({
        ...tool,
        inputSchema: toProtocolObjectSchema(tool.inputSchema),
        outputSchema: toProtocolObjectSchema(tool.outputSchema)
      }))
    }
  }

  const callTool = async (request: ToolCallRequest): Promise<CallToolResult> => {
    enter()
    try {
      const { arguments: args, name } = request.params

      const start = clock.currentTimeMillis()
      const inputBytes = JSON.stringify(args ?? {}).length

      const returnError = (errorResponse: McpToolResponse, editMode?: string) => {
        const durationMs = clock.currentTimeMillis() - start
        telemetry.toolCalled({
          toolName: name,
          status: "error",
          errorTag: errorResponse._meta?.errorTag,
          durationMs,
          inputBytes,
          outputBytes: computeOutputBytes(errorResponse),
          editMode
        })
        return toMcpResponse(errorResponse)
      }

      if (name === VERSION_TOOL_NAME) {
        if (!isEmptyArgumentsObject(args)) return returnError(createUnexpectedArgumentsError(name))

        const latest = await fetchLatestVersion()
        let versionResult: Schema.Schema.Type<typeof VersionToolResultSchema>
        try {
          versionResult = validateVersionToolResult({ current: VERSION, latest })
        } catch {
          return returnError(mapDomainErrorToMcp(new HulyError({ message: "Failed to build version result" })))
        }
        const versionResponse = createSuccessResponse(versionResult)
        const durationMs = clock.currentTimeMillis() - start
        telemetry.toolCalled({
          toolName: name,
          status: "success",
          durationMs,
          inputBytes,
          outputBytes: computeOutputBytes(versionResponse)
        })
        return toMcpResponse(versionResponse)
      }

      if (name === GET_HULY_CONTEXT_TOOL_NAME) {
        if (!isEmptyArgumentsObject(args)) return returnError(createUnexpectedArgumentsError(name))

        let context: GetHulyContextResult
        try {
          context = validateHulyContextResult(getHulyContext())
        } catch {
          return returnError(mapDomainErrorToMcp(new HulyError({ message: "Failed to build Huly context" })))
        }

        const contextResponse = createSuccessResponse(context)
        const durationMs = clock.currentTimeMillis() - start
        telemetry.toolCalled({
          toolName: name,
          status: "success",
          durationMs,
          inputBytes,
          outputBytes: computeOutputBytes(contextResponse)
        })
        return toMcpResponse(contextResponse)
      }

      const tool = registry.tools.get(name)
      if (tool === undefined) return returnError(createUnknownToolError(name))

      if (isNoArgumentTool(tool) && !isEmptyArgumentsObject(args)) {
        return returnError(createUnexpectedArgumentsError(name))
      }

      if (args === undefined && requiresArgumentsObject(tool)) {
        return returnError(createMissingArgumentsError(name))
      }

      const editMode = deriveEditMode(name, args)

      let clients: ClientBundle
      try {
        clients = await resolveClients()
      } catch (e) {
        const errorResponse = mapDomainErrorToMcp(
          new HulyError({ message: `Failed to initialize Huly clients: ${e instanceof Error ? e.message : String(e)}` })
        )
        return returnError(errorResponse, editMode)
      }

      const response = await registry.handleToolCall(
        name,
        args,
        clients.hulyClient,
        clients.storageClient,
        clients.workspaceClient
      )
      const durationMs = clock.currentTimeMillis() - start
      if (response === null) return returnError(createUnknownToolError(name), editMode)

      telemetry.toolCalled({
        toolName: name,
        status: response.isError === true ? "error" : "success",
        errorTag: response._meta?.errorTag,
        durationMs,
        inputBytes,
        outputBytes: computeOutputBytes(response),
        editMode
      })

      return toMcpResponse(response)
    } finally {
      leave()
    }
  }

  const listResourcesHandler = async (): Promise<ListResourcesResult> => {
    enter()
    try {
      let clients: ClientBundle
      try {
        clients = await resolveClients()
      } catch (e) {
        if (shouldReturnEmptyResourceListOnClientResolutionFailure(e, getHulyContext)) return { resources: [] }
        throw createResourceListClientResolutionError(e)
      }

      const resourceList = await Effect.runPromiseExit(
        listResources().pipe(
          Effect.provideService(HulyClient, clients.hulyClient)
        )
      )
      if (Exit.isSuccess(resourceList)) return resourceList.value
      return throwResourceListError(resourceList.cause)
    } finally {
      leave()
    }
  }

  const readResource = async (request: ResourceReadRequest): Promise<ReadResourceResult> => {
    enter()
    try {
      const { uri } = request.params
      const clients = await resolveResourceClientsOrThrow(
        resolveClients,
        error => createResourceClientResolutionError(uri, error)
      )
      const diagnosticsScope = await Effect.runPromise(makeDiagnosticsScope)
      const resourceRead = await Effect.runPromiseExit(
        readHulyResource(uri).pipe(
          Effect.provideService(HulyClient, clients.hulyClient),
          Effect.provideService(Diagnostics, diagnosticsScope.service)
        )
      )
      const warnings = await Effect.runPromise(diagnosticsScope.drainWarnings)
      if (Exit.isSuccess(resourceRead)) return withResourceWarnings(resourceRead.value, warnings)
      return throwResourceReadError(uri, resourceRead.cause)
    } finally {
      leave()
    }
  }

  return {
    listTools,
    callTool,
    listResources: listResourcesHandler,
    listResourceTemplates,
    readResource,
    serverDiscover: () => ({
      resultType: "complete",
      supportedVersions: ["2026-07-28"],
      capabilities: { tools: {}, resources: {} },
      serverInfo: { name: "huly-mcp", version: VERSION }
    }),
    drainInflight
  }
}
