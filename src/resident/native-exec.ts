import * as NodeRuntime from "@effect/platform-node/NodeRuntime"
import * as NodeStdio from "@effect/platform-node/NodeStdio"
import { Clock, Effect } from "effect"
import { ConfigValidationError } from "../config/config.js"

import { runProfileStartupDiagnostic } from "../profiles/startup-diagnostic.js"
import { nativeBridgeFailure, NATIVE_STARTUP_MILLIS } from "./native-contract.js"
import { nativeExecutableFor } from "./native-availability.js"
import { makeStartupBudget } from "./startup-budget.js"
import { resolveManagedStartup } from "./startup-selection.js"

const NANOS_PER_MILLISECOND = 1_000_000

export const startNativeResident = () => {
  const main = Effect.gen(function* () {
    const execute = process.execve?.bind(process)
    const packageFile = process.argv[1]
    const executable =
      packageFile === undefined
        ? undefined
        : nativeExecutableFor({
            platform: process.platform,
            architecture: process.arch,
            packageFile,
            execveAvailable: execute !== undefined
          })
    if (executable === undefined || execute === undefined || packageFile === undefined) {
      process.stderr.write("Native resident bridge unavailable; starting ordinary stdio\n")
      const { main: local } = yield* Effect.promise(() => import("../runtime/server-startup.js"))
      return yield* local
    }
    const started = yield* Clock.monotonicTimeNanos
    const startup = yield* makeStartupBudget
    const selected = yield* startup.within(resolveManagedStartup({ ...process.env }, process.platform))
    if (selected.kind === "local") {
      const { main: local } = yield* Effect.promise(() => import("../runtime/server-startup.js"))
      return yield* local
    }
    const elapsed = Number((yield* Clock.monotonicTimeNanos) - started) / NANOS_PER_MILLISECOND
    const remaining = Math.floor(NATIVE_STARTUP_MILLIS - elapsed)
    if (remaining <= 0) return yield* nativeBridgeFailure()
    return yield* Effect.try({
      try: () => execute(executable, [executable, process.execPath, packageFile, String(remaining)], process.env),
      catch: nativeBridgeFailure
    })
  }).pipe(
    Effect.catchTag("CliProfileStoreError", (error) => runProfileStartupDiagnostic(error, PKG_VERSION)),
    Effect.provide(NodeStdio.layer),
    Effect.tapError((error) =>
      Effect.sync(() =>
        process.stderr.write(
          `${
            error instanceof ConfigValidationError
              ? error.message
              : "Native resident startup failed; use ordinary stdio if the native executable is unavailable"
          }\n`
        )
      )
    )
  )
  NodeRuntime.runMain(main, { disableErrorReporting: true })
}
