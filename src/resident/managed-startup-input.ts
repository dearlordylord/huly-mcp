import { finished, type Readable } from "node:stream"
import { Deferred, Effect } from "effect"

import { BackendResponseError } from "./response-stream.js"

type InputOwner = "observing" | "ended" | "failed" | "inactive"
type BridgeHandoff = <E, R>(bridge: Effect.Effect<void, E, R>) => Effect.Effect<void, E | BackendResponseError, R>

const inputFailure = () =>
  new BackendResponseError({ message: "Resident stdin failed before admission; no request was dispatched or replayed" })

export const withManagedStartupInput = <E, R>(
  input: Readable,
  use: (handoff: BridgeHandoff) => Effect.Effect<void, E, R>
) =>
  Effect.scoped(
    Effect.gen(function* () {
      const terminal = yield* Deferred.make<void, BackendResponseError>()
      let owner: InputOwner = "observing"
      const ended = () => {
        if (owner !== "observing") return
        owner = "ended"
        Deferred.doneUnsafe(terminal, Effect.void)
      }
      const failed = () => {
        if (owner !== "observing") return
        owner = "failed"
        Deferred.doneUnsafe(terminal, Effect.fail(inputFailure()))
      }
      const readable = () => {
        if (owner === "observing" && input.readableLength === 0) input.read(0)
      }
      const detach = () => {
        owner = "inactive"
        input.off("readable", readable)
      }
      const cleanup = yield* Effect.acquireRelease(
        Effect.sync(() => {
          input.on("readable", readable)
          return finished(input, { readable: true, writable: false }, (error) => {
            if (error) failed()
            else ended()
          })
        }),
        (cleanup) =>
          Effect.gen(function* () {
            if (owner !== "inactive" && input.destroyed) yield* Deferred.await(terminal).pipe(Effect.ignore)
            detach()
            cleanup()
          })
      )
      yield* Effect.sync(() => {
        if (input.readableEnded) ended()
        else if (!input.destroyed) input.read(0)
      })
      const handoff: BridgeHandoff = <BridgeE, BridgeR>(bridge: Effect.Effect<void, BridgeE, BridgeR>) =>
        Effect.suspend<void, BridgeE | BackendResponseError, BridgeR>(() => {
          switch (owner) {
            case "observing":
              if (input.destroyed) return Deferred.await(terminal)
              detach()
              cleanup()
              return bridge
            case "ended":
              // The EOF branch owns completion; do not run the caller's continuation.
              return Effect.never
            case "failed":
              return Effect.fail(inputFailure())
            case "inactive":
              return Effect.fail(
                new BackendResponseError({ message: "Resident stdin ownership was already transferred" })
              )
          }
        })
      return yield* Effect.raceFirst(use(handoff), Deferred.await(terminal))
    })
  )
