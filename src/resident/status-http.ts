import { Effect, Schema } from "effect"
import { HttpServerRequest, HttpServerResponse } from "effect/http"

import { ResidentLiveStatus } from "./status-contract.js"

const HTTP_METHOD_NOT_ALLOWED = 405
const HTTP_NOT_FOUND = 404
const HTTP_OK = 200

/** Inside the generation TLS/bearer policy; no attachment or Huly client acquisition. */
export const renderResidentStatus = Effect.fn("renderResidentStatus")(function* (
  status: Effect.Effect<ResidentLiveStatus> | undefined
) {
  const request = yield* HttpServerRequest.HttpServerRequest
  if (request.method !== "GET") return HttpServerResponse.empty({ status: HTTP_METHOD_NOT_ALLOWED })
  if (status === undefined) return HttpServerResponse.empty({ status: HTTP_NOT_FOUND })
  const body = yield* status.pipe(Effect.flatMap(Schema.encodeEffect(ResidentLiveStatus)), Effect.orDie)
  return HttpServerResponse.jsonUnsafe(body, { status: HTTP_OK, headers: { "cache-control": "no-store" } })
})
