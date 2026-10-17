import { Effect, Exit, Redacted } from "effect"

import { parseChildStart } from "./bootstrap-codec.js"
import { type BootstrapNonce, ManagedLaunchError, PREPARED_CHILD_MILLIS } from "./managed-contract.js"
import { type ChildStartState, decideChildStart } from "./start-authorization.js"

// Internal event port. All serialized frames pass through the bootstrap codecs.
export interface ChildAuthorizationPort {
  readonly onMessage: (listener: (message: unknown) => void) => () => void
  readonly onDisconnect: (listener: () => void) => () => void
  readonly send: (frame: Redacted.Redacted<string>, onFailure: () => void) => void
}

const retired = () =>
  new ManagedLaunchError({ reason: "ipc", message: "Resident child retired before startup authorization" })

export const awaitChildAuthorization = Effect.fn("awaitChildAuthorization")(function* (
  port: ChildAuthorizationPort,
  nonce: BootstrapNonce,
  prepared: Redacted.Redacted<string>
) {
  let state: ChildStartState = "prepared"
  const transition = (event: Parameters<typeof decideChildStart>[1]) => {
    const decision = decideChildStart(state, event)
    state = decision.state
    return decision.action
  }
  const authorized = Effect.callback<Effect.Success<ReturnType<typeof parseChildStart>>, ManagedLaunchError>(
    (resume) => {
      const cleanup = () => {
        removeMessage()
        removeDisconnect()
      }
      const finish = (
        result: Effect.Effect<Effect.Success<ReturnType<typeof parseChildStart>>, ManagedLaunchError>
      ) => {
        cleanup()
        resume(result)
      }
      const refuse = (event: "disconnect" | "invalid") => {
        if (transition(event) === "exit") finish(Effect.fail(retired()))
      }
      const removeMessage = port.onMessage((message) => {
        if (state !== "prepared") return
        const decoded = Effect.runSyncExit(parseChildStart(message))
        if (Exit.isFailure(decoded) || Redacted.value(decoded.value.nonce) !== Redacted.value(nonce)) {
          refuse("invalid")
          return
        }
        if (transition("start") === "claim") finish(Effect.succeed(decoded.value))
      })
      const removeDisconnect = port.onDisconnect(() => refuse("disconnect"))
      port.send(prepared, () => refuse("invalid"))
      return Effect.sync(cleanup)
    }
  )
  const deadline = Effect.sleep(PREPARED_CHILD_MILLIS).pipe(
    Effect.andThen(Effect.suspend(() => (transition("timeout") === "exit" ? Effect.fail(retired()) : Effect.never)))
  )
  return yield* Effect.raceFirst(authorized, deadline)
})
