import "../../../src/polyfills.js"
import * as fs from "node:fs/promises"
import { Deferred, Effect, Exit, Logger, Ref, Schema } from "effect"

import { HulyError } from "../../../src/huly/errors.js"
import type { ToolRegistry } from "../../../src/mcp/tools/index.js"
import { defineTool } from "../../../src/mcp/tools/registry.js"
import { ResidentDirectory, ResidentFilePath } from "../../../src/resident/protected-path.js"
import { captureResidentSelection } from "../../../src/resident/selection-config.js"
import { StopFaultCommand, StopFaultEvent, StopFaultMode, StopFaultState } from "../stop-fault-observation.js"

import { runManagedFaultBackend } from "../../helpers/managed-fault-backend.js"

const Input = Schema.Struct({ directory: ResidentDirectory, state: ResidentFilePath, mode: StopFaultMode })
const EmptyParams = Schema.Struct({})
const emit = (event: StopFaultEvent) =>
  Schema.encodeEffect(Schema.fromJsonString(StopFaultEvent))(event).pipe(
    Effect.orDie,
    Effect.flatMap((line) =>
      Effect.sync(() => {
        process.stdout.write(`${line}\n`)
      })
    )
  )
const main = Effect.gen(function* () {
  const input = yield* Schema.decodeUnknownEffect(Input)({
    directory: process.argv[2],
    state: process.argv[3],
    mode: process.argv[4]
  })
  const capture = yield* captureResidentSelection({ ...process.env })
  const cleanup = yield* Deferred.make<void>()
  const response = yield* Deferred.make<void>()
  const calls = yield* Ref.make(0)
  const receive = (raw: unknown) => {
    Schema.decodeUnknownSync(StopFaultCommand)(raw)
    Effect.runSync(Deferred.succeed(cleanup, undefined))
  }
  yield* Effect.acquireRelease(
    Effect.sync(() => {
      process.on("message", receive)
    }),
    () =>
      Effect.sync(() => {
        process.off("message", receive)
      })
  )
  const tool = defineTool(
    {
      name: "fixture_increment",
      description: "Commit one disposable fixture write and hold its response and cleanup.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      resultSchema: StopFaultState,
      category: "test"
    },
    Schema.decodeUnknownEffect(EmptyParams),
    () =>
      Effect.gen(function* () {
        yield* Ref.update(calls, (count) => count + 1)
        const encoded = yield* Schema.encodeEffect(Schema.fromJsonString(StopFaultState))({ writes: 1 }).pipe(
          Effect.orDie
        )
        yield* Effect.tryPromise({
          try: () => fs.writeFile(input.state, encoded, { mode: 0o600, flag: "wx" }),
          catch: () => new HulyError({ message: "Disposable fixture write failed" })
        })
        yield* emit({ kind: "committed" })
        yield* Deferred.await(response)
        return StopFaultState.make({ writes: 1 })
      }).pipe(Effect.ensuring(emit({ kind: "cleaning" }).pipe(Effect.andThen(Deferred.await(cleanup)))))
  )
  const registry: ToolRegistry = {
    tools: new Map([[tool.name, tool]]),
    definitions: [tool],
    handleToolCall: (name, args, hulyClient, storageClient, workspaceClient) =>
      name === tool.name ? tool.handler(args, hulyClient, storageClient, workspaceClient) : Promise.resolve(null)
  }
  const outcome = yield* runManagedFaultBackend({
    directory: input.directory,
    capture,
    registry,
    close: () =>
      input.mode === "failed-cleanup" ? Promise.reject(new Error("fixture-private-close-cause")) : Promise.resolve(),
    onReady: (attachment) => emit({ kind: "ready", generation: attachment.identity.generation })
  }).pipe(Effect.exit)
  yield* emit({ kind: Exit.isSuccess(outcome) ? "retired" : "retained", dispatches: yield* Ref.get(calls) })
  if (Exit.isFailure(outcome)) process.exitCode = 1
}).pipe(Effect.scoped, Effect.provideService(Logger.LogToStderr, true))

void Effect.runPromise(main)
  .catch(() => {
    process.stderr.write("Managed stop fault backend failed\n")
    process.exitCode = 1
  })
  .finally(() => process.disconnect?.())
