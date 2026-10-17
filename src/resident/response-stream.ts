import { Effect, Schema, Stream } from "effect"
import { McpSchema } from "effect/ai"
import { Sse } from "effect/encoding"

const RpcVersion = Schema.Literal("2.0")
const Success = Schema.Struct({ jsonrpc: RpcVersion, id: McpSchema.RequestId, result: Schema.Unknown })
const Failure = Schema.Struct({
  jsonrpc: RpcVersion,
  id: Schema.NullOr(McpSchema.RequestId),
  error: Schema.Struct({ code: Schema.Int, message: Schema.String, data: Schema.optionalKey(Schema.Unknown) })
})
const Notification = Schema.Struct({
  jsonrpc: RpcVersion,
  id: Schema.optionalKey(Schema.Never),
  method: Schema.String,
  params: Schema.optionalKey(Schema.Unknown)
})

// Interactive requests need a separately negotiated continuation bridge. Do not
// decode an id-bearing request as a notification and silently discard its id.
export const BackendMessage = Schema.Union([Success, Failure, Notification])
export type BackendMessage = Schema.Schema.Type<typeof BackendMessage>

export class BackendResponseError extends Schema.TaggedError<BackendResponseError>()("BackendResponseError", {
  message: Schema.String
}) {}

const responseFailure = (error: unknown) =>
  error instanceof BackendResponseError
    ? error
    : new BackendResponseError({ message: "Invalid backend protocol response" })

const boundedBody = <E, R>(body: Stream.Stream<Uint8Array, E, R>, maxBytes: number) =>
  body.pipe(
    Stream.mapAccumEffect(
      () => 0,
      (consumed, chunk) => {
        const next = consumed + chunk.byteLength
        return next > maxBytes
          ? Effect.fail(new BackendResponseError({ message: "Backend response exceeded its byte budget" }))
          : Effect.succeed<readonly [number, ReadonlyArray<Uint8Array>]>([next, [chunk]])
      }
    )
  )

export const decodeBackendMessages = <E, R>(options: {
  readonly body: Stream.Stream<Uint8Array, E, R>
  readonly contentType: string
  readonly maxBytes: number
}) => {
  const text = boundedBody(options.body, options.maxBytes).pipe(Stream.decodeText())
  const mediaType = options.contentType.split(";")[0]?.trim().toLowerCase()
  if (mediaType === "application/json") {
    return Stream.fromEffect(
      text.pipe(
        Stream.runFold(
          () => "",
          (acc, chunk) => acc + chunk
        ),
        Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(BackendMessage))),
        Effect.mapError(responseFailure)
      )
    )
  }
  if (mediaType === "text/event-stream") {
    return text.pipe(
      Stream.pipeThroughChannel(Sse.decodeDataSchema(BackendMessage, { maxEventSize: options.maxBytes })),
      Stream.map((event) => event.data),
      Stream.mapError(responseFailure)
    )
  }
  return Stream.fail(new BackendResponseError({ message: "Unsupported backend response content type" }))
}
