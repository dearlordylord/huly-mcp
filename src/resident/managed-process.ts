import { spawn, type ChildProcess } from "node:child_process"
import { randomBytes } from "node:crypto"
import { Effect, Redacted, Result, Schema } from "effect"

import { VERSION } from "../version.js"
import { encodeChildStart, parseChildReply } from "./bootstrap-codec.js"
import {
  BootstrapNonce,
  type ChildReply,
  type ManagedExecutable,
  ManagedLaunchError,
  MANAGED_BOOTSTRAP_VERSION,
  MANAGED_FAILURE_CLEANUP_MILLIS,
  type ResidentStartupCapture
} from "./managed-contract.js"
import { parseManagedChildEnvironment } from "./managed-child-environment.js"
import type { AcquiredSelectionClaim, SelectionClaimError } from "./selection-claim.js"
import type { StartupBudget } from "./startup-budget.js"

const ipcFailure = () =>
  new ManagedLaunchError({
    reason: "ipc",
    message: "Resident child startup failed before authenticated readiness; no request was dispatched or replayed"
  })

const NONCE_BYTES = 32

const waitForReply = <A>(
  child: ChildProcess,
  accept: (reply: ChildReply) => Effect.Effect<A, ManagedLaunchError>,
  initiate: (fail: (error: ManagedLaunchError | SelectionClaimError) => void) => void = () => {}
) =>
  Effect.callback<A, ManagedLaunchError | SelectionClaimError>((resume) => {
    const cleanup = () => {
      child.removeListener("message", message)
      child.removeListener("error", fail)
      child.removeListener("exit", fail)
      child.removeListener("disconnect", fail)
    }
    const finish = (result: Effect.Effect<A, ManagedLaunchError | SelectionClaimError>) => {
      cleanup()
      resume(result)
    }
    const fail = () => finish(Effect.fail(ipcFailure()))
    const message = (input: unknown) => finish(parseChildReply(input).pipe(Effect.flatMap(accept)))
    child.on("message", message)
    child.on("error", fail)
    child.on("exit", fail)
    child.on("disconnect", fail)
    if (child.exitCode !== null || child.signalCode !== null || !child.connected) fail()
    else initiate((error) => finish(Effect.fail(error)))
    return Effect.sync(cleanup)
  })

const preparedMatches = (frame: ChildReply, nonce: BootstrapNonce) =>
  frame.kind === "prepared" &&
  frame.implementation.version === VERSION &&
  Redacted.value(frame.nonce) === Redacted.value(nonce)

export const launchManagedChild = Effect.fn("launchManagedChild")(function* (options: {
  readonly executable: ManagedExecutable
  readonly capture: ResidentStartupCapture
  readonly claim: AcquiredSelectionClaim
  readonly environment: NodeJS.ProcessEnv
  readonly startup: StartupBudget
}) {
  const nonce = yield* Effect.sync(() => randomBytes(NONCE_BYTES).toString("hex")).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(BootstrapNonce)),
    Effect.mapError(ipcFailure)
  )
  const start = yield* encodeChildStart({
    kind: "start",
    version: MANAGED_BOOTSTRAP_VERSION,
    nonce,
    directory: options.claim.directory,
    capture: options.capture,
    claim: options.claim.transferProof
  })
  const environment = yield* parseManagedChildEnvironment(options.environment, nonce)
  return yield* Effect.acquireUseRelease(
    Effect.try({
      try: () => ({
        child: spawn(options.executable.executable, [options.executable.packageFile], {
          detached: true,
          stdio: ["ignore", "ignore", "ignore", "ipc"],
          env: Object.fromEntries(Object.entries(environment).map(([key, value]) => [key, Redacted.value(value)]))
        }),
        startAttempted: false
      }),
      catch: ipcFailure
    }),
    (owned) =>
      Effect.gen(function* () {
        yield* options.startup.within(
          waitForReply(owned.child, (frame) =>
            preparedMatches(frame, nonce) ? Effect.void : Effect.fail(ipcFailure())
          )
        )
        return yield* options.startup.within(
          waitForReply(
            owned.child,
            (frame) => (frame.kind === "ready" ? Effect.succeed(frame.file) : Effect.fail(ipcFailure())),
            (fail) => {
              const transferred = options.claim.transferTo(() => {
                owned.startAttempted = true
                try {
                  owned.child.send(Redacted.value(start), (error) => {
                    if (error !== null) fail(ipcFailure())
                  })
                } catch {
                  fail(ipcFailure())
                }
              })
              if (Result.isFailure(transferred)) fail(transferred.failure)
            }
          )
        )
      }),
    (owned) =>
      Effect.gen(function* () {
        const child = owned.child
        const detach = Effect.try({
          try: () => {
            if (child.connected) child.disconnect()
            child.channel?.unref()
            child.unref()
          },
          catch: ipcFailure
        })
        if (owned.startAttempted || child.pid === undefined || child.exitCode !== null || child.signalCode !== null) {
          yield* detach
          return
        }
        yield* Effect.callback<void, ManagedLaunchError>((resume) => {
          const cleanup = () => {
            child.removeListener("exit", exited)
            child.removeListener("error", failed)
          }
          const finish = (result: Effect.Effect<void, ManagedLaunchError>) => {
            cleanup()
            resume(result)
          }
          const exited = () => finish(Effect.void)
          const failed = () => finish(Effect.fail(ipcFailure()))
          child.once("exit", exited)
          child.once("error", failed)
          try {
            if (child.exitCode !== null || child.signalCode !== null) exited()
            else child.kill("SIGKILL")
          } catch {
            failed()
          }
          return Effect.sync(cleanup)
        }).pipe(
          Effect.interruptible,
          Effect.timeoutOrElse({
            duration: MANAGED_FAILURE_CLEANUP_MILLIS,
            orElse: () =>
              Effect.fail(
                new ManagedLaunchError({
                  reason: "retirement",
                  message: "Prepared resident child termination was not confirmed"
                })
              )
          })
        )
        yield* detach
      })
  )
})
