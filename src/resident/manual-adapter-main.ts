import { NodeRuntime, NodeStdio } from "@effect/platform-node"
import { Effect } from "effect"

import { runManualAdapter } from "./manual-adapter.js"
import { captureManualResidentSelection } from "./selection-config.js"
import { BackendResponseError } from "./response-stream.js"

NodeRuntime.runMain(
  Effect.gen(function* () {
    const environment = { ...process.env }
    const captured = yield* captureManualResidentSelection(environment)
    yield* runManualAdapter(captured?.selection)
  }).pipe(
    Effect.provide(NodeStdio.layer),
    Effect.mapError((error) =>
      error instanceof BackendResponseError
        ? error
        : new BackendResponseError({
            message:
              "Adapter failed; check the private attachment file and backend generation. No request was replayed."
          })
    ),
    Effect.tapError((error) => Effect.sync(() => process.stderr.write(`Huly MCP manual adapter: ${error.message}\n`)))
  ),
  { disableErrorReporting: true }
)
