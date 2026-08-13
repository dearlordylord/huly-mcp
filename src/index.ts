#!/usr/bin/env node
/**
 * Main entry point for Huly MCP server.
 *
 * @module
 */

import "./polyfills.js"

import { NodeRuntime } from "@effect/platform-node"
import type { ConfigError } from "effect"
import { Config, Effect, Layer, Option, Redacted, Schema } from "effect"

import {
  type ConfigValidationError,
  hulyConfigProviderFromHeaders,
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
import { type ClientBundle, type McpServerError, McpServerService, type McpTransportType } from "./mcp/server.js"
import { type ConsoleRedirectHandle, redirectConsoleToStderr } from "./mcp/stdio-output.js"
import {
  buildCombinedClientLayer,
  buildScopedClientBundle,
  type CombinedClientLayer,
  createClientResolver
} from "./runtime/huly-clients.js"
import { TelemetryService } from "./telemetry/telemetry.js"

type AppError = ConfigValidationError | HulyClientError | StorageClientError | McpServerError | ConfigError.ConfigError

const getTransportType = Config.string("MCP_TRANSPORT").pipe(
  Config.withDefault("stdio"),
  Effect.map((t): McpTransportType => {
    if (t === "http") return "http"
    return "stdio"
  })
)

type HttpPortConfigName = "MCP_HTTP_PORT" | "PORT"

const httpPortConfig = (name: HttpPortConfigName) =>
  Config.integer(name).pipe(
    Config.validate({ message: "must be a whole number between 0 and 65535", validation: Schema.is(HttpPort) })
  )

export const getHttpPort: Effect.Effect<HttpPort, ConfigError.ConfigError> = Config.all({
  mcpHttpPort: httpPortConfig("MCP_HTTP_PORT").pipe(Config.option),
  cloudRunPort: httpPortConfig("PORT").pipe(Config.option)
}).pipe(
  Effect.map(({ cloudRunPort, mcpHttpPort }) =>
    Option.getOrElse(mcpHttpPort, () => Option.getOrElse(cloudRunPort, () => DEFAULT_HTTP_PORT))
  )
)

const getHttpHost: Effect.Effect<HttpHost, ConfigError.ConfigError> = Config.string("MCP_HTTP_HOST").pipe(
  Config.validate({ message: "must be a non-empty trimmed host", validation: Schema.is(HttpHost) }),
  Config.withDefault(DEFAULT_HTTP_HOST)
)

export const getMcpAuthToken = Config.redacted("MCP_AUTH_TOKEN").pipe(Config.option)

const isGlamaRegistryInspection = (): boolean => process.env["GLAMA_VERSION"] !== undefined

const parseBooleanEnvFlag = (value: string): boolean => value.toLowerCase() === "true"

export const getLazyEnvs = Config.string("LAZY_ENVS").pipe(
  Config.option,
  Effect.map((value) => Option.match(value, { onNone: isGlamaRegistryInspection, onSome: parseBooleanEnvFlag }))
)

const restoreConsoleRedirect = (redirect: ConsoleRedirectHandle | undefined): Effect.Effect<void> =>
  Effect.sync(() => {
    redirect?.restore()
  })

const webHeadersRecord = (headers: Headers): Record<string, string> => Object.fromEntries(headers.entries())

const createHttpClientLeaseResolver =
  (
    combinedClientLayer: CombinedClientLayer,
    resolveEnvClients: () => Promise<ClientBundle>
  ): ((req: Request) => Promise<RequestClientLease>) =>
  (req) => {
    const headers = webHeadersRecord(req.headers)
    return Effect.runPromise(hulyConfigProviderFromHeaders(headers)).then((configProvider) => {
      if (configProvider === undefined) {
        return resolveEnvClients().then((bundle) => ({ bundle, close: () => {} }))
      }

      return Effect.runPromise(
        buildScopedClientBundle(combinedClientLayer).pipe(
          Effect.withConfigProvider(configProvider),
          Effect.map(({ bundle, close }) => ({ bundle, close }))
        )
      )
    })
  }

const buildAppLayer = (
  transport: McpTransportType,
  httpPort: HttpPort,
  httpHost: HttpHost,
  mcpAuthToken: string | undefined,
  authMethod: "token" | "password",
  resolveClients: () => Promise<ClientBundle>,
  closeClients: () => Promise<void>,
  resolveClientLeaseForHttpRequest: (req: Request) => Promise<RequestClientLease>
): Layer.Layer<McpServerService | HttpServerFactoryService, McpServerError, never> => {
  const mcpServerConfig = {
    transport,
    httpPort,
    httpHost,
    ...(mcpAuthToken === undefined ? {} : { mcpAuthToken }),
    authMethod,
    resolveClients,
    closeClients,
    resolveClientLeaseForHttpRequest,
    getRuntimeConfigContext: () => sanitizeHulyRuntimeConfigFromEnv(process.env),
    getRuntimeConfigContextForHttpRequest: (req: Request) =>
      sanitizeHulyRuntimeConfigFromHeaders(webHeadersRecord(req.headers), process.env)
  }
  const mcpServerLayer = McpServerService.layer(mcpServerConfig).pipe(Layer.provide(TelemetryService.layer))

  return Layer.merge(mcpServerLayer, HttpServerFactoryService.defaultLayer)
}

const runConfiguredServer = (transport: McpTransportType): Effect.Effect<void, AppError> =>
  Effect.gen(function* () {
    const httpPort = yield* getHttpPort
    const httpHost = yield* getHttpHost
    const mcpAuthToken =
      transport === "http" ? Option.map(yield* getMcpAuthToken, Redacted.value).pipe(Option.getOrUndefined) : undefined
    const lazyEnvs = yield* getLazyEnvs
    const authMethod: "token" | "password" = process.env["HULY_TOKEN"] ? "token" : "password"

    const combinedClientLayer = buildCombinedClientLayer()
    const [resolveClients, primeClients, closeClients] = createClientResolver(combinedClientLayer)
    const resolveHttpClientLease = createHttpClientLeaseResolver(combinedClientLayer, resolveClients)

    if (!lazyEnvs && transport === "stdio") {
      yield* buildScopedClientBundle(combinedClientLayer).pipe(
        Effect.tap(primeClients),
        Effect.catchTag("HulyUnavailableError", () => Effect.void)
      )
    }

    // stdout reserved for MCP protocol in stdio mode - no console output here
    const appLayer = buildAppLayer(
      transport,
      httpPort,
      httpHost,
      mcpAuthToken,
      authMethod,
      resolveClients,
      closeClients,
      resolveHttpClientLease
    )

    yield* Effect.gen(function* () {
      const server = yield* McpServerService
      yield* server.run()
    }).pipe(Effect.provide(appLayer), Effect.scoped)
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
