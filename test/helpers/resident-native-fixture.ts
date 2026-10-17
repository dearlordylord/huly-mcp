import { randomBytes, randomUUID } from "node:crypto"
import { NodeHttpClient } from "@effect/platform-node"
import { Deferred, Effect, Fiber, Layer, Option, Redacted, Schema, Stream } from "effect"
import { McpProtocol, McpSchema, McpServer } from "effect/ai"
import { HttpClientRequest, HttpServerRequest } from "effect/http"
import type { HttpMiddleware } from "effect/http/HttpMiddleware"

import { HttpHost, HttpPort, HttpServerFactoryService, startHttpTransport } from "../../src/mcp/http-transport.js"
import { parseLegacyHttpSession, type LegacyHttpSession } from "../../src/resident/protocol-session.js"
import { HostMessage, requestHeaders } from "../../src/resident/request-headers.js"
import { type AttachmentToken, RESIDENT_ATTACHMENT_HEADER } from "../../src/resident/admission-contract.js"
import {
  makeResidentHttpServerFactory,
  ResidentEndpoint,
  ResidentTlsIdentity,
  withResidentHttpsAgent
} from "../../src/resident/tls-channel.js"

const SECRET_BYTES = 32
export const AUTHORIZATION = Redacted.make("native-session-owner-fixture")
const OwnerName = Schema.Literals(["first", "second", "none"])
export type OwnerName = Schema.Schema.Type<typeof OwnerName>
// These are native resource capabilities, not serialized payloads.
export type Owner = McpSchema.McpHttpSessionOwner["Service"]
export type SessionResource = Parameters<Owner["adopt"]>[0]

export const withNativeServer = <A, E, R>(
  owners: ReadonlyMap<OwnerName, Owner>,
  use: (endpoint: ResidentEndpoint, identity: ResidentTlsIdentity) => Effect.Effect<A, E, R>,
  options?: {
    readonly middleware?: HttpMiddleware
    readonly registration?: Effect.Effect<void, never, McpServer.McpServer>
  }
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
        middleware: (httpEffect) => {
          const native = Effect.gen(function* () {
            const request = yield* HttpServerRequest.HttpServerRequest
            const selected = Schema.decodeUnknownSync(OwnerName)(request.headers["x-fixture-owner"] ?? "none")
            const owner = owners.get(selected)
            return yield* owner === undefined
              ? httpEffect
              : Effect.provideService(httpEffect, McpSchema.McpHttpSessionOwner, owner)
          })
          return options?.middleware === undefined ? native : options.middleware(native)
        }
      },
      Layer.effectDiscard(options?.registration ?? Effect.void).pipe(
        Layer.provide(
          McpServer.layerHttp({
            name: "native-session-fixture",
            version: "1.0",
            path: "/mcp",
            protocols: [McpProtocol.v2026_07_28, McpProtocol.v2025_06_18],
            legacyStatelessProtocolVersion: McpProtocol.v2025_06_18.protocolVersion
          }).pipe(Layer.orDie)
        )
      ),
      () => {}
    ).pipe(Effect.provideService(HttpServerFactoryService, factory), Effect.forkScoped)
    yield* Effect.raceFirst(
      Deferred.await(ready),
      Fiber.join(serving).pipe(Effect.andThen(Effect.die("Native fixture ended before readiness")))
    )
    try {
      return yield* use(yield* Deferred.await(bound), identity)
    } finally {
      yield* Deferred.succeed(shutdown, undefined)
      yield* Fiber.join(serving)
    }
  }).pipe(Effect.scoped)

export const exchange = (
  endpoint: ResidentEndpoint,
  identity: ResidentTlsIdentity,
  owner: OwnerName,
  message: HostMessage,
  session: Option.Option<LegacyHttpSession> = Option.none(),
  attachmentToken?: AttachmentToken
) =>
  withResidentHttpsAgent(endpoint, identity, (agent) =>
    Effect.gen(function* () {
      const client = yield* NodeHttpClient.makeNodeHttp.pipe(
        Effect.provideService(NodeHttpClient.HttpAgent, { http: agent, https: agent })
      )
      const headers = requestHeaders(message, AUTHORIZATION, session)
      headers.set("x-fixture-owner", owner)
      if (attachmentToken !== undefined) headers.set(RESIDENT_ATTACHMENT_HEADER, Redacted.value(attachmentToken))
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

export const initialize = (owner: OwnerName) =>
  HostMessage.make({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: owner, version: "1.0" } }
  })
export const ping = HostMessage.make({ jsonrpc: "2.0", id: 1, method: "ping" })
