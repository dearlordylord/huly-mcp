import * as NodeRuntime from "@effect/platform-node/NodeRuntime"
import * as NodeStdio from "@effect/platform-node/NodeStdio"
import { Effect } from "effect"

import { ConfigValidationError } from "../config/config.js"
import { McpProcessPolicyError } from "../mcp/process-policy.js"
import { CliProfileStoreError } from "../profiles/model.js"
import { runProfileStartupDiagnostic } from "../profiles/startup-diagnostic.js"
import { runManualAdapter } from "./manual-adapter.js"
import { captureManualResidentSelection } from "./selection-config.js"
import { BackendResponseError } from "./response-stream.js"
import { ProtectedFileError } from "./protected-path.js"

NodeRuntime.runMain(
  Effect.gen(function* () {
    const environment = { ...process.env }
    const captured = yield* captureManualResidentSelection(environment)
    yield* runManualAdapter(captured?.selection)
  }).pipe(
    Effect.catchTag("CliProfileStoreError", (error) => runProfileStartupDiagnostic(error, PKG_VERSION)),
    Effect.provide(NodeStdio.layer),
    Effect.mapError((error) =>
      error instanceof BackendResponseError ||
      error instanceof CliProfileStoreError ||
      error instanceof ConfigValidationError ||
      error instanceof McpProcessPolicyError ||
      error instanceof ProtectedFileError
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
