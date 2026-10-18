import "../../../src/polyfills.js"
import { Deferred, Effect, Logger, Queue, Ref, Schema } from "effect"
import { TestClock } from "effect/testing"

import type { ToolRegistry } from "../../../src/mcp/tools/index.js"
import { defineTool } from "../../../src/mcp/tools/registry.js"
import { DEFAULT_LEASE_POLICY } from "../../../src/resident/admission-contract.js"
import { MANAGED_IDLE_MILLIS } from "../../../src/resident/managed-contract.js"
import { ResidentDirectory } from "../../../src/resident/protected-path.js"
import { captureResidentSelection } from "../../../src/resident/selection-config.js"
import { runManagedFaultBackend } from "../../helpers/managed-fault-backend.js"
import { IDLE_WORK_TOOL, IdleWorkCommand, IdleWorkEvent } from "../idle-work-observation.js"

const COMMAND_CAPACITY = 3
const EXPIRY_IDLE_INTERVALS = 2
const LAST_IDLE_STEP = 100
const emit = (event: Schema.Schema.Type<typeof IdleWorkEvent>) =>
  Schema.encodeEffect(Schema.fromJsonString(IdleWorkEvent))(event).pipe(
    Effect.orDie,
    Effect.flatMap((line) => Effect.sync(() => process.stdout.write(`${line}\n`)))
  )
const main = Effect.gen(function* () {
  const directory = yield* Schema.decodeUnknownEffect(ResidentDirectory)(process.argv[2])
  const capture = yield* captureResidentSelection({ ...process.env })
  const release = yield* Deferred.make<void>()
  const commands =
    yield* Queue.bounded<Exclude<Schema.Schema.Type<typeof IdleWorkCommand>, "release">>(COMMAND_CAPACITY)
  const receive = (raw: unknown) => {
    const command = Schema.decodeUnknownSync(IdleWorkCommand)(raw)
    if (command === "release") Effect.runSync(Deferred.succeed(release, undefined))
    else if (!Queue.offerUnsafe(commands, command)) throw new Error("Idle work command capacity exceeded")
  }
  yield* Effect.acquireRelease(
    Effect.sync(() => process.on("message", receive)),
    () => Effect.sync(() => process.off("message", receive))
  )
  yield* Effect.forever(
    Effect.gen(function* () {
      const command = yield* Queue.take(commands)
      const millis =
        command === "expire"
          ? DEFAULT_LEASE_POLICY.durationMillis + MANAGED_IDLE_MILLIS * EXPIRY_IDLE_INTERVALS
          : command === "almost-idle"
            ? MANAGED_IDLE_MILLIS - LAST_IDLE_STEP
            : LAST_IDLE_STEP
      yield* TestClock.adjust(millis)
      if (command !== "retire") yield* emit({ kind: "advanced", phase: command })
    })
  ).pipe(Effect.forkScoped)
  const dispatches = yield* Ref.make(0)
  const tool = defineTool(
    {
      name: IDLE_WORK_TOOL,
      description: "Hold one synthetic request and its cancellation cleanup.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      resultSchema: Schema.Struct({}),
      category: "test"
    },
    Schema.decodeUnknownEffect(Schema.Struct({})),
    () =>
      Ref.update(dispatches, (count) => count + 1).pipe(
        Effect.andThen(emit({ kind: "started" })),
        Effect.andThen(Effect.never),
        Effect.ensuring(
          emit({ kind: "cleaning" }).pipe(
            Effect.andThen(Deferred.await(release)),
            Effect.andThen(emit({ kind: "cleaned" }))
          )
        )
      )
  )
  const registry: ToolRegistry = {
    tools: new Map([[tool.name, tool]]),
    definitions: [tool],
    handleToolCall: (name, args, huly, storage, workspace) =>
      name === tool.name ? tool.handler(args, huly, storage, workspace) : Promise.resolve(null)
  }
  yield* runManagedFaultBackend({
    directory,
    capture,
    registry,
    close: () => Promise.resolve(),
    onReady: (attachment) => emit({ kind: "ready", generation: attachment.identity.generation })
  })
  const count = yield* Schema.decodeUnknownEffect(Schema.Literal(1))(yield* Ref.get(dispatches))
  yield* emit({ kind: "retired", dispatches: count })
}).pipe(Effect.scoped, Effect.provide(TestClock.layer()), Effect.provideService(Logger.LogToStderr, true))

void Effect.runPromise(main)
  .catch(() => {
    process.stderr.write("Managed idle work backend failed\n")
    process.exitCode = 1
  })
  .finally(() => process.disconnect?.())
