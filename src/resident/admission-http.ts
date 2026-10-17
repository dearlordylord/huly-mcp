import { ByteSize, Effect, Schema } from "effect"
import { HttpIncomingMessage, HttpServerRequest, HttpServerResponse } from "effect/http"

import { RequestWorkOwner } from "../runtime/request-work.js"
import {
  AdmissionError,
  AttachmentAdmitted,
  AttachmentToken,
  RESIDENT_ATTACHMENT_HEADER,
  RESIDENT_ATTACHMENTS_PATH
} from "./admission-contract.js"
import type { makeResidentAdmissions } from "./admissions.js"
import { attachmentRequestOwner } from "./attachment-http-context.js"
import type { makeCompatibilityAuthority } from "./compatibility-authority.js"
import {
  CompatibilityChallenge,
  CompatibilityError,
  CompatibilityProof,
  MAX_COMPATIBILITY_REQUEST_BYTES,
  RESIDENT_COMPATIBILITY_PATH
} from "./compatibility-contract.js"

const HTTP_FORBIDDEN = 403
const HTTP_CAPACITY = 503
const HTTP_CONFLICT = 409
const HTTP_NO_CONTENT = 204
const HTTP_METHOD_NOT_ALLOWED = 405
const HTTP_CREATED = 201
const HTTP_OK = 200
const HTTP_BAD_REQUEST = 400
const nativeSession = Schema.NonEmptyString
type Admissions = Effect.Success<ReturnType<typeof makeResidentAdmissions>>
type CompatibilityAuthority = Effect.Success<ReturnType<typeof makeCompatibilityAuthority>>

const parseToken = (value: string | undefined) =>
  Schema.decodeUnknownEffect(AttachmentToken)(value).pipe(
    Effect.mapError(
      () => new AdmissionError({ kind: "unknown", message: "Resident attachment authorization is required" })
    )
  )
const rejection = (error: AdmissionError) =>
  HttpServerResponse.text(error.message, {
    status: error.kind === "unknown" ? HTTP_FORBIDDEN : error.kind === "capacity" ? HTTP_CAPACITY : HTTP_CONFLICT
  })

const compatibilityRejection = (error: CompatibilityError) =>
  HttpServerResponse.text(error.message, {
    status:
      error.kind === "input"
        ? HTTP_BAD_REQUEST
        : error.kind === "unknown" || error.kind === "mismatch"
          ? HTTP_FORBIDDEN
          : HTTP_CAPACITY
  })

const renderChallenge = (request: HttpServerRequest.HttpServerRequest, authority: CompatibilityAuthority) =>
  Effect.gen(function* () {
    if (request.method !== "POST") return HttpServerResponse.empty({ status: HTTP_METHOD_NOT_ALLOWED })
    const challenge = yield* authority.challenge
    const encoded = yield* Schema.encodeEffect(CompatibilityChallenge)(challenge).pipe(Effect.orDie)
    return HttpServerResponse.jsonUnsafe(encoded, { status: HTTP_OK, headers: { "cache-control": "no-store" } })
  })

const verifySelection = (request: HttpServerRequest.HttpServerRequest, authority: CompatibilityAuthority) =>
  Effect.gen(function* () {
    const proof = yield* request.json.pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(CompatibilityProof)),
      Effect.provideService(HttpIncomingMessage.MaxBodySize, ByteSize.bytes(MAX_COMPATIBILITY_REQUEST_BYTES)),
      Effect.mapError(() => new CompatibilityError({ kind: "input", message: "Resident comparison proof is invalid" }))
    )
    yield* authority.verify(proof)
  })

const renderAttachmentControl = (
  request: HttpServerRequest.HttpServerRequest,
  admissions: Admissions,
  authority: CompatibilityAuthority | undefined
) =>
  Effect.gen(function* () {
    if (request.method === "POST") {
      if (authority !== undefined) yield* verifySelection(request, authority)
      const admitted = yield* admissions.admit
      const encoded = yield* Schema.encodeEffect(AttachmentAdmitted)(admitted).pipe(Effect.orDie)
      return HttpServerResponse.jsonUnsafe(encoded, { status: HTTP_CREATED, headers: { "cache-control": "no-store" } })
    }
    if (request.method === "PUT") {
      yield* admissions.renew(yield* parseToken(request.headers[RESIDENT_ATTACHMENT_HEADER]))
      return HttpServerResponse.empty({ status: HTTP_NO_CONTENT })
    }
    if (request.method !== "DELETE") return HttpServerResponse.empty({ status: HTTP_METHOD_NOT_ALLOWED })
    yield* admissions.release(yield* parseToken(request.headers[RESIDENT_ATTACHMENT_HEADER]))
    return HttpServerResponse.empty({ status: HTTP_NO_CONTENT })
  })

/** Must run inside the generation's TLS/bearer policy, outside request-client acquisition. */
export const residentAdmissionMiddleware =
  (admissions: Admissions, authority?: CompatibilityAuthority) =>
  <E, R>(httpEffect: Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>) =>
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest
      if (request.url === RESIDENT_COMPATIBILITY_PATH && authority !== undefined)
        return yield* renderChallenge(request, authority)
      if (request.url === RESIDENT_ATTACHMENTS_PATH)
        return yield* renderAttachmentControl(request, admissions, authority)
      const owner = yield* admissions.find(yield* parseToken(request.headers[RESIDENT_ATTACHMENT_HEADER]))
      const session = request.headers["mcp-session-id"]
      if (session !== undefined) {
        const parsed = yield* Schema.decodeUnknownEffect(nativeSession)(session).pipe(
          Effect.mapError(
            () => new AdmissionError({ kind: "unknown", message: "Resident native session is unavailable" })
          )
        )
        if (!(yield* owner.ownsSession(parsed))) return HttpServerResponse.empty({ status: HTTP_FORBIDDEN })
      }
      return yield* Effect.provideService(httpEffect, RequestWorkOwner, attachmentRequestOwner(owner))
    }).pipe(
      Effect.catchIf(
        (error): error is AdmissionError => error instanceof AdmissionError,
        (error) => Effect.succeed(rejection(error))
      ),
      Effect.catchIf(
        (error): error is CompatibilityError => error instanceof CompatibilityError,
        (error) => Effect.succeed(compatibilityRejection(error))
      )
    )
