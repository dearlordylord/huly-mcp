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

import { type HulyConfigError, HulyConfigService } from "./config/config.js"
import { HulyClient, type HulyClientError } from "./huly/client.js"
import { HulyStorageClient, type StorageClientError } from "./huly/storage.js"
import { type McpServerError, McpServerService, type McpTransportType } from "./mcp/server.js"
;(globalThis as any).indexedDB = fakeIndexedDB

// Mock window with basic event handling
// - dirtiest hack here. current api package is frontend-oriented, but we somehow run it on the server and it somehow works. hooray?
const mockWindow: any = {
  addEventListener: () => {},
  removeEventListener: () => {},
  location: { href: "" },
  document: {}
}
;(globalThis as any).window = mockWindow

if (!(globalThis as any).navigator) {
  Object.defineProperty(globalThis, "navigator", {
    value: { userAgent: "node" },
    writable: true,
    configurable: true
  })
}

export type AppError = HulyConfigError | HulyClientError | StorageClientError | McpServerError | ConfigError.ConfigError

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

export const buildAppLayer = (
  transport: McpTransportType,
  httpPort: number
): Layer.Layer<McpServerService, HulyConfigError | HulyClientError | StorageClientError, never> => {
  const configLayer = HulyConfigService.layer

  const hulyClientLayer = HulyClient.layer.pipe(
    Layer.provide(configLayer)
  )

  const storageClientLayer = HulyStorageClient.layer.pipe(
    Layer.provide(configLayer)
  )

  const combinedClientLayer = Layer.merge(hulyClientLayer, storageClientLayer)

  const mcpServerLayer = McpServerService.layer({
    transport,
    httpPort
  }).pipe(Layer.provide(combinedClientLayer))

  return mcpServerLayer
}

export const main: Effect.Effect<void, AppError> = Effect.gen(function*() {
  const transport = yield* getTransportType
  const httpPort = yield* getHttpPort
  // stdout reserved for MCP protocol in stdio mode - no console output here
  const appLayer = buildAppLayer(transport, httpPort)

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
