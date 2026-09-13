/**
 * MCP Server infrastructure for Huly MCP server.

 * @module
 */
import type { McpRequestContext, Server } from "@modelcontextprotocol/server"
import { serveStdio, type StdioServerTransport } from "@modelcontextprotocol/server/stdio"
import { Config, Context, Deferred, type Duration, Effect, type Exit, Layer, type Redacted, Ref, Schema } from "effect"

import { createMcpServer, type McpServerLifecycle } from "./create-mcp-server.js"
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
import type { ClientBundle, ClientResolver, HulyClientBundleError } from "../runtime/client-resolver.js"
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
  readonly mcpAuthToken?: Redacted.Redacted<string>
  readonly shutdownGracePeriod?: Duration.Input
  readonly authMethod?: "token" | "password"
}

interface McpServerConfigCallbacks {
  readonly resolveClients: ClientResolver
  readonly resolveClientLeaseForHttpRequest?: (
    req: Request
  ) => Promise<RequestClientLease<Exit.Exit<ClientBundle, HulyClientBundleError>>>
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
  cause: Schema.optional(Schema.Defect())
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

export interface McpServerOperations {
  readonly run: () => Effect.Effect<void, McpServerError, HttpServerFactoryService>
  readonly stop: () => Effect.Effect<void, McpServerError>
  readonly awaitReady: () => Effect.Effect<void, McpServerError>
}

interface McpServerRunControl {
  readonly shutdown: Deferred.Deferred<void>
  readonly done: Deferred.Deferred<void>
  readonly ready: Deferred.Deferred<void>
}

const DEFAULT_SHUTDOWN_GRACE_PERIOD = "5 seconds"

const requestShutdown = (coordinator: StdioShutdownCoordinator, reason: StdioShutdownReason): void => {
  Effect.runSync(coordinator.request(reason))
}

const awaitStdioLifecycleEvent = (
  coordinator: StdioShutdownCoordinator,
  stdioProcess: StdioProcessPort
): Effect.Effect<void> =>
  Effect.callback<void>((resume) => {
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
  Effect.tryPromise({
    try: () => Promise.all([...lifecycles].map((lifecycle) => lifecycle.quiesce())).then(() => {}),
    catch: (cause) => new McpServerError({ message: "in-flight request drain failed", cause })
  })

const optionalPromiseCleanup = (cleanup: (() => Promise<void>) | undefined): Effect.Effect<void, unknown> =>
  cleanup === undefined
    ? Effect.void
    : Effect.tryPromise({
        try: cleanup,
        catch: (cause) => new McpServerError({ message: "client cleanup failed", cause })
      })

export class McpServerService extends Context.Service<McpServerService, McpServerOperations>()("@hulymcp/McpServer") {
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
        const shutdownGracePeriod = config.shutdownGracePeriod ?? DEFAULT_SHUTDOWN_GRACE_PERIOD

        const runControlRef = yield* Ref.make<McpServerRunControl | null>(null)

        const operations: McpServerOperations = {
          run: () =>
            Effect.gen(function* () {
              const control: McpServerRunControl = {
                shutdown: yield* Deferred.make<void>(),
                done: yield* Deferred.make<void>(),
                ready: yield* Deferred.make<void>()
              }
              const claimed = yield* Ref.modify(runControlRef, (current) =>
                current === null ? [true, control] : [false, current]
              )
              if (!claimed) {
                return yield* new McpServerError({ message: "MCP server is already running" })
              }

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
                    onerror: () => writeError("MCP stdio handler error")
                  })
                  const stdioProcess = config.stdioProcess ?? liveStdioProcessPort
                  const shutdownResources: StdioShutdownResources = {
                    drain: drainStdioRequests(lifecycles),
                    closeWire: Effect.tryPromise({
                      try: () => stdioHandle.close(),
                      catch: (cause) => new McpServerError({ message: "wire close failed", cause })
                    }),
                    closeTelemetry: Effect.tryPromise({
                      try: () => telemetry.shutdown(),
                      catch: (cause) => new McpServerError({ message: "telemetry close failed", cause })
                    }),
                    closeClients: optionalPromiseCleanup(config.closeClients),
                    forceExit: (code) => Effect.sync(() => stdioProcess.forceExit(code)),
                    writeDiagnostic: (message) => Effect.sync(() => writeError(message))
                  }
                  const awaitStop = Deferred.await(control.shutdown).pipe(
                    Effect.tap(() => coordinator.request("stop")),
                    Effect.asVoid
                  )

                  yield* Deferred.succeed(control.ready, undefined)
                  yield* Effect.raceFirst(awaitStdioLifecycleEvent(coordinator, stdioProcess), awaitStop).pipe(
                    Effect.ensuring(
                      coordinator
                        .request("runtime-interruption")
                        .pipe(Effect.andThen(executeBoundedStdioShutdown(coordinator, shutdownResources)))
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
                    const [server, admissionLifecycle] = createMcpServer(
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
                    attachRequestClientLifecycle(
                      server,
                      lifecycle,
                      () => writeError("Request-scoped Huly client cleanup failed\n"),
                      admissionLifecycle.quiesce
                    )
                    return server
                  }

                  yield* Effect.raceFirst(
                    startHttpTransport(
                      {
                        port,
                        host,
                        authToken: config.mcpAuthToken,
                        onReady: () => Deferred.succeed(control.ready, undefined),
                        shutdownGracePeriod
                      },
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
            }),

          awaitReady: () =>
            Effect.gen(function* () {
              const control = yield* Ref.get(runControlRef)
              if (control === null) {
                return yield* new McpServerError({ message: "MCP server is not running" })
              }
              yield* Deferred.await(control.ready)
            })
        }

        return operations
      })
    )
  }

  static testLayer(mockOperations: Partial<McpServerOperations>): Layer.Layer<McpServerService> {
    const defaultOps: McpServerOperations = {
      run: () => Effect.void,
      stop: () => Effect.void,
      awaitReady: () => Effect.void
    }

    return Layer.succeed(McpServerService, { ...defaultOps, ...mockOperations })
  }
}
