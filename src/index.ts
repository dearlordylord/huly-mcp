#!/usr/bin/env node
/**
 * Main entry point for Huly MCP server.
 *
 * Loads configuration, builds Layer stack, and starts the MCP server.
 * Handles graceful shutdown on SIGTERM/SIGINT.
 *
 * Usage:
 *   npm start
 *
 * Environment variables:
 *   HULY_URL           - Huly platform URL (required)
 *   HULY_EMAIL         - User email (required)
 *   HULY_PASSWORD      - User password (required)
 *   HULY_WORKSPACE     - Default workspace (required)
 *   HULY_CONNECTION_TIMEOUT - Connection timeout in ms (default: 30000)
 *   MCP_TRANSPORT      - Transport mode: stdio (default: stdio)
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
import { type McpServerError, McpServerService, type McpTransportType } from "./mcp/server.js"
;(globalThis as any).indexedDB = fakeIndexedDB

// Mock window with basic event handling
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

// --- Types ---

/**
 * Application error - wraps all startup/runtime errors.
 */
export type AppError = HulyConfigError | HulyClientError | McpServerError | ConfigError.ConfigError

// --- Main Program ---

/**
 * Get transport type from environment.
 * Defaults to "stdio" if not set.
 */
const getTransportType = Config.string("MCP_TRANSPORT").pipe(
  Config.withDefault("stdio"),
  Effect.map((t): McpTransportType => {
    if (t === "http") return "http"
    return "stdio"
  })
)

/**
 * Get HTTP port from environment.
 * Defaults to 3000 if not set.
 */
const getHttpPort = Config.integer("MCP_HTTP_PORT").pipe(
  Config.withDefault(3000)
)

/**
 * Build the full application layer stack.
 * Config → HulyClient → McpServer
 */
export const buildAppLayer = (
  transport: McpTransportType,
  httpPort: number
): Layer.Layer<McpServerService, HulyConfigError | HulyClientError, never> => {
  // HulyClient requires HulyConfig
  const hulyClientLayer = HulyClient.layer.pipe(
    Layer.provide(HulyConfigService.layer)
  )

  // McpServer requires HulyClient
  const mcpServerLayer = McpServerService.layer({
    transport,
    httpPort
  }).pipe(Layer.provide(hulyClientLayer))

  return mcpServerLayer
}

/**
 * Main program that starts the MCP server.
 * Runs until shutdown signal is received.
 */
export const main: Effect.Effect<void, AppError> = Effect.gen(function*() {
  // Get transport configuration
  const transport = yield* getTransportType
  const httpPort = yield* getHttpPort

  // Note: No console output here - stdout reserved for MCP protocol in stdio mode

  // Build layer stack
  const appLayer = buildAppLayer(transport, httpPort)

  // Get server service and run
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
