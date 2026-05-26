import type { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js"
import { Schema } from "effect"

import { type GetHulyContextResult, GetHulyContextResultSchema } from "../domain/schemas/index.js"
import type { HulyClient } from "../huly/client.js"
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
import { registerResourceHandlers } from "./resources.js"
import { createDefaultMcpSdkServer } from "./sdk-server.js"
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

type McpServerHandle = readonly [server: Server, drainInflight: () => Promise<void>]

const DRAIN_POLL_MS = 50
const DRAIN_TIMEOUT_MS = 30_000

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

export const createMcpServer = (
  resolveClients: () => Promise<ClientBundle>,
  telemetry: TelemetryOperations,
  registry: ToolRegistry,
  getHulyContext: () => GetHulyContextResult,
  createServer: () => Server = createDefaultMcpSdkServer
): McpServerHandle => {
  let inflight = 0
  const drainInflight = createDrainInflight(() => inflight)
  const server = createServer()

  server.setRequestHandler(ListToolsRequestSchema, async () => {
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
            inputSchema: toClientCompatibleInputSchema(tool.inputSchema),
            outputSchema: defaultToolOutputSchema,
            annotations: resolveAnnotations(tool)
          }]
        })
      ]
    }
  })

  registerResourceHandlers(server, resolveClients, {
    enter: () => {
      inflight++
    },
    leave: () => {
      inflight--
    }
  })

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    inflight++
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
      inflight--
    }
  })

  const handle: McpServerHandle = [server, drainInflight]
  return handle
}

const NPM_FETCH_TIMEOUT_MS = 5_000
const NPM_PACKAGE_NAME = "@firfi/huly-mcp"

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
