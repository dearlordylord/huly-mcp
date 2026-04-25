/**
 * MCP Server infrastructure for Huly MCP server.

 * @module
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js"
import { Config, Context, Effect, Layer, Ref, Schema } from "effect"

import type { HttpServerFactoryService, HttpTransportError } from "./http-transport.js"
import { DEFAULT_HTTP_PORT, startHttpTransport } from "./http-transport.js"

import type { HulyClient } from "../huly/client.js"
import { HulyError } from "../huly/errors-base.js"
import type { HulyStorageClient } from "../huly/storage.js"
import type { WorkspaceClientOperations } from "../huly/workspace-client.js"
import type { TelemetryOperations } from "../telemetry/telemetry.js"
import { TelemetryService } from "../telemetry/telemetry.js"
import { VERSION } from "../version.js"
import type { McpToolResponse } from "./error-mapping.js"
import {
  createSuccessResponse,
  createUnknownToolError,
  mapDomainErrorToMcp,
  McpErrorCode,
  toMcpResponse
} from "./error-mapping.js"
import type { ToolRegistry } from "./tools/index.js"
import { CATEGORY_NAMES, createFilteredRegistry, resolveAnnotations, toolRegistry } from "./tools/index.js"

const NPM_PACKAGE_NAME = "@firfi/huly-mcp"
const VERSION_TOOL_NAME = "get_version"

const versionToolDefinition = {
  name: VERSION_TOOL_NAME,
  description: "Returns the current version of this Huly MCP server and the latest version available on npm.",
  inputSchema: { type: "object" as const, properties: {} },
  annotations: {
    title: "Get Version",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true
  }
}

const NPM_FETCH_TIMEOUT_MS = 5_000

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

const handleVersionTool = async (): Promise<McpToolResponse> => {
  const latest = await fetchLatestNpmVersion()
  return createSuccessResponse({ current: VERSION, latest })
}

interface McpInputSchema {
  readonly type: "object"
  readonly properties?: Record<string, unknown>
  readonly required?: Array<string>
  readonly [key: string]: unknown
}

const isObjectSchema = (schema: object): schema is McpInputSchema => "type" in schema && schema.type === "object"

export type McpTransportType = "stdio" | "http"

/**
 * Bundle of lazily-resolved Huly client services needed by tool handlers.
 */
export interface ClientBundle {
  readonly hulyClient: HulyClient["Type"]
  readonly storageClient: HulyStorageClient["Type"]
  readonly workspaceClient?: WorkspaceClientOperations
}

interface McpServerConfigData {
  readonly transport: McpTransportType
  readonly httpPort?: number
  readonly httpHost?: string
  readonly autoExit?: boolean
  readonly authMethod?: "token" | "password"
}

interface McpServerConfigCallbacks {
  readonly resolveClients: () => Promise<ClientBundle>
  readonly createServer?: () => Server
  readonly createStdioTransport?: () => StdioServerTransport
  readonly writeError?: (message: string) => void
}

type McpServerConfig = McpServerConfigData & McpServerConfigCallbacks

export class McpServerError extends Schema.TaggedError<McpServerError>()(
  "McpServerError",
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Defect)
  }
) {}

const defaultWriteError = (message: string): void => {
  console.error(message)
}

const parseToolsets = (
  raw: string | undefined,
  writeError: (message: string) => void = defaultWriteError
): ReadonlySet<string> | undefined => {
  if (raw === undefined || raw.trim() === "") return undefined
  const requested = raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
  const enabled = new Set<string>()
  for (const r of requested) {
    if (CATEGORY_NAMES.has(r)) {
      enabled.add(r)
    } else {
      writeError(
        `Warning: unknown toolset category "${r}", ignoring. Valid categories: ${[...CATEGORY_NAMES].join(", ")}`
      )
    }
  }
  return enabled.size > 0 ? enabled : undefined
}

interface McpServerOperations {
  readonly run: () => Effect.Effect<void, McpServerError, HttpServerFactoryService>
  readonly stop: () => Effect.Effect<void, McpServerError>
}

/**
 * Create a configured MCP Server instance with tool handlers.
 * Used for both stdio and HTTP transports.
 */
type McpServerHandle = readonly [server: Server, drainInflight: () => Promise<void>]

const DRAIN_POLL_MS = 50
const DRAIN_TIMEOUT_MS = 30_000

const createMcpServer = (
  resolveClients: () => Promise<ClientBundle>,
  telemetry: TelemetryOperations,
  registry: ToolRegistry,
  createServer: () => Server = () =>
    new Server(
      {
        name: "huly-mcp",
        version: VERSION
      },
      {
        capabilities: {
          tools: {}
        }
      }
    )
): McpServerHandle => {
  let inflight = 0
  const drainInflight = (): Promise<void> => {
    if (inflight <= 0) return Promise.resolve()
    return new Promise((resolve) => {
      const start = Date.now() // eslint-disable-line no-restricted-syntax -- non-Effect Promise-based drain loop
      const check = () => {
        if (inflight <= 0 || Date.now() - start > DRAIN_TIMEOUT_MS) { // eslint-disable-line no-restricted-syntax
          resolve()
        } else {
          setTimeout(check, DRAIN_POLL_MS)
        }
      }
      check()
    })
  }

  const server = createServer()

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    telemetry.firstListTools()
    return {
      tools: [
        versionToolDefinition,
        ...registry.definitions.flatMap((tool) => {
          if (!isObjectSchema(tool.inputSchema)) return []
          return [{
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
            annotations: resolveAnnotations(tool)
          }]
        })
      ]
    }
  })

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    inflight++
    try {
      const { arguments: args, name } = request.params

      const start = Date.now() // eslint-disable-line no-restricted-syntax -- non-Effect async handler
      const inputBytes = JSON.stringify(args ?? {}).length

      const computeOutputBytes = (response: McpToolResponse): number =>
        response.content.reduce((sum, c) => sum + c.text.length, 0)

      if (name === VERSION_TOOL_NAME) {
        const versionResponse = await handleVersionTool()
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

      const deriveEditMode = (): string | undefined => {
        if (name !== "edit_document" || args === undefined) return undefined
        if ("old_text" in args) return "search_and_replace"
        if ("content" in args) return "full_replace"
        return "title_only"
      }
      const editMode = deriveEditMode()

      let clients: ClientBundle
      try {
        clients = await resolveClients()
      } catch (e) {
        const durationMs = Date.now() - start // eslint-disable-line no-restricted-syntax
        const errorResponse = mapDomainErrorToMcp(
          new HulyError({ message: `Failed to initialize Huly clients: ${e instanceof Error ? e.message : String(e)}` })
        )
        telemetry.toolCalled({
          toolName: name,
          status: "error",
          errorTag: errorResponse._meta.errorTag,
          durationMs,
          inputBytes,
          outputBytes: computeOutputBytes(errorResponse),
          editMode
        })
        return toMcpResponse(errorResponse)
      }

      const response = await registry.handleToolCall(
        name,
        args ?? {},
        clients.hulyClient,
        clients.storageClient,
        clients.workspaceClient
      )
      const durationMs = Date.now() - start // eslint-disable-line no-restricted-syntax

      if (response === null) {
        const errorResponse = createUnknownToolError(name)
        telemetry.toolCalled({
          toolName: name,
          status: "error",
          errorTag: errorResponse._meta.errorTag,
          durationMs,
          inputBytes,
          outputBytes: computeOutputBytes(errorResponse),
          editMode
        })
        return toMcpResponse(errorResponse)
      }

      const isInternalError = response._meta?.errorCode === McpErrorCode.InternalError
      telemetry.toolCalled({
        toolName: name,
        status: isInternalError ? "error" : "success",
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

  return [server, drainInflight] as const
}

export class McpServerService extends Context.Tag("@hulymcp/McpServer")<
  McpServerService,
  McpServerOperations
>() {
  static layer(
    config: McpServerConfig
  ): Layer.Layer<McpServerService, never, TelemetryService> {
    return Layer.effect(
      McpServerService,
      Effect.gen(function*() {
        const telemetry = yield* TelemetryService
        const writeError = config.writeError ?? defaultWriteError

        const toolsetsRaw = yield* Effect.orElseSucceed(Config.string("TOOLSETS"), () => "")
        const enabledCategories = parseToolsets(toolsetsRaw || undefined, writeError)

        const toolsets = enabledCategories ? [...enabledCategories] : null
        const registry = enabledCategories
          ? createFilteredRegistry(enabledCategories)
          : toolRegistry

        telemetry.sessionStart({
          transport: config.transport,
          authMethod: config.authMethod ?? "password",
          toolCount: registry.definitions.length,
          toolsets
        })

        const flushTelemetry = Effect.ignore(
          Effect.tryPromise(() => telemetry.shutdown())
        )

        const serverRef = yield* Ref.make<Server | null>(null)
        const isRunning = yield* Ref.make(false)

        const operations: McpServerOperations = {
          run: () =>
            Effect.gen(function*() {
              if (yield* Ref.get(isRunning)) {
                return yield* new McpServerError({
                  message: "MCP server is already running"
                })
              }

              yield* Ref.set(isRunning, true)

              if (config.transport === "stdio") {
                const [stdioServer, drainInflight] = createMcpServer(
                  config.resolveClients,
                  telemetry,
                  registry,
                  config.createServer
                )
                yield* Ref.set(serverRef, stdioServer)
                const transport = config.createStdioTransport?.() ?? new StdioServerTransport()

                yield* Effect.tryPromise({
                  try: () => stdioServer.connect(transport),
                  catch: (e) =>
                    new McpServerError({
                      message: `Failed to connect stdio transport: ${String(e)}`,
                      cause: e
                    })
                })

                yield* Effect.async<void, McpServerError>((resume) => {
                  const cleanup = () => {
                    void drainInflight().then(() => {
                      Effect.runSync(Ref.set(isRunning, false))
                      resume(Effect.void)
                    })
                  }

                  process.on("SIGINT", cleanup)
                  process.on("SIGTERM", cleanup)

                  if (config.autoExit) {
                    process.stdin.on("end", cleanup)
                    process.stdin.on("close", cleanup)
                  }

                  return Effect.sync(() => {
                    process.off("SIGINT", cleanup)
                    process.off("SIGTERM", cleanup)
                    if (config.autoExit) {
                      process.stdin.off("end", cleanup)
                      process.stdin.off("close", cleanup)
                    }
                  })
                })

                yield* flushTelemetry

                yield* Effect.tryPromise({
                  try: () => stdioServer.close(),
                  catch: (e) =>
                    new McpServerError({
                      message: `Failed to close server: ${String(e)}`,
                      cause: e
                    })
                })
              } else {
                const port = config.httpPort ?? DEFAULT_HTTP_PORT
                const host = config.httpHost ?? "127.0.0.1"

                yield* startHttpTransport(
                  { port, host },
                  () => createMcpServer(config.resolveClients, telemetry, registry, config.createServer)[0]
                ).pipe(
                  Effect.scoped,
                  Effect.mapError(
                    (e: HttpTransportError) =>
                      new McpServerError({
                        message: e.message,
                        cause: e.cause
                      })
                  )
                )

                yield* Ref.set(isRunning, false)
                yield* flushTelemetry
              }
            }),

          stop: () =>
            Effect.gen(function*() {
              if (!(yield* Ref.get(isRunning))) {
                return
              }

              yield* Ref.set(isRunning, false)

              yield* flushTelemetry

              const runningServer = yield* Ref.get(serverRef)
              if (runningServer !== null) {
                yield* Effect.tryPromise({
                  try: () => runningServer.close(),
                  catch: (e) =>
                    new McpServerError({
                      message: `Failed to stop server: ${String(e)}`,
                      cause: e
                    })
                })
                yield* Ref.set(serverRef, null)
              }
            })
        }

        return operations
      })
    )
  }

  static testLayer(
    mockOperations: Partial<McpServerOperations>
  ): Layer.Layer<McpServerService> {
    const defaultOps: McpServerOperations = {
      run: () => Effect.void,
      stop: () => Effect.void
    }

    return Layer.succeed(McpServerService, { ...defaultOps, ...mockOperations })
  }
}
