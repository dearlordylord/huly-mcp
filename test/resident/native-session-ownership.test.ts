import { randomBytes, randomUUID } from "node:crypto"
import { NodeHttpClient } from "@effect/platform-node"
import { Deferred, Effect, Exit, Fiber, Layer, Option, Redacted, Ref, Schedule, Schema, Stream } from "effect"
import { McpProtocol, McpSchema, McpServer } from "effect/ai"
import { HttpClientRequest, HttpServerRequest } from "effect/http"
import { expect, it } from "vitest"

import { HttpHost, HttpPort, HttpServerFactoryService, startHttpTransport } from "../../src/mcp/http-transport.js"
import { parseLegacyHttpSession, LegacyHttpSession } from "../../src/resident/protocol-session.js"
import { HostMessage, requestHeaders } from "../../src/resident/request-headers.js"
import {
  makeResidentHttpServerFactory,
  ResidentEndpoint,
  ResidentTlsIdentity,
  withResidentHttpsAgent
} from "../../src/resident/tls-channel.js"

const RESPONSE_BOUND = 5_000
const SECRET_BYTES = 32
const HTTP_OK = 200
const HTTP_NOT_FOUND = 404
const AUTHORIZATION = Redacted.make("native-session-owner-fixture")
const OwnerName = Schema.Literals(["first", "second", "none"])
type OwnerName = Schema.Schema.Type<typeof OwnerName>
// These are native resource capabilities, not serialized payloads.
type Owner = McpSchema.McpHttpSessionOwner["Service"]
type SessionResource = Parameters<Owner["adopt"]>[0]

const withNativeServer = <A, E, R>(
  owners: ReadonlyMap<OwnerName, Owner>,
  use: (endpoint: ResidentEndpoint, identity: ResidentTlsIdentity) => Effect.Effect<A, E, R>
) =>
  Effect.gen(function* () {
    const identity = Schema.decodeUnknownSync(ResidentTlsIdentity)({
      generation: randomUUID(),
      key: randomBytes(SECRET_BYTES).toString("hex")
    })
    const bound = yield* Deferred.make<ResidentEndpoint>()
    const ready = yield* Deferred.make<void>()
    const shutdown = yield* Deferred.make<void>()
    const factory = makeResidentHttpServerFactory(identity)
    const serving = yield* startHttpTransport(
      {
        port: HttpPort.make(0),
        host: HttpHost.make("127.0.0.1"),
        authToken: AUTHORIZATION,
        onBound: (address) => {
          if (address._tag === "UnixPathAddress") return Effect.die("Expected native TCP listener")
          return Deferred.succeed(
            bound,
            Schema.decodeUnknownSync(ResidentEndpoint)(`https://127.0.0.1:${address.port}/mcp`)
          )
        },
        onReady: () => Deferred.succeed(ready, undefined),
        shutdown: Deferred.await(shutdown),
        middleware: (httpEffect) =>
          Effect.gen(function* () {
            const request = yield* HttpServerRequest.HttpServerRequest
            const selected = Schema.decodeUnknownSync(OwnerName)(request.headers["x-fixture-owner"] ?? "none")
            const owner = owners.get(selected)
            return yield* owner === undefined
              ? httpEffect
              : Effect.provideService(httpEffect, McpSchema.McpHttpSessionOwner, owner)
          })
      },
      McpServer.layerHttp({
        name: "native-session-fixture",
        version: "1.0",
        path: "/mcp",
        protocols: [McpProtocol.v2026_07_28, McpProtocol.v2025_06_18],
        legacyStatelessProtocolVersion: McpProtocol.v2025_06_18.protocolVersion
      }).pipe(Layer.orDie),
      () => {}
    ).pipe(Effect.provideService(HttpServerFactoryService, factory), Effect.forkScoped)
    yield* Deferred.await(ready)
    try {
      return yield* use(yield* Deferred.await(bound), identity)
    } finally {
      yield* Deferred.succeed(shutdown, undefined)
      yield* Fiber.join(serving)
    }
  }).pipe(Effect.scoped)

const exchange = (
  endpoint: ResidentEndpoint,
  identity: ResidentTlsIdentity,
  owner: OwnerName,
  message: HostMessage,
  session: Option.Option<LegacyHttpSession> = Option.none()
) =>
  withResidentHttpsAgent(endpoint, identity, (agent) =>
    Effect.gen(function* () {
      const client = yield* NodeHttpClient.makeNodeHttp.pipe(
        Effect.provideService(NodeHttpClient.HttpAgent, { http: agent, https: agent })
      )
      const headers = requestHeaders(message, AUTHORIZATION, session)
      headers.set("x-fixture-owner", owner)
      const body = yield* Schema.encodeEffect(Schema.fromJsonString(HostMessage))(message)
      const response = yield* client.execute(
        HttpClientRequest.post(endpoint.href).pipe(
          HttpClientRequest.setHeaders(headers),
          HttpClientRequest.bodyText(body, "application/json")
        )
      )
      yield* Stream.runDrain(response.stream)
      return { status: response.status, session: yield* parseLegacyHttpSession(new Headers(response.headers)) }
    })
  )

const initialize = (owner: OwnerName) =>
  HostMessage.make({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: owner, version: "1.0" } }
  })
const ping = HostMessage.make({ jsonrpc: "2.0", id: 1, method: "ping" })

it("adopts actual native UUIDs and releases only the captured session", async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      const first = yield* Deferred.make<SessionResource>()
      const second = yield* Deferred.make<SessionResource>()
      const adopted = yield* Ref.make(0)
      const own = (target: Deferred.Deferred<SessionResource>): Owner => ({
        adopt: (resource) =>
          Deferred.succeed(target, resource).pipe(
            Effect.andThen(Ref.update(adopted, (count) => count + 1)),
            Effect.as(true)
          )
      })
      yield* withNativeServer(
        new Map<OwnerName, Owner>([
          ["first", own(first)],
          ["second", own(second)]
        ]),
        (endpoint, identity) =>
          Effect.gen(function* () {
            const firstReply = yield* exchange(endpoint, identity, "first", initialize("first"))
            const secondReply = yield* exchange(endpoint, identity, "second", initialize("second"))
            const ordinary = yield* exchange(endpoint, identity, "none", initialize("none"))
            expect(firstReply.status).toBe(HTTP_OK)
            expect(
              Option.isSome(firstReply.session) && Option.isSome(secondReply.session) && Option.isSome(ordinary.session)
            ).toBe(true)
            expect((yield* exchange(endpoint, identity, "first", ping, firstReply.session)).status).toBe(HTTP_OK)
            const resource = yield* Deferred.await(first)
            expect(yield* resource.release).toBe(true)
            expect((yield* exchange(endpoint, identity, "first", ping, firstReply.session)).status).toBe(HTTP_NOT_FOUND)
            expect(yield* resource.release).toBe(false)
            expect((yield* exchange(endpoint, identity, "second", ping, secondReply.session)).status).toBe(HTTP_OK)
            expect((yield* exchange(endpoint, identity, "none", ping, ordinary.session)).status).toBe(HTTP_OK)
            const modern = yield* exchange(
              endpoint,
              identity,
              "first",
              HostMessage.make({
                jsonrpc: "2.0",
                id: 1,
                method: "server/discover",
                params: {
                  _meta: {
                    "io.modelcontextprotocol/protocolVersion": "2026-07-28",
                    "io.modelcontextprotocol/clientInfo": { name: "first", version: "1.0" },
                    "io.modelcontextprotocol/clientCapabilities": {}
                  }
                }
              })
            )
            expect(modern.status).toBe(HTTP_OK)
            expect(Option.isNone(modern.session)).toBe(true)
            const compatibility = yield* exchange(endpoint, identity, "first", ping)
            expect(compatibility.status).toBe(HTTP_OK)
            expect(Option.isNone(compatibility.session)).toBe(true)
            expect(yield* Ref.get(adopted)).toBe(2)
            expect(yield* (yield* Deferred.await(second)).release).toBe(true)
            expect((yield* exchange(endpoint, identity, "second", ping, secondReply.session)).status).toBe(
              HTTP_NOT_FOUND
            )
          })
      )
    }).pipe(Effect.timeout(RESPONSE_BOUND))
  )
})

it.each(["decline", "defect", "interruption"])("rolls back native registration after adoption %s", async (mode) => {
  await Effect.runPromise(
    Effect.gen(function* () {
      const started = yield* Deferred.make<SessionResource>()
      const owner: Owner = {
        adopt: (resource) =>
          Deferred.succeed(started, resource).pipe(
            Effect.andThen(
              mode === "decline"
                ? Effect.succeed(false)
                : mode === "defect"
                  ? Effect.die(new Error("Fixture adoption defect"))
                  : Effect.never
            )
          )
      }
      yield* withNativeServer(new Map<OwnerName, Owner>([["first", owner]]), (endpoint, identity) =>
        Effect.gen(function* () {
          const pending = yield* Effect.exit(exchange(endpoint, identity, "first", initialize("first"))).pipe(
            Effect.forkScoped
          )
          const resource = yield* Deferred.await(started)
          if (mode === "interruption") yield* Fiber.interrupt(pending)
          else {
            const attempt = yield* Fiber.join(pending)
            if (Exit.isSuccess(attempt)) expect(Option.isNone(attempt.value.session)).toBe(true)
          }
          const session = Option.some(
            Schema.decodeUnknownSync(LegacyHttpSession)({ id: resource.id, protocolVersion: "2025-06-18" })
          )
          const removed = yield* exchange(endpoint, identity, "none", ping, session).pipe(
            Effect.repeat({ until: (reply) => reply.status === HTTP_NOT_FOUND, schedule: Schedule.spaced("10 millis") })
          )
          expect(removed.status).toBe(HTTP_NOT_FOUND)
          expect(yield* resource.release).toBe(false)
        })
      )
    }).pipe(Effect.timeout(RESPONSE_BOUND))
  )
})
