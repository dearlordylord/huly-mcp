#!/usr/bin/env node
/**
 * Main entry point for Huly MCP server.
 *
 * @module
 */

import "./polyfills.js"

import { NodeRuntime } from "@effect/platform-node"
import type { ConfigError } from "effect"
import { Config, Effect, Layer, Option, Redacted } from "effect"
import type { Request } from "express"

import {
  type ConfigValidationError,
  hulyConfigProviderFromHeaders,
  sanitizeHulyRuntimeConfigFromEnv,
  sanitizeHulyRuntimeConfigFromHeaders
} from "./config/config.js"
import type { HulyClientError } from "./huly/client.js"
import type { StorageClientError } from "./huly/storage.js"
import type { WorkspaceClientError } from "./huly/workspace-client.js"
import { DEFAULT_HTTP_PORT, HttpServerFactoryService } from "./mcp/http-transport.js"
import { type ClientBundle, type McpServerError, McpServerService, type McpTransportType } from "./mcp/server.js"
import { type ConsoleRedirectHandle, redirectConsoleToStderr } from "./mcp/stdio-output.js"
import {
  buildClientBundle,
  buildCombinedClientLayer,
  buildScopedClientBundle,
  type CombinedClientLayer,
  createClientResolver
} from "./runtime/huly-clients.js"
import { TelemetryService } from "./telemetry/telemetry.js"

type AppError =
  | ConfigValidationError
  | HulyClientError
  | StorageClientError
  | WorkspaceClientError
  | McpServerError
  | ConfigError.ConfigError

const getTransportType = Config.string("MCP_TRANSPORT").pipe(
  Config.withDefault("stdio"),
  Effect.map((t): McpTransportType => {
    if (t === "http") return "http"
    return "stdio"
  })
)

export const getHttpPort = Config.all({
  mcpHttpPort: Config.integer("MCP_HTTP_PORT").pipe(Config.option),
  cloudRunPort: Config.integer("PORT").pipe(Config.option)
}).pipe(
  Effect.map(({ cloudRunPort, mcpHttpPort }) =>
    Option.getOrElse(mcpHttpPort, () => Option.getOrElse(cloudRunPort, () => DEFAULT_HTTP_PORT))
  )
)

const getHttpHost = Config.string("MCP_HTTP_HOST").pipe(
  Config.withDefault("127.0.0.1")
)

export const getMcpAuthToken = Config.redacted("MCP_AUTH_TOKEN").pipe(Config.option)

const getAutoExit = Config.boolean("MCP_AUTO_EXIT").pipe(
  Config.withDefault(false)
)

const isGlamaRegistryInspection = (): boolean => process.env["GLAMA_VERSION"] !== undefined

const parseBooleanEnvFlag = (value: string): boolean => value.toLowerCase() === "true"

export const getLazyEnvs = Config.string("LAZY_ENVS").pipe(
  Config.option,
  Effect.map((value) =>
    Option.match(value, {
      onNone: isGlamaRegistryInspection,
      onSome: parseBooleanEnvFlag
    })
  )
)

const restoreConsoleRedirect = (redirect: ConsoleRedirectHandle | undefined): Effect.Effect<void> =>
  Effect.sync(() => {
    redirect?.restore()
  })

const createHttpClientResolver = (
  combinedClientLayer: CombinedClientLayer,
  resolveEnvClients: () => Promise<ClientBundle>
): (req: Request) => Promise<ClientBundle> => {
  const requestClients = new WeakMap<Request, Promise<ClientBundle>>()

  return (req) => {
    const existing = requestClients.get(req)
    if (existing !== undefined) return existing

    const clients = Effect.runPromise(hulyConfigProviderFromHeaders(req.headers)).then((configProvider) => {
      if (configProvider === undefined) return resolveEnvClients()

      return Effect.runPromise(
        buildScopedClientBundle(combinedClientLayer).pipe(
          Effect.withConfigProvider(configProvider),
          Effect.map(({ bundle, close }) => {
            let closed = false
            req.on("close", () => {
              if (closed) return
              closed = true
              close()
            })
            return bundle
          })
        )
      )
    })
    requestClients.set(req, clients)
    return clients
  }
}

const buildAppLayer = (
  transport: McpTransportType,
  httpPort: number,
  httpHost: string,
  mcpAuthToken: string | undefined,
  autoExit: boolean,
  authMethod: "token" | "password",
  resolveClients: () => Promise<ClientBundle>,
  resolveClientsForHttpRequest: (req: Request) => Promise<ClientBundle>
): Layer.Layer<
  McpServerService | HttpServerFactoryService,
  McpServerError,
  never
> => {
  const mcpServerConfig = {
    transport,
    httpPort,
    httpHost,
    ...(mcpAuthToken === undefined ? {} : { mcpAuthToken }),
    autoExit,
    authMethod,
    resolveClients,
    resolveClientsForHttpRequest,
    getRuntimeConfigContext: () => sanitizeHulyRuntimeConfigFromEnv(process.env),
    getRuntimeConfigContextForHttpRequest: (req: Request) =>
      sanitizeHulyRuntimeConfigFromHeaders(req.headers, process.env)
  }
  const mcpServerLayer = McpServerService.layer(mcpServerConfig).pipe(Layer.provide(TelemetryService.layer))

  return Layer.merge(mcpServerLayer, HttpServerFactoryService.defaultLayer)
}

const runConfiguredServer = (transport: McpTransportType): Effect.Effect<void, AppError> =>
  Effect.gen(function*() {
    const httpPort = yield* getHttpPort
    const httpHost = yield* getHttpHost
    const mcpAuthToken = transport === "http"
      ? Option.map(yield* getMcpAuthToken, Redacted.value).pipe(Option.getOrUndefined)
      : undefined
    const autoExit = yield* getAutoExit
    const lazyEnvs = yield* getLazyEnvs
    const authMethod: "token" | "password" = process.env["HULY_TOKEN"] ? "token" : "password"

    const combinedClientLayer = buildCombinedClientLayer()
    const [resolveClients, primeClients] = createClientResolver(combinedClientLayer)
    const resolveHttpClients = createHttpClientResolver(combinedClientLayer, resolveClients)

    if (!lazyEnvs && transport === "stdio") {
      // Eager init: build client layers within the Effect pipeline to preserve
      // typed errors (ConfigValidationError, HulyClientError, etc.).
      // This also primes the memoized resolver for subsequent tool calls.
      yield* Effect.gen(function*() {
        const bundle = yield* buildClientBundle(combinedClientLayer)
        primeClients(bundle)
      }).pipe(
        // A network outage must not prevent the stdio transport from accepting
        // initialize and returning its typed, actionable tool-call failure.
        Effect.catchTag("HulyUnavailableError", () => Effect.void)
      )
    }

    // stdout reserved for MCP protocol in stdio mode - no console output here
    const appLayer = buildAppLayer(
      transport,
      httpPort,
      httpHost,
      mcpAuthToken,
      autoExit,
      authMethod,
      resolveClients,
      resolveHttpClients
    )

    yield* Effect.gen(function*() {
      const server = yield* McpServerService
      yield* server.run()
    }).pipe(
      Effect.provide(appLayer),
      Effect.scoped
    )
  })

export const main: Effect.Effect<void, AppError> = Effect.gen(function*() {
  const transport = yield* getTransportType
  const consoleRedirect = yield* Effect.sync(() => transport === "stdio" ? redirectConsoleToStderr() : undefined)

  yield* runConfiguredServer(transport).pipe(
    Effect.ensuring(restoreConsoleRedirect(consoleRedirect))
  )
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
