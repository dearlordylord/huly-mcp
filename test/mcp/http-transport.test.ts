import * as http from "node:http"

import { Context, Deferred, Effect, Fiber, Layer, Redacted, type Duration } from "effect"
import { HttpRouter, HttpServer, HttpServerResponse } from "effect/unstable/http"
import * as NetAddress from "effect/unstable/net/NetAddress"
import { describe, expect, it } from "vitest"

import {
  DEFAULT_HTTP_HOST,
  HttpHost,
  HttpPort,
  HttpServerFactoryService,
  HttpTransportError,
  httpServeError,
  startHttpTransport,
  type HttpServerFactory
} from "../../src/mcp/http-transport.js"
import { failingHttpServerFactory, makeTestHttpServerFactory } from "./http-test-support.js"

const routeLayer = HttpRouter.add("POST", "/mcp", HttpServerResponse.text("ok"))

interface RunningTransport {
  readonly server: http.Server
  readonly url: string
  readonly stop: () => Promise<void>
}

const start = async (options?: {
  readonly authToken?: string
  readonly host?: string
  readonly gracePeriod?: Duration.Input
  readonly onShutdown?: () => Effect.Effect<void, unknown>
  readonly writeError?: (message: string) => void
}): Promise<RunningTransport> => {
  const listening = await Effect.runPromise(Deferred.make<http.Server>())
  const ready = await Effect.runPromise(Deferred.make<void>())
  const shutdown = await Effect.runPromise(Deferred.make<void>())
  const factory = makeTestHttpServerFactory(
    (server) => Effect.runSync(Deferred.succeed(listening, server)),
    options?.writeError
  )
  const config = {
    host: HttpHost.make(options?.host ?? DEFAULT_HTTP_HOST),
    port: HttpPort.make(0),
    ...(options?.authToken === undefined ? {} : { authToken: Redacted.make(options.authToken) }),
    ...(options?.gracePeriod === undefined ? {} : { shutdownGracePeriod: options.gracePeriod }),
    ...(options?.onShutdown === undefined ? {} : { onShutdown: options.onShutdown }),
    onReady: () => Deferred.succeed(ready, undefined).pipe(Effect.asVoid),
    shutdown: Deferred.await(shutdown)
  }
  const fiber = Effect.runFork(
    startHttpTransport(config, routeLayer).pipe(Effect.provideService(HttpServerFactoryService, factory))
  )
  const server = await Effect.runPromise(Deferred.await(listening))
  await Effect.runPromise(Deferred.await(ready))
  const address = server.address()
  if (address === null || typeof address === "string") throw new Error("Expected a TCP address")
  return {
    server,
    url: `http://127.0.0.1:${String(address.port)}/mcp`,
    stop: async () => {
      await Effect.runPromise(Deferred.succeed(shutdown, undefined))
      await Effect.runPromise(Fiber.join(fiber))
    }
  }
}

const post = (url: string, headers?: Record<string, string>): Promise<Response> =>
  fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: "{}" })

const postWithNodeHeaders = (url: string, headers: Record<string, string>): Promise<number> =>
  new Promise((resolve, reject) => {
    const target = new URL(url)
    const request = http.request(
      {
        hostname: target.hostname,
        port: target.port,
        path: target.pathname,
        method: "POST",
        headers: { "content-type": "application/json", ...headers }
      },
      (response) => {
        response.resume()
        response.once("end", () => resolve(response.statusCode ?? 0))
      }
    )
    request.once("error", reject)
    request.end("{}")
  })

const addressFactory = (address: NetAddress.SocketAddress): HttpServerFactory => ({
  make: () => Effect.succeed(HttpServer.make({ address, serve: () => Effect.void }))
})

describe("Effect HTTP transport policy", () => {
  it("builds the default Node factory with optional graceful timeout", async () => {
    const addresses = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const context = yield* Layer.build(HttpServerFactoryService.defaultLayer)
          const factory = Context.get(context, HttpServerFactoryService)
          const first = yield* factory.make(HttpPort.make(0), DEFAULT_HTTP_HOST)
          const bounded = yield* factory.make(HttpPort.make(0), DEFAULT_HTTP_HOST, "1 second")
          return [first.address, bounded.address]
        })
      )
    )
    expect(addresses.every(NetAddress.isInetAddress)).toBe(true)
  })

  it("maps default Node listener binding failures", async () => {
    const blocker = http.createServer()
    await new Promise<void>((resolve, reject) => {
      blocker.once("error", reject)
      blocker.listen(0, "127.0.0.1", resolve)
    })
    const address = blocker.address()
    if (address === null || typeof address === "string") throw new Error("Expected a TCP address")

    try {
      const result = await Effect.runPromiseExit(
        Effect.scoped(
          Effect.gen(function* () {
            const context = yield* Layer.build(HttpServerFactoryService.defaultLayer)
            const factory = Context.get(context, HttpServerFactoryService)
            yield* factory.make(HttpPort.make(address.port), DEFAULT_HTTP_HOST)
          })
        )
      )
      expect(result._tag).toBe("Failure")
    } finally {
      await new Promise<void>((resolve, reject) => {
        blocker.close((error) => (error === undefined ? resolve() : reject(error)))
      })
    }
  })

  it("enforces bearer authentication before routing", async () => {
    const transport = await start({ authToken: "secret" })
    try {
      const unauthorized = await post(transport.url)
      expect(unauthorized.status).toBe(401)
      expect(unauthorized.headers.get("www-authenticate")).toBe("Bearer")
      expect(await unauthorized.json()).toEqual({
        jsonrpc: "2.0",
        error: { code: -32_000, message: "Unauthorized" },
        id: null
      })
      expect((await post(transport.url, { authorization: "Basic secret" })).status).toBe(401)
      expect((await post(transport.url, { authorization: "Bearer short" })).status).toBe(401)
      expect((await post(transport.url, { authorization: "Bearer secret" })).status).toBe(200)
    } finally {
      await transport.stop()
    }
  })

  it("isolates loopback Host and Origin policy", async () => {
    const transport = await start()
    try {
      expect(await postWithNodeHeaders(transport.url, { host: "evil.example" })).toBe(403)
      expect(await postWithNodeHeaders(transport.url, { host: "[::1" })).toBe(403)
      expect(await postWithNodeHeaders(transport.url, { origin: "https://evil.example" })).toBe(403)
      expect(await postWithNodeHeaders(transport.url, { host: "[::1]:4321" })).toBe(200)
      expect((await post(transport.url, { origin: "http://localhost:4321" })).status).toBe(200)
      expect((await post(transport.url, { origin: "http://[::1]:4321" })).status).toBe(200)
      expect((await post(transport.url, { origin: "not a url" })).status).toBe(403)
    } finally {
      await transport.stop()
    }
  })

  it("applies loopback Host and Origin isolation before bearer authentication", async () => {
    const transport = await start({ authToken: "secret" })
    try {
      expect(await postWithNodeHeaders(transport.url, { host: "evil.example" })).toBe(403)
      expect(await postWithNodeHeaders(transport.url, { origin: "https://evil.example" })).toBe(403)
      expect((await post(transport.url)).status).toBe(401)
    } finally {
      await transport.stop()
    }
  })

  it("leaves Host policy to deployments on public bindings and disables blank tokens", async () => {
    const transport = await start({ host: "0.0.0.0", authToken: "   " })
    try {
      expect(await postWithNodeHeaders(transport.url, { host: "external.example" })).toBe(200)
      expect(
        await postWithNodeHeaders(transport.url, { host: "external.example", origin: "https://browser.example" })
      ).toBe(200)
    } finally {
      await transport.stop()
    }
  })

  it("closes the listener on owner shutdown and fiber interruption", async () => {
    const transport = await start()
    await transport.stop()
    expect(transport.server.listening).toBe(false)

    const listening = await Effect.runPromise(Deferred.make<http.Server>())
    const factory = makeTestHttpServerFactory((server) => Effect.runSync(Deferred.succeed(listening, server)))
    const fiber = Effect.runFork(
      startHttpTransport({ host: DEFAULT_HTTP_HOST, port: HttpPort.make(0) }, routeLayer).pipe(
        Effect.provideService(HttpServerFactoryService, factory)
      )
    )
    const interruptedServer = await Effect.runPromise(Deferred.await(listening))
    await Effect.runPromise(Fiber.interrupt(fiber))
    expect(interruptedServer.listening).toBe(false)
  })

  it("reports Unix and IPv6 listener addresses", async () => {
    const diagnostics: Array<string> = []
    for (const address of [
      NetAddress.unixPathAddress("/tmp/huly-mcp-test.sock"),
      NetAddress.inetAddressFromIpStringUnsafe("::1", 4321)
    ]) {
      await Effect.runPromise(
        startHttpTransport(
          { host: DEFAULT_HTTP_HOST, port: HttpPort.make(0), shutdown: Effect.void },
          routeLayer,
          (message) => diagnostics.push(message)
        ).pipe(Effect.provideService(HttpServerFactoryService, addressFactory(address)))
      )
    }
    expect(diagnostics).toEqual([
      "MCP HTTP server listening on unix:///tmp/huly-mcp-test.sock/mcp\n",
      "MCP HTTP server listening on http://[::1]:4321/mcp\n"
    ])
  })

  it("bounds drain shutdown and still closes the listener", async () => {
    const diagnostics: Array<string> = []
    const transport = await start({
      gracePeriod: "20 millis",
      onShutdown: () => Effect.never,
      writeError: (message) => diagnostics.push(message)
    })
    await transport.stop()
    expect(transport.server.listening).toBe(false)
    expect(diagnostics).toContain("MCP HTTP server drain timed out\n")
  })

  it("reports non-Error drain failures and still closes the listener", async () => {
    const diagnostics: Array<string> = []
    const transport = await start({
      onShutdown: () => Effect.fail("plain drain failure"),
      writeError: (message) => diagnostics.push(message)
    })

    await transport.stop()

    expect(transport.server.listening).toBe(false)
    expect(diagnostics).toContain("MCP HTTP server drain failed: plain drain failure\n")
  })

  it("preserves typed listener startup failures", async () => {
    const error = httpServeError(DEFAULT_HTTP_HOST, HttpPort.make(4321), { cause: "address in use" })
    expect(error.message).toContain("127.0.0.1:4321")
    const result = await Effect.runPromiseExit(
      startHttpTransport({ host: DEFAULT_HTTP_HOST, port: HttpPort.make(0) }, routeLayer).pipe(
        Effect.provideService(
          HttpServerFactoryService,
          failingHttpServerFactory(new HttpTransportError({ message: "failed" }))
        )
      )
    )
    expect(result._tag).toBe("Failure")
  })

  it("maps HTTP application layer setup failures", async () => {
    const result = await Effect.runPromiseExit(
      startHttpTransport(
        { host: DEFAULT_HTTP_HOST, port: HttpPort.make(0), shutdown: Effect.void },
        Layer.effectDiscard(Effect.fail("router setup failed"))
      ).pipe(
        Effect.provideService(
          HttpServerFactoryService,
          addressFactory(NetAddress.inetAddressFromIpStringUnsafe("127.0.0.1", 4321))
        )
      )
    )

    expect(result._tag).toBe("Failure")
    if (result._tag === "Failure") {
      expect(String(result.cause)).toContain("HTTP application setup failed")
    }
  })
})
