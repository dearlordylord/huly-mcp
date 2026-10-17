import "../polyfills.js"
import { NodeRuntime, NodeStdio } from "@effect/platform-node"
import { Effect, Schema } from "effect"

import { CliProfileStoreError } from "../profiles/model.js"
import { withAdapterAttachment } from "./adapter-attachment.js"
import { readResidentAttachment } from "./attachment-file.js"
import { ManagedExecutable, ManagedLaunchError } from "./managed-contract.js"
import { runAdapterBridge } from "./manual-adapter.js"
import { launchManagedChild } from "./managed-process.js"
import { prepareManagedDirectory, withResidentSelection } from "./managed-selection.js"
import { resolveManagedStartup } from "./startup-selection.js"
import { makeStartupBudget } from "./startup-budget.js"

const main = Effect.gen(function* () {
  const environment = { ...process.env }
  const startup = yield* makeStartupBudget
  const selected = yield* startup.within(resolveManagedStartup(environment))
  if (selected.kind === "local") {
    const { main: local } = yield* Effect.promise(() => import("../runtime/server-startup.js"))
    return yield* local
  }
  const capture = selected.capture
  const directory = yield* startup.within(prepareManagedDirectory)
  const executable = yield* Schema.decodeUnknownEffect(ManagedExecutable)({
    executable: process.execPath,
    packageFile: process.argv[1]
  })
  yield* withResidentSelection({
    directory,
    capture,
    startup,
    existing: (_file, exchange) => runAdapterBridge(exchange),
    absent: (ownership) =>
      Effect.gen(function* () {
        const file = yield* launchManagedChild({
          executable,
          capture,
          directory,
          environment,
          startup,
          authorize: ownership.release
        })
        const attachment = yield* startup.within(readResidentAttachment(file))
        yield* withAdapterAttachment(attachment, runAdapterBridge, capture.selection, startup)
      })
  })
}).pipe(
  Effect.provide(NodeStdio.layer),
  Effect.mapError((error) =>
    error instanceof ManagedLaunchError || error instanceof CliProfileStoreError
      ? error
      : new ManagedLaunchError({
          reason: "unavailable",
          message: "Managed resident attachment failed; inspect private startup state. No request was replayed."
        })
  ),
  Effect.tapError((error) => Effect.sync(() => process.stderr.write(`${error.message}\n`)))
)

NodeRuntime.runMain(main, { disableErrorReporting: true })
