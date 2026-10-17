import { Effect, Option, Schema } from "effect"

import { BackendResponseError } from "./response-stream.js"

export const LegacyHttpSession = Schema.Struct({
  id: Schema.RedactedFromValue(Schema.NonEmptyString.pipe(Schema.brand("ResidentLegacySessionId"))),
  protocolVersion: Schema.Literal("2025-06-18")
})
export type LegacyHttpSession = Schema.Schema.Type<typeof LegacyHttpSession>

export const parseLegacyHttpSession = (headers: Headers) => {
  const id = headers.get("mcp-session-id")
  if (id === null) return Effect.succeed(Option.none<LegacyHttpSession>())
  return Schema.decodeUnknownEffect(LegacyHttpSession)({
    id,
    protocolVersion: headers.get("mcp-protocol-version")
  }).pipe(
    Effect.map(Option.some),
    Effect.mapError(() => new BackendResponseError({ message: "Backend returned invalid legacy session headers" }))
  )
}
