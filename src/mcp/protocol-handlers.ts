import type {
  CallToolResult,
  ListResourcesResult,
  ListResourceTemplatesResult,
  ListToolsResult,
  ReadResourceResult
} from "@modelcontextprotocol/sdk/types.js"
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js"
import { Cause, Chunk, Effect, Exit, Schema } from "effect"

import { type GetHulyContextResult, GetHulyContextResultSchema } from "../domain/schemas/index.js"
import { HulyClient } from "../huly/client.js"
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
  versionToolDefinition
} from "./huly-context-tool.js"
import { isObjectSchema, toClientCompatibleInputSchema } from "./input-schema-compat.js"
import { listResources, listResourceTemplates, readHulyResource } from "./resources.js"
import { defaultToolOutputSchema } from "./tool-output-schema.js"
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

const deriveEditMode = (name: string, args: unknown): string | undefined => {
  if (name !== "edit_document" || args === undefined) return undefined
  if (typeof args !== "object" || args === null || Array.isArray(args)) return undefined
  if ("old_text" in args) return "search_and_replace"
  if ("content" in args) return "full_replace"
  return "title_only"
}

const validateHulyContextResult = (value: unknown): GetHulyContextResult =>
  Schema.decodeUnknownSync(GetHulyContextResultSchema)(value)

const createDrainInflight = (getInflight: () => number): () => Promise<void> => () => {
  if (getInflight() <= 0) return Promise.resolve()
  return new Promise((resolve) => {
    const start = Date.now() // eslint-disable-line no-restricted-syntax -- non-Effect Promise-based drain loop
    const check = () => {
      if (getInflight() <= 0 || Date.now() - start > DRAIN_TIMEOUT_MS) { // eslint-disable-line no-restricted-syntax
        resolve()
      } else {
        setTimeout(check, DRAIN_POLL_MS)
      }
    }
    check()
  })
}

const fetchLatestNpmVersion = async (): Promise<string> => {
  try {
    const res = await fetch(`https://registry.npmjs.org/${NPM_PACKAGE_NAME}/latest`, {
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
  getHulyContext: () => GetHulyContextResult
): McpProtocolHandlers => {
  let inflight = 0
  const drainInflight = createDrainInflight(() => inflight)
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
        ...registry.definitions.flatMap((tool) => {
          if (!isObjectSchema(tool.inputSchema)) return []
          return [{
            name: tool.name,
            description: tool.description,
            inputSchema: toProtocolObjectSchema(toClientCompatibleInputSchema(tool.inputSchema)),
            outputSchema: toProtocolObjectSchema(defaultToolOutputSchema),
            annotations: resolveAnnotations(tool)
          }]
        })
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

      const start = Date.now() // eslint-disable-line no-restricted-syntax -- non-Effect async handler
      const inputBytes = JSON.stringify(args ?? {}).length

      const returnError = (errorResponse: McpToolResponse, editMode?: string) => {
        const durationMs = Date.now() - start // eslint-disable-line no-restricted-syntax -- non-Effect async handler
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

        const latest = await fetchLatestNpmVersion()
        const versionResponse = createSuccessResponse({ current: VERSION, latest })
        const durationMs = Date.now() - start // eslint-disable-line no-restricted-syntax -- non-Effect async handler
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
        const durationMs = Date.now() - start // eslint-disable-line no-restricted-syntax -- non-Effect async handler
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
      const durationMs = Date.now() - start // eslint-disable-line no-restricted-syntax
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
      const clients = await resolveResourceClientsOrThrow(resolveClients, createResourceListClientResolutionError)
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
      const resourceRead = await Effect.runPromiseExit(
        readHulyResource(uri).pipe(
          Effect.provideService(HulyClient, clients.hulyClient)
        )
      )
      if (Exit.isSuccess(resourceRead)) return resourceRead.value
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
