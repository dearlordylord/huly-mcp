import { NodeHttpClient } from "@effect/platform-node"
import { ByteSize, Effect, Fiber, type Option, Redacted, Schedule, Schema } from "effect"
import { HttpClientRequest, HttpClientResponse, HttpIncomingMessage } from "effect/http"

import {
  AttachmentAdmitted,
  type AttachmentToken,
  RESIDENT_ATTACHMENT_HEADER,
  RESIDENT_ATTACHMENTS_PATH
} from "./admission-contract.js"
import { withResidentExchange } from "./attachment-exchange.js"
import type { ResidentAttachment } from "./attachment-file.js"
import type { LegacyHttpSession } from "./protocol-session.js"
import type { HostMessage } from "./request-headers.js"
import { BackendResponseError } from "./response-stream.js"
import { withResidentHttpsAgent } from "./tls-channel.js"
import { MAX_ADMISSION_RESPONSE_BYTES } from "./adapter-limits.js"
import { withResidentHeaderRedaction } from "./private-http.js"
import { VERSION } from "../version.js"
import {
  CompatibilityChallenge,
  CompatibilityProof,
  RESIDENT_COMPATIBILITY_PATH,
  type ResidentSelection
} from "./compatibility-contract.js"
import { makeCompatibilityProof } from "./compatibility-crypto.js"

const HTTP_CREATED = 201
const HTTP_NO_CONTENT = 204
const HTTP_OK = 200
const CONTROL_ALLOWANCE = "5 seconds"

const controlRequest = (
  attachment: ResidentAttachment,
  method: "POST" | "PUT" | "DELETE",
  token: AttachmentToken | undefined,
  path: typeof RESIDENT_ATTACHMENTS_PATH | typeof RESIDENT_COMPATIBILITY_PATH = RESIDENT_ATTACHMENTS_PATH
) =>
  HttpClientRequest.make(method)(new URL(path, attachment.endpoint).href).pipe(
    HttpClientRequest.setHeaders({
      authorization: `Bearer ${Redacted.value(attachment.authorization)}`,
      ...(token === undefined ? {} : { [RESIDENT_ATTACHMENT_HEADER]: Redacted.value(token) })
    })
  )

const control = <A, E, R>(
  attachment: ResidentAttachment,
  request: HttpClientRequest.HttpClientRequest,
  use: (response: HttpClientResponse.HttpClientResponse) => Effect.Effect<A, E, R>
) =>
  withResidentHttpsAgent(attachment.endpoint, attachment.identity, (agent) =>
    Effect.gen(function* () {
      const client = yield* NodeHttpClient.makeNodeHttp.pipe(
        Effect.provideService(NodeHttpClient.HttpAgent, { http: agent, https: agent })
      )
      const response = yield* client.execute(request)
      return yield* use(response)
    })
  ).pipe(withResidentHeaderRedaction, Effect.interruptible, Effect.timeout(CONTROL_ALLOWANCE))

const requestAdmission = (attachment: ResidentAttachment, selection: ResidentSelection | undefined) =>
  Effect.gen(function* () {
    const request = controlRequest(attachment, "POST", undefined)
    if (selection === undefined) return request
    const challenge = yield* control(
      attachment,
      controlRequest(attachment, "POST", undefined, RESIDENT_COMPATIBILITY_PATH),
      (response) =>
        Effect.gen(function* () {
          if (response.status !== HTTP_OK)
            return yield* new BackendResponseError({ message: "Resident comparison challenge was rejected" })
          return yield* HttpClientResponse.schemaBodyJson(
            CompatibilityChallenge.check(
              Schema.makeFilter(
                (value) => value.generation === attachment.identity.generation && value.implementation === VERSION
              )
            )
          )(response).pipe(
            Effect.provideService(HttpIncomingMessage.MaxBodySize, ByteSize.bytes(MAX_ADMISSION_RESPONSE_BYTES))
          )
        })
    )
    const proof = yield* makeCompatibilityProof(selection, challenge, attachment.authorization)
    const encoded = yield* Schema.encodeEffect(CompatibilityProof)(proof)
    return yield* HttpClientRequest.bodyJson(request, encoded)
  })

const adapterExchange =
  (attachment: ResidentAttachment, token: AttachmentToken) =>
  <A, E, R>(
    message: HostMessage,
    session: Option.Option<LegacyHttpSession>,
    use: (response: HttpClientResponse.HttpClientResponse) => Effect.Effect<A, E, R>
  ) =>
    withResidentExchange(attachment, message, session, use, token)
export type AdapterExchange = ReturnType<typeof adapterExchange>

export const withAdapterAttachment = <A, E, R>(
  attachment: ResidentAttachment,
  use: (exchange: AdapterExchange) => Effect.Effect<A, E, R>,
  selection?: ResidentSelection
) =>
  Effect.acquireUseRelease(
    requestAdmission(attachment, selection).pipe(
      Effect.flatMap((request) =>
        control(attachment, request, (response) =>
          Effect.gen(function* () {
            if (response.status !== HTTP_CREATED)
              return yield* new BackendResponseError({
                message: "Resident admission was rejected; no Huly request was dispatched"
              })
            const admitted = yield* HttpClientResponse.schemaBodyJson(AttachmentAdmitted)(response).pipe(
              Effect.provideService(HttpIncomingMessage.MaxBodySize, ByteSize.bytes(MAX_ADMISSION_RESPONSE_BYTES))
            )
            return admitted
          })
        )
      ),
      Effect.timeout(CONTROL_ALLOWANCE),
      Effect.mapError(
        () =>
          new BackendResponseError({ message: "Resident admission failed; no Huly request was dispatched or replayed" })
      ),
      Effect.interruptible
    ),
    (admitted) =>
      Effect.scoped(
        Effect.gen(function* () {
          const renewal = control(attachment, controlRequest(attachment, "PUT", admitted.token), (response) =>
            response.status === HTTP_NO_CONTENT
              ? Effect.void
              : Effect.fail(
                  new BackendResponseError({ message: "Resident eligibility was lost; no request was replayed" })
                )
          ).pipe(
            Effect.mapError(
              () =>
                new BackendResponseError({
                  message: "Resident renewal failed; this adapter stopped without replaying a request"
                })
            )
          )
          const heartbeat = yield* renewal.pipe(
            Effect.repeat(Schedule.spaced(admitted.lease.renewEveryMillis)),
            Effect.delay(admitted.lease.renewEveryMillis),
            Effect.forkScoped
          )
          return yield* Effect.raceFirst(use(adapterExchange(attachment, admitted.token)), Fiber.join(heartbeat))
        })
      ),
    (admitted) =>
      control(attachment, controlRequest(attachment, "DELETE", admitted.token), (response) =>
        response.status === HTTP_NO_CONTENT
          ? Effect.void
          : Effect.fail(
              new BackendResponseError({ message: "Resident release was not confirmed; no request was replayed" })
            )
      ).pipe(
        Effect.mapError(
          () => new BackendResponseError({ message: "Resident cleanup was not confirmed; no request was replayed" })
        )
      )
  )
