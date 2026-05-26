import { afterEach, beforeEach, describe, it } from "@effect/vitest"
import { Context, Effect, Layer, Option, Redacted } from "effect"
import { expect } from "vitest"
import { HulyClient } from "../src/huly/client.js"
import { HulyStorageClient } from "../src/huly/storage.js"
import { WorkspaceClient } from "../src/huly/workspace-client.js"
import { getHttpPort, getMcpAuthToken, main } from "../src/index.js"
import { DEFAULT_HTTP_PORT, HttpServerFactoryService } from "../src/mcp/http-transport.js"
import { type ClientBundle, McpServerError, McpServerService } from "../src/mcp/server.js"
import { TelemetryService } from "../src/telemetry/telemetry.js"

const resolveClientsFromLayer = (
  clientLayer: Layer.Layer<HulyClient | HulyStorageClient | WorkspaceClient>
): () => Promise<ClientBundle> => {
  let promise: Promise<ClientBundle> | null = null
  return () => {
    if (promise === null) {
      promise = Effect.runPromise(
        Effect.gen(function*() {
          const ctx = yield* Layer.build(clientLayer).pipe(Effect.scoped)
          return {
            hulyClient: Context.get(ctx, HulyClient),
            storageClient: Context.get(ctx, HulyStorageClient),
            workspaceClient: Context.get(ctx, WorkspaceClient)
          }
        })
      )
    }
    return promise
  }
}

const CLOUD_RUN_TEST_PORT = "8080"
const MCP_HTTP_TEST_PORT = "9090"

// --- Tests ---

describe("Main Entry Point", () => {
  // Store original env vars
  const originalEnv: Record<string, string | undefined> = {}
  const envVars = [
    "HULY_URL",
    "HULY_EMAIL",
    "HULY_PASSWORD",
    "HULY_TOKEN",
    "HULY_WORKSPACE",
    "HULY_CONNECTION_TIMEOUT",
    "MCP_TRANSPORT",
    "MCP_HTTP_PORT",
    "MCP_AUTH_TOKEN",
    "PORT"
  ]

  beforeEach(() => {
    // Save and clear env vars
    for (const key of envVars) {
      originalEnv[key] = process.env[key]
      delete process.env[key]
    }
  })

  afterEach(() => {
    // Restore env vars
    for (const key of envVars) {
      if (originalEnv[key] !== undefined) {
        process.env[key] = originalEnv[key]
      } else {
        delete process.env[key]
      }
    }
  })

  describe("main program", () => {
    // test-revizorro: approved
    it.effect("fails on missing config with ConfigValidationError", () =>
      Effect.gen(function*() {
        // Don't set any env vars - config should fail
        const error = yield* Effect.flip(main)

        expect(error._tag).toBe("ConfigValidationError")
        expect(error.message).toContain("Configuration error")
      }))
  })

  describe("HTTP port config", () => {
    it.effect("uses PORT when MCP_HTTP_PORT is unset", () =>
      Effect.gen(function*() {
        process.env["PORT"] = CLOUD_RUN_TEST_PORT

        const port = yield* getHttpPort

        expect(port).toBe(Number(CLOUD_RUN_TEST_PORT))
      }))

    it.effect("prefers MCP_HTTP_PORT over PORT", () =>
      Effect.gen(function*() {
        process.env["MCP_HTTP_PORT"] = MCP_HTTP_TEST_PORT
        process.env["PORT"] = CLOUD_RUN_TEST_PORT

        const port = yield* getHttpPort

        expect(port).toBe(Number(MCP_HTTP_TEST_PORT))
      }))

    it.effect("uses the default HTTP port when neither env var is set", () =>
      Effect.gen(function*() {
        const port = yield* getHttpPort

        expect(port).toBe(DEFAULT_HTTP_PORT)
      }))
  })

  describe("MCP HTTP auth token config", () => {
    it.effect("treats MCP_AUTH_TOKEN as optional", () =>
      Effect.gen(function*() {
        const token = yield* getMcpAuthToken

        expect(Option.isNone(token)).toBe(true)
      }))

    it.effect("reads MCP_AUTH_TOKEN as a redacted value independent of Huly tokens", () =>
      Effect.gen(function*() {
        process.env["MCP_AUTH_TOKEN"] = "mcp-endpoint-secret"
        process.env["HULY_TOKEN"] = "huly-api-token"

        const token = yield* getMcpAuthToken

        expect(Option.isSome(token)).toBe(true)
        if (Option.isSome(token)) {
          expect(Redacted.value(token.value)).toBe("mcp-endpoint-secret")
          expect(`${token.value}`).toBe("<redacted>")
        }
      }))
  })

  describe("layer composition", () => {
    it.scoped("McpServerService layer composes with HulyClient, HulyStorageClient, and WorkspaceClient", () =>
      Effect.gen(function*() {
        const clientLayer = Layer.mergeAll(
          HulyClient.testLayer({}),
          HulyStorageClient.testLayer({}),
          WorkspaceClient.testLayer({})
        )
        const mcpServerLayer = McpServerService.layer({
          transport: "stdio",
          resolveClients: resolveClientsFromLayer(clientLayer)
        }).pipe(
          Layer.provide(TelemetryService.testLayer())
        )

        yield* Layer.build(mcpServerLayer)
      }))
  })

  describe("error handling", () => {
    // test-revizorro: approved
    it.effect("reports config validation errors clearly", () =>
      Effect.gen(function*() {
        // Invalid URL
        process.env["HULY_URL"] = "not-a-valid-url"
        process.env["HULY_EMAIL"] = "test@example.com"
        process.env["HULY_PASSWORD"] = "test-password"
        process.env["HULY_WORKSPACE"] = "test-workspace"

        const error = yield* Effect.flip(main)

        expect(error._tag).toBe("ConfigValidationError")
        expect(error.message).toContain("Configuration error")
      }))

    // test-revizorro: approved
    it.effect("reports missing required config", () =>
      Effect.gen(function*() {
        // Missing HULY_PASSWORD
        process.env["HULY_URL"] = "https://test.huly.app"
        process.env["HULY_EMAIL"] = "test@example.com"
        process.env["HULY_WORKSPACE"] = "test-workspace"

        const error = yield* Effect.flip(main)

        expect(error).toBeDefined()
      }))
  })

  describe("McpServerService integration", () => {
    // test-revizorro: approved
    it.effect("server run/stop cycle works", () =>
      Effect.gen(function*() {
        let runCalled = false
        let stopCalled = false

        const mockServerLayer = McpServerService.testLayer({
          run: () =>
            Effect.sync(() => {
              runCalled = true
            }),
          stop: () =>
            Effect.sync(() => {
              stopCalled = true
            })
        })

        yield* Effect.gen(function*() {
          const server = yield* McpServerService
          yield* server.run()
          yield* server.stop()
        }).pipe(Effect.provide(mockServerLayer))

        expect(runCalled).toBe(true)
        expect(stopCalled).toBe(true)
      }).pipe(Effect.provide(HttpServerFactoryService.defaultLayer)))

    // test-revizorro: approved
    it.effect("server error is properly typed", () =>
      Effect.gen(function*() {
        const mockServerLayer = McpServerService.testLayer({
          run: () => new McpServerError({ message: "Connection refused" })
        })

        const error = yield* Effect.flip(
          Effect.gen(function*() {
            const server = yield* McpServerService
            yield* server.run()
          }).pipe(Effect.provide(mockServerLayer))
        )

        expect(error._tag).toBe("McpServerError")
        expect(error.message).toBe("Connection refused")
      }).pipe(Effect.provide(HttpServerFactoryService.defaultLayer)))
  })
})
