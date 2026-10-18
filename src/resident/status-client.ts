import * as NodeHttpClient from "@effect/platform-node/NodeHttpClient"
import { ByteSize, Effect, Redacted } from "effect"
import { HttpClientRequest, HttpClientResponse, HttpIncomingMessage } from "effect/http"

import type { ResidentAttachment } from "./attachment-file.js"
import { MAX_COMPATIBILITY_REQUEST_BYTES } from "./compatibility-contract.js"
import { withResidentHeaderRedaction } from "./private-http.js"
import { RESIDENT_STATUS_PATH, ResidentLiveStatus, ResidentStatusObservation } from "./status-contract.js"
import { withResidentHttpsAgent } from "./tls-channel.js"

const HTTP_OK = 200
const unavailable = ResidentStatusObservation.make({ kind: "unavailable", recovery: "unverified" })

/** One read of one protected descriptor; never starts, attaches, retries or resets an owner. */
export const readResidentLiveStatus = Effect.fn("readResidentLiveStatus")(function* (attachment: ResidentAttachment) {
  return yield* withResidentHttpsAgent(attachment.endpoint, attachment.identity, (agent) =>
    Effect.gen(function* () {
      const client = yield* NodeHttpClient.makeNodeHttp.pipe(
        Effect.provideService(NodeHttpClient.HttpAgent, { http: agent, https: agent })
      )
      const response = yield* client.execute(
        HttpClientRequest.get(new URL(RESIDENT_STATUS_PATH, attachment.endpoint).href).pipe(
          HttpClientRequest.setHeaders({ authorization: `Bearer ${Redacted.value(attachment.authorization)}` })
        )
      )
      if (response.status !== HTTP_OK) return unavailable
      const status = yield* HttpClientResponse.schemaBodyJson(ResidentLiveStatus)(response)
      if (status.generation !== attachment.identity.generation) return unavailable
      return ResidentStatusObservation.make({ kind: "authenticated", status })
    })
  ).pipe(
    Effect.provideService(HttpIncomingMessage.MaxBodySize, ByteSize.bytes(MAX_COMPATIBILITY_REQUEST_BYTES)),
    Effect.timeout("5 seconds"),
    Effect.catch(() => Effect.succeed(unavailable)),
    withResidentHeaderRedaction
  )
})
