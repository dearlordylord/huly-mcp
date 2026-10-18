import type { IncomingMessage, ServerResponse } from "node:http"
import { ConfigProvider, Deferred, Effect, Layer, Schema, Sink, Stdio, Stream } from "effect"
import { expect, it } from "vitest"

import { runManualAdapter } from "../../src/resident/manual-adapter.js"
import { HostMessage } from "../../src/resident/request-headers.js"
import { startResidentFixture } from "../helpers/resident-fixture.js"

const HTTP_OK = 200
const REQUEST_ID = 41
const FRAMES_PER_ADAPTER = 2
const BOUND = "5 seconds"
const Profile = Schema.Struct({ name: Schema.String, capabilities: Schema.Json })
const Observation = Schema.Struct({
  body: HostMessage,
  session: Schema.UndefinedOr(Schema.String),
  protocol: Schema.UndefinedOr(Schema.String)
})
const Reply = Schema.Struct({
  jsonrpc: Schema.Literal("2.0"),
  id: Schema.Number,
  result: Schema.Struct({ owner: Schema.String })
})
const profiles = Schema.decodeUnknownSync(Schema.Array(Profile))([
  { name: "left", capabilities: { roots: { listChanged: true }, experimental: { marker: [null, "日本語"] } } },
  { name: "right", capabilities: { roots: { listChanged: false }, sampling: {} } }
])

it.each(["2026-07-28", "2025-06-18"])(
  "preserves per-adapter capabilities and request metadata across the TLS boundary with %s",
  async (protocol) => {
    const seen: Array<Schema.Schema.Type<typeof Observation>> = []
    const failures: Array<unknown> = []
    const handle = async (request: IncomingMessage, response: ServerResponse) => {
      let text = ""
      const decoder = new TextDecoder()
      for await (const bytes of request) {
        if (!Buffer.isBuffer(bytes)) throw new Error("Expected request bytes")
        text += decoder.decode(bytes, { stream: true })
      }
      text += decoder.decode()
      const body = Schema.decodeUnknownSync(Schema.fromJsonString(HostMessage))(text)
      const observation = Schema.decodeUnknownSync(Observation)({
        body,
        session: request.headers["mcp-session-id"],
        protocol: request.headers["mcp-protocol-version"]
      })
      seen.push(observation)
      const parsed =
        body.method === "initialize"
          ? Schema.decodeUnknownSync(Schema.Struct({ clientInfo: Schema.Struct({ name: Schema.String }) }))(body.params)
              .clientInfo
          : Schema.decodeUnknownSync(
              Schema.Struct({
                _meta: Schema.Struct({ "io.modelcontextprotocol/clientInfo": Schema.Struct({ name: Schema.String }) })
              })
            )(body.params)._meta["io.modelcontextprotocol/clientInfo"]
      response
        .writeHead(HTTP_OK, {
          "content-type": "application/json",
          "mcp-session-id": `session-${parsed.name}`,
          "mcp-protocol-version": protocol
        })
        .end(
          Schema.encodeSync(Schema.fromJsonString(Reply))(
            Schema.decodeUnknownSync(Reply)({ jsonrpc: "2.0", id: body.id, result: { owner: parsed.name } })
          )
        )
    }
    const fixture = await startResidentFixture((request, response) => {
      void handle(request, response).catch((error) => {
        failures.push(error)
        response.destroy()
      })
    }, "capability-boundary-fixture")
    try {
      const runs = await Promise.all(
        profiles.map(async (profile) => {
          const meta = {
            "io.modelcontextprotocol/protocolVersion": protocol,
            "io.modelcontextprotocol/clientInfo": { name: profile.name, version: "1" },
            "io.modelcontextprotocol/clientCapabilities": profile.capabilities,
            progressToken: "shared-token",
            extension: { nested: [false, null, "проект"] }
          }
          const initialization =
            protocol === "2025-06-18"
              ? {
                  jsonrpc: "2.0",
                  id: 1,
                  method: "initialize",
                  params: {
                    protocolVersion: protocol,
                    capabilities: profile.capabilities,
                    clientInfo: { name: profile.name, version: "1" }
                  }
                }
              : { jsonrpc: "2.0", id: 1, method: "server/discover", params: { _meta: meta } }
          const call = {
            jsonrpc: "2.0",
            id: REQUEST_ID,
            method: "tools/call",
            params: { name: "get_project", arguments: { project: profile.name.toUpperCase() }, _meta: meta }
          }
          const frames = Schema.decodeUnknownSync(Schema.Tuple([HostMessage, HostMessage]))([initialization, call])
          const output: Array<string> = []
          const done = Effect.runSync(Deferred.make<void>())
          const initialized = Effect.runSync(Deferred.make<void>())
          const bytes = (frame: HostMessage) =>
            new TextEncoder().encode(Schema.encodeSync(Schema.fromJsonString(HostMessage))(frame) + "\n")
          await Effect.runPromise(
            runManualAdapter().pipe(
              Effect.provide(
                Layer.merge(
                  Stdio.layerTest({
                    stdin: Stream.concat(
                      Stream.make(bytes(frames[0])),
                      Stream.concat(
                        Stream.fromEffect(Deferred.await(initialized).pipe(Effect.as(bytes(frames[1])))),
                        Stream.fromEffectDrain(Deferred.await(done))
                      )
                    ),
                    stdout: () =>
                      Sink.forEach((value) =>
                        Effect.gen(function* () {
                          output.push(typeof value === "string" ? value : new TextDecoder().decode(value))
                          if (output.length === 1) yield* Deferred.succeed(initialized, undefined)
                          if (output.length === frames.length) yield* Deferred.succeed(done, undefined)
                        })
                      )
                  }),
                  ConfigProvider.layer(ConfigProvider.fromUnknown({ MCP_RESIDENT_ATTACHMENT_FILE: fixture.file }))
                )
              ),
              Effect.timeout(BOUND)
            )
          )
          const replies = output
            .join("")
            .trim()
            .split("\n")
            .map((line) => Schema.decodeUnknownSync(Schema.fromJsonString(Reply))(line))
          replies.sort((left, right) => left.id - right.id)
          expect(replies.map((reply) => reply.id)).toEqual([1, REQUEST_ID])
          expect(replies.map((reply) => reply.result.owner)).toEqual([profile.name, profile.name])
          return { profile, frames }
        })
      )
      expect(failures).toEqual([])
      expect(seen).toHaveLength(profiles.length * FRAMES_PER_ADAPTER)
      for (const { frames, profile } of runs) {
        const owned = seen.filter((item) => {
          const params = Schema.decodeUnknownSync(
            Schema.Struct({
              clientInfo: Schema.optionalKey(Schema.Struct({ name: Schema.String })),
              _meta: Schema.optionalKey(
                Schema.Struct({ "io.modelcontextprotocol/clientInfo": Schema.Struct({ name: Schema.String }) })
              )
            })
          )(item.body.params)
          return (params.clientInfo?.name ?? params._meta?.["io.modelcontextprotocol/clientInfo"].name) === profile.name
        })
        owned.sort((left, right) => Number(left.body.id) - Number(right.body.id))
        expect(owned.map((item) => item.body)).toEqual(frames)
        expect(owned.map((item) => item.session)).toEqual([
          undefined,
          protocol === "2025-06-18" ? `session-${profile.name}` : undefined
        ])
        expect(owned.map((item) => item.protocol)).toEqual([protocol === "2025-06-18" ? undefined : protocol, protocol])
      }
    } finally {
      await fixture.cleanup()
    }
  }
)
