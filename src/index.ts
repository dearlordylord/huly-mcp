#!/usr/bin/env node
/**
 * Main entry point for Huly MCP server.
 *
 * @module
 */

// Polyfill browser globals for Node.js (required by @hcengineering packages)
import { NodeRuntime } from "@effect/platform-node"
import type { ConfigError } from "effect"
import { Config, Effect, Layer } from "effect"
import fakeIndexedDB from "fake-indexeddb"

import { type ConfigValidationError, HulyConfigService } from "./config/config.js"
import { HulyClient, type HulyClientError } from "./huly/client.js"
import { HulyStorageClient, type StorageClientError } from "./huly/storage.js"
import { WorkspaceClient, type WorkspaceClientError } from "./huly/workspace-client.js"
import { HttpServerFactoryService } from "./mcp/http-transport.js"
import { type McpServerError, McpServerService, type McpTransportType } from "./mcp/server.js"
;(globalThis as Record<string, unknown>).indexedDB = fakeIndexedDB

// Mock window with basic event handling
// - dirtiest hack here. current api package is frontend-oriented, but we somehow run it on the server and it somehow works. hooray?
const mockWindow: Record<string, unknown> = {
  addEventListener: () => {},
  removeEventListener: () => {},
  location: { href: "" },
  document: {}
}
;(globalThis as Record<string, unknown>).window = mockWindow

if (!(globalThis as Record<string, unknown>).navigator) {
  Object.defineProperty(globalThis, "navigator", {
    value: { userAgent: "node" },
    writable: true,
    configurable: true
  })
}

export type AppError =
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
  Config.withDefault(3000)
)

const getHttpHost = Config.string("MCP_HTTP_HOST").pipe(
  Config.withDefault("127.0.0.1")
)

const getAutoExit = Config.boolean("MCP_AUTO_EXIT").pipe(
  Config.withDefault(false)
)

const buildAppLayer = (
  transport: McpTransportType,
  httpPort: number,
  httpHost: string,
  autoExit: boolean
): Layer.Layer<
  McpServerService | HttpServerFactoryService,
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

  const combinedClientLayer = Layer.merge(
    Layer.merge(hulyClientLayer, storageClientLayer),
    workspaceClientLayer
  )

  const mcpServerLayer = McpServerService.layer({
    transport,
    httpPort,
    httpHost,
    autoExit
  }).pipe(Layer.provide(combinedClientLayer))

  // Merge with HttpServerFactoryService for HTTP transport
  return Layer.merge(mcpServerLayer, HttpServerFactoryService.defaultLayer)
}

export const main: Effect.Effect<void, AppError> = Effect.gen(function*() {
  const transport = yield* getTransportType
  const httpPort = yield* getHttpPort
  const httpHost = yield* getHttpHost
  const autoExit = yield* getAutoExit
  // stdout reserved for MCP protocol in stdio mode - no console output here
  const appLayer = buildAppLayer(transport, httpPort, httpHost, autoExit)

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
