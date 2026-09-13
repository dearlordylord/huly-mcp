import type http from "node:http"

import { afterEach, beforeEach, describe, it } from "@effect/vitest"
import { ConfigProvider, Context, Deferred, Effect, Exit, Fiber, Inspectable, Layer, Option, Redacted } from "effect"
import { TestClock } from "effect/testing"
import { expect } from "vitest"
import { HulyClient } from "../src/huly/client.js"
import { HulyStorageClient } from "../src/huly/storage.js"
import { WorkspaceClient } from "../src/huly/workspace-client.js"
import { buildAppLayer, closeProcessClients, getHttpPort, getLazyEnvs, getMcpAuthToken, main } from "../src/index.js"
import { DEFAULT_HTTP_HOST, DEFAULT_HTTP_PORT, HttpPort, HttpServerFactoryService } from "../src/mcp/http-transport.js"
import { type ClientBundle, McpServerError, McpServerService } from "../src/mcp/server.js"
import { TelemetryService } from "../src/telemetry/telemetry.js"
import { makeTestHttpServerFactory } from "./mcp/http-test-support.js"

const resolveClientsFromLayer = (
  clientLayer: Layer.Layer<HulyClient | HulyStorageClient | WorkspaceClient>
): (() => Promise<Exit.Exit<ClientBundle>>) => {
  let promise: Promise<Exit.Exit<ClientBundle>> | null = null
  return () => {
    if (promise === null) {
      promise = Effect.runPromise(
        Effect.gen(function* () {
          const ctx = yield* Layer.build(clientLayer).pipe(Effect.scoped)
          return Exit.succeed({
            hulyClient: Context.get(ctx, HulyClient),
            storageClient: Context.get(ctx, HulyStorageClient),
            workspaceClient: Context.get(ctx, WorkspaceClient)
          })
        })
      )
    }
    return promise
  }
}

const CLOUD_RUN_TEST_PORT = "8080"
const MCP_HTTP_TEST_PORT = "9090"

const provideConfig = (values: Record<string, string>) =>
  Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown(values)))

const discoveryRequest = (authorization?: string): RequestInit => ({
  method: "POST",
  headers: {
    accept: "application/json, text/event-stream",
    "content-type": "application/json",
    "mcp-protocol-version": "2026-07-28",
    "mcp-method": "server/discover",
    ...(authorization === undefined ? {} : { authorization })
  },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "server/discover",
    params: {
      _meta: {
        "io.modelcontextprotocol/protocolVersion": "2026-07-28",
        "io.modelcontextprotocol/clientCapabilities": {},
        "io.modelcontextprotocol/clientInfo": { name: "index-auth-test", version: "1.0.0" }
      }
    }
  })
})

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
    "PORT",
    "LAZY_ENVS",
    "GLAMA_VERSION"
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
    it.effect("fails on missing config with ConfigValidationError", () =>
      Effect.gen(function* () {
        // Don't set any env vars - config should fail
        const error = yield* Effect.flip(main)

        expect(error._tag).toBe("ConfigValidationError")
        expect(error.message).toContain("Configuration error")
      })
    )
  })

  describe("HTTP port config", () => {
    it.effect("uses PORT when MCP_HTTP_PORT is unset", () =>
      Effect.gen(function* () {
        const port = yield* getHttpPort.pipe(provideConfig({ PORT: CLOUD_RUN_TEST_PORT }))

        expect(port).toBe(Number(CLOUD_RUN_TEST_PORT))
      })
    )

    it.effect("prefers MCP_HTTP_PORT over PORT", () =>
      Effect.gen(function* () {
        const port = yield* getHttpPort.pipe(
          provideConfig({ MCP_HTTP_PORT: MCP_HTTP_TEST_PORT, PORT: CLOUD_RUN_TEST_PORT })
        )

        expect(port).toBe(Number(MCP_HTTP_TEST_PORT))
      })
    )

    it.effect("uses the default HTTP port when neither env var is set", () =>
      Effect.gen(function* () {
        const port = yield* getHttpPort

        expect(port).toBe(DEFAULT_HTTP_PORT)
      })
    )

    it.effect("rejects an HTTP port outside the TCP range", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(getHttpPort.pipe(provideConfig({ MCP_HTTP_PORT: "65536" })))

        expect(Inspectable.toStringUnknown(error)).toContain("must be a whole number between 0 and 65535")
      })
    )
  })

  describe("MCP HTTP auth token config", () => {
    it.effect("treats MCP_AUTH_TOKEN as optional", () =>
      Effect.gen(function* () {
        const token = yield* getMcpAuthToken

        expect(Option.isNone(token)).toBe(true)
      })
    )

    it.effect("reads MCP_AUTH_TOKEN as a redacted value independent of Huly tokens", () =>
      Effect.gen(function* () {
        const token = yield* getMcpAuthToken.pipe(
          provideConfig({ MCP_AUTH_TOKEN: "mcp-endpoint-secret", HULY_TOKEN: "huly-api-token" })
        )

        expect(Option.isSome(token)).toBe(true)
        if (Option.isSome(token)) {
          expect(Redacted.value(token.value)).toBe("mcp-endpoint-secret")
          expect(Inspectable.toStringUnknown(token.value)).toBe('"<redacted>"')
        }
      })
    )

    it.effect("rejects a whitespace-only MCP_AUTH_TOKEN instead of disabling HTTP auth", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(getMcpAuthToken.pipe(provideConfig({ MCP_AUTH_TOKEN: " \t " })))

        expect(Inspectable.toStringUnknown(error)).toContain("must not be empty or whitespace-only")
      })
    )

    it.effect("wires MCP_AUTH_TOKEN from bootstrap config through the server HTTP boundary", () =>
      Effect.gen(function* () {
        const configuredToken = yield* getMcpAuthToken.pipe(
          provideConfig({ MCP_AUTH_TOKEN: "mcp-endpoint-secret", HULY_TOKEN: "huly-api-token" })
        )
        if (Option.isNone(configuredToken)) return yield* Effect.die(new Error("Expected configured MCP auth token"))

        let resolveListening: ((server: http.Server) => void) | undefined
        const listening = new Promise<http.Server>((resolve) => {
          resolveListening = resolve
        })
        const clientLayer = Layer.mergeAll(
          HulyClient.testLayer({}),
          HulyStorageClient.testLayer({}),
          WorkspaceClient.testLayer({})
        )
        const resolveClients = resolveClientsFromLayer(clientLayer)
        const httpServerLayer = Layer.succeed(
          HttpServerFactoryService,
          makeTestHttpServerFactory((server) => resolveListening?.(server))
        )
        const appLayer = buildAppLayer(
          "http",
          HttpPort.make(0),
          DEFAULT_HTTP_HOST,
          configuredToken.value,
          "token",
          resolveClients,
          async () => ({ bundle: await resolveClients(), close: () => {} }),
          httpServerLayer
        )

        yield* Effect.gen(function* () {
          const operations = yield* McpServerService
          const fiber = yield* operations.run().pipe(Effect.forkChild({ startImmediately: true }))
          yield* operations.awaitReady()
          const server = yield* Effect.promise(() => listening)
          const address = server.address()
          if (address === null || typeof address === "string") {
            return yield* Effect.die(new Error("Expected an assigned TCP port"))
          }
          const endpoint = `http://127.0.0.1:${address.port}/mcp`

          yield* Effect.gen(function* () {
            const rejected = yield* Effect.promise(() => fetch(endpoint, discoveryRequest()))
            const accepted = yield* Effect.promise(() =>
              fetch(endpoint, discoveryRequest("Bearer mcp-endpoint-secret"))
            )
            yield* Effect.promise(() => Promise.all([rejected.text(), accepted.text()]))

            expect(rejected.status).toBe(401)
            expect(accepted.status).toBe(200)
          }).pipe(Effect.ensuring(Effect.ignore(operations.stop())))

          yield* Fiber.join(fiber)
          expect(server.listening).toBe(false)
        }).pipe(Effect.provide(appLayer), Effect.scoped)
      })
    )
  })

  describe("lazy Huly config startup", () => {
    it.effect("defaults to eager stdio config validation outside registry inspection", () =>
      Effect.gen(function* () {
        const lazyEnvs = yield* getLazyEnvs

        expect(lazyEnvs).toBe(false)
      })
    )

    it.effect("defaults to lazy config validation during Glama registry inspection", () =>
      Effect.gen(function* () {
        process.env["GLAMA_VERSION"] = "1.0.0"

        const lazyEnvs = yield* getLazyEnvs

        expect(lazyEnvs).toBe(true)
      })
    )

    it.effect("lets explicit LAZY_ENVS override Glama registry inspection", () =>
      Effect.gen(function* () {
        process.env["GLAMA_VERSION"] = "1.0.0"
        const lazyEnvs = yield* getLazyEnvs.pipe(provideConfig({ LAZY_ENVS: "false" }))

        expect(lazyEnvs).toBe(false)
      })
    )
  })

  describe("layer composition", () => {
    it.effect("McpServerService layer composes with HulyClient, HulyStorageClient, and WorkspaceClient", () =>
      Effect.gen(function* () {
        const clientLayer = Layer.mergeAll(
          HulyClient.testLayer({}),
          HulyStorageClient.testLayer({}),
          WorkspaceClient.testLayer({})
        )
        const mcpServerLayer = McpServerService.layer({
          transport: "stdio",
          resolveClients: resolveClientsFromLayer(clientLayer)
        }).pipe(Layer.provide(TelemetryService.testLayer()))

        yield* Layer.build(mcpServerLayer)
      })
    )
  })

  describe("process client cleanup", () => {
    it.effect("bounds a stuck client close with the Effect clock", () =>
      Effect.gen(function* () {
        const closeStarted = yield* Deferred.make<void>()
        const errors: Array<string> = []
        const cleanup = closeProcessClients(
          () => {
            Effect.runSync(Deferred.succeed(closeStarted, undefined))
            return new Promise(() => {})
          },
          "5 seconds",
          (message) => errors.push(message)
        )
        const fiber = yield* cleanup.pipe(Effect.forkChild({ startImmediately: true }))

        yield* Deferred.await(closeStarted)
        yield* TestClock.adjust("5 seconds")
        yield* Fiber.join(fiber)

        expect(errors).toEqual(["Process-scoped Huly client cleanup timed out"])
      })
    )

    it.effect("sanitizes client close failures", () =>
      Effect.gen(function* () {
        const errors: Array<string> = []

        yield* closeProcessClients(
          () => Promise.reject(new Error("secret-token")),
          "5 seconds",
          (message) => errors.push(message)
        )

        expect(errors).toEqual(["Process-scoped Huly client cleanup failed"])
        expect(errors.join(" ")).not.toContain("secret-token")
      })
    )
  })

  describe("error handling", () => {
    it.effect("reports config validation errors clearly", () =>
      Effect.gen(function* () {
        // Invalid URL
        process.env["HULY_URL"] = "not-a-valid-url"
        process.env["HULY_EMAIL"] = "test@example.com"
        process.env["HULY_PASSWORD"] = "test-password"
        process.env["HULY_WORKSPACE"] = "test-workspace"

        const error = yield* Effect.flip(main)

        expect(error._tag).toBe("ConfigValidationError")
        expect(error.message).toContain("Configuration error")
      })
    )

    it.effect("reports missing required config", () =>
      Effect.gen(function* () {
        // Missing HULY_PASSWORD
        process.env["HULY_URL"] = "https://test.huly.example.test"
        process.env["HULY_EMAIL"] = "test@example.com"
        process.env["HULY_WORKSPACE"] = "test-workspace"

        const error = yield* Effect.flip(main)

        expect(error).toBeDefined()
      })
    )
  })

  describe("McpServerService integration", () => {
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
            })
        })

        yield* Effect.gen(function* () {
          const server = yield* McpServerService
          yield* server.run()
          yield* server.stop()
        }).pipe(Effect.provide(mockServerLayer))

        expect(runCalled).toBe(true)
        expect(stopCalled).toBe(true)
      }).pipe(Effect.provide(HttpServerFactoryService.defaultLayer))
    )

    it.effect("server error is properly typed", () =>
      Effect.gen(function* () {
        const mockServerLayer = McpServerService.testLayer({
          run: () => new McpServerError({ message: "Connection refused" })
        })

        const error = yield* Effect.flip(
          Effect.gen(function* () {
            const server = yield* McpServerService
            yield* server.run()
          }).pipe(Effect.provide(mockServerLayer))
        )

        expect(error._tag).toBe("McpServerError")
        expect(error.message).toBe("Connection refused")
      }).pipe(Effect.provide(HttpServerFactoryService.defaultLayer))
    )
  })
})
