import "../polyfills.js"
import { NodeRuntime } from "@effect/platform-node"
import { Config, Effect, Redacted } from "effect"

import { VERSION } from "../version.js"
import { encodeChildReply } from "./bootstrap-codec.js"
import { awaitChildAuthorization, type ChildAuthorizationPort } from "./child-authorization.js"
import { BootstrapNonce, ManagedLaunchError, MANAGED_PACKAGE_NAME } from "./managed-contract.js"
import { runOwnedGeneration, withResidentSelection } from "./managed-selection.js"
import type { ResidentFilePath } from "./protected-path.js"
import { makeStartupBudget } from "./startup-budget.js"

const main = Effect.gen(function* () {
  const environment = { ...process.env }
  const send = process.send?.bind(process)
  if (send === undefined || !process.connected)
    return yield* new ManagedLaunchError({
      reason: "ipc",
      message: "Resident child requires its private parent channel"
    })
  const port: ChildAuthorizationPort = {
    onMessage: (listener) => {
      process.on("message", listener)
      return () => {
        process.removeListener("message", listener)
      }
    },
    onDisconnect: (listener) => {
      process.on("disconnect", listener)
      return () => {
        process.removeListener("disconnect", listener)
      }
    },
    send: (frame, failed) => {
      try {
        send(Redacted.value(frame), (error) => {
          if (error !== null) failed()
        })
      } catch {
        failed()
      }
    }
  }
  const nonce = yield* Config.schema(BootstrapNonce, "MCP_RESIDENT_BOOTSTRAP_NONCE")
  const prepared = yield* encodeChildReply({
    kind: "prepared",
    version: 1,
    implementation: { name: MANAGED_PACKAGE_NAME, version: VERSION },
    nonce
  })
  const start = yield* awaitChildAuthorization(port, nonce, prepared)
  const startup = yield* makeStartupBudget
  const notify = (file: ResidentFilePath) =>
    encodeChildReply({ kind: "ready", version: 1, file }).pipe(
      Effect.tap((frame) => Effect.sync(() => port.send(frame, () => {}))),
      Effect.asVoid
    )
  yield* withResidentSelection({
    directory: start.directory,
    capture: start.capture,
    startup,
    existing: (file) => notify(file),
    absent: (ownership) =>
      runOwnedGeneration(ownership, (ready) =>
        Effect.gen(function* () {
          const { runConfiguredResidentServer } = yield* Effect.promise(() => import("../runtime/server-startup.js"))
          return yield* runConfiguredResidentServer({
            capture: start.capture,
            directory: start.directory,
            environment,
            lifetime: "managed",
            startup,
            report: (file) => ready(file).pipe(Effect.andThen(notify(file)))
          })
        })
      )
  })
}).pipe(
  Effect.mapError(
    () =>
      new ManagedLaunchError({
        reason: "ipc",
        message: "Managed resident child failed; unresolved ownership must be inspected before replacement"
      })
  ),
  Effect.tapError(() =>
    Effect.sync(() => process.stderr.write("Managed resident child failed; no request was replayed\n"))
  )
)

NodeRuntime.runMain(main, { disableErrorReporting: true })
