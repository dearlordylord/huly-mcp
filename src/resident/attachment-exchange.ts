import * as NodeHttpClient from "@effect/platform-node/NodeHttpClient"
import { Effect, type Option, Redacted, Schema } from "effect"
import { HttpClientRequest, type HttpClientResponse } from "effect/http"

import type { ResidentAttachment } from "./attachment-file.js"
import type { LegacyHttpSession } from "./protocol-session.js"
import { HostMessage, requestHeaders } from "./request-headers.js"
import { BackendResponseError } from "./response-stream.js"
import { withResidentHttpsAgent } from "./tls-channel.js"
import { type AttachmentToken, RESIDENT_ATTACHMENT_HEADER } from "./admission-contract.js"
import { withResidentHeaderRedaction } from "./private-http.js"

export const withResidentExchange = <A, E, R>(
  attachment: ResidentAttachment,
  message: HostMessage,
  session: Option.Option<LegacyHttpSession>,
  use: (response: HttpClientResponse.HttpClientResponse) => Effect.Effect<A, E, R>,
  token?: AttachmentToken
) =>
  withResidentHttpsAgent(attachment.endpoint, attachment.identity, (agent) =>
    Effect.gen(function* () {
      const body = yield* Schema.encodeEffect(Schema.fromJsonString(HostMessage))(message).pipe(
        Effect.mapError(
          () => new BackendResponseError({ message: "Stdio request could not be encoded; it was not dispatched" })
        )
      )
      const client = yield* NodeHttpClient.makeNodeHttp.pipe(
        Effect.provideService(NodeHttpClient.HttpAgent, { http: agent, https: agent })
      )
      const headers = requestHeaders(message, attachment.authorization, session)
      if (token !== undefined) headers.set(RESIDENT_ATTACHMENT_HEADER, Redacted.value(token))
      const request = HttpClientRequest.post(attachment.endpoint.href).pipe(
        HttpClientRequest.setHeaders(headers),
        HttpClientRequest.bodyText(body, "application/json")
      )
      const response = yield* client
        .execute(request)
        .pipe(
          Effect.mapError(
            () =>
              new BackendResponseError({
                message: "Backend connection failed; operation outcome may be unknown. No request was replayed."
              })
          )
        )
      return yield* use(response)
    })
  ).pipe(withResidentHeaderRedaction)
