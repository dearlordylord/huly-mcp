import type http from "node:http"

import { Context, Effect, Fiber, Layer } from "effect"
import { describe, expect, it } from "vitest"

import { sanitizeHulyRuntimeConfigFromEnv, sanitizeHulyRuntimeConfigFromHeaders } from "../../src/config/config.js"
import { HulyClient } from "../../src/huly/client.js"
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

const clientBundle = async (): Promise<ClientBundle> => {
  const layer = Layer.mergeAll(HulyClient.testLayer({}), HulyStorageClient.testLayer({}), WorkspaceClient.testLayer({}))
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
  it("keeps HTTP running when stdin emits EOF", async () => {
    const listening = deferred<http.Server>()
    const writes: Array<string> = []
    const bundle = await clientBundle()
    const layer = McpServerService.layer({
      transport: "http",
      httpPort: 0,
      httpHost: "127.0.0.1",
      resolveClients: async () => bundle,
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

  it("uses request runtime config and releases a request-scoped client lease", async () => {
    const listening = deferred<http.Server>()
    const writes: Array<string> = []
    const seenWorkspaces: Array<string | undefined> = []
    let releases = 0
    const bundle = await clientBundle()
    const layer = McpServerService.layer({
      transport: "http",
      httpPort: 0,
      httpHost: "127.0.0.1",
      resolveClients: async () => bundle,
      resolveClientLeaseForHttpRequest: async (request) => {
        seenWorkspaces.push(request.headers.get("x-huly-workspace") ?? undefined)
        return {
          bundle,
          close: () => {
            releases++
          }
        }
      },
      getRuntimeConfigContext: () => sanitizeHulyRuntimeConfigFromEnv(runtimeEnv),
      getRuntimeConfigContextForHttpRequest: (request) =>
        sanitizeHulyRuntimeConfigFromHeaders(Object.fromEntries(request.headers.entries()), runtimeEnv)
    }).pipe(Layer.provide(TelemetryService.testLayer()))
    const context = await Effect.runPromise(Layer.build(layer).pipe(Effect.scoped))
    const operations = Context.get(context, McpServerService)
    const fiber = Effect.runFork(
      operations.run().pipe(Effect.provideService(HttpServerFactoryService, runningFactory(listening, writes)))
    )
    const server = await listening.promise
    const address = server.address()
    if (address === null || typeof address === "string") throw new Error("Expected an assigned TCP port")

    const endpoint = `http://127.0.0.1:${address.port}/mcp`
    const unsupportedHeaderResponse = await fetch(endpoint, {
      ...modernRequest("tools/call", { name: "get_huly_context", arguments: {} }),
      headers: {
        ...modernRequest("tools/call", { name: "get_huly_context", arguments: {} }).headers,
        "x-huly-unsupported": "present"
      }
    })
    await unsupportedHeaderResponse.text()
    const contextResponse = await fetch(endpoint, {
      ...modernRequest("tools/call", { name: "get_huly_context", arguments: {} }),
      headers: {
        ...modernRequest("tools/call", { name: "get_huly_context", arguments: {} }).headers,
        "x-huly-url": runtimeEnv.HULY_URL,
        "x-huly-workspace": "request-workspace",
        "x-huly-token": runtimeEnv.HULY_TOKEN
      }
    })
    await contextResponse.text()
    const response = await fetch(endpoint, {
      ...modernRequest("tools/call", { name: "list_projects", arguments: {} }),
      headers: {
        ...modernRequest("tools/call", { name: "list_projects", arguments: {} }).headers,
        "x-huly-url": runtimeEnv.HULY_URL,
        "x-huly-workspace": "request-workspace",
        "x-huly-token": runtimeEnv.HULY_TOKEN
      }
    })
    await response.text()
    const isolatedResponse = await fetch(endpoint, {
      ...modernRequest("tools/call", { name: "list_projects", arguments: {} }),
      headers: {
        ...modernRequest("tools/call", { name: "list_projects", arguments: {} }).headers,
        "x-huly-url": runtimeEnv.HULY_URL,
        "x-huly-workspace": "isolated-workspace",
        "x-huly-token": runtimeEnv.HULY_TOKEN
      }
    })
    await isolatedResponse.text()
    await Promise.resolve()

    expect(response.status).toBe(200)
    expect(unsupportedHeaderResponse.status).toBe(200)
    expect(isolatedResponse.status).toBe(200)
    expect(seenWorkspaces).toEqual(["request-workspace", "isolated-workspace"])
    expect(releases).toBe(2)

    await Effect.runPromise(operations.stop())
    await Effect.runPromise(Fiber.join(fiber))
    expect(server.listening).toBe(false)
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
        return bundle
      },
      getRuntimeConfigContext: () => sanitizeHulyRuntimeConfigFromEnv(runtimeEnv)
    }).pipe(Layer.provide(TelemetryService.testLayer()))
    const context = await Effect.runPromise(Layer.build(layer).pipe(Effect.scoped))
    const operations = Context.get(context, McpServerService)
    const fiber = Effect.runFork(
      operations.run().pipe(Effect.provideService(HttpServerFactoryService, runningFactory(listening, writes)))
    )
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

    process.emit("SIGINT")
    await Effect.runPromise(Fiber.join(fiber))
  })

  it("maps listener failures and applies the default host and port", async () => {
    const bundle = await clientBundle()
    const layer = McpServerService.layer({
      transport: "http",
      resolveClients: async () => bundle,
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
