import { Effect, Schema } from "effect"
import { HttpServerRequest, HttpServerResponse } from "effect/http"

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

const HTTP_FORBIDDEN = 403
const HTTP_CAPACITY = 503
const HTTP_CONFLICT = 409
const HTTP_NO_CONTENT = 204
const HTTP_METHOD_NOT_ALLOWED = 405
const HTTP_CREATED = 201
const nativeSession = Schema.NonEmptyString

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

/** Must run inside the generation's TLS/bearer policy, outside request-client acquisition. */
export const residentAdmissionMiddleware =
  (admissions: Effect.Success<ReturnType<typeof makeResidentAdmissions>>) =>
  <E, R>(httpEffect: Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>) =>
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest
      if (request.url === RESIDENT_ATTACHMENTS_PATH) {
        if (request.method === "POST") {
          const admitted = yield* admissions.admit
          const encoded = yield* Schema.encodeEffect(AttachmentAdmitted)(admitted).pipe(Effect.orDie)
          return HttpServerResponse.jsonUnsafe(encoded, {
            status: HTTP_CREATED,
            headers: { "cache-control": "no-store" }
          })
        }
        if (request.method === "PUT") {
          yield* admissions.renew(yield* parseToken(request.headers[RESIDENT_ATTACHMENT_HEADER]))
          return HttpServerResponse.empty({ status: HTTP_NO_CONTENT })
        }
        if (request.method !== "DELETE") return HttpServerResponse.empty({ status: HTTP_METHOD_NOT_ALLOWED })
        yield* admissions.release(yield* parseToken(request.headers[RESIDENT_ATTACHMENT_HEADER]))
        return HttpServerResponse.empty({ status: HTTP_NO_CONTENT })
      }
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
      )
    )
