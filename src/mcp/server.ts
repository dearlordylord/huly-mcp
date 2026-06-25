/**
 * MCP Server infrastructure for Huly MCP server.

 * @module
 */
import type { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { Config, Context, Effect, Layer, Ref, Schema } from "effect"
import type { Request } from "express"

import { type ClientBundle, createMcpServer } from "./create-mcp-server.js"
import type { HttpServerFactoryService, HttpTransportDependencies, HttpTransportError } from "./http-transport.js"
import { DEFAULT_HTTP_PORT, startHttpTransport } from "./http-transport.js"
import { buildHulyContext, type ToolExposureContext } from "./huly-context-tool.js"
import { createMcpProtocolHandlers } from "./protocol-handlers.js"
import type { ProtocolExposureOptions } from "./protocol-tool-exposure.js"

import { type SanitizedHulyRuntimeConfigContext, sanitizeHulyRuntimeConfigFromEnv } from "../config/config.js"
import type { GetHulyContextResult } from "../domain/schemas/index.js"
import { TelemetryService } from "../telemetry/telemetry.js"
import {
  type McpClientInfoLike,
  parseMcpClientInfo,
  parseToolExposureConfig,
  type ToolExposureConfig
} from "./tool-mode.js"
import { resolveToolScope } from "./tool-scope.js"
import { createScopedRegistry, toolRegistry } from "./tools/index.js"

export type { ClientBundle } from "./create-mcp-server.js"

export type McpTransportType = "stdio" | "http"

interface McpServerConfigData {
  readonly transport: McpTransportType
  readonly httpPort?: number
  readonly httpHost?: string
  readonly mcpAuthToken?: string
  readonly autoExit?: boolean
  readonly authMethod?: "token" | "password"
  readonly httpTransportDependencies?: Partial<HttpTransportDependencies>
}

interface McpServerConfigCallbacks {
  readonly resolveClients: () => Promise<ClientBundle>
  readonly resolveClientsForHttpRequest?: (req: Request) => Promise<ClientBundle>
  readonly getRuntimeConfigContext?: () => SanitizedHulyRuntimeConfigContext
  readonly getRuntimeConfigContextForHttpRequest?: (req: Request) => SanitizedHulyRuntimeConfigContext
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

const parseToolExposureConfigEffect = (
  env: Parameters<typeof parseToolExposureConfig>[0]
): Effect.Effect<ToolExposureConfig, McpServerError> => {
  const parsed = parseToolExposureConfig(env)
  if (parsed._tag === "Success") return Effect.succeed(parsed.value)
  return Effect.fail(new McpServerError({ message: parsed.message }))
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const clientInfoFromMcp2026Request = (req: Request): McpClientInfoLike | undefined => {
  const body = req.body
  if (!isRecord(body) || !isRecord(body.params) || !isRecord(body.params._meta)) return undefined
  const clientInfo = body.params._meta["io.modelcontextprotocol/clientInfo"]
  return parseMcpClientInfo(clientInfo)
}

const clientInfoFromLegacyHttpRequest = (req: Request): McpClientInfoLike | undefined => {
  const body = req.body
  if (!isRecord(body) || !isRecord(body.params)) return undefined
  return parseMcpClientInfo(body.params.clientInfo) ?? clientInfoFromMcp2026Request(req)
}

interface McpServerOperations {
  readonly run: () => Effect.Effect<void, McpServerError, HttpServerFactoryService>
  readonly stop: () => Effect.Effect<void, McpServerError>
}

export class McpServerService extends Context.Tag("@hulymcp/McpServer")<
  McpServerService,
  McpServerOperations
>() {
  static layer(
    config: McpServerConfig
  ): Layer.Layer<McpServerService, McpServerError, TelemetryService> {
    return Layer.effect(
      McpServerService,
      Effect.gen(function*() {
        const telemetry = yield* TelemetryService
        const writeError = config.writeError ?? defaultWriteError

        const toolsetsRaw = yield* Effect.orElseSucceed(Config.string("TOOLSETS"), () => "")
        const toolsRaw = yield* Effect.orElseSucceed(Config.string("TOOLS"), () => "")
        const hulyToolModeRaw = yield* Effect.orElseSucceed(
          Config.string("HULY_TOOL_MODE"),
          (): string | undefined => undefined
        )
        const proxyOutputStrictRaw = yield* Effect.orElseSucceed(
          Config.string("PROXY_OUTPUT_STRICT"),
          (): string | undefined => undefined
        )
        const exposureConfig = yield* parseToolExposureConfigEffect({
          ...(hulyToolModeRaw === undefined ? {} : { hulyToolMode: hulyToolModeRaw }),
          ...(proxyOutputStrictRaw === undefined ? {} : { proxyOutputStrict: proxyOutputStrictRaw })
        })
        const toolScope = resolveToolScope(
          {
            toolsets: toolsetsRaw,
            tools: toolsRaw
          },
          toolRegistry.definitions,
          writeError
        )
        const toolsets = toolScope.filteringActive ? toolScope.enabledToolsets : null
        const scopedNativeRegistry = createScopedRegistry({
          filteringActive: toolScope.filteringActive,
          categories: toolScope.enabledCategories,
          toolNames: toolScope.enabledToolNames
        })
        const registries = {
          fullRegistry: toolRegistry,
          scopedNativeRegistry
        }
        const getRuntimeConfigContext = config.getRuntimeConfigContext
          ?? (() => sanitizeHulyRuntimeConfigFromEnv(process.env))
        const getHulyContext = (
          runtimeConfig: SanitizedHulyRuntimeConfigContext,
          toolExposure: ToolExposureContext
        ): GetHulyContextResult =>
          buildHulyContext(config, scopedNativeRegistry, toolScope, runtimeConfig, toolExposure)
        const sdkExposureOptions: Partial<ProtocolExposureOptions> = {
          exposureConfig,
          toolScopeFilteringActive: toolScope.filteringActive
        }
        const requestExposureOptions = (
          currentClientInfo: () => McpClientInfoLike | undefined
        ): Partial<ProtocolExposureOptions> => ({
          ...sdkExposureOptions,
          currentClientInfo
        })

        telemetry.sessionStart({
          transport: config.transport,
          authMethod: config.authMethod ?? "password",
          toolCount: scopedNativeRegistry.definitions.length,
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
                  registries,
                  (toolExposure) => getHulyContext(getRuntimeConfigContext(), toolExposure),
                  config.createServer,
                  sdkExposureOptions
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
                const createHttpRequestContext = (req: Request) => {
                  const resolveClientsForRequest = config.resolveClientsForHttpRequest
                  const requestResolveClients = resolveClientsForRequest === undefined
                    ? config.resolveClients
                    : () => resolveClientsForRequest(req)
                  const requestRuntimeConfig = config.getRuntimeConfigContextForHttpRequest === undefined
                    ? getRuntimeConfigContext()
                    : config.getRuntimeConfigContextForHttpRequest(req)
                  return { requestResolveClients, requestRuntimeConfig }
                }

                yield* startHttpTransport(
                  { port, host, authToken: config.mcpAuthToken },
                  (req) => {
                    const { requestResolveClients, requestRuntimeConfig } = createHttpRequestContext(req)
                    return createMcpServer(
                      requestResolveClients,
                      telemetry,
                      registries,
                      (toolExposure) => getHulyContext(requestRuntimeConfig, toolExposure),
                      config.createServer,
                      requestExposureOptions(() => clientInfoFromLegacyHttpRequest(req))
                    )[0]
                  },
                  config.httpTransportDependencies,
                  (req) => {
                    const { requestResolveClients, requestRuntimeConfig } = createHttpRequestContext(req)
                    return createMcpProtocolHandlers(
                      requestResolveClients,
                      telemetry,
                      registries,
                      (toolExposure) => getHulyContext(requestRuntimeConfig, toolExposure),
                      undefined,
                      undefined,
                      requestExposureOptions(() => clientInfoFromMcp2026Request(req))
                    )
                  }
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
