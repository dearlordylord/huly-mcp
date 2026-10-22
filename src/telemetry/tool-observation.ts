import { Cause, Clock, Effect, Exit } from "effect"

import { observeAttachmentActivity } from "./attachment-context.js"
import { reportTelemetry, type ToolStatus } from "./events.js"
import type { TelemetryOperations, ToolCalledProps } from "./telemetry.js"

const NANOS_PER_MILLISECOND = 1_000_000

const rejectionTags = new Set([
  "UnknownTool",
  "ServerShuttingDown",
  "ParseError",
  "MissingArguments",
  "UnexpectedArguments",
  "CliInputError"
])
export const toolResponseStatus = (isError: boolean, errorTag: string | undefined): ToolStatus => {
  if (!isError) return "success"
  if (errorTag === "Interrupted") return "cancelled"
  return errorTag !== undefined && rejectionTags.has(errorTag) ? "rejected" : "error"
}
export const toolFailureStatus = <E>(cause: Cause.Cause<E>): ToolStatus =>
  Cause.hasInterruptsOnly(cause) ? "cancelled" : "error"

export const jsonUtf8Bytes = (input: unknown): number | undefined => {
  try {
    const encoded = JSON.stringify(input)
    return encoded === undefined ? undefined : Buffer.byteLength(encoded, "utf8")
  } catch {
    return undefined
  }
}

// Internal attempt metadata; the PostHog codec owns the serialized event shape.
export type ToolObservation = Omit<ToolCalledProps, "status" | "durationMs" | "attachmentId">
export const observeToolCall = <A, E, R>(
  telemetry: TelemetryOperations,
  metadata: ToolObservation,
  use: Effect.Effect<A, E, R>,
  result: (value: A) => Pick<ToolCalledProps, "status" | "errorTag" | "outputBytes">
): Effect.Effect<A, E, R> =>
  Effect.gen(function* () {
    const startedAt = yield* Clock.monotonicTimeNanos
    const attachmentId = yield* observeAttachmentActivity
    return yield* use.pipe(
      Effect.onExit((exit) =>
        Effect.gen(function* () {
          const finishedAt = yield* Clock.monotonicTimeNanos
          reportTelemetry(() =>
            telemetry.toolCalled({
              ...metadata,
              ...(attachmentId === undefined ? {} : { attachmentId }),
              durationMs: Number(finishedAt - startedAt) / NANOS_PER_MILLISECOND,
              ...(Exit.isSuccess(exit)
                ? result(exit.value)
                : {
                    status: toolFailureStatus(exit.cause),
                    errorTag: Cause.hasInterruptsOnly(exit.cause) ? "Interrupted" : "UnexpectedError"
                  })
            })
          )
        })
      )
    )
  })
