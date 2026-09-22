import { describe, it } from "@effect/vitest"
import { Context, Effect, Exit, Fiber, Layer } from "effect"
import { TestClock } from "effect/testing"
import { expect } from "vitest"

import { sanitizeHulyRuntimeConfigFromEnv } from "../../src/config/config.js"
import { HulyClient } from "../../src/huly/client.js"
import { HulyStorageClient } from "../../src/huly/storage.js"
import { HttpServerFactoryService } from "../../src/mcp/http-transport.js"
import { McpServerError, McpServerService } from "../../src/mcp/server.js"
import type { StdioProcessPort, StdioShutdownHandlers } from "../../src/mcp/stdio-shutdown.js"
import { TelemetryService } from "../../src/telemetry/telemetry.js"
import { inertHttpServerFactory } from "./http-test-support.js"

const runtimeEnv = { HULY_URL: "https://huly.example.com", HULY_WORKSPACE: "workspace", HULY_TOKEN: "test-token" }

class TestStdioProcess implements StdioProcessPort {
  private handlers: StdioShutdownHandlers | undefined

  listen(handlers: StdioShutdownHandlers): () => void {
    this.handlers = handlers
    return () => {
      if (this.handlers === handlers) this.handlers = undefined
    }
  }

  forceExit(_code: 1): void {}

  trigger(reason: "stdin-eof" | "stdin-close" | "sigint" | "sigterm"): void {
    if (reason === "stdin-eof") this.handlers?.stdinEof()
    else if (reason === "stdin-close") this.handlers?.stdinClose()
    else if (reason === "sigint") this.handlers?.sigint()
    else this.handlers?.sigterm()
  }
}

class ImmediateSignalStdioProcess implements StdioProcessPort {
  removedListeners = 0

  listen(handlers: StdioShutdownHandlers): () => void {
    handlers.sigterm()
    return () => {
      this.removedListeners++
    }
  }

  forceExit(_code: 1): void {}
}

const buildOperations = Effect.fn("buildServerOperations")(function* (
  stdioProcess: StdioProcessPort | null = new TestStdioProcess(),
  closeClients?: () => Promise<void>,
  shutdownTelemetry?: () => Promise<void>
) {
  const clients = yield* Layer.build(Layer.mergeAll(HulyClient.testLayer({}), HulyStorageClient.testLayer({})))
  const bundle = {
    hulyClient: Context.get(clients, HulyClient),
    storageClient: Context.get(clients, HulyStorageClient)
  }
  const layer = McpServerService.layer({
    transport: "stdio",
    resolveClients: async () => Exit.succeed(bundle),
    ...(stdioProcess === null ? {} : { stdioProcess }),
    ...(closeClients === undefined ? {} : { closeClients }),
    getRuntimeConfigContext: () => sanitizeHulyRuntimeConfigFromEnv(runtimeEnv)
  }).pipe(
    Layer.provide(TelemetryService.testLayer(shutdownTelemetry === undefined ? {} : { shutdown: shutdownTelemetry }))
  )
  const context = yield* Layer.build(layer)
  return Context.get(context, McpServerService)
})

const buildHttpOperationsWithDefaultRuntimeContext = Effect.fn("buildHttpOperationsWithDefaultRuntimeContext")(
  function* () {
    const clients = yield* Layer.build(Layer.mergeAll(HulyClient.testLayer({}), HulyStorageClient.testLayer({})))
    const bundle = {
      hulyClient: Context.get(clients, HulyClient),
      storageClient: Context.get(clients, HulyStorageClient)
    }
    const layer = McpServerService.layer({ transport: "http", resolveClients: async () => Exit.succeed(bundle) }).pipe(
      Layer.provide(TelemetryService.testLayer())
    )
    const context = yield* Layer.build(layer)
    return Context.get(context, McpServerService)
  }
)

const runReady = Effect.fn("runServerReady")(function* (operations: McpServerService["Service"]) {
  const fiber = yield* operations
    .run()
    .pipe(
      Effect.provideService(HttpServerFactoryService, inertHttpServerFactory("HTTP is outside this test")),
      Effect.forkScoped({ startImmediately: true })
    )
  yield* operations.awaitReady()
  return fiber
})

describe("McpServerService operations", () => {
  it.effect("stop is a no-op when the server has not started", () =>
    Effect.gen(function* () {
      const operations = yield* buildOperations()
      yield* operations.stop()
    })
  )

  it.effect("awaitReady fails with a typed lifecycle error before startup", () =>
    Effect.gen(function* () {
      const operations = yield* buildOperations()
      const error = yield* operations.awaitReady().pipe(Effect.flip)
      expect(error).toBeInstanceOf(McpServerError)
      expect(error.message).toBe("MCP server is not running")
    })
  )

  it.effect("rejects a second concurrent run and releases the first run", () =>
    Effect.gen(function* () {
      const operations = yield* buildOperations()
      const first = yield* runReady(operations)
      const error = yield* operations
        .run()
        .pipe(
          Effect.provideService(HttpServerFactoryService, inertHttpServerFactory("HTTP is outside this test")),
          Effect.flip
        )
      expect(error.message).toBe("MCP server is already running")
      yield* operations.stop()
      yield* Fiber.join(first)
    })
  )

  it.effect("maps HTTP startup failures and releases ownership for a later run", () =>
    Effect.gen(function* () {
      const operations = yield* buildHttpOperationsWithDefaultRuntimeContext()
      const factory = inertHttpServerFactory("listener failed")

      const first = yield* operations.run().pipe(Effect.provideService(HttpServerFactoryService, factory), Effect.flip)
      const second = yield* operations.run().pipe(Effect.provideService(HttpServerFactoryService, factory), Effect.flip)

      expect(first).toBeInstanceOf(McpServerError)
      expect(first.message).toBe("listener failed")
      expect(second.message).toBe("listener failed")
    })
  )

  it.effect("handles every stdio ownership signal", () =>
    Effect.gen(function* () {
      for (const reason of ["stdin-eof", "stdin-close", "sigint", "sigterm"] as const) {
        const process = new TestStdioProcess()
        const operations = yield* buildOperations(process)
        const fiber = yield* runReady(operations)
        process.trigger(reason)
        if (reason === "stdin-eof" || reason === "stdin-close") {
          yield* Effect.yieldNow
          yield* TestClock.adjust("250 millis")
        }
        yield* Fiber.join(fiber)
      }
    })
  )

  it.effect("handles a shutdown signal delivered while listeners are being installed", () =>
    Effect.gen(function* () {
      const process = new ImmediateSignalStdioProcess()
      const operations = yield* buildOperations(process)

      yield* operations
        .run()
        .pipe(Effect.provideService(HttpServerFactoryService, inertHttpServerFactory("HTTP is outside this test")))

      expect(process.removedListeners).toBe(1)
    })
  )

  it.effect("runs configured client cleanup once", () =>
    Effect.gen(function* () {
      let closed = 0
      const operations = yield* buildOperations(new TestStdioProcess(), async () => {
        closed++
      })
      const fiber = yield* runReady(operations)
      yield* operations.stop()
      yield* Fiber.join(fiber)
      expect(closed).toBe(1)
    })
  )

  it.effect("uses and releases the live stdio process adapter when none is configured", () =>
    Effect.gen(function* () {
      const before = {
        eof: process.stdin.listenerCount("end"),
        close: process.stdin.listenerCount("close"),
        sigint: process.listenerCount("SIGINT"),
        sigterm: process.listenerCount("SIGTERM")
      }
      const operations = yield* buildOperations(null)
      const fiber = yield* runReady(operations)

      expect(process.stdin.listenerCount("end")).toBeGreaterThan(before.eof)
      expect(process.stdin.listenerCount("close")).toBeGreaterThan(before.close)
      expect(process.listenerCount("SIGINT")).toBeGreaterThan(before.sigint)
      expect(process.listenerCount("SIGTERM")).toBeGreaterThan(before.sigterm)

      yield* operations.stop()
      yield* Fiber.join(fiber)

      expect(process.stdin.listenerCount("end")).toBe(before.eof)
      expect(process.stdin.listenerCount("close")).toBe(before.close)
      expect(process.listenerCount("SIGINT")).toBe(before.sigint)
      expect(process.listenerCount("SIGTERM")).toBe(before.sigterm)
    })
  )

  it.effect("attempts both telemetry and client cleanup when shutdown callbacks fail", () =>
    Effect.gen(function* () {
      let clientAttempts = 0
      let telemetryAttempts = 0
      const operations = yield* buildOperations(
        new TestStdioProcess(),
        async () => {
          clientAttempts++
          throw new Error("client cleanup failed")
        },
        async () => {
          telemetryAttempts++
          throw new Error("telemetry cleanup failed")
        }
      )
      const fiber = yield* runReady(operations)

      yield* operations.stop()
      yield* Fiber.join(fiber)

      expect(clientAttempts).toBe(1)
      expect(telemetryAttempts).toBe(1)
    })
  )

  it.effect("provides no-op defaults from the test layer", () =>
    Effect.gen(function* () {
      const context = yield* Layer.build(McpServerService.testLayer({}))
      const operations = Context.get(context, McpServerService)
      yield* operations
        .run()
        .pipe(Effect.provideService(HttpServerFactoryService, inertHttpServerFactory("test layer does not listen")))
      yield* operations.stop()
      yield* operations.awaitReady()
    })
  )
})
