import { spawn, type ChildProcess } from "node:child_process"
import { randomBytes } from "node:crypto"
import { Effect, Redacted, Schema } from "effect"

import { ProfileEnvironmentSchema } from "../profiles/model.js"
import { VERSION } from "../version.js"
import { encodeChildStart, parseChildReply } from "./bootstrap-codec.js"
import {
  BootstrapNonce,
  type ChildReply,
  type ManagedExecutable,
  ManagedLaunchError,
  MANAGED_FAILURE_CLEANUP_MILLIS,
  type ResidentStartupCapture
} from "./managed-contract.js"
import type { ResidentDirectory } from "./protected-path.js"
import type { SelectionClaimError } from "./selection-claim.js"
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
  initiate: (fail: () => void) => void = () => {}
) =>
  Effect.callback<A, ManagedLaunchError>((resume) => {
    const cleanup = () => {
      child.removeListener("message", message)
      child.removeListener("error", fail)
      child.removeListener("exit", fail)
      child.removeListener("disconnect", fail)
    }
    const finish = (result: Effect.Effect<A, ManagedLaunchError>) => {
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
    else initiate(fail)
    return Effect.sync(cleanup)
  })

const preparedMatches = (frame: ChildReply, nonce: BootstrapNonce) =>
  frame.kind === "prepared" &&
  frame.implementation.version === VERSION &&
  Redacted.value(frame.nonce) === Redacted.value(nonce)

export const launchManagedChild = Effect.fn("launchManagedChild")(function* (options: {
  readonly executable: ManagedExecutable
  readonly capture: ResidentStartupCapture
  readonly directory: ResidentDirectory
  readonly environment: NodeJS.ProcessEnv
  readonly startup: StartupBudget
  readonly authorize: Effect.Effect<void, SelectionClaimError>
}) {
  const nonce = yield* Effect.sync(() => randomBytes(NONCE_BYTES).toString("hex")).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(BootstrapNonce)),
    Effect.mapError(ipcFailure)
  )
  const start = yield* encodeChildStart({
    kind: "start",
    version: 1,
    nonce,
    directory: options.directory,
    capture: options.capture
  })
  const environment = { ...options.environment }
  for (const key of Object.keys(ProfileEnvironmentSchema.fields)) delete environment[key]
  delete environment["MCP_AUTH_TOKEN"]
  environment["MCP_TRANSPORT"] = "resident-child"
  environment["MCP_RESIDENT_BOOTSTRAP_NONCE"] = Redacted.value(nonce)
  return yield* Effect.acquireUseRelease(
    Effect.try({
      try: () => ({
        child: spawn(options.executable.executable, [options.executable.packageFile], {
          detached: true,
          stdio: ["ignore", "ignore", "ignore", "ipc"],
          env: environment
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
        yield* options.startup.within(options.authorize)
        return yield* options.startup.within(
          waitForReply(
            owned.child,
            (frame) => (frame.kind === "ready" ? Effect.succeed(frame.file) : Effect.fail(ipcFailure())),
            (fail) => {
              owned.startAttempted = true
              try {
                owned.child.send(Redacted.value(start), (error) => {
                  if (error !== null) fail()
                })
              } catch {
                fail()
              }
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
