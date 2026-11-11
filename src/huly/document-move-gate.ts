import { Effect, Semaphore } from "effect"
import type { Ref } from "@hcengineering/core"
import type { Teamspace } from "@hcengineering/document"

import { NonEmptyString } from "../domain/schemas/shared.js"
import { MovementTransportError } from "./movement-transaction-transport.js"

export const makeDocumentMoveGate = () => {
  const scopes = new Map<string, { semaphore: Semaphore.Semaphore; users: number; uncertain: boolean }>()
  return <A, E>(
    workspace: NonEmptyString,
    teamspace: Ref<Teamspace>,
    write: Effect.Effect<A, E>
  ): Effect.Effect<A, E | MovementTransportError> => {
    const key = JSON.stringify([workspace, teamspace])
    return Effect.acquireUseRelease(
      Effect.sync(() => {
        const scope = scopes.get(key) ?? { semaphore: Semaphore.makeUnsafe(1), users: 0, uncertain: false }
        scope.users++
        scopes.set(key, scope)
        return scope
      }),
      (scope) =>
        scope.semaphore.withPermit(
          Effect.uninterruptible(
            Effect.suspend((): Effect.Effect<A, E | MovementTransportError> => {
              if (scope.uncertain) {
                return Effect.fail(
                  new MovementTransportError({
                    phase: "before-send",
                    reason: NonEmptyString.make(
                      "An earlier document move in this teamspace may still be executing. Confirm it has settled in Huly before restarting this MCP process to resume moves."
                    )
                  })
                )
              }
              return write.pipe(
                Effect.tapError((error) =>
                  Effect.sync(() => {
                    if (error instanceof MovementTransportError && error.phase === "after-send") {
                      scope.uncertain = true
                    }
                  })
                )
              )
            })
          )
        ),
      (scope) =>
        Effect.sync(() => {
          scope.users--
          if (scope.users === 0 && !scope.uncertain) scopes.delete(key)
        })
    )
  }
}

export type DocumentMoveGate = ReturnType<typeof makeDocumentMoveGate>
