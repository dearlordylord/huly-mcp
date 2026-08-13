import { PassThrough } from "node:stream"

import { Server } from "@modelcontextprotocol/server"
import { it } from "@effect/vitest"
import { Context, Effect, Fiber, Layer, TestClock } from "effect"
import { describe, expect } from "vitest"

import { sanitizeHulyRuntimeConfigFromEnv } from "../../src/config/config.js"
import { HulyClient } from "../../src/huly/client.js"
import { HulyStorageClient } from "../../src/huly/storage.js"
import { WorkspaceClient } from "../../src/huly/workspace-client.js"
import { HttpServerFactoryService } from "../../src/mcp/http-transport.js"
import { createDefaultMcpSdkServer } from "../../src/mcp/sdk-server.js"
import type { ClientBundle } from "../../src/mcp/server.js"
import { McpServerService } from "../../src/mcp/server.js"
import type { StdioProcessPort, StdioShutdownHandlers } from "../../src/mcp/stdio-shutdown.js"
import { TelemetryService } from "../../src/telemetry/telemetry.js"
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio"
import { inertHttpServerFactory } from "./http-test-support.js"

const runtimeEnv = { HULY_URL: "https://huly.example.com", HULY_WORKSPACE: "workspace", HULY_TOKEN: "test-token" }

const clientBundle = async (): Promise<ClientBundle> => {
  const layer = Layer.mergeAll(HulyClient.testLayer({}), HulyStorageClient.testLayer({}), WorkspaceClient.testLayer({}))
  const context = await Effect.runPromise(Layer.build(layer).pipe(Effect.scoped))
  return {
    hulyClient: Context.get(context, HulyClient),
    storageClient: Context.get(context, HulyStorageClient),
    workspaceClient: Context.get(context, WorkspaceClient)
  }
}

const unusedHttpFactory = inertHttpServerFactory("HTTP is outside this stdio test")

class FailingCloseTransport extends StdioServerTransport {
  override close(): Promise<void> {
    return Promise.reject(new Error("wire close failed"))
  }
}

class RecordingStdioProcess implements StdioProcessPort {
  private handlers: StdioShutdownHandlers | null = null
  private readonly waiters = new Set<() => void>()
  readonly forcedExitCodes: Array<1> = []
  listenerRegistrations = 0

  listen(handlers: StdioShutdownHandlers): () => void {
    this.handlers = handlers
    this.listenerRegistrations++
    for (const resolve of this.waiters) resolve()
    this.waiters.clear()
    return () => {
      if (this.handlers === handlers) this.handlers = null
    }
  }

  forceExit(code: 1): void {
    this.forcedExitCodes.push(code)
  }

  awaitListening(): Promise<void> {
    return this.handlers === null ? new Promise((resolve) => this.waiters.add(resolve)) : Promise.resolve()
  }

  emitEof(): void {
    this.handlers?.stdinEof()
  }

  emitSigterm(): void {
    this.handlers?.sigterm()
  }
}

class CountingCloseTransport extends StdioServerTransport {
  closes = 0

  override close(): Promise<void> {
    this.closes++
    return super.close()
  }
}

class CountingSdkServer extends Server {
  closes = 0

  constructor() {
    super({ name: "shutdown-test", version: "1.0.0" }, { capabilities: { resources: {}, tools: {} } })
  }

  override close(): Promise<void> {
    this.closes++
    return super.close()
  }
}

describe("McpServerService released stdio lifecycle", () => {
  it("lets the SDK report owned stdio wire close failures out of band", async () => {
    const bundle = await clientBundle()
    const layer = McpServerService.layer({
      transport: "stdio",
      resolveClients: async () => bundle,
      createServer: createDefaultMcpSdkServer,
      createStdioTransport: () => new FailingCloseTransport(new PassThrough(), new PassThrough()),
      getRuntimeConfigContext: () => sanitizeHulyRuntimeConfigFromEnv(runtimeEnv)
    }).pipe(Layer.provide(TelemetryService.testLayer()))
    const context = await Effect.runPromise(Layer.build(layer).pipe(Effect.scoped))
    const operations = Context.get(context, McpServerService)
    const fiber = Effect.runFork(
      operations.run().pipe(Effect.provideService(HttpServerFactoryService, unusedHttpFactory))
    )
    await Promise.resolve()

    await Effect.runPromise(operations.stop())
    await Effect.runPromise(Fiber.join(fiber))
  })

  it("closes the pinned modern server after draining on stdin end", async () => {
    const input = new PassThrough()
    const output = new PassThrough()
    const responseWritten = new Promise<void>((resolve) => {
      output.once("data", () => resolve())
    })
    input.write(
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "server/discover",
        params: {
          _meta: {
            "io.modelcontextprotocol/protocolVersion": "2026-07-28",
            "io.modelcontextprotocol/clientCapabilities": {}
          }
        }
      })}\n`
    )
    const bundle = await clientBundle()
    const layer = McpServerService.layer({
      transport: "stdio",
      resolveClients: async () => bundle,
      createServer: createDefaultMcpSdkServer,
      createStdioTransport: () => new StdioServerTransport(input, output),
      getRuntimeConfigContext: () => sanitizeHulyRuntimeConfigFromEnv(runtimeEnv)
    }).pipe(Layer.provide(TelemetryService.testLayer()))
    const context = await Effect.runPromise(Layer.build(layer).pipe(Effect.scoped))
    const operations = Context.get(context, McpServerService)
    const fiber = Effect.runFork(
      operations.run().pipe(Effect.provideService(HttpServerFactoryService, unusedHttpFactory))
    )

    await responseWritten
    process.stdin.emit("end")
    await Effect.runPromise(Fiber.join(fiber))
  })

  it("treats EOF as unconditional ownership loss and coalesces a racing signal", async () => {
    const input = new PassThrough()
    const output = new PassThrough()
    const transport = new CountingCloseTransport(input, output)
    const stdioProcess = new RecordingStdioProcess()
    const bundle = await clientBundle()
    let telemetryCloses = 0
    let clientCloses = 0
    const sdkServers: Array<CountingSdkServer> = []
    const sdkCreatedState = { resolve: () => {} }
    const sdkCreated = new Promise<void>((resolve) => {
      sdkCreatedState.resolve = resolve
    })
    const layer = McpServerService.layer({
      transport: "stdio",
      resolveClients: async () => bundle,
      closeClients: async () => {
        clientCloses++
      },
      createServer: () => {
        const server = new CountingSdkServer()
        sdkServers.push(server)
        sdkCreatedState.resolve()
        return server
      },
      createStdioTransport: () => transport,
      stdioProcess,
      getRuntimeConfigContext: () => sanitizeHulyRuntimeConfigFromEnv(runtimeEnv)
    }).pipe(
      Layer.provide(
        TelemetryService.testLayer({
          shutdown: async () => {
            telemetryCloses++
          }
        })
      )
    )
    const context = await Effect.runPromise(Layer.build(layer).pipe(Effect.scoped))
    const operations = Context.get(context, McpServerService)
    const fiber = Effect.runFork(
      operations.run().pipe(Effect.provideService(HttpServerFactoryService, unusedHttpFactory))
    )

    await stdioProcess.awaitListening()
    input.write(
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "server/discover",
        params: {
          _meta: {
            "io.modelcontextprotocol/protocolVersion": "2026-07-28",
            "io.modelcontextprotocol/clientCapabilities": {}
          }
        }
      })}\n`
    )
    await sdkCreated
    stdioProcess.emitEof()
    stdioProcess.emitSigterm()
    await Effect.runPromise(Fiber.join(fiber))

    expect(transport.closes).toBe(1)
    expect(sdkServers).toHaveLength(1)
    expect(sdkServers[0]?.closes).toBe(1)
    expect(telemetryCloses).toBe(1)
    expect(clientCloses).toBe(1)
    expect(stdioProcess.forcedExitCodes).toEqual([])
  })

  it.scoped("forces one exit when a top-level external close exceeds the global deadline", () =>
    Effect.gen(function* () {
      const stdioProcess = new RecordingStdioProcess()
      const errors: Array<string> = []
      const bundle = yield* Effect.promise(clientBundle)
      const neverCloses = new Promise<void>(() => {})
      const layer = McpServerService.layer({
        transport: "stdio",
        resolveClients: async () => bundle,
        closeClients: () => neverCloses,
        createServer: createDefaultMcpSdkServer,
        createStdioTransport: () => new StdioServerTransport(new PassThrough(), new PassThrough()),
        stdioProcess,
        writeError: (message) => errors.push(message),
        getRuntimeConfigContext: () => sanitizeHulyRuntimeConfigFromEnv(runtimeEnv)
      }).pipe(Layer.provide(TelemetryService.testLayer()))
      const context = yield* Layer.build(layer)
      const operations = Context.get(context, McpServerService)
      const fiber = yield* operations
        .run()
        .pipe(Effect.provideService(HttpServerFactoryService, unusedHttpFactory), Effect.fork)

      yield* Effect.promise(() => stdioProcess.awaitListening())
      yield* Effect.sync(() => stdioProcess.emitEof())
      yield* TestClock.adjust("10 seconds")
      yield* Fiber.join(fiber)

      expect(stdioProcess.forcedExitCodes).toEqual([1])
      expect(errors).toEqual(["Huly MCP stdio shutdown exceeded 10 seconds; forcing process exit"])
    })
  )

  it.scoped("abandons an accepted request after its allowance and still completes before the global deadline", () =>
    Effect.gen(function* () {
      const input = new PassThrough()
      const output = new PassThrough()
      const stdioProcess = new RecordingStdioProcess()
      const requestStarted = yield* Effect.makeLatch(false)
      const neverResolves = new Promise<ClientBundle>(() => {})
      const errors: Array<string> = []
      const layer = McpServerService.layer({
        transport: "stdio",
        resolveClients: () => {
          Effect.runSync(requestStarted.open)
          return neverResolves
        },
        createServer: createDefaultMcpSdkServer,
        createStdioTransport: () => new StdioServerTransport(input, output),
        stdioProcess,
        writeError: (message) => errors.push(message),
        getRuntimeConfigContext: () => sanitizeHulyRuntimeConfigFromEnv(runtimeEnv)
      }).pipe(Layer.provide(TelemetryService.testLayer()))
      const context = yield* Layer.build(layer)
      const operations = Context.get(context, McpServerService)
      const fiber = yield* operations
        .run()
        .pipe(Effect.provideService(HttpServerFactoryService, unusedHttpFactory), Effect.fork)

      yield* Effect.promise(() => stdioProcess.awaitListening())
      yield* Effect.sync(() => {
        input.write(
          `${JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: {
              protocolVersion: "2025-06-18",
              capabilities: {},
              clientInfo: { name: "shutdown-test", version: "1.0.0" }
            }
          })}\n`
        )
        input.write(
          `${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "list_projects", arguments: {} } })}\n`
        )
      })
      yield* requestStarted.await
      yield* Effect.sync(() => stdioProcess.emitEof())
      yield* Effect.yieldNow()
      yield* TestClock.adjust("10 seconds")
      yield* Fiber.join(fiber)

      expect(stdioProcess.forcedExitCodes).toEqual([])
      expect(errors).not.toContain("Huly MCP stdio shutdown exceeded 10 seconds; forcing process exit")
    })
  )
})
