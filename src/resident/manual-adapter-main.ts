import { NodeRuntime, NodeStdio } from "@effect/platform-node"
import { Effect } from "effect"

import { runManualAdapter } from "./manual-adapter.js"
import { BackendResponseError } from "./response-stream.js"

NodeRuntime.runMain(
  runManualAdapter.pipe(
    Effect.provide(NodeStdio.layer),
    Effect.catch((error) =>
      Effect.gen(function* () {
        // Configuration and parse diagnostics must not echo private boundary data.
        yield* Effect.sync(() =>
          process.stderr.write(
            error instanceof BackendResponseError
              ? `Huly MCP manual adapter: ${error.message}\n`
              : "Huly MCP manual adapter failed; check endpoint and local authorization. No request was replayed.\n"
          )
        )
        yield* Effect.sync(() => {
          process.exitCode = 1
        })
      })
    )
  )
)
