#!/usr/bin/env node
/**
 * Main entry point for Huly MCP server.
 *
 * @module
 */

import "./polyfills.js"

import { NodeRuntime } from "@effect/platform-node"
import type { ConfigError } from "effect"
import { Config, Context, Effect, Layer, Scope } from "effect"

import { type ConfigValidationError, HulyConfigService } from "./config/config.js"
import { HulyClient, type HulyClientError } from "./huly/client.js"
import { HulyStorageClient, type StorageClientError } from "./huly/storage.js"
import { WorkspaceClient, type WorkspaceClientError } from "./huly/workspace-client.js"
import { DEFAULT_HTTP_PORT, HttpServerFactoryService } from "./mcp/http-transport.js"
import { type ClientBundle, type McpServerError, McpServerService, type McpTransportType } from "./mcp/server.js"
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

const getHttpPort = Config.integer("MCP_HTTP_PORT").pipe(
  Config.withDefault(DEFAULT_HTTP_PORT)
)

const getHttpHost = Config.string("MCP_HTTP_HOST").pipe(
  Config.withDefault("127.0.0.1")
)

const getAutoExit = Config.boolean("MCP_AUTO_EXIT").pipe(
  Config.withDefault(false)
)

const getLazyEnvs = Config.string("LAZY_ENVS").pipe(
  Config.withDefault("false"),
  Effect.map((v) => v.toLowerCase() === "true")
)

/**
 * Build the combined client layer (not yet evaluated — deferred until first use).
 */
const buildCombinedClientLayer = (): Layer.Layer<
  HulyClient | HulyStorageClient | WorkspaceClient,
  ConfigValidationError | HulyClientError | StorageClientError | WorkspaceClientError,
  never
> => {
  const configLayer = HulyConfigService.layer

  const hulyClientLayer = HulyClient.layer.pipe(
    Layer.provide(configLayer)
  )

  const storageClientLayer = HulyStorageClient.layer.pipe(
    Layer.provide(configLayer)
  )

  const workspaceClientLayer = WorkspaceClient.layer.pipe(
    Layer.provide(configLayer)
  )

  return Layer.merge(
    Layer.merge(hulyClientLayer, storageClientLayer),
    workspaceClientLayer
  )
}

/**
 * Create a memoized client resolver that builds layers on first call
 * and keeps the scope alive for the process lifetime.
 * Returns [resolver, prime] — prime pre-populates the cache from an existing bundle.
 */
const createClientResolver = (
  combinedClientLayer: Layer.Layer<
    HulyClient | HulyStorageClient | WorkspaceClient,
    ConfigValidationError | HulyClientError | StorageClientError | WorkspaceClientError,
    never
  >
): readonly [resolve: () => Promise<ClientBundle>, prime: (bundle: ClientBundle) => void] => {
  let clientsPromise: Promise<ClientBundle> | null = null

  const resolve = (): Promise<ClientBundle> => {
    if (clientsPromise === null) {
      clientsPromise = Effect.runPromise(
        Effect.gen(function*() {
          const scope = yield* Scope.make()
          const ctx = yield* Layer.buildWithScope(combinedClientLayer, scope)
          return {
            hulyClient: Context.get(ctx, HulyClient),
            storageClient: Context.get(ctx, HulyStorageClient),
            workspaceClient: Context.get(ctx, WorkspaceClient)
          }
        })
      )
    }
    return clientsPromise
  }

  const prime = (bundle: ClientBundle): void => {
    clientsPromise = Promise.resolve(bundle)
  }

  return [resolve, prime] as const
}

const buildAppLayer = (
  transport: McpTransportType,
  httpPort: number,
  httpHost: string,
  autoExit: boolean,
  authMethod: "token" | "password",
  resolveClients: () => Promise<ClientBundle>
): Layer.Layer<
  McpServerService | HttpServerFactoryService,
  never,
  never
> => {
  const mcpServerLayer = McpServerService.layer({
    transport,
    httpPort,
    httpHost,
    autoExit,
    authMethod,
    resolveClients
  }).pipe(Layer.provide(TelemetryService.layer))

  return Layer.merge(mcpServerLayer, HttpServerFactoryService.defaultLayer)
}

export const main: Effect.Effect<void, AppError> = Effect.gen(function*() {
  const transport = yield* getTransportType
  const httpPort = yield* getHttpPort
  const httpHost = yield* getHttpHost
  const autoExit = yield* getAutoExit
  const lazyEnvs = yield* getLazyEnvs
  const authMethod: "token" | "password" = process.env["HULY_TOKEN"] ? "token" : "password"

  const combinedClientLayer = buildCombinedClientLayer()
  const [resolveClients, primeClients] = createClientResolver(combinedClientLayer)

  if (!lazyEnvs) {
    // Eager init: build client layers within the Effect pipeline to preserve
    // typed errors (ConfigValidationError, HulyClientError, etc.).
    // This also primes the memoized resolver for subsequent tool calls.
    yield* Effect.gen(function*() {
      const scope = yield* Scope.make()
      const ctx = yield* Layer.buildWithScope(combinedClientLayer, scope)
      primeClients({
        hulyClient: Context.get(ctx, HulyClient),
        storageClient: Context.get(ctx, HulyStorageClient),
        workspaceClient: Context.get(ctx, WorkspaceClient)
      })
    })
  }

  // stdout reserved for MCP protocol in stdio mode - no console output here
  const appLayer = buildAppLayer(transport, httpPort, httpHost, autoExit, authMethod, resolveClients)

  yield* Effect.gen(function*() {
    const server = yield* McpServerService
    yield* server.run()
  }).pipe(
    Effect.provide(appLayer),
    Effect.scoped
  )
})

// Run with NodeRuntime.runMain - handles errors, exit codes, and interrupts automatically
// Only run when executed directly (not when imported for testing)
const isMainModule = (() => {
  // CJS bundled: require.main === module
  if (typeof require !== "undefined" && require.main === module) return true
  // ESM: check if process.argv[1] matches this file
  if (typeof import.meta !== "undefined" && process.argv[1]) {
    const arg = process.argv[1]
    return arg.endsWith("index.ts") || arg.endsWith("index.cjs") || arg.endsWith("index.js")
  }
  return false
})()

if (isMainModule) {
  NodeRuntime.runMain(main)
}
