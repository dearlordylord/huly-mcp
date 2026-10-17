import { NodeHttpClient } from "@effect/platform-node"
import { Effect, type Option, Schema } from "effect"
import { HttpClientRequest, type HttpClientResponse } from "effect/http"

import type { ResidentAttachment } from "./attachment-file.js"
import type { LegacyHttpSession } from "./protocol-session.js"
import { HostMessage, requestHeaders } from "./request-headers.js"
import { BackendResponseError } from "./response-stream.js"
import { withResidentHttpsAgent } from "./tls-channel.js"

export const withResidentExchange = <A, E, R>(
  attachment: ResidentAttachment,
  message: HostMessage,
  session: Option.Option<LegacyHttpSession>,
  use: (response: HttpClientResponse.HttpClientResponse) => Effect.Effect<A, E, R>
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
      const request = HttpClientRequest.post(attachment.endpoint.href).pipe(
        HttpClientRequest.setHeaders(requestHeaders(message, attachment.authorization, session)),
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
  )
