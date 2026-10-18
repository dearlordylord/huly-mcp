import "../../../src/polyfills.js"
import { Deferred, Effect, Logger, Schema } from "effect"
import { TestClock } from "effect/testing"

import type { ToolRegistry } from "../../../src/mcp/tools/index.js"
import { MANAGED_IDLE_MILLIS } from "../../../src/resident/managed-contract.js"
import { ResidentDirectory } from "../../../src/resident/protected-path.js"
import { captureResidentSelection } from "../../../src/resident/selection-config.js"
import { runManagedFaultBackend } from "../../helpers/managed-fault-backend.js"
import { IdleFenceCommand, IdleFenceEvent } from "../idle-fence-observation.js"

const emit = (event: Schema.Schema.Type<typeof IdleFenceEvent>) =>
  Schema.encodeEffect(Schema.fromJsonString(IdleFenceEvent))(event).pipe(
    Effect.orDie,
    Effect.flatMap((line) => Effect.sync(() => process.stdout.write(`${line}\n`)))
  )
const main = Effect.gen(function* () {
  const directory = yield* Schema.decodeUnknownEffect(ResidentDirectory)(process.argv[2])
  const capture = yield* captureResidentSelection({ ...process.env })
  const retire = yield* Deferred.make<void>()
  const release = yield* Deferred.make<void>()
  const receive = (raw: unknown) => {
    const command = Schema.decodeUnknownSync(IdleFenceCommand)(raw)
    Effect.runSync(Deferred.succeed(command === "retire" ? retire : release, undefined))
  }
  yield* Effect.acquireRelease(
    Effect.sync(() => process.on("message", receive)),
    () => Effect.sync(() => process.off("message", receive))
  )
  yield* Deferred.await(retire).pipe(Effect.andThen(TestClock.adjust(MANAGED_IDLE_MILLIS)), Effect.forkScoped)
  const registry: ToolRegistry = { tools: new Map(), definitions: [], handleToolCall: () => Promise.resolve(null) }
  yield* runManagedFaultBackend({
    directory,
    capture,
    registry,
    onReady: (attachment) => emit({ kind: "ready", generation: attachment.identity.generation }),
    close: () => Effect.runPromise(emit({ kind: "closing" }).pipe(Effect.andThen(Deferred.await(release))))
  })
}).pipe(Effect.scoped, Effect.provide(TestClock.layer()), Effect.provideService(Logger.LogToStderr, true))

void Effect.runPromise(main)
  .catch(() => {
    process.stderr.write("Managed idle fence backend failed\n")
    process.exitCode = 1
  })
  .finally(() => process.disconnect?.())
