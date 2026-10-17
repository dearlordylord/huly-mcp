import {
  type Cause,
  Config,
  Effect,
  Fiber,
  FiberMap,
  Option,
  Queue,
  Redacted,
  Ref,
  Result,
  Schema,
  Stdio,
  Stream
} from "effect"
import { McpSchema } from "effect/ai"
import { Ndjson } from "effect/encoding"

import {
  advanceBackendResponse,
  BackendResponseError,
  decodeBackendMessages,
  finishBackendResponse,
  type ResponsePhase
} from "./response-stream.js"
import { observeResidentResponse } from "./response-observations.js"

const MAX_RESPONSE_MIB = 128
const MAX_RESPONSE_BYTES = MAX_RESPONSE_MIB * 1024 * 1024
const MAX_INPUT_BYTES = 1024 * 1024
const MAX_REQUESTS = 8
const OUTPUT_CAPACITY = 16
const ACCEPTED = 202
const NO_CONTENT = 204
const LINE_FEED = 10
const OUTPUT_WRITE_ALLOWANCE = "10 seconds"
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
  request: number,
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
    const discardBody = Effect.tryPromise({
      try: () => response.body?.cancel() ?? Promise.resolve(),
      catch: () => fail("Backend response cleanup failed")
    })
    if (!response.ok) {
      yield* discardBody
      return yield* fail("Backend rejected the request; no request was replayed")
    }
    if (response.status === ACCEPTED || response.status === NO_CONTENT) {
      yield* discardBody
      return yield* Effect.fromResult(finishBackendResponse("awaiting", message.id))
    }
    const body = response.body
    if (body === null) return yield* fail("Backend response has no body")
    const phase = yield* Ref.make<ResponsePhase>("awaiting")
    const observedRequest = message.id === undefined ? undefined : request
    observeResidentResponse({ request: observedRequest, event: "Started", accepted: true })
    yield* decodeBackendMessages({
      body: Stream.fromReadableStream({ evaluate: () => body, onError: () => fail("Backend response disconnected") }),
      contentType: response.headers.get("content-type") ?? "",
      maxBytes: MAX_RESPONSE_BYTES
    }).pipe(
      Stream.runForEach((reply) =>
        Effect.gen(function* () {
          const decision = advanceBackendResponse(yield* Ref.get(phase), message.id, reply)
          observeResidentResponse({
            request: observedRequest,
            event: !("id" in reply) ? "Progress" : reply.id === message.id ? "OwnReply" : "ForeignReply",
            accepted: Result.isSuccess(decision)
          })
          const next = yield* Effect.fromResult(decision)
          yield* Ref.set(phase, next)
          yield* Queue.offer(output, `${JSON.stringify(reply)}\n`).pipe(
            Effect.flatMap((accepted) => (accepted ? Effect.void : Effect.fail(fail("Stdio output is closed"))))
          )
        })
      )
    )
    const completion = finishBackendResponse(yield* Ref.get(phase), message.id)
    observeResidentResponse({ request: observedRequest, event: "End", accepted: Result.isSuccess(completion) })
    yield* Effect.fromResult(completion)
  })

export const runManualAdapter = Effect.gen(function* () {
  const endpoint = yield* Config.schema(Endpoint, "MCP_STDIO_BACKEND_URL")
  const authorization = yield* Config.schema(Schema.RedactedFromValue(Schema.NonEmptyString), "MCP_AUTH_TOKEN")
  const stdio = yield* Stdio.Stdio
  const output = yield* Queue.bounded<string, Cause.Done>(OUTPUT_CAPACITY)
  const writer = yield* Stream.fromQueue(output).pipe(
    Stream.runForEach((line) =>
      Stream.make(line).pipe(
        Stream.run(stdio.stdout({ endOnDone: false })),
        Effect.timeoutOrElse({
          duration: OUTPUT_WRITE_ALLOWANCE,
          orElse: () => Effect.fail(fail("Stdio output did not drain within 10 seconds"))
        }),
        Effect.mapError(() => fail("Stdio output failed or exceeded its 10 second write allowance"))
      )
    ),
    Effect.forkScoped
  )
  const requests = yield* FiberMap.make<string | number | symbol, void, BackendResponseError>()
  const requestOrdinal = yield* Ref.make(0)
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
        const ordinal = yield* Ref.updateAndGet(requestOrdinal, (value) => value + 1)
        yield* FiberMap.run(requests, key, forward(endpoint, authorization, message, ordinal, output))
      })
    )
  )
  yield* Effect.raceFirst(input, Effect.raceFirst(FiberMap.join(requests), Fiber.join(writer)))
  yield* FiberMap.clear(requests)
  yield* Queue.end(output)
  yield* Fiber.join(writer)
}).pipe(Effect.scoped)
