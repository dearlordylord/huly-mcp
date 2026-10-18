import "../../../src/polyfills.js"
import { Effect, Logger, Queue, Schema } from "effect"
import { TestClock } from "effect/testing"

import { readResidentAttachment } from "../../../src/resident/attachment-file.js"
import { runOwnedGeneration, withResidentSelection } from "../../../src/resident/managed-selection.js"
import { ResidentDirectory } from "../../../src/resident/protected-path.js"
import { captureResidentSelection } from "../../../src/resident/selection-config.js"
import { makeStartupBudget } from "../../../src/resident/startup-budget.js"
import { runConfiguredResidentServer } from "../../../src/runtime/server-startup.js"
import { IdleClockCommand, IdleClockEvent } from "../idle-clock-observation.js"

const CLOCK_ADVANCE = { near: 4_900, protected: 5_000, released: 4_900, retire: 100 }
const COMMAND_CAPACITY = 4
const emit = (event: Schema.Schema.Type<typeof IdleClockEvent>) =>
  Schema.encodeEffect(Schema.fromJsonString(IdleClockEvent))(event).pipe(
    Effect.orDie,
    Effect.flatMap((line) => Effect.sync(() => process.stdout.write(`${line}\n`)))
  )
const main = Effect.gen(function* () {
  const directory = yield* Schema.decodeUnknownEffect(ResidentDirectory)(process.argv[2])
  const environment = { ...process.env }
  const capture = yield* captureResidentSelection(environment)
  const commands = yield* Queue.bounded<Schema.Schema.Type<typeof IdleClockCommand>>(COMMAND_CAPACITY)
  const receive = (raw: unknown) => {
    const command = Schema.decodeUnknownSync(IdleClockCommand)(raw)
    if (!Queue.offerUnsafe(commands, command)) throw new Error("Idle clock command capacity exceeded")
  }
  yield* Effect.acquireRelease(
    Effect.sync(() => process.on("message", receive)),
    () => Effect.sync(() => process.off("message", receive))
  )
  yield* Effect.forever(
    Effect.gen(function* () {
      const command = yield* Queue.take(commands)
      yield* TestClock.adjust(CLOCK_ADVANCE[command.phase])
      yield* emit({ kind: "advanced", phase: command.phase })
    })
  ).pipe(Effect.forkScoped)
  const startup = yield* makeStartupBudget
  yield* withResidentSelection({
    directory,
    capture,
    startup,
    existing: () => Effect.die("Clock backend must own a new generation"),
    absent: (ownership) =>
      runOwnedGeneration(ownership, (ready) =>
        runConfiguredResidentServer({
          directory,
          capture,
          environment,
          lifetime: "managed",
          startup,
          report: (file) =>
            ready(file).pipe(
              Effect.andThen(readResidentAttachment(file)),
              Effect.flatMap((attachment) => emit({ kind: "ready", generation: attachment.identity.generation }))
            )
        })
      )
  })
}).pipe(Effect.scoped, Effect.provide(TestClock.layer()), Effect.provideService(Logger.LogToStderr, true))

void Effect.runPromise(main)
  .catch(() => {
    process.stderr.write("Managed idle clock backend failed\n")
    process.exitCode = 1
  })
  .finally(() => process.disconnect?.())
