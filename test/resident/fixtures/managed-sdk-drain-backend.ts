import "../../../src/polyfills.js"
import { NodeRuntime } from "@effect/platform-node"
import { channel } from "node:diagnostics_channel"
import { Effect, Schema } from "effect"

import { runConfiguredResidentServer } from "../../../src/runtime/server-startup.js"
import { runOwnedGeneration, withResidentSelection } from "../../../src/resident/managed-selection.js"
import { ResidentDirectory } from "../../../src/resident/protected-path.js"
import { captureResidentSelection } from "../../../src/resident/selection-config.js"
import { makeStartupBudget } from "../../../src/resident/startup-budget.js"
import { HTTP_ADMISSION_CHANNEL, HttpAdmissionObservationSchema } from "../../../src/mcp/http-admission-observations.js"

NodeRuntime.runMain(
  Effect.gen(function* () {
    yield* Effect.acquireRelease(
      Effect.sync(() => {
        const observations = channel(HTTP_ADMISSION_CHANNEL)
        const listener = (input: unknown) => {
          const event = Schema.decodeUnknownSync(HttpAdmissionObservationSchema)(input)
          if (event._tag === "ResidentAdmissions_drainStarted")
            process.stderr.write(`${Schema.encodeSync(Schema.fromJsonString(HttpAdmissionObservationSchema))(event)}\n`)
        }
        observations.subscribe(listener)
        return () => observations.unsubscribe(listener)
      }),
      (unsubscribe) => Effect.sync(unsubscribe)
    )
    const environment = { ...process.env }
    const directory = yield* Schema.decodeUnknownEffect(ResidentDirectory)(environment["MCP_RESIDENT_STATE_DIRECTORY"])
    const capture = yield* captureResidentSelection(environment)
    const startup = yield* makeStartupBudget
    yield* withResidentSelection({
      directory,
      capture,
      startup,
      existing: () => Effect.die("Drain fault backend requires its own generation"),
      absent: (ownership) =>
        runOwnedGeneration(ownership, (ready) =>
          runConfiguredResidentServer({
            directory,
            capture,
            environment,
            startup,
            lifetime: "managed",
            report: (file) =>
              ready(file).pipe(
                Effect.andThen(Effect.sync(() => process.stderr.write(`Resident attachment: ${file}\n`)))
              )
          })
        )
    })
  }).pipe(Effect.scoped)
)
