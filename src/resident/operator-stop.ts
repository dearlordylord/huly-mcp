import { ByteSize, Effect, Schema } from "effect"
import { HttpIncomingMessage, HttpServerRequest, HttpServerResponse } from "effect/http"

import { MAX_COMPATIBILITY_REQUEST_BYTES } from "./compatibility-contract.js"
import { ResidentTlsIdentity } from "./tls-channel.js"

export const RESIDENT_STOP_PATH = "/resident/control/stop-v1"
const HTTP_OK = 200
const HTTP_ACCEPTED = 202
const HTTP_BAD_REQUEST = 400
const HTTP_CONFLICT = 409
const HTTP_METHOD_NOT_ALLOWED = 405
const Generation = ResidentTlsIdentity.fields.generation
const StopRequest = Schema.Struct({ stopWire: Schema.Literal(1), generation: Generation })
const StopCapability = Schema.Struct({
  stopWire: Schema.Literal(1),
  generation: Generation,
  mode: Schema.Literal("managed"),
  acknowledgment: Schema.Literal("admission-fenced"),
  retirementEvidence: Schema.Literal("none")
})
const StopAcknowledgment = Schema.Struct({
  stopWire: Schema.Literal(1),
  generation: Generation,
  accepted: Schema.Literal("admission-fenced"),
  retirement: Schema.Literal("unconfirmed")
})
const StopRefusal = Schema.Struct({
  stopWire: Schema.Literal(1),
  refused: Schema.Literals(["not-managed", "wrong-generation", "invalid-request"])
})

// Internal capability port; the existing admissions owner alone changes lifecycle state.
export type ResidentStopSupport =
  | { readonly kind: "unsupported" }
  | {
      readonly kind: "managed"
      readonly generation: Schema.Schema.Type<typeof Generation>
      readonly fence: Effect.Effect<void>
    }

const refusal = (refused: Schema.Schema.Type<typeof StopRefusal>["refused"]) =>
  Schema.encodeEffect(StopRefusal)({ stopWire: 1, refused }).pipe(
    Effect.orDie,
    Effect.map((body) =>
      HttpServerResponse.jsonUnsafe(body, {
        status: refused === "invalid-request" ? HTTP_BAD_REQUEST : HTTP_CONFLICT,
        headers: { "cache-control": "no-store" }
      })
    )
  )

/** Inside generation TLS/bearer protection; never acquires a Huly client or attachment. */
export const renderResidentStop = Effect.fn("renderResidentStop")(function* (
  support: ResidentStopSupport = { kind: "unsupported" }
) {
  const request = yield* HttpServerRequest.HttpServerRequest
  if (request.method !== "GET" && request.method !== "POST")
    return HttpServerResponse.empty({ status: HTTP_METHOD_NOT_ALLOWED })
  if (support.kind === "unsupported") return yield* refusal("not-managed")
  if (request.method === "GET") {
    const body = yield* Schema.encodeEffect(StopCapability)({
      stopWire: 1,
      generation: support.generation,
      mode: "managed",
      acknowledgment: "admission-fenced",
      retirementEvidence: "none"
    }).pipe(Effect.orDie)
    return HttpServerResponse.jsonUnsafe(body, { status: HTTP_OK, headers: { "cache-control": "no-store" } })
  }
  const parsed = yield* request.json.pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(StopRequest)),
    Effect.provideService(HttpIncomingMessage.MaxBodySize, ByteSize.bytes(MAX_COMPATIBILITY_REQUEST_BYTES)),
    Effect.option
  )
  if (parsed._tag === "None") return yield* refusal("invalid-request")
  if (parsed.value.generation !== support.generation) return yield* refusal("wrong-generation")
  const body = yield* Schema.encodeEffect(StopAcknowledgment)({
    stopWire: 1,
    generation: support.generation,
    accepted: "admission-fenced",
    retirement: "unconfirmed"
  }).pipe(Effect.orDie)
  yield* support.fence
  return HttpServerResponse.jsonUnsafe(body, { status: HTTP_ACCEPTED, headers: { "cache-control": "no-store" } })
})
