import { type Cause, Config, Effect, Fiber, FiberMap, Option, Queue, Redacted, Schema, Stdio, Stream } from "effect"
import { McpSchema } from "effect/ai"
import { Ndjson } from "effect/encoding"

import { BackendResponseError, decodeBackendMessages } from "./response-stream.js"

const MAX_RESPONSE_MIB = 128
const MAX_RESPONSE_BYTES = MAX_RESPONSE_MIB * 1024 * 1024
const MAX_INPUT_BYTES = 1024 * 1024
const MAX_REQUESTS = 8
const OUTPUT_CAPACITY = 16
const ACCEPTED = 202
const NO_CONTENT = 204
const LINE_FEED = 10
const Endpoint = Schema.URLFromString.check(
  Schema.makeFilter(
    (url) =>
      url.protocol === "http:" &&
      ["127.0.0.1", "[::1]"].includes(url.hostname) &&
      url.username === "" &&
      url.password === "" &&
      url.search === "" &&
      url.hash === ""
  )
)
const HostMessage = Schema.Struct({
  jsonrpc: Schema.Literal("2.0"),
  id: Schema.optionalKey(McpSchema.RequestId),
  method: Schema.String,
  params: Schema.optionalKey(Schema.Unknown)
})
type HostMessage = Schema.Schema.Type<typeof HostMessage>
const Routing = Schema.Struct({
  name: Schema.optionalKey(Schema.String),
  uri: Schema.optionalKey(Schema.String),
  _meta: Schema.optionalKey(
    Schema.Struct({ "io.modelcontextprotocol/protocolVersion": Schema.optionalKey(Schema.String) })
  )
})
const Cancellation = Schema.Struct({ requestId: McpSchema.RequestId })
const fail = (message: string) => new BackendResponseError({ message })

// Bounds are provisional admission limits, not certified performance budgets.
// Input scanning precedes NDJSON buffering, including unterminated input lines.
const boundedInput = <E, R>(input: Stream.Stream<Uint8Array, E, R>) =>
  input.pipe(
    Stream.mapAccumEffect(
      () => 0,
      (pending, chunk) => {
        let count = pending
        for (const byte of chunk) {
          count = byte === LINE_FEED ? 0 : count + 1
          if (count > MAX_INPUT_BYTES) return Effect.fail(fail("Stdio input exceeded its message budget"))
        }
        return Effect.succeed<readonly [number, ReadonlyArray<Uint8Array>]>([count, [chunk]])
      }
    ),
    Stream.pipeThroughChannel(Ndjson.decodeSchema(HostMessage)())
  )

const requestHeaders = (message: HostMessage, authorization: Redacted.Redacted<string>) => {
  const headers = new Headers({
    accept: "application/json, text/event-stream",
    authorization: `Bearer ${Redacted.value(authorization)}`,
    "content-type": "application/json",
    "mcp-method": message.method
  })
  const routing = Schema.decodeUnknownOption(Routing)(message.params)
  if (Option.isSome(routing)) {
    const version = routing.value._meta?.["io.modelcontextprotocol/protocolVersion"]
    if (version !== undefined) headers.set("mcp-protocol-version", version)
    const name = message.method === "resources/read" ? routing.value.uri : routing.value.name
    if (name !== undefined) headers.set("mcp-name", name)
  }
  return headers
}

const forward = (
  endpoint: URL,
  authorization: Redacted.Redacted<string>,
  message: HostMessage,
  output: Queue.Queue<string, Cause.Done>
) =>
  Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: (signal) =>
        fetch(endpoint, {
          method: "POST",
          headers: requestHeaders(message, authorization),
          body: JSON.stringify(message),
          redirect: "error",
          signal
        }),
      catch: () => fail("Backend connection failed; operation outcome may be unknown. No request was replayed.")
    })
    if (!response.ok) {
      yield* Effect.tryPromise({
        try: () => response.body?.cancel() ?? Promise.resolve(),
        catch: () => fail("Backend response cleanup failed")
      })
      return yield* fail("Backend rejected the request; no request was replayed")
    }
    if (response.status === ACCEPTED || response.status === NO_CONTENT) return
    const body = response.body
    if (body === null) return yield* fail("Backend response has no body")
    yield* decodeBackendMessages({
      body: Stream.fromReadableStream({ evaluate: () => body, onError: () => fail("Backend response disconnected") }),
      contentType: response.headers.get("content-type") ?? "",
      maxBytes: MAX_RESPONSE_BYTES
    }).pipe(
      Stream.runForEach((reply) => {
        if ("id" in reply && reply.id !== message.id)
          return Effect.fail(fail("Backend response belongs to another request"))
        return Queue.offer(output, `${JSON.stringify(reply)}\n`).pipe(
          Effect.flatMap((accepted) => (accepted ? Effect.void : Effect.fail(fail("Stdio output is closed"))))
        )
      })
    )
  })

export const runManualAdapter = Effect.gen(function* () {
  const endpoint = yield* Config.schema(Endpoint, "MCP_STDIO_BACKEND_URL")
  const authorization = yield* Config.schema(Schema.RedactedFromValue(Schema.NonEmptyString), "MCP_AUTH_TOKEN")
  const stdio = yield* Stdio.Stdio
  const output = yield* Queue.bounded<string, Cause.Done>(OUTPUT_CAPACITY)
  const writer = yield* Stream.fromQueue(output).pipe(Stream.run(stdio.stdout({ endOnDone: false })), Effect.forkScoped)
  const requests = yield* FiberMap.make<string | number | symbol, void, BackendResponseError>()
  const input = boundedInput(stdio.stdin).pipe(
    Stream.runForEach((message) =>
      Effect.gen(function* () {
        if (message.method === "notifications/cancelled") {
          const cancellation = yield* Schema.decodeUnknownEffect(Cancellation)(message.params)
          yield* FiberMap.remove(requests, cancellation.requestId)
          return
        }
        const key = message.id ?? Symbol()
        if ((yield* FiberMap.has(requests, key)) || (yield* FiberMap.size(requests)) >= MAX_REQUESTS) {
          return yield* fail("Stdio request admission limit reached or request id already active")
        }
        yield* FiberMap.run(requests, key, forward(endpoint, authorization, message, output))
      })
    )
  )
  yield* Effect.raceFirst(input, Effect.raceFirst(FiberMap.join(requests), Fiber.join(writer)))
  yield* FiberMap.clear(requests)
  yield* Queue.end(output)
  yield* Fiber.join(writer)
}).pipe(Effect.scoped)
