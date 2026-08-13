/**
 * MCP Server infrastructure for Huly MCP server.

 * @module
 */
import type { McpRequestContext, Server } from "@modelcontextprotocol/server"
import { serveStdio, type StdioServerTransport } from "@modelcontextprotocol/server/stdio"
import { Config, Context, Deferred, Effect, Layer, Ref, Schema } from "effect"

import { type ClientBundle, createMcpServer, type McpServerLifecycle } from "./create-mcp-server.js"
import type { HttpHost, HttpPort, HttpServerFactoryService, HttpTransportError } from "./http-transport.js"
import { DEFAULT_HTTP_HOST, DEFAULT_HTTP_PORT, startHttpTransport } from "./http-transport.js"
import { buildHulyContext, type ToolExposureContext } from "./huly-context-tool.js"
import type { ProtocolExposureOptions } from "./protocol-tool-exposure.js"
import {
  attachRequestClientLifecycle,
  createRequestClientLifecycle,
  type RequestClientLease
} from "./request-client-lifecycle.js"
import {
  executeBoundedStdioShutdown,
  liveStdioProcessPort,
  makeStdioShutdownCoordinator,
  type StdioProcessPort,
  type StdioShutdownCoordinator,
  type StdioShutdownReason,
  type StdioShutdownResources
} from "./stdio-shutdown.js"

import { type SanitizedHulyRuntimeConfigContext, sanitizeHulyRuntimeConfigFromEnv } from "../config/config.js"
import type { GetHulyContextResult } from "../domain/schemas/index.js"
import type { HostedHulyMigrationInstructions } from "../huly/unavailable-diagnostics.js"
import { TelemetryService } from "../telemetry/telemetry.js"
import { writeStderrLine } from "../utils/stderr.js"
import {
  createHostedHulyMigrationNoticeProvider,
  hostedHulyMigrationInstructionsForOrigin
} from "./tool-call-notices.js"
import { parseToolExposureConfig, type ToolExposureConfig } from "./tool-mode.js"
import { resolveToolScope } from "./tool-scope.js"
import { createScopedRegistry, toolRegistry } from "./tools/index.js"

export type { ClientBundle } from "./create-mcp-server.js"

export type McpTransportType = "stdio" | "http"

interface McpServerConfigData {
  readonly transport: McpTransportType
  readonly httpPort?: HttpPort
  readonly httpHost?: HttpHost
  readonly mcpAuthToken?: string
  readonly authMethod?: "token" | "password"
}

interface McpServerConfigCallbacks {
  readonly resolveClients: () => Promise<ClientBundle>
  readonly resolveClientLeaseForHttpRequest?: (req: Request) => Promise<RequestClientLease>
  readonly getRuntimeConfigContext?: () => SanitizedHulyRuntimeConfigContext
  readonly getRuntimeConfigContextForHttpRequest?: (req: Request) => SanitizedHulyRuntimeConfigContext
  readonly createServer?: (instructions?: HostedHulyMigrationInstructions) => Server
  readonly createStdioTransport?: () => StdioServerTransport
  readonly closeClients?: () => Promise<void>
  readonly stdioProcess?: StdioProcessPort
  readonly writeError?: (message: string) => void
}

type McpServerConfig = McpServerConfigData & McpServerConfigCallbacks

export class McpServerError extends Schema.TaggedError<McpServerError>()("McpServerError", {
  message: Schema.String,
  cause: Schema.optional(Schema.Defect)
}) {}

const defaultWriteError = (message: string): void => {
  writeStderrLine(message)
}

const parseToolExposureConfigEffect = (
  env: Parameters<typeof parseToolExposureConfig>[0]
): Effect.Effect<ToolExposureConfig, McpServerError> => {
  const parsed = parseToolExposureConfig(env)
  if (parsed._tag === "Success") return Effect.succeed(parsed.value)
  return Effect.fail(new McpServerError({ message: parsed.message }))
}

interface McpServerOperations {
  readonly run: () => Effect.Effect<void, McpServerError, HttpServerFactoryService>
  readonly stop: () => Effect.Effect<void, McpServerError>
}

interface McpServerRunControl {
  readonly shutdown: Deferred.Deferred<void>
  readonly done: Deferred.Deferred<void>
}

const requestShutdown = (coordinator: StdioShutdownCoordinator, reason: StdioShutdownReason): void => {
  Effect.runSync(coordinator.request(reason))
}

const awaitStdioLifecycleEvent = (
  coordinator: StdioShutdownCoordinator,
  stdioProcess: StdioProcessPort
): Effect.Effect<void> =>
  Effect.async<void>((resume) => {
    const listenerState = { remove: () => {} }
    const request = (reason: StdioShutdownReason) => {
      listenerState.remove()
      requestShutdown(coordinator, reason)
      resume(Effect.void)
    }
    listenerState.remove = stdioProcess.listen({
      stdinEof: () => request("stdin-eof"),
      stdinClose: () => request("stdin-close"),
      sigint: () => request("sigint"),
      sigterm: () => request("sigterm")
    })
    return Effect.sync(() => listenerState.remove())
  })

const drainStdioRequests = (lifecycles: ReadonlySet<McpServerLifecycle>): Effect.Effect<void, unknown> =>
  Effect.tryPromise(() => Promise.all([...lifecycles].map((lifecycle) => lifecycle.quiesce())).then(() => {}))

const promiseCleanup = (cleanup: (() => Promise<void>) | undefined): Effect.Effect<void, unknown> =>
  cleanup === undefined ? Effect.void : Effect.tryPromise(cleanup)

export class McpServerService extends Context.Tag("@hulymcp/McpServer")<McpServerService, McpServerOperations>() {
  static layer(config: McpServerConfig): Layer.Layer<McpServerService, McpServerError, TelemetryService> {
    return Layer.effect(
      McpServerService,
      Effect.gen(function* () {
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
          { toolsets: toolsetsRaw, tools: toolsRaw },
          toolRegistry.definitions,
          writeError
        )
        const toolsets = toolScope.filteringActive ? toolScope.enabledToolsets : null
        const scopedNativeRegistry = createScopedRegistry({
          filteringActive: toolScope.filteringActive,
          categories: toolScope.enabledCategories,
          toolNames: toolScope.enabledToolNames
        })
        const registries = { fullRegistry: toolRegistry, scopedNativeRegistry }
        const getRuntimeConfigContext =
          config.getRuntimeConfigContext ?? (() => sanitizeHulyRuntimeConfigFromEnv(process.env))
        const getHulyContext = (
          runtimeConfig: SanitizedHulyRuntimeConfigContext,
          toolExposure: ToolExposureContext
        ): GetHulyContextResult =>
          buildHulyContext(config, scopedNativeRegistry, toolScope, runtimeConfig, toolExposure)
        const sdkExposureOptions: Partial<ProtocolExposureOptions> = {
          exposureConfig,
          toolScopeFilteringActive: toolScope.filteringActive
        }
        telemetry.sessionStart({
          transport: config.transport,
          authMethod: config.authMethod ?? "password",
          toolCount: scopedNativeRegistry.definitions.length,
          toolsets
        })

        const flushTelemetry = Effect.ignore(Effect.tryPromise(() => telemetry.shutdown()))

        const isRunning = yield* Ref.make(false)
        const runControlRef = yield* Ref.make<McpServerRunControl | null>(null)

        const operations: McpServerOperations = {
          run: () =>
            Effect.gen(function* () {
              if (yield* Ref.get(isRunning)) {
                return yield* new McpServerError({ message: "MCP server is already running" })
              }

              yield* Ref.set(isRunning, true)
              const control: McpServerRunControl = {
                shutdown: yield* Deferred.make<void>(),
                done: yield* Deferred.make<void>()
              }
              yield* Ref.set(runControlRef, control)

              yield* Effect.gen(function* () {
                if (config.transport === "stdio") {
                  const stdioRuntimeConfig = getRuntimeConfigContext()
                  const lifecycles = new Set<McpServerLifecycle>()
                  const coordinator = yield* makeStdioShutdownCoordinator(() => {
                    for (const lifecycle of lifecycles) void lifecycle.quiesce()
                  })
                  const createStdioServer = () => {
                    const [server, lifecycle] = createMcpServer(
                      config.resolveClients,
                      telemetry,
                      registries,
                      (toolExposure) => getHulyContext(stdioRuntimeConfig, toolExposure),
                      config.createServer,
                      sdkExposureOptions,
                      createHostedHulyMigrationNoticeProvider({
                        delivery: "once",
                        hulyOrigin: stdioRuntimeConfig.huly.url.origin
                      }),
                      hostedHulyMigrationInstructionsForOrigin(stdioRuntimeConfig.huly.url.origin)
                    )
                    lifecycles.add(lifecycle)
                    return server
                  }
                  const stdioHandle = serveStdio(createStdioServer, {
                    legacy: "serve",
                    ...(config.createStdioTransport === undefined ? {} : { transport: config.createStdioTransport() }),
                    onerror: (error) => writeError(`MCP stdio handler error: ${error.message}`)
                  })
                  const stdioProcess = config.stdioProcess ?? liveStdioProcessPort
                  const shutdownResources: StdioShutdownResources = {
                    drain: drainStdioRequests(lifecycles),
                    closeWire: Effect.tryPromise(() => stdioHandle.close()),
                    closeTelemetry: Effect.tryPromise(() => telemetry.shutdown()),
                    closeClients: promiseCleanup(config.closeClients),
                    forceExit: (code) => Effect.sync(() => stdioProcess.forceExit(code)),
                    writeDiagnostic: (message) => Effect.sync(() => writeError(message))
                  }
                  const awaitStop = Deferred.await(control.shutdown).pipe(
                    Effect.tap(() => coordinator.request("stop")),
                    Effect.asVoid
                  )

                  yield* Effect.raceFirst(awaitStdioLifecycleEvent(coordinator, stdioProcess), awaitStop).pipe(
                    Effect.ensuring(
                      coordinator
                        .request("runtime-interruption")
                        .pipe(Effect.zipRight(executeBoundedStdioShutdown(coordinator, shutdownResources)))
                    )
                  )
                } else {
                  const port = config.httpPort ?? DEFAULT_HTTP_PORT
                  const host = config.httpHost ?? DEFAULT_HTTP_HOST
                  const createHttpServer = ({ requestInfo }: McpRequestContext): Server => {
                    const requestRuntimeConfig =
                      requestInfo === undefined || config.getRuntimeConfigContextForHttpRequest === undefined
                        ? getRuntimeConfigContext()
                        : config.getRuntimeConfigContextForHttpRequest(requestInfo)
                    const lifecycle = createRequestClientLifecycle(() => {
                      if (requestInfo === undefined || config.resolveClientLeaseForHttpRequest === undefined) {
                        return config.resolveClients().then((bundle) => ({ bundle, close: () => {} }))
                      }
                      return config.resolveClientLeaseForHttpRequest(requestInfo)
                    })
                    const [server] = createMcpServer(
                      lifecycle.resolve,
                      telemetry,
                      registries,
                      (toolExposure) => getHulyContext(requestRuntimeConfig, toolExposure),
                      config.createServer,
                      sdkExposureOptions,
                      createHostedHulyMigrationNoticeProvider({
                        delivery: "always",
                        hulyOrigin: requestRuntimeConfig.huly.url.origin
                      }),
                      hostedHulyMigrationInstructionsForOrigin(requestRuntimeConfig.huly.url.origin)
                    )
                    attachRequestClientLifecycle(server, lifecycle, (error) => {
                      writeError(`Request-scoped Huly client cleanup failed: ${error.message}`)
                    })
                    return server
                  }

                  yield* Effect.raceFirst(
                    startHttpTransport(
                      { port, host, authToken: config.mcpAuthToken },
                      createHttpServer,
                      writeError
                    ).pipe(
                      Effect.scoped,
                      Effect.mapError(
                        (e: HttpTransportError) => new McpServerError({ message: e.message, cause: e.cause })
                      )
                    ),
                    Deferred.await(control.shutdown)
                  )

                  yield* flushTelemetry
                }
              }).pipe(
                Effect.ensuring(
                  Effect.gen(function* () {
                    yield* Ref.set(isRunning, false)
                    yield* Ref.set(runControlRef, null)
                    yield* Deferred.succeed(control.done, undefined)
                  })
                )
              )
            }),

          stop: () =>
            Effect.gen(function* () {
              const control = yield* Ref.get(runControlRef)
              if (control === null) return
              yield* Deferred.succeed(control.shutdown, undefined)
              yield* Deferred.await(control.done)
            })
        }

        return operations
      })
    )
  }

  static testLayer(mockOperations: Partial<McpServerOperations>): Layer.Layer<McpServerService> {
    const defaultOps: McpServerOperations = { run: () => Effect.void, stop: () => Effect.void }

    return Layer.succeed(McpServerService, { ...defaultOps, ...mockOperations })
  }
}
