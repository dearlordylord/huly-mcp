import { ConfigProvider, Context, Effect, Exit, Layer } from "effect"

import { HulyClient } from "../../src/huly/client.js"
import { HulyStorageClient } from "../../src/huly/storage.js"
import { McpServerService } from "../../src/mcp/server.js"
import type { ToolRegistry } from "../../src/mcp/tools/index.js"
import { readResidentAttachment, type ResidentAttachment } from "../../src/resident/attachment-file.js"
import { makeManualResidentBackend } from "../../src/resident/manual-backend.js"
import { runOwnedGeneration, withResidentSelection } from "../../src/resident/managed-selection.js"
import type { ResidentStartupCapture } from "../../src/resident/managed-contract.js"
import type { ResidentDirectory } from "../../src/resident/protected-path.js"
import { makeStartupBudget } from "../../src/resident/startup-budget.js"
import { closeResidentClients } from "../../src/runtime/server-startup.js"
import { TelemetryService } from "../../src/telemetry/telemetry.js"

// Internal test ports: no service or cleanup capability crosses the process boundary.
export const runManagedFaultBackend = Effect.fn("runManagedFaultBackend")(function* (options: {
  readonly directory: ResidentDirectory
  readonly capture: ResidentStartupCapture
  readonly registry: ToolRegistry
  readonly close: () => Promise<void>
  readonly onReady: (attachment: ResidentAttachment) => Effect.Effect<void>
}) {
  return yield* withResidentSelection({
    directory: options.directory,
    capture: options.capture,
    startup: yield* makeStartupBudget,
    existing: () => Effect.die("Fault backend must own its new generation"),
    absent: (ownership) =>
      runOwnedGeneration(ownership, (ready) =>
        Effect.gen(function* () {
          const backend = yield* makeManualResidentBackend({
            mode: "configured",
            lifetime: "managed",
            selection: options.capture.selection,
            startup: yield* makeStartupBudget
          })
          const clients = yield* Layer.build(Layer.merge(HulyClient.testLayer({}), HulyStorageClient.testLayer({})))
          const bundle = {
            hulyClient: Context.get(clients, HulyClient),
            storageClient: Context.get(clients, HulyStorageClient)
          }
          yield* Effect.gen(function* () {
            const server = yield* McpServerService
            yield* backend.run(server, (file) =>
              ready(file).pipe(Effect.andThen(readResidentAttachment(file)), Effect.flatMap(options.onReady))
            )
          }).pipe(
            Effect.provide(
              McpServerService.layer({
                transport: "http",
                httpHost: "127.0.0.1",
                httpPort: 0,
                registry: options.registry,
                mcpAuthToken: backend.authorization,
                ...backend.httpPolicy(Effect.succeed("ready")),
                resolveClients: async () => Exit.succeed(bundle),
                getRuntimeConfigContext: () => options.capture.runtimeContext,
                closeClients: () =>
                  Effect.runPromise(
                    backend.beforeClientsClose.pipe(Effect.andThen(closeResidentClients(options.close)))
                  )
              }).pipe(Layer.provide(TelemetryService.testLayer({})))
            ),
            Effect.scoped
          )
        }).pipe(Effect.scoped)
      )
  }).pipe(
    Effect.provide(
      ConfigProvider.layer(ConfigProvider.fromUnknown({ MCP_RESIDENT_STATE_DIRECTORY: options.directory }))
    )
  )
})
