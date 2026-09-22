import { describe, it } from "@effect/vitest"
import { Context, Effect, Exit, Fiber, Latch, Layer } from "effect"
import { TestClock } from "effect/testing"
import { expect } from "vitest"

import { sanitizeHulyRuntimeConfigFromEnv } from "../../src/config/config.js"
import { HulyClient } from "../../src/huly/client.js"
import { HulyStorageClient } from "../../src/huly/storage.js"
import { HttpServerFactoryService } from "../../src/mcp/http-transport.js"
import { McpServerService } from "../../src/mcp/server.js"
import type { StdioProcessPort, StdioShutdownHandlers } from "../../src/mcp/stdio-shutdown.js"
import { TelemetryService } from "../../src/telemetry/telemetry.js"
import { inertHttpServerFactory } from "./http-test-support.js"

const runtimeEnv = { HULY_URL: "https://huly.example.com", HULY_WORKSPACE: "workspace", HULY_TOKEN: "test-token" }

class RecordingStdioProcess implements StdioProcessPort {
  private handlers: StdioShutdownHandlers | undefined
  private readonly onListen: () => void
  readonly forcedExitCodes: Array<1> = []
  removedListeners = 0

  constructor(onListen: () => void = () => {}) {
    this.onListen = onListen
  }

  listen(handlers: StdioShutdownHandlers): () => void {
    this.handlers = handlers
    this.onListen()
    return () => {
      if (this.handlers === handlers) {
        this.handlers = undefined
        this.removedListeners++
      }
    }
  }

  forceExit(code: 1): void {
    this.forcedExitCodes.push(code)
  }

  emitEof(): void {
    this.handlers?.stdinEof()
  }

  emitSigterm(): void {
    this.handlers?.sigterm()
  }
}

const makeBundle = Effect.fn("makeBundle")(function* () {
  const context = yield* Layer.build(Layer.mergeAll(HulyClient.testLayer({}), HulyStorageClient.testLayer({})))
  return { hulyClient: Context.get(context, HulyClient), storageClient: Context.get(context, HulyStorageClient) }
})

const buildOperations = Effect.fn("buildOperations")(function* (
  stdioProcess: StdioProcessPort,
  options: { readonly closeClients?: () => Promise<void>; readonly shutdownTelemetry?: () => Promise<void> } = {}
) {
  const bundle = yield* makeBundle()
  const layer = McpServerService.layer({
    transport: "stdio",
    resolveClients: async () => Exit.succeed(bundle),
    stdioProcess,
    ...(options.closeClients === undefined ? {} : { closeClients: options.closeClients }),
    getRuntimeConfigContext: () => sanitizeHulyRuntimeConfigFromEnv(runtimeEnv)
  }).pipe(
    Layer.provide(
      TelemetryService.testLayer(options.shutdownTelemetry === undefined ? {} : { shutdown: options.shutdownTelemetry })
    )
  )
  const context = yield* Layer.build(layer)
  return Context.get(context, McpServerService)
})

const runReady = Effect.fn("runReady")(function* (operations: McpServerService["Service"]) {
  const fiber = yield* operations
    .run()
    .pipe(
      Effect.provideService(HttpServerFactoryService, inertHttpServerFactory("HTTP is outside this test")),
      Effect.forkScoped({ startImmediately: true })
    )
  yield* operations.awaitReady()
  return fiber
})

describe("McpServerService Effect stdio lifecycle", () => {
  it.effect("stops cleanly through the owner operation", () =>
    Effect.gen(function* () {
      const process = new RecordingStdioProcess()
      const operations = yield* buildOperations(process)
      const fiber = yield* runReady(operations)
      yield* operations.stop()
      yield* Fiber.join(fiber)
      expect(process.forcedExitCodes).toEqual([])
    })
  )

  it.effect("treats EOF as ownership loss and completes successfully", () =>
    Effect.gen(function* () {
      const process = new RecordingStdioProcess()
      const operations = yield* buildOperations(process)
      const fiber = yield* runReady(operations)
      process.emitEof()
      yield* Effect.yieldNow
      yield* TestClock.adjust("250 millis")
      yield* Fiber.join(fiber)
      expect(process.forcedExitCodes).toEqual([])
    })
  )

  it.effect("coalesces signal and EOF requests", () =>
    Effect.gen(function* () {
      const process = new RecordingStdioProcess()
      const operations = yield* buildOperations(process)
      const fiber = yield* runReady(operations)
      process.emitEof()
      process.emitSigterm()
      yield* Effect.yieldNow
      yield* TestClock.adjust("250 millis")
      yield* operations.stop()
      yield* Fiber.join(fiber)
      expect(process.forcedExitCodes).toEqual([])
    })
  )

  it.effect("reports awaitReady before startup as a typed error", () =>
    Effect.gen(function* () {
      const operations = yield* buildOperations(new RecordingStdioProcess())
      const error = yield* operations.awaitReady().pipe(Effect.flip)
      expect(error._tag).toBe("McpServerError")
      expect(error.message).toBe("MCP server is not running")
    })
  )

  it.effect("finalizes stdio ownership when the run fiber is interrupted during startup", () =>
    Effect.gen(function* () {
      const listening = yield* Latch.make()
      const shutdownOrder: Array<string> = []
      const process = new RecordingStdioProcess(() => listening.openUnsafe())
      const operations = yield* buildOperations(process, {
        shutdownTelemetry: async () => {
          shutdownOrder.push("telemetry")
        },
        closeClients: async () => {
          shutdownOrder.push("clients")
        }
      })
      const fiber = yield* operations
        .run()
        .pipe(
          Effect.provideService(HttpServerFactoryService, inertHttpServerFactory("HTTP is outside this test")),
          Effect.forkScoped({ startImmediately: true })
        )
      yield* listening.await

      yield* Fiber.interrupt(fiber)

      expect(process.removedListeners).toBe(1)
      expect(process.forcedExitCodes).toEqual([])
      expect(shutdownOrder).toEqual(["telemetry", "clients"])
    })
  )
})
