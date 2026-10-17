import { type Cause, Config, Effect, Fiber, FiberMap, Option, Queue, Ref, Result, Schema, Stdio, Stream } from "effect"
import { McpSchema } from "effect/ai"
import { Ndjson } from "effect/encoding"

import {
  advanceBackendResponse,
  BackendResponseError,
  BackendMessage,
  decodeBackendMessages,
  finishBackendResponse,
  type ResponsePhase
} from "./response-stream.js"
import { observeResidentResponse } from "./response-observations.js"
import { type LegacyHttpSession, parseLegacyHttpSession } from "./protocol-session.js"
import { HostMessage } from "./request-headers.js"
import { readResidentAttachment } from "./attachment-file.js"
import { type AdapterExchange, withAdapterAttachment } from "./adapter-attachment.js"
import { ResidentFilePath } from "./protected-path.js"
import type { ResidentSelection } from "./compatibility-contract.js"
import { MAX_ADAPTER_REQUESTS } from "./adapter-limits.js"

const MAX_RESPONSE_MIB = 128
const MAX_RESPONSE_BYTES = MAX_RESPONSE_MIB * 1024 * 1024
const MAX_INPUT_BYTES = 1024 * 1024
const OUTPUT_CAPACITY = 16
const ACCEPTED = 202
const NO_CONTENT = 204
const MIN_SUCCESS = 200
const MAX_SUCCESS = 299
const LINE_FEED = 10
const OUTPUT_WRITE_ALLOWANCE = "10 seconds"
type AdapterProtocolState =
  | { readonly _tag: "Fresh" }
  | { readonly _tag: "Initializing" }
  | { readonly _tag: "Initialized"; readonly legacySession: Option.Option<LegacyHttpSession> }
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

const forward = (
  exchange: AdapterExchange,
  message: HostMessage,
  request: number,
  protocol: Ref.Ref<AdapterProtocolState>,
  output: Queue.Queue<string, Cause.Done>
) =>
  Effect.gen(function* () {
    const state = yield* Ref.get(protocol)
    const session = state._tag === "Initialized" ? state.legacySession : Option.none<LegacyHttpSession>()
    yield* exchange(message, session, (response) =>
      Effect.gen(function* () {
        if (response.status < MIN_SUCCESS || response.status > MAX_SUCCESS)
          return yield* fail("Backend rejected the request; no request was replayed")
        if (message.method === "initialize")
          yield* Ref.set(protocol, {
            _tag: "Initialized",
            legacySession: yield* parseLegacyHttpSession(new Headers(response.headers))
          })
        if (response.status === ACCEPTED || response.status === NO_CONTENT) {
          return yield* Effect.fromResult(finishBackendResponse("awaiting", message.id))
        }
        const phase = yield* Ref.make<ResponsePhase>("awaiting")
        const observedRequest = message.id === undefined ? undefined : request
        observeResidentResponse({ request: observedRequest, event: "Started", accepted: true })
        yield* decodeBackendMessages({
          body: response.stream.pipe(Stream.mapError(() => fail("Backend response disconnected"))),
          contentType: response.headers["content-type"] ?? "",
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
              const encodedReply = yield* Schema.encodeEffect(Schema.fromJsonString(BackendMessage))(reply).pipe(
                Effect.mapError(() => fail("Backend reply could not be encoded for stdio"))
              )
              yield* Queue.offer(output, `${encodedReply}\n`).pipe(
                Effect.flatMap((accepted) => (accepted ? Effect.void : Effect.fail(fail("Stdio output is closed"))))
              )
            })
          )
        )
        const completion = finishBackendResponse(yield* Ref.get(phase), message.id)
        observeResidentResponse({ request: observedRequest, event: "End", accepted: Result.isSuccess(completion) })
        yield* Effect.fromResult(completion)
      })
    )
  })

const runBridge = (exchange: AdapterExchange) =>
  Effect.gen(function* () {
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
    const protocol = yield* Ref.make<AdapterProtocolState>({ _tag: "Fresh" })
    const input = boundedInput(stdio.stdin).pipe(
      Stream.runForEach((message) =>
        Effect.gen(function* () {
          if (message.method === "notifications/cancelled") {
            const cancellation = yield* Schema.decodeUnknownEffect(Cancellation)(message.params)
            yield* FiberMap.remove(requests, cancellation.requestId)
            return
          }
          const key = message.id ?? Symbol()
          if ((yield* FiberMap.has(requests, key)) || (yield* FiberMap.size(requests)) >= MAX_ADAPTER_REQUESTS) {
            return yield* fail("Stdio request admission limit reached or request id already active")
          }
          if (message.method === "initialize") {
            if ((yield* Ref.get(protocol))._tag !== "Fresh")
              return yield* fail("Adapter initialization already started; start a new adapter for another session")
            yield* Ref.set(protocol, { _tag: "Initializing" })
          }
          const ordinal = yield* Ref.updateAndGet(requestOrdinal, (value) => value + 1)
          yield* FiberMap.run(requests, key, forward(exchange, message, ordinal, protocol, output))
        })
      )
    )
    yield* Effect.raceFirst(input, Effect.raceFirst(FiberMap.join(requests), Fiber.join(writer)))
    yield* FiberMap.clear(requests)
    yield* Queue.end(output)
    yield* Fiber.join(writer)
  }).pipe(Effect.scoped)

export const runManualAdapter = Effect.fn("runManualAdapter")(function* (selection?: ResidentSelection) {
  const attachment = yield* readResidentAttachment(
    yield* Config.schema(ResidentFilePath, "MCP_RESIDENT_ATTACHMENT_FILE")
  )
  yield* withAdapterAttachment(attachment, runBridge, selection)
})
