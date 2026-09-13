import type http from "node:http"

import { toFindResult } from "@hcengineering/core"
import { Server } from "@modelcontextprotocol/server"
import { Context, Effect, Exit, Fiber, Layer } from "effect"
import { describe, expect, it } from "vitest"

import { sanitizeHulyRuntimeConfigFromEnv, sanitizeHulyRuntimeConfigFromHeaders } from "../../src/config/config.js"
import { HulyClient, type HulyClientOperations } from "../../src/huly/client.js"
import { HulyStorageClient } from "../../src/huly/storage.js"
import { WorkspaceClient } from "../../src/huly/workspace-client.js"
import { HttpServerFactoryService, HttpTransportError, type HttpServerFactory } from "../../src/mcp/http-transport.js"
import type { ClientBundle } from "../../src/mcp/server.js"
import { McpServerService } from "../../src/mcp/server.js"
import { TelemetryService } from "../../src/telemetry/telemetry.js"
import { failingHttpServerFactory, makeTestHttpServerFactory } from "./http-test-support.js"

const protocolVersion = "2026-07-28"
const runtimeEnv = { HULY_URL: "https://huly.example.com", HULY_WORKSPACE: "workspace", HULY_TOKEN: "test-token" }

const deferred = <A>(): { readonly promise: Promise<A>; readonly resolve: (value: A) => void } => {
  let resolvePromise: ((value: A) => void) | undefined
  const promise = new Promise<A>((resolve) => {
    resolvePromise = resolve
  })
  return { promise, resolve: (value) => resolvePromise?.(value) }
}

const clientBundle = async (operations: Partial<HulyClientOperations> = {}): Promise<ClientBundle> => {
  const layer = Layer.mergeAll(
    HulyClient.testLayer(operations),
    HulyStorageClient.testLayer({}),
    WorkspaceClient.testLayer({})
  )
  const context = await Effect.runPromise(Layer.build(layer).pipe(Effect.scoped))
  return {
    hulyClient: Context.get(context, HulyClient),
    storageClient: Context.get(context, HulyStorageClient),
    workspaceClient: Context.get(context, WorkspaceClient)
  }
}

const modernRequest = (
  method: string,
  params: Record<string, unknown>
): { readonly method: "POST"; readonly headers: Record<string, string>; readonly body: string } => ({
  method: "POST",
  headers: {
    accept: "application/json, text/event-stream",
    "content-type": "application/json",
    "mcp-protocol-version": protocolVersion,
    "mcp-method": method,
    ...(method === "tools/call" && typeof params.name === "string" ? { "mcp-name": params.name } : {})
  },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method,
    params: {
      ...params,
      _meta: {
        "io.modelcontextprotocol/protocolVersion": protocolVersion,
        "io.modelcontextprotocol/clientCapabilities": {},
        "io.modelcontextprotocol/clientInfo": { name: "server-http-test", version: "1.0.0" }
      }
    }
  })
})

const runningFactory = (
  listening: ReturnType<typeof deferred<http.Server>>,
  writes: Array<string>
): HttpServerFactory => makeTestHttpServerFactory(listening.resolve, (message) => writes.push(message))

describe("McpServerService released HTTP integration", () => {
  it("drains admitted HTTP tool bodies before releasing request clients", async () => {
    const listening = deferred<http.Server>()
    const started = deferred<void>()
    const aborted = deferred<void>()
    const finish = deferred<void>()
    let released = false
    let bodyFinishedWithOpenClients = false
    const bundle = await clientBundle({
      findAll: () =>
        Effect.promise(async () => {
          started.resolve()
          await finish.promise
          bodyFinishedWithOpenClients = !released
          expect(released).toBe(false)
          return toFindResult([])
        })
    })
    const layer = McpServerService.layer({
      transport: "http",
      httpPort: 0,
      httpHost: "127.0.0.1",
      resolveClients: async () => Exit.succeed(bundle),
      resolveClientLeaseForHttpRequest: async () => ({
        bundle: Exit.succeed(bundle),
        close: () => {
          released = true
        }
      }),
      createServer: () => {
        const server = new Server(
          { name: "drain-test", version: "1.0.0" },
          { capabilities: { tools: {}, resources: {} } }
        )
        server.onclose = aborted.resolve
        return server
      },
      getRuntimeConfigContext: () => sanitizeHulyRuntimeConfigFromEnv(runtimeEnv)
    }).pipe(Layer.provide(TelemetryService.testLayer()))
    const context = await Effect.runPromise(Layer.build(layer).pipe(Effect.scoped))
    const operations = Context.get(context, McpServerService)
    const fiber = Effect.runFork(
      operations.run().pipe(Effect.provideService(HttpServerFactoryService, runningFactory(listening, [])))
    )
    await Effect.runPromise(operations.awaitReady())
    const server = await listening.promise
    const address = server.address()
    if (address === null || typeof address === "string") throw new Error("Expected an assigned TCP port")
    const response = fetch(
      `http://127.0.0.1:${address.port}/mcp`,
      modernRequest("tools/call", { name: "list_projects", arguments: {} })
    )
    await started.promise
    const stopping = Effect.runPromise(operations.stop())
    await aborted.promise
    expect(released).toBe(false)
    finish.resolve()
    await stopping
    await Effect.runPromise(Fiber.join(fiber))
    expect(bodyFinishedWithOpenClients).toBe(true)
    expect(released).toBe(true)
    expect((await response).status).toBe(499)
  })
  it("keeps HTTP running when stdin emits EOF", async () => {
    const listening = deferred<http.Server>()
    const writes: Array<string> = []
    const bundle = await clientBundle()
    const layer = McpServerService.layer({
      transport: "http",
      httpPort: 0,
      httpHost: "127.0.0.1",
      resolveClients: async () => Exit.succeed(bundle),
      getRuntimeConfigContext: () => sanitizeHulyRuntimeConfigFromEnv(runtimeEnv)
    }).pipe(Layer.provide(TelemetryService.testLayer()))
    const context = await Effect.runPromise(Layer.build(layer).pipe(Effect.scoped))
    const operations = Context.get(context, McpServerService)
    const fiber = Effect.runFork(
      operations.run().pipe(Effect.provideService(HttpServerFactoryService, runningFactory(listening, writes)))
    )
    const server = await listening.promise

    process.stdin.emit("end")
    await Promise.resolve()

    expect(server.listening).toBe(true)
    await Effect.runPromise(operations.stop())
    await Effect.runPromise(Fiber.join(fiber))
  })

  it("isolates concurrent request config, server products, and client leases", async () => {
    const listening = deferred<http.Server>()
    const writes: Array<string> = []
    const seenRuntimeConfig: Array<{
      readonly origin: string | undefined
      readonly workspace: string | undefined
      readonly tokenConfigured: boolean
    }> = []
    const seenLeases: Array<{
      readonly token: string | null
      readonly workspace: string | null
      readonly bundle: ClientBundle
    }> = []
    const bothLeasesRequested = deferred<void>()
    const releaseLeases = deferred<void>()
    const alphaBundle = await clientBundle()
    const betaBundle = await clientBundle()
    const leaseCloseCounts = new Map<string, number>()
    const layer = McpServerService.layer({
      transport: "http",
      httpPort: 0,
      httpHost: "127.0.0.1",
      resolveClients: async () => Exit.succeed(alphaBundle),
      resolveClientLeaseForHttpRequest: async (request) => {
        const token = request.headers.get("x-huly-token")
        const workspace = request.headers.get("x-huly-workspace")
        const bundle = token === "token-alpha" ? alphaBundle : betaBundle
        seenLeases.push({ token, workspace, bundle })
        if (seenLeases.length === 2) bothLeasesRequested.resolve()
        await releaseLeases.promise
        return {
          bundle: Exit.succeed(bundle),
          close: () => {
            if (token !== null) leaseCloseCounts.set(token, (leaseCloseCounts.get(token) ?? 0) + 1)
          }
        }
      },
      getRuntimeConfigContext: () => sanitizeHulyRuntimeConfigFromEnv(runtimeEnv),
      getRuntimeConfigContextForHttpRequest: (request) => {
        const runtimeConfig = sanitizeHulyRuntimeConfigFromHeaders(
          Object.fromEntries(request.headers.entries()),
          runtimeEnv
        )
        seenRuntimeConfig.push({
          origin: runtimeConfig.huly.url.origin,
          workspace: runtimeConfig.huly.workspace.value,
          tokenConfigured: runtimeConfig.auth.tokenConfigured
        })
        return runtimeConfig
      }
    }).pipe(Layer.provide(TelemetryService.testLayer()))
    const context = await Effect.runPromise(Layer.build(layer).pipe(Effect.scoped))
    const operations = Context.get(context, McpServerService)
    const fiber = Effect.runFork(
      operations.run().pipe(Effect.provideService(HttpServerFactoryService, runningFactory(listening, writes)))
    )
    await Effect.runPromise(operations.awaitReady())
    const server = await listening.promise
    const address = server.address()
    if (address === null || typeof address === "string") throw new Error("Expected an assigned TCP port")

    const endpoint = `http://127.0.0.1:${address.port}/mcp`
    const requestForIdentity = (url: string, workspace: string, token: string) =>
      fetch(endpoint, {
        ...modernRequest("tools/call", { name: "list_projects", arguments: {} }),
        headers: {
          ...modernRequest("tools/call", { name: "list_projects", arguments: {} }).headers,
          "x-huly-url": url,
          "x-huly-workspace": workspace,
          "x-huly-token": token
        }
      })
    const requests = Promise.all([
      requestForIdentity("https://alpha.huly.example.com", "workspace-alpha", "token-alpha"),
      requestForIdentity("https://beta.huly.example.com", "workspace-beta", "token-beta")
    ])
    await bothLeasesRequested.promise
    expect(
      seenLeases.map(({ token }) => token).toSorted((left, right) => String(left).localeCompare(String(right)))
    ).toEqual(["token-alpha", "token-beta"])
    expect(seenLeases.find(({ token }) => token === "token-alpha")?.bundle).toBe(alphaBundle)
    expect(seenLeases.find(({ token }) => token === "token-beta")?.bundle).toBe(betaBundle)
    releaseLeases.resolve()
    const [alphaResponse, betaResponse] = await requests
    await Promise.all([alphaResponse.text(), betaResponse.text()])

    expect(alphaResponse.status).toBe(200)
    expect(betaResponse.status).toBe(200)
    expect(
      seenRuntimeConfig.toSorted((left, right) => (left.workspace ?? "").localeCompare(right.workspace ?? ""))
    ).toEqual([
      { origin: "https://alpha.huly.example.com", workspace: "workspace-alpha", tokenConfigured: true },
      { origin: "https://beta.huly.example.com", workspace: "workspace-beta", tokenConfigured: true }
    ])
    expect(leaseCloseCounts).toEqual(
      new Map([
        ["token-alpha", 1],
        ["token-beta", 1]
      ])
    )
    await Effect.runPromise(operations.stop())
    await Effect.runPromise(Fiber.join(fiber))
    expect(server.listening).toBe(false)
    expect(leaseCloseCounts).toEqual(
      new Map([
        ["token-alpha", 1],
        ["token-beta", 1]
      ])
    )
  })

  it("reports request-scoped Huly client cleanup failures without exposing their cause", async () => {
    const listening = deferred<http.Server>()
    const cleanupReported = deferred<string>()
    const bundle = await clientBundle()
    const layer = McpServerService.layer({
      transport: "http",
      httpPort: 0,
      httpHost: "127.0.0.1",
      resolveClients: async () => Exit.succeed(bundle),
      resolveClientLeaseForHttpRequest: async () => ({
        bundle: Exit.succeed(bundle),
        close: () => Promise.reject(new Error("tenant connection reset during close"))
      }),
      getRuntimeConfigContext: () => sanitizeHulyRuntimeConfigFromEnv(runtimeEnv),
      writeError: (message) => {
        if (message.startsWith("Request-scoped Huly client cleanup failed")) cleanupReported.resolve(message)
      }
    }).pipe(Layer.provide(TelemetryService.testLayer()))
    const context = await Effect.runPromise(Layer.build(layer).pipe(Effect.scoped))
    const operations = Context.get(context, McpServerService)
    const fiber = Effect.runFork(
      operations.run().pipe(Effect.provideService(HttpServerFactoryService, runningFactory(listening, [])))
    )
    await Effect.runPromise(operations.awaitReady())
    const server = await listening.promise
    const address = server.address()
    if (address === null || typeof address === "string") throw new Error("Expected an assigned TCP port")

    const response = await fetch(
      `http://127.0.0.1:${address.port}/mcp`,
      modernRequest("tools/call", { name: "list_projects", arguments: {} })
    )
    await response.text()

    expect(await cleanupReported.promise).toBe("Request-scoped Huly client cleanup failed\n")
    await Effect.runPromise(operations.stop())
    await Effect.runPromise(Fiber.join(fiber))
  })

  it("falls back to shared clients and process runtime config when request callbacks are absent", async () => {
    const listening = deferred<http.Server>()
    const writes: Array<string> = []
    let sharedResolutions = 0
    const bundle = await clientBundle()
    const layer = McpServerService.layer({
      transport: "http",
      httpPort: 0,
      httpHost: "127.0.0.1",
      resolveClients: async () => {
        sharedResolutions++
        return Exit.succeed(bundle)
      },
      getRuntimeConfigContext: () => sanitizeHulyRuntimeConfigFromEnv(runtimeEnv)
    }).pipe(Layer.provide(TelemetryService.testLayer()))
    const context = await Effect.runPromise(Layer.build(layer).pipe(Effect.scoped))
    const operations = Context.get(context, McpServerService)
    const fiber = Effect.runFork(
      operations.run().pipe(Effect.provideService(HttpServerFactoryService, runningFactory(listening, writes)))
    )
    await Effect.runPromise(operations.awaitReady())
    const server = await listening.promise
    const address = server.address()
    if (address === null || typeof address === "string") throw new Error("Expected an assigned TCP port")

    const response = await fetch(
      `http://127.0.0.1:${address.port}/mcp`,
      modernRequest("tools/call", { name: "list_projects", arguments: {} })
    )
    await response.text()

    expect(response.status).toBe(200)
    expect(sharedResolutions).toBe(1)

    await Effect.runPromise(operations.stop())
    await Effect.runPromise(Fiber.join(fiber))
  })

  it("maps listener failures and applies the default host and port", async () => {
    const bundle = await clientBundle()
    const layer = McpServerService.layer({
      transport: "http",
      resolveClients: async () => Exit.succeed(bundle),
      getRuntimeConfigContext: () => sanitizeHulyRuntimeConfigFromEnv(runtimeEnv)
    }).pipe(Layer.provide(TelemetryService.testLayer()))
    const context = await Effect.runPromise(Layer.build(layer).pipe(Effect.scoped))
    const operations = Context.get(context, McpServerService)
    let seenPort = 0
    let seenHost = ""
    const failure = new HttpTransportError({ message: "listener failed" })
    const failingFactory = failingHttpServerFactory(failure)
    const factory: HttpServerFactory = {
      make: (port, host) => {
        seenPort = port
        seenHost = host
        return failingFactory.make(port, host)
      }
    }

    const result = await Effect.runPromise(
      Effect.exit(operations.run().pipe(Effect.provideService(HttpServerFactoryService, factory)))
    )
    const retry = await Effect.runPromise(
      Effect.exit(operations.run().pipe(Effect.provideService(HttpServerFactoryService, factory)))
    )

    expect(result._tag).toBe("Failure")
    expect(String(result)).toContain("listener failed")
    expect(retry._tag).toBe("Failure")
    expect(String(retry)).toContain("listener failed")
    expect(String(retry)).not.toContain("already running")
    expect(seenPort).toBe(3000)
    expect(seenHost).toBe("127.0.0.1")
  })
})
