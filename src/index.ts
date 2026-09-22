#!/usr/bin/env node
/**
 * Main entry point for Huly MCP server.
 *
 * @module
 */

import "./polyfills.js"

import { NodeRuntime } from "@effect/platform-node"
import { Config, type Duration, Effect, Exit, Layer, Option, type Redacted, Schema } from "effect"

import {
  type ConfigValidationError,
  sanitizeHulyRuntimeConfigFromEnv,
  sanitizeHulyRuntimeConfigFromHeaders
} from "./config/config.js"
import type { HulyClientError } from "./huly/client.js"
import type { StorageClientError } from "./huly/storage.js"
import {
  DEFAULT_HTTP_HOST,
  DEFAULT_HTTP_PORT,
  HttpHost,
  HttpPort,
  HttpServerFactoryService
} from "./mcp/http-transport.js"
import type { RequestClientLease } from "./mcp/request-client-lifecycle.js"
import { type McpServerError, McpServerService, type McpTransportType } from "./mcp/server.js"
import { type ConsoleRedirectHandle, redirectConsoleToStderr } from "./mcp/stdio-output.js"
import {
  buildCombinedClientLayer,
  createClientResolver,
  isRecoverableClientUnavailableCause
} from "./runtime/huly-clients.js"
import type { ClientBundle, ClientResolver, HulyClientBundleError } from "./runtime/client-resolver.js"
import { createHttpClientLeaseResolver } from "./runtime/http-client-leases.js"
import { TelemetryService } from "./telemetry/telemetry.js"
import { writeStderrLine } from "./utils/stderr.js"

type AppError = ConfigValidationError | HulyClientError | StorageClientError | McpServerError | Config.ConfigError

const getTransportType = Config.String("MCP_TRANSPORT").pipe(
  Config.withDefault("stdio"),
  Effect.map((t): McpTransportType => {
    if (t === "http") return "http"
    return "stdio"
  })
)

type HttpPortConfigName = "MCP_HTTP_PORT" | "PORT"

const httpPortConfig = (name: HttpPortConfigName) => Config.schema(HttpPort, name)

export const getHttpPort: Effect.Effect<HttpPort, Config.ConfigError> = Config.all({
  mcpHttpPort: httpPortConfig("MCP_HTTP_PORT").pipe(Config.option),
  cloudRunPort: httpPortConfig("PORT").pipe(Config.option)
}).pipe(
  Effect.map(({ cloudRunPort, mcpHttpPort }) =>
    Option.getOrElse(mcpHttpPort, () => Option.getOrElse(cloudRunPort, () => DEFAULT_HTTP_PORT))
  )
)

const getHttpHost: Effect.Effect<HttpHost, Config.ConfigError> = Config.schema(HttpHost, "MCP_HTTP_HOST").pipe(
  Config.withDefault(DEFAULT_HTTP_HOST)
)

const McpAuthToken = Schema.RedactedFromValue(
  Schema.String.check(
    Schema.makeFilter((token) => token.trim().length > 0, { message: "must not be empty or whitespace-only" })
  )
)

// A blank token is a startup error rather than "auth disabled": setting MCP_AUTH_TOKEN must never open the endpoint.
export const getMcpAuthToken = Config.schema(McpAuthToken, "MCP_AUTH_TOKEN").pipe(Config.option)

const DEFAULT_PROCESS_CLOSE_GRACE_PERIOD = "5 seconds"

export const closeProcessClients = (
  closeClients: () => Promise<void>,
  gracePeriod: Duration.Input = DEFAULT_PROCESS_CLOSE_GRACE_PERIOD,
  writeError: (message: string) => void = writeStderrLine
): Effect.Effect<void> =>
  Effect.tryPromise(closeClients).pipe(
    Effect.interruptible,
    Effect.timeoutOrElse({
      duration: gracePeriod,
      orElse: () => Effect.sync(() => writeError("Process-scoped Huly client cleanup timed out"))
    }),
    Effect.catch(() => Effect.sync(() => writeError("Process-scoped Huly client cleanup failed")))
  )

const isGlamaRegistryInspection = (): boolean => process.env["GLAMA_VERSION"] !== undefined

const parseBooleanEnvFlag = (value: string): boolean => value.toLowerCase() === "true"

export const getLazyEnvs = Config.String("LAZY_ENVS").pipe(
  Config.option,
  Effect.map((value) => Option.match(value, { onNone: isGlamaRegistryInspection, onSome: parseBooleanEnvFlag }))
)

const restoreConsoleRedirect = (redirect: ConsoleRedirectHandle | undefined): Effect.Effect<void> =>
  Effect.sync(() => {
    redirect?.restore()
  })

const webHeadersRecord = (headers: Headers): Record<string, string> => Object.fromEntries(headers.entries())

export const buildAppLayer = (
  transport: McpTransportType,
  httpPort: HttpPort,
  httpHost: HttpHost,
  mcpAuthToken: Redacted.Redacted<string> | undefined,
  authMethod: "token" | "password",
  resolveClients: ClientResolver,
  resolveClientLeaseForHttpRequest: (
    req: Request,
    signal: AbortSignal
  ) => Promise<RequestClientLease<Exit.Exit<ClientBundle, HulyClientBundleError>>>,
  httpServerFactoryLayer: Layer.Layer<HttpServerFactoryService> = HttpServerFactoryService.defaultLayer,
  closeClients?: () => Promise<void>
): Layer.Layer<McpServerService | HttpServerFactoryService, McpServerError, never> => {
  const mcpServerConfig = {
    transport,
    httpPort,
    httpHost,
    ...(mcpAuthToken === undefined ? {} : { mcpAuthToken }),
    authMethod,
    resolveClients,
    ...(closeClients === undefined ? {} : { closeClients }),
    resolveClientLeaseForHttpRequest,
    getRuntimeConfigContext: () => sanitizeHulyRuntimeConfigFromEnv(process.env),
    getRuntimeConfigContextForHttpRequest: (req: Request) =>
      sanitizeHulyRuntimeConfigFromHeaders(webHeadersRecord(req.headers), process.env)
  }
  const mcpServerLayer = McpServerService.layer(mcpServerConfig).pipe(Layer.provide(TelemetryService.layer))

  return Layer.merge(mcpServerLayer, httpServerFactoryLayer)
}

const runConfiguredServer = (transport: McpTransportType): Effect.Effect<void, AppError> =>
  Effect.gen(function* () {
    const httpPort = yield* getHttpPort
    const httpHost = yield* getHttpHost
    const mcpAuthToken = transport === "http" ? Option.getOrUndefined(yield* getMcpAuthToken) : undefined
    const lazyEnvs = yield* getLazyEnvs
    const authMethod: "token" | "password" = process.env["HULY_TOKEN"] ? "token" : "password"

    const combinedClientLayer = buildCombinedClientLayer()
    yield* Effect.acquireUseRelease(
      Effect.sync(() => createClientResolver(combinedClientLayer)),
      ({ close: closeClients, resolve: resolveClients }) => {
        const resolveHttpClientLease = createHttpClientLeaseResolver(combinedClientLayer, resolveClients)
        return Effect.gen(function* () {
          if (!lazyEnvs && transport === "stdio") {
            // Eager init uses the same process-owned resolver as subsequent tool calls.
            yield* Effect.gen(function* () {
              const clientExit = yield* Effect.promise(resolveClients)
              if (Exit.isSuccess(clientExit) || isRecoverableClientUnavailableCause(clientExit.cause)) return
              return yield* Effect.failCause(clientExit.cause)
            })
          }

          // stdout reserved for MCP protocol in stdio mode - no console output here
          const appLayer = buildAppLayer(
            transport,
            httpPort,
            httpHost,
            mcpAuthToken,
            authMethod,
            resolveClients,
            resolveHttpClientLease,
            HttpServerFactoryService.defaultLayer,
            closeClients
          )

          yield* Effect.gen(function* () {
            const server = yield* McpServerService
            yield* server.run()
          }).pipe(Effect.provide(appLayer), Effect.scoped)
        })
      },
      ({ close }) => closeProcessClients(close)
    )
  })

export const main: Effect.Effect<void, AppError> = Effect.gen(function* () {
  const transport = yield* getTransportType
  const consoleRedirect = yield* Effect.sync(() => (transport === "stdio" ? redirectConsoleToStderr() : undefined))

  yield* runConfiguredServer(transport).pipe(Effect.ensuring(restoreConsoleRedirect(consoleRedirect)))
})

// Run with NodeRuntime.runMain - handles errors, exit codes, and interrupts automatically
// Only run when executed directly (not when imported for testing)
const isMainModule = (() => {
  // CJS bundled: require.main === module
  if (typeof require !== "undefined" && require.main === module) return true
  return false
})()

if (isMainModule) {
  NodeRuntime.runMain(main)
}
