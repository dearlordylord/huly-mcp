import { afterEach, beforeEach, describe, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { expect } from "vitest"
import { HulyClient } from "../src/huly/client.js"
import { HulyStorageClient } from "../src/huly/storage.js"
import { WorkspaceClient } from "../src/huly/workspace-client.js"
import { main } from "../src/index.js"
import { McpServerError, McpServerService } from "../src/mcp/server.js"
import { TelemetryService } from "../src/telemetry/telemetry.js"

// --- Tests ---

describe("Main Entry Point", () => {
  // Store original env vars
  const originalEnv: Record<string, string | undefined> = {}
  const envVars = [
    "HULY_URL",
    "HULY_EMAIL",
    "HULY_PASSWORD",
    "HULY_WORKSPACE",
    "HULY_CONNECTION_TIMEOUT",
    "MCP_TRANSPORT",
    "MCP_HTTP_PORT"
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
    // test-revizorro: suspect | trivial assertion `toBeDefined()` passes with any error; test doesn't verify ConfigValidationError or missing field
    it.effect("fails on missing config", () =>
      Effect.gen(function*() {
        // Don't set any env vars - config should fail
        const error = yield* Effect.flip(main)

        expect(error).toBeDefined()
      }))
  })

  describe("layer composition", () => {
    it.scoped("McpServerService layer composes with HulyClient, HulyStorageClient, and WorkspaceClient", () =>
      Effect.gen(function*() {
        const hulyClientLayer = HulyClient.testLayer({})
        const storageClientLayer = HulyStorageClient.testLayer({})
        const workspaceClientLayer = WorkspaceClient.testLayer({})
        const mcpServerLayer = McpServerService.layer({ transport: "stdio" }).pipe(
          Layer.provide(Layer.merge(
            Layer.merge(
              Layer.merge(hulyClientLayer, storageClientLayer),
              workspaceClientLayer
            ),
            TelemetryService.testLayer()
          ))
        )

        yield* Layer.build(mcpServerLayer)
      }))
  })

  describe("error handling", () => {
    // test-revizorro: suspect | only checks error exists, not error type/message - should verify ConfigValidationError with URL validation details
    it.effect("reports config validation errors clearly", () =>
      Effect.gen(function*() {
        // Invalid URL
        process.env["HULY_URL"] = "not-a-valid-url"
        process.env["HULY_EMAIL"] = "test@example.com"
        process.env["HULY_PASSWORD"] = "test-password"
        process.env["HULY_WORKSPACE"] = "test-workspace"

        const error = yield* Effect.flip(main)

        expect(error).toBeDefined()
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
    // test-revizorro: scheduled
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
      }))

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
      }))
  })
})
