import { join } from "node:path"
import { NodeHttpClient } from "@effect/platform-node"
import { ByteSize, Effect, Redacted, Ref, Schema } from "effect"
import {
  HttpClientRequest,
  HttpClientResponse,
  HttpIncomingMessage,
  HttpServerRequest,
  HttpServerResponse
} from "effect/http"

import { ResidentAttachment } from "./attachment-file.js"
import { MAX_COMPATIBILITY_REQUEST_BYTES } from "./compatibility-contract.js"
import { ResidentDirectory } from "./protected-path.js"
import { withResidentHeaderRedaction } from "./private-http.js"
import { openRegistryInventory } from "./registry-inventory.js"
import { makeStartupBudget } from "./startup-budget.js"
import { inspectResidentState } from "./state-status.js"
import { ResidentTlsIdentity, withResidentHttpsAgent } from "./tls-channel.js"

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

export const ResidentStopTarget = Schema.Struct({ directory: ResidentDirectory, generation: Generation })
export type ResidentStopTarget = Schema.Schema.Type<typeof ResidentStopTarget>
const Accepted = Schema.Struct({
  kind: Schema.Literal("accepted"),
  generation: Generation,
  retirement: Schema.Literal("unconfirmed")
})
const Unconfirmed = Schema.Struct({
  kind: Schema.Literal("unconfirmed"),
  generation: Generation,
  submission: Schema.Literal("unknown"),
  retirement: Schema.Literal("unconfirmed")
})
export const ResidentStopReport = Schema.Union([Accepted, Unconfirmed])
export type ResidentStopReport = Schema.Schema.Type<typeof ResidentStopReport>
export class ResidentStopRefused extends Schema.TaggedError<ResidentStopRefused>()("ResidentStopRefused", {
  reason: Schema.Literals([
    "namespace-unverified",
    "target-missing",
    "unsupported-wire",
    "owner-unavailable",
    "explicit-refusal"
  ]),
  message: Schema.String
}) {}
class StopResponseUnconfirmed extends Schema.TaggedError<StopResponseUnconfirmed>()("StopResponseUnconfirmed", {}) {}

const selectStopAttachment = Effect.fn("selectStopAttachment")(function* (target: ResidentStopTarget) {
  const status = yield* inspectResidentState(target.directory).pipe(
    Effect.mapError(
      () =>
        new ResidentStopRefused({
          reason: "namespace-unverified",
          message: "Resident ownership namespace is unverified; preserve its state. No stop was submitted."
        })
    )
  )
  if (status.state === "absent" || !status.generations.some((owner) => owner.generation === target.generation))
    return yield* new ResidentStopRefused({
      reason: "target-missing",
      message:
        "The exact resident generation was not observed. Absence is not retirement evidence; no stop was submitted."
    })
  const registry = yield* openRegistryInventory(ResidentDirectory.make(join(target.directory, "generations")))
  const record = (yield* registry.inventory).find(({ envelope }) => envelope.generation === target.generation)
  if (record === undefined)
    return yield* new ResidentStopRefused({
      reason: "target-missing",
      message: "Resident generation changed during selection; no stop was submitted."
    })
  const attachment = yield* Schema.decodeUnknownEffect(ResidentAttachment)(Redacted.value(record.envelope.descriptor))
  if (
    attachment.identity.generation !== target.generation ||
    attachment.implementation.version !== record.envelope.implementation.version
  )
    return yield* new ResidentStopRefused({
      reason: "namespace-unverified",
      message: "Resident descriptor identity is inconsistent; no stop was submitted."
    })
  return attachment
})

/** Select one protected existing generation and submit at most one stop; never starts or resets an owner. */
export const requestResidentStop = Effect.fn("requestResidentStop")(function* (target: ResidentStopTarget) {
  // Internal invocation knowledge, never persisted or shared with a replacement caller.
  type Submission =
    | { readonly kind: "not-submitted" | "submitted" }
    | { readonly kind: "accepted"; readonly receipt: Schema.Schema.Type<typeof Accepted> }
  const submission = yield* Ref.make<Submission>({ kind: "not-submitted" })
  const budget = yield* makeStartupBudget
  const operation = Effect.gen(function* () {
    const attachment = yield* selectStopAttachment(target)
    return yield* withResidentHttpsAgent(attachment.endpoint, attachment.identity, (agent) =>
      Effect.gen(function* () {
        const client = yield* NodeHttpClient.makeNodeHttp.pipe(
          Effect.provideService(NodeHttpClient.HttpAgent, { http: agent, https: agent })
        )
        const endpoint = new URL(RESIDENT_STOP_PATH, attachment.endpoint).href
        const headers = { authorization: `Bearer ${Redacted.value(attachment.authorization)}` }
        const capability = yield* client
          .execute(HttpClientRequest.get(endpoint).pipe(HttpClientRequest.setHeaders(headers)))
          .pipe(
            Effect.flatMap((response) =>
              Effect.gen(function* () {
                if (response.status !== HTTP_OK)
                  return yield* new ResidentStopRefused({
                    reason: "unsupported-wire",
                    message: "Resident managed stop wire is unsupported; no stop was submitted."
                  })
                return yield* HttpClientResponse.schemaBodyJson(StopCapability)(response)
              })
            ),
            Effect.provideService(HttpIncomingMessage.MaxBodySize, ByteSize.bytes(MAX_COMPATIBILITY_REQUEST_BYTES)),
            Effect.timeout("5 seconds")
          )
        if (capability.generation !== target.generation)
          return yield* new ResidentStopRefused({
            reason: "unsupported-wire",
            message: "Resident stop capability belongs to another generation; no stop was submitted."
          })
        const body = yield* Schema.encodeEffect(Schema.fromJsonString(StopRequest))({
          stopWire: 1,
          generation: target.generation
        })
        const request = HttpClientRequest.post(endpoint).pipe(
          HttpClientRequest.setHeaders(headers),
          HttpClientRequest.bodyText(body, "application/json")
        )
        yield* Ref.set(submission, { kind: "submitted" })
        return yield* client.execute(request).pipe(
          Effect.flatMap((response) =>
            Effect.gen(function* () {
              if (response.status === HTTP_CONFLICT || response.status === HTTP_BAD_REQUEST) {
                yield* HttpClientResponse.schemaBodyJson(StopRefusal)(response)
                return yield* new ResidentStopRefused({
                  reason: "explicit-refusal",
                  message:
                    "The authenticated resident refused this stop without fencing. Retirement remains unconfirmed."
                })
              }
              if (response.status !== HTTP_ACCEPTED) return yield* new StopResponseUnconfirmed({})
              const acknowledgment = yield* HttpClientResponse.schemaBodyJson(StopAcknowledgment)(response)
              if (acknowledgment.generation !== target.generation) return yield* new StopResponseUnconfirmed({})
              const result = Accepted.make({
                kind: "accepted",
                generation: target.generation,
                retirement: "unconfirmed"
              })
              yield* Ref.set(submission, { kind: "accepted", receipt: result })
              return result
            })
          ),
          Effect.provideService(HttpIncomingMessage.MaxBodySize, ByteSize.bytes(MAX_COMPATIBILITY_REQUEST_BYTES)),
          Effect.timeout("5 seconds")
        )
      })
    )
  }).pipe(withResidentHeaderRedaction)
  return yield* budget.within(operation).pipe(
    Effect.catch((error) =>
      Effect.gen(function* () {
        const knowledge = yield* Ref.get(submission)
        if (knowledge.kind === "accepted") {
          yield* Effect.logWarning(
            "Resident stop was accepted, but local control-channel cleanup was not confirmed. Retirement remains unconfirmed."
          )
          return knowledge.receipt
        }
        if (error instanceof ResidentStopRefused) return yield* error
        if (knowledge.kind === "submitted")
          return Unconfirmed.make({
            kind: "unconfirmed",
            generation: target.generation,
            submission: "unknown",
            retirement: "unconfirmed"
          })
        return yield* new ResidentStopRefused({
          reason: "owner-unavailable",
          message:
            "Resident stop ownership or protocol could not be authenticated; no stop was submitted. Preserve unresolved state."
        })
      })
    )
  )
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
