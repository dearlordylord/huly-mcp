import { NodeStream } from "@effect/platform-node"
import { randomBytes, randomUUID } from "node:crypto"
import { request } from "node:https"
import type { IncomingMessage } from "node:http"
import { createConnection, createServer, type Socket } from "node:net"
import { once } from "node:events"
import { ConfigProvider, Deferred, Effect, Exit, Fiber, Layer, Option, Redacted, Schema, Stream } from "effect"
import { HttpServerResponse } from "effect/http"
import { expect, it } from "vitest"

import { sanitizeHulyRuntimeConfigFromEnv } from "../../src/config/config.js"
import { GetHulyContextResultSchema } from "../../src/domain/schemas/index.js"
import { HttpServerFactoryService } from "../../src/mcp/http-transport.js"
import { McpServerService } from "../../src/mcp/server.js"
import { HostMessage, requestHeaders } from "../../src/resident/request-headers.js"
import { BackendMessage, BackendResponseError, decodeBackendMessages } from "../../src/resident/response-stream.js"
import {
  makeResidentHttpServerFactory,
  ResidentEndpoint,
  ResidentTlsIdentity,
  withResidentHttpsAgent
} from "../../src/resident/tls-channel.js"
import { TelemetryService } from "../../src/telemetry/telemetry.js"

const KEY_BYTES = 32
const RESPONSE_BOUND = 5_000
const RESPONSE_BYTES = 1024 * 1024
const AUTHORIZATION = Redacted.make("private-tls-native-fixture")
const identity = () =>
  Schema.decodeUnknownSync(ResidentTlsIdentity)({
    generation: randomUUID(),
    key: randomBytes(KEY_BYTES).toString("hex")
  })

const exchange = (endpoint: ResidentEndpoint, channel: ResidentTlsIdentity, message: HostMessage) =>
  withResidentHttpsAgent(endpoint, channel, (agent) =>
    Effect.gen(function* () {
      const body = yield* Schema.encodeEffect(Schema.fromJsonString(HostMessage))(message)
      const response = yield* Effect.tryPromise({
        try: (signal) =>
          new Promise<IncomingMessage>((resolve, reject) => {
            const outgoing = request(
              endpoint,
              {
                agent,
                signal,
                method: "POST",
                headers: Object.fromEntries(requestHeaders(message, AUTHORIZATION, Option.none()))
              },
              resolve
            )
            outgoing.once("error", reject)
            outgoing.end(body)
          }),
        catch: () => new BackendResponseError({ message: "Fixture exchange failed" })
      })
      return yield* decodeBackendMessages({
        body: NodeStream.fromReadable<Uint8Array, BackendResponseError>({
          evaluate: () => response,
          onError: () => new BackendResponseError({ message: "Fixture response failed" })
        }),
        contentType: response.headers["content-type"] ?? "",
        maxBytes: RESPONSE_BYTES
      }).pipe(Stream.runCollect)
    })
  )

it(
  "serves the native MCP application through expected-generation TLS and rejects wrong identities",
  { timeout: 15_000 },
  async () => {
    const owner = identity()
    const replies = await Effect.runPromise(
      Effect.gen(function* () {
        const bound = yield* Deferred.make<ResidentEndpoint>()
        const factory = makeResidentHttpServerFactory(owner)
        const server = yield* McpServerService
        const fiber = yield* server.run().pipe(
          Effect.provideService(HttpServerFactoryService, {
            ...factory,
            make: (port, host, grace) =>
              factory.make(port, host, grace).pipe(
                Effect.tap((httpServer) => {
                  const address = httpServer.address
                  if (address._tag === "UnixPathAddress") return Effect.die("Expected TCP listener")
                  return Deferred.succeed(
                    bound,
                    Schema.decodeUnknownSync(ResidentEndpoint)(`https://127.0.0.1:${address.port}/mcp`)
                  )
                })
              )
          }),
          Effect.forkScoped
        )
        const endpoint = yield* Deferred.await(bound)
        yield* server.awaitReady()
        const message = HostMessage.make({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "get_huly_context",
            arguments: {},
            _meta: {
              "io.modelcontextprotocol/protocolVersion": "2026-07-28",
              "io.modelcontextprotocol/clientInfo": { name: "claude-code", version: "1.0" },
              "io.modelcontextprotocol/clientCapabilities": {}
            }
          }
        })
        try {
          const valid = yield* exchange(endpoint, owner, message)
          const wrongKey = yield* Effect.exit(
            exchange(endpoint, { ...identity(), generation: owner.generation }, message)
          )
          const wrongGeneration = yield* Effect.exit(
            exchange(endpoint, { ...owner, generation: identity().generation }, message)
          )
          const surviving = yield* exchange(endpoint, owner, message)
          return { valid, wrongKey, wrongGeneration, surviving, endpoint, message }
        } finally {
          yield* server.stop()
          yield* Fiber.join(fiber)
        }
      }).pipe(
        Effect.scoped,
        Effect.provide(
          Layer.merge(
            ConfigProvider.layer(ConfigProvider.fromUnknown({})),
            McpServerService.layer({
              transport: "http",
              httpHost: "127.0.0.1",
              httpPort: 0,
              mcpAuthToken: AUTHORIZATION,
              resolveClients: () => Promise.reject(new Error("Catalog must not acquire Huly")),
              getRuntimeConfigContext: () =>
                sanitizeHulyRuntimeConfigFromEnv({
                  HULY_URL: "https://huly.example.com",
                  HULY_WORKSPACE: "fixture",
                  HULY_TOKEN: "fixture"
                })
            }).pipe(Layer.provide(TelemetryService.testLayer({})))
          )
        )
      )
    )
    expect(Exit.isFailure(replies.wrongKey)).toBe(true)
    expect(Exit.isFailure(replies.wrongGeneration)).toBe(true)
    expect(replies.surviving).toEqual(replies.valid)
    const terminal = replies.valid.find((message) => "result" in message)
    expect(terminal).toBeDefined()
    if (terminal === undefined || !("result" in terminal)) throw new Error("Expected native context result")
    const result = Schema.decodeUnknownSync(
      Schema.Struct({ structuredContent: Schema.Struct({ result: GetHulyContextResultSchema }) })
    )(terminal.result)
    expect(result.structuredContent.result.transport.http?.port).toBeGreaterThan(0)
    let leakedApplicationBytes = false
    const replacementSockets = new Set<Socket>()
    const replacement = createServer((socket) => {
      replacementSockets.add(socket)
      socket.once("close", () => replacementSockets.delete(socket))
      socket.on("data", (chunk: Buffer) => {
        leakedApplicationBytes ||=
          chunk.includes(Buffer.from(Redacted.value(AUTHORIZATION))) ||
          chunk.includes(Buffer.from(Redacted.value(owner.key), "hex")) ||
          chunk.includes(Buffer.from("get_huly_context"))
        socket.end("HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\n{}")
      })
    })
    replacement.listen(Number(replies.endpoint.port), "127.0.0.1")
    await once(replacement, "listening")
    try {
      const lost = await Effect.runPromiseExit(
        exchange(replies.endpoint, owner, replies.message).pipe(Effect.timeout(RESPONSE_BOUND))
      )
      expect(Exit.isFailure(lost)).toBe(true)
      expect(leakedApplicationBytes).toBe(false)
    } finally {
      for (const socket of replacementSockets) socket.destroy()
      await new Promise<void>((resolve, reject) => replacement.close((error) => (error ? reject(error) : resolve())))
    }
  }
)

it("closes an interrupted TLS handshake before it can hand a socket to HTTP", { timeout: 15_000 }, async () => {
  const accepted = await Effect.runPromise(Deferred.make<void>())
  const closed = await Effect.runPromise(Deferred.make<void>())
  const sockets = new Set<Socket>()
  let receivedApplicationBytes = false
  const backend = createServer((socket) => {
    sockets.add(socket)
    socket.once("close", () => sockets.delete(socket))
    socket.on("data", (chunk: Buffer) => {
      receivedApplicationBytes ||= chunk.includes(Buffer.from("private-tls-native-fixture"))
    })
    socket.once("close", () => Effect.runSync(Deferred.succeed(closed, undefined)))
    Effect.runSync(Deferred.succeed(accepted, undefined))
  })
  backend.listen(0, "127.0.0.1")
  await once(backend, "listening")
  const address = backend.address()
  if (address === null || typeof address === "string") throw new Error("Expected owned TCP listener")
  const endpoint = Schema.decodeUnknownSync(ResidentEndpoint)(`https://127.0.0.1:${address.port}/mcp`)
  const fiber = Effect.runFork(
    exchange(endpoint, identity(), HostMessage.make({ jsonrpc: "2.0", id: 1, method: "server/discover" }))
  )
  try {
    await Effect.runPromise(Deferred.await(accepted).pipe(Effect.timeout(RESPONSE_BOUND)))
    await Effect.runPromise(Fiber.interrupt(fiber).pipe(Effect.timeout(RESPONSE_BOUND)))
    await Effect.runPromise(Deferred.await(closed).pipe(Effect.timeout(RESPONSE_BOUND)))
    expect(receivedApplicationBytes).toBe(false)
  } finally {
    for (const socket of sockets) socket.destroy()
    await Effect.runPromise(Fiber.interrupt(fiber))
    await new Promise<void>((resolve, reject) => backend.close((error) => (error ? reject(error) : resolve())))
  }
})

it("retires its listener while a peer withholds the TLS handshake", { timeout: 15_000 }, async () => {
  const connected = await Effect.runPromise(Deferred.make<void>())
  const retire = await Effect.runPromise(Deferred.make<void>())
  let peer: Socket | undefined
  const fiber = Effect.runFork(
    Effect.gen(function* () {
      const server = yield* makeResidentHttpServerFactory(identity()).make(0, "127.0.0.1", "5 seconds")
      const address = server.address
      if (address._tag === "UnixPathAddress") return yield* Effect.die("Expected TCP listener")
      yield* Effect.tryPromise({
        try: () =>
          new Promise<void>((resolve, reject) => {
            peer = createConnection({ host: "127.0.0.1", port: address.port }, resolve)
            peer.once("error", reject)
            peer.resume()
          }),
        catch: () => new BackendResponseError({ message: "Owned peer could not connect" })
      })
      yield* Deferred.succeed(connected, undefined)
      yield* Deferred.await(retire)
    }).pipe(Effect.scoped)
  )
  try {
    await Effect.runPromise(Deferred.await(connected).pipe(Effect.timeout(RESPONSE_BOUND)))
    await Effect.runPromise(Deferred.succeed(retire, undefined))
    const exit = await Effect.runPromiseExit(Fiber.join(fiber).pipe(Effect.timeout(RESPONSE_BOUND)))
    expect(Exit.isSuccess(exit)).toBe(true)
    if (peer !== undefined && !peer.closed) await once(peer, "close", { signal: AbortSignal.timeout(RESPONSE_BOUND) })
    expect(peer?.destroyed).toBe(true)
  } finally {
    peer?.destroy()
    await Effect.runPromise(Fiber.interrupt(fiber))
  }
})

it("lets an authenticated response finish after listener retirement begins", { timeout: 15_000 }, async () => {
  const owner = identity()
  const bound = await Effect.runPromise(Deferred.make<ResidentEndpoint>())
  const entered = await Effect.runPromise(Deferred.make<void>())
  const complete = await Effect.runPromise(Deferred.make<void>())
  const retire = await Effect.runPromise(Deferred.make<void>())
  const listener = Effect.runFork(
    Effect.gen(function* () {
      const server = yield* makeResidentHttpServerFactory(owner).make(0, "127.0.0.1", "5 seconds")
      const address = server.address
      if (address._tag === "UnixPathAddress") return yield* Effect.die("Expected TCP listener")
      yield* server.serve(
        Effect.gen(function* () {
          yield* Deferred.succeed(entered, undefined)
          yield* Deferred.await(complete)
          return HttpServerResponse.text(
            Schema.encodeSync(Schema.fromJsonString(BackendMessage))({
              jsonrpc: "2.0",
              id: 1,
              result: { retained: true }
            }),
            { contentType: "application/json" }
          )
        })
      )
      yield* Deferred.succeed(
        bound,
        Schema.decodeUnknownSync(ResidentEndpoint)(`https://127.0.0.1:${address.port}/mcp`)
      )
      yield* Deferred.await(retire)
    }).pipe(Effect.scoped)
  )
  const endpoint = await Effect.runPromise(Deferred.await(bound).pipe(Effect.timeout(RESPONSE_BOUND)))
  const response = Effect.runFork(
    exchange(endpoint, owner, HostMessage.make({ jsonrpc: "2.0", id: 1, method: "ping" }))
  )
  try {
    await Effect.runPromise(Deferred.await(entered).pipe(Effect.timeout(RESPONSE_BOUND)))
    await Effect.runPromise(Deferred.succeed(retire, undefined))
    const refused = Effect.callback<boolean, BackendResponseError>((resume) => {
      const probe = createConnection({ host: "127.0.0.1", port: Number(endpoint.port) })
      probe.once("connect", () => resume(Effect.succeed(false)))
      probe.once("error", (error) =>
        resume(
          Schema.is(Schema.Struct({ code: Schema.Literal("ECONNREFUSED") }))(error)
            ? Effect.succeed(true)
            : Effect.fail(new BackendResponseError({ message: "Retirement probe failed" }))
        )
      )
      return Effect.sync(() => probe.destroy())
    })
    await Effect.runPromise(refused.pipe(Effect.repeat({ until: (closed) => closed }), Effect.timeout(RESPONSE_BOUND)))
    await Effect.runPromise(Deferred.succeed(complete, undefined))
    expect(await Effect.runPromise(Fiber.join(response).pipe(Effect.timeout(RESPONSE_BOUND)))).toEqual([
      { jsonrpc: "2.0", id: 1, result: { retained: true } }
    ])
    await Effect.runPromise(Fiber.join(listener).pipe(Effect.timeout(RESPONSE_BOUND)))
  } finally {
    await Effect.runPromise(Deferred.succeed(complete, undefined))
    await Effect.runPromise(Fiber.interrupt(response))
    await Effect.runPromise(Fiber.interrupt(listener))
  }
})
