import { Effect, Schema } from "effect"

import { type GetProjectParamsSchema, GetProjectResultSchema } from "../src/domain/schemas/projects.js"
import { type LiveReadClient, LiveReadProbeError } from "./resident-live-read-contract.js"

const NativeProjectCall = Schema.Struct({
  isError: Schema.optionalKey(Schema.Literal(false)),
  structuredContent: Schema.Struct({ result: GetProjectResultSchema })
})
const ProxyProjectCall = Schema.Struct({
  isError: Schema.optionalKey(Schema.Literal(false)),
  structuredContent: Schema.Struct({
    result: Schema.Struct({ toolName: Schema.Literal("get_project"), result: GetProjectResultSchema })
  })
})
export const liveProjectCall = (client: LiveReadClient, args: Schema.Codec.Encoded<typeof GetProjectParamsSchema>) =>
  client.exposure === "native"
    ? { name: "get_project", arguments: args }
    : { name: "invoke_tool", arguments: { toolName: "get_project", arguments: args } }
export const parseLiveProjectReply = Effect.fn("parseLiveProjectReply")(function* (
  client: LiveReadClient,
  reply: unknown
) {
  if (client.exposure === "native") {
    const parsed = yield* Schema.decodeUnknownEffect(NativeProjectCall)(reply).pipe(
      Effect.mapError(() => new LiveReadProbeError({ phase: "read" }))
    )
    return parsed.structuredContent.result
  }
  const parsed = yield* Schema.decodeUnknownEffect(ProxyProjectCall)(reply).pipe(
    Effect.mapError(() => new LiveReadProbeError({ phase: "read" }))
  )
  return parsed.structuredContent.result.result
})
