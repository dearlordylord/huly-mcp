import "../../../src/polyfills.js"
import { NodeRuntime } from "@effect/platform-node"
import { Effect, Schema } from "effect"

import { ManagedExecutable, ResidentPackagePath } from "../../../src/resident/managed-contract.js"
import { withResidentSelection } from "../../../src/resident/managed-selection.js"
import { launchManagedChild } from "../../../src/resident/managed-process.js"
import { ResidentDirectory } from "../../../src/resident/protected-path.js"
import { captureResidentSelection } from "../../../src/resident/selection-config.js"
import { makeStartupBudget } from "../../../src/resident/startup-budget.js"

const Input = Schema.Struct({ child: ResidentPackagePath, directory: ResidentDirectory, markers: ResidentDirectory })
const main = Effect.gen(function* () {
  const input = yield* Schema.decodeUnknownEffect(Input)({
    child: process.argv[2],
    directory: process.argv[3],
    markers: process.argv[4]
  })
  const capture = yield* captureResidentSelection({ ...process.env })
  const startup = yield* makeStartupBudget
  const executable = yield* Schema.decodeUnknownEffect(ManagedExecutable)({
    executable: process.execPath,
    packageFile: input.child
  })
  yield* withResidentSelection({
    directory: input.directory,
    capture,
    startup,
    existing: () => Effect.die("Authorized launch must own a new startup"),
    absent: (ownership) =>
      launchManagedChild({
        executable,
        capture,
        directory: input.directory,
        startup,
        authorize: ownership.release,
        environment: { ...process.env, RESIDENT_TEST_DIRECTORY: input.markers }
      })
  })
})
NodeRuntime.runMain(main, { disableErrorReporting: true })
