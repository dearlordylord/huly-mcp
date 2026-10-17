import { Context, type Effect, Schema } from "effect"

export class RequestWorkRejected extends Schema.TaggedError<RequestWorkRejected>()("RequestWorkRejected", {
  message: Schema.String
}) {}

export class RequestWorkCleanupFailed extends Schema.TaggedError<RequestWorkCleanupFailed>()(
  "RequestWorkCleanupFailed",
  { message: Schema.String }
) {}

// Internal resource port. Cleanup must certify retained target work before ownership ends.
export class RequestWorkOwner extends Context.Service<
  RequestWorkOwner,
  {
    readonly withWork: <A, E, R>(options: {
      readonly use: Effect.Effect<A, E, R>
      readonly cleanup: Effect.Effect<void, RequestWorkCleanupFailed>
    }) => Effect.Effect<A, E | RequestWorkRejected | RequestWorkCleanupFailed, R>
  }
>()("@hulymcp/RequestWorkOwner") {}
