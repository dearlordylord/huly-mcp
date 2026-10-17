import "../../../src/polyfills.js"
import * as fs from "node:fs/promises"
import { ConfigProvider, Context, Deferred, Effect, Exit, Layer, Logger, Ref, Schema } from "effect"

import { HulyClient } from "../../../src/huly/client.js"
import { HulyError } from "../../../src/huly/errors.js"
import { HulyStorageClient } from "../../../src/huly/storage.js"
import { McpServerService } from "../../../src/mcp/server.js"
import type { ToolRegistry } from "../../../src/mcp/tools/index.js"
import { defineTool } from "../../../src/mcp/tools/registry.js"
import { makeManualResidentBackend } from "../../../src/resident/manual-backend.js"
import { runOwnedGeneration, withResidentSelection } from "../../../src/resident/managed-selection.js"
import { ResidentDirectory, ResidentFilePath } from "../../../src/resident/protected-path.js"
import { captureResidentSelection } from "../../../src/resident/selection-config.js"
import { makeStartupBudget } from "../../../src/resident/startup-budget.js"
import { closeResidentClients } from "../../../src/runtime/server-startup.js"
import { TelemetryService } from "../../../src/telemetry/telemetry.js"
import { StopFaultCommand, StopFaultEvent, StopFaultMode, StopFaultState } from "../stop-fault-observation.js"
import { readResidentAttachment } from "../../../src/resident/attachment-file.js"

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
  const outcome = yield* withResidentSelection({
    directory: input.directory,
    capture,
    startup: yield* makeStartupBudget,
    existing: () => Effect.die("Fault backend must own its new generation"),
    absent: (ownership) =>
      runOwnedGeneration(ownership, (ready) =>
        Effect.gen(function* () {
          const backend = yield* makeManualResidentBackend({
            mode: "configured",
            lifetime: "managed",
            selection: capture.selection,
            startup: yield* makeStartupBudget
          })
          const clients = yield* Layer.build(Layer.merge(HulyClient.testLayer({}), HulyStorageClient.testLayer({})))
          const bundle = {
            hulyClient: Context.get(clients, HulyClient),
            storageClient: Context.get(clients, HulyStorageClient)
          }
          const close = () =>
            input.mode === "failed-cleanup"
              ? Promise.reject(new Error("fixture-private-close-cause"))
              : Promise.resolve()
          yield* Effect.gen(function* () {
            const server = yield* McpServerService
            yield* backend.run(server, (file) =>
              ready(file).pipe(
                Effect.andThen(readResidentAttachment(file)),
                Effect.flatMap((attachment) => emit({ kind: "ready", generation: attachment.identity.generation }))
              )
            )
          }).pipe(
            Effect.provide(
              McpServerService.layer({
                transport: "http",
                httpHost: "127.0.0.1",
                httpPort: 0,
                registry,
                mcpAuthToken: backend.authorization,
                ...backend.httpPolicy,
                resolveClients: async () => Exit.succeed(bundle),
                getRuntimeConfigContext: () => capture.runtimeContext,
                closeClients: () =>
                  Effect.runPromise(backend.beforeClientsClose.pipe(Effect.andThen(closeResidentClients(close))))
              }).pipe(Layer.provide(TelemetryService.testLayer({})))
            ),
            Effect.scoped
          )
        }).pipe(Effect.scoped)
      )
  }).pipe(
    Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({ MCP_RESIDENT_STATE_DIRECTORY: input.directory }))),
    Effect.exit
  )
  yield* emit({ kind: Exit.isSuccess(outcome) ? "retired" : "retained", dispatches: yield* Ref.get(calls) })
  if (Exit.isFailure(outcome)) process.exitCode = 1
}).pipe(Effect.scoped, Effect.provideService(Logger.LogToStderr, true))

void Effect.runPromise(main)
  .catch(() => {
    process.stderr.write("Managed stop fault backend failed\n")
    process.exitCode = 1
  })
  .finally(() => process.disconnect?.())
