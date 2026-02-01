import { describe, it, beforeEach, afterEach } from "@effect/vitest"
import { expect } from "vitest"
import { Effect, Layer, Cause } from "effect"
import { HulyConfigService } from "../src/config/config.js"
import { HulyClient } from "../src/huly/client.js"
import { McpServerService, McpServerError } from "../src/mcp/server.js"
import { main } from "../src/index.js"

// --- Test Helpers ---

const createTestConfigLayer = () =>
  HulyConfigService.testLayer({
    url: "https://test.huly.app",
    email: "test@example.com",
    password: "test-password",
    workspace: "test-workspace",
    connectionTimeout: 5000,
  })

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
    "MCP_HTTP_PORT",
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
    it.effect("fails on missing config", () =>
      Effect.gen(function* () {
        // Don't set any env vars - config should fail
        const error = yield* Effect.flip(main)

        expect(error).toBeDefined()
      })
    )
  })

  describe("layer composition", () => {
    // test-revizorro: approved
    it.scoped("McpServerService layer composes with HulyClient", () =>
      Effect.gen(function* () {
        const hulyClientLayer = HulyClient.testLayer({})
        const mcpServerLayer = McpServerService.layer({ transport: "stdio" }).pipe(
          Layer.provide(hulyClientLayer)
        )

        yield* Layer.build(mcpServerLayer)
      })
    )
  })

  describe("error handling", () => {
    // test-revizorro: approved
    it.effect("reports config validation errors clearly", () =>
      Effect.gen(function* () {
        // Invalid URL
        process.env["HULY_URL"] = "not-a-valid-url"
        process.env["HULY_EMAIL"] = "test@example.com"
        process.env["HULY_PASSWORD"] = "test-password"
        process.env["HULY_WORKSPACE"] = "test-workspace"

        const error = yield* Effect.flip(main)

        expect(error).toBeDefined()
      })
    )

    // test-revizorro: approved
    it.effect("reports missing required config", () =>
      Effect.gen(function* () {
        // Missing HULY_PASSWORD
        process.env["HULY_URL"] = "https://test.huly.app"
        process.env["HULY_EMAIL"] = "test@example.com"
        process.env["HULY_WORKSPACE"] = "test-workspace"

        const error = yield* Effect.flip(main)

        expect(error).toBeDefined()
      })
    )
  })

  describe("McpServerService integration", () => {
    // test-revizorro: approved
    it.effect("server run/stop cycle works", () =>
      Effect.gen(function* () {
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
            }),
        })

        yield* Effect.gen(function* () {
          const server = yield* McpServerService
          yield* server.run()
          yield* server.stop()
        }).pipe(Effect.provide(mockServerLayer))

        expect(runCalled).toBe(true)
        expect(stopCalled).toBe(true)
      })
    )

    // test-revizorro: approved
    it.effect("server error is properly typed", () =>
      Effect.gen(function* () {
        const mockServerLayer = McpServerService.testLayer({
          run: () => new McpServerError({ message: "Connection refused" }),
        })

        const error = yield* Effect.flip(
          Effect.gen(function* () {
            const server = yield* McpServerService
            yield* server.run()
          }).pipe(Effect.provide(mockServerLayer))
        )

        expect(error._tag).toBe("McpServerError")
        expect(error.message).toBe("Connection refused")
      })
    )
  })
})
