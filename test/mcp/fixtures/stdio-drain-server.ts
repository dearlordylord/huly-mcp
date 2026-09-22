import { Context, Deferred, Effect, Exit, Layer, Result, Schema } from "effect"

import { sanitizeHulyRuntimeConfigFromEnv } from "../../../src/config/config.js"
import { HulyClient } from "../../../src/huly/client.js"
import { HulyStorageClient } from "../../../src/huly/storage.js"
import { HttpServerFactoryService } from "../../../src/mcp/http-transport.js"
import { McpServerService } from "../../../src/mcp/server.js"
import type { ToolRegistry } from "../../../src/mcp/tools/index.js"
import { defineTool } from "../../../src/mcp/tools/registry.js"
import { TelemetryService } from "../../../src/telemetry/telemetry.js"

const ReleaseMessage = Schema.Struct({ type: Schema.Literal("release") })
const EmptyParams = Schema.Struct({})
const LargeResult = Schema.Struct({ payload: Schema.String })
const LARGE_RESPONSE_SIZE = 128_000
const payload = "stdio-drain-payload:" + "x".repeat(LARGE_RESPONSE_SIZE)
const release = Deferred.makeUnsafe<void>()

const onReleaseMessage = (message: unknown): void => {
  if (Result.isSuccess(Schema.decodeUnknownResult(ReleaseMessage)(message))) {
    process.off("message", onReleaseMessage)
    process.disconnect?.()
    Effect.runSync(Deferred.succeed(release, undefined))
  }
}
process.on("message", onReleaseMessage)

const tool = defineTool(
  {
    name: "delayed_large_response",
    description: "Return a large response after the certification harness releases the operation.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    resultSchema: LargeResult,
    category: "test"
  },
  Schema.decodeUnknownEffect(EmptyParams),
  () =>
    Effect.sync(() => process.send?.({ type: "started" })).pipe(
      Effect.andThen(Deferred.await(release)),
      Effect.as({ payload })
    )
)

const registry: ToolRegistry = {
  tools: new Map([[tool.name, tool]]),
  definitions: [tool],
  handleToolCall: (name, args, hulyClient, storageClient, workspaceClient) =>
    name === tool.name ? tool.handler(args, hulyClient, storageClient, workspaceClient) : Promise.resolve(null)
}

const program = Effect.gen(function* () {
  const clientContext = yield* Layer.build(Layer.merge(HulyClient.testLayer({}), HulyStorageClient.testLayer({})))
  const bundle = {
    hulyClient: Context.get(clientContext, HulyClient),
    storageClient: Context.get(clientContext, HulyStorageClient)
  }
  const serverLayer = McpServerService.layer({
    transport: "stdio",
    registry,
    resolveClients: async () => Exit.succeed(bundle),
    getRuntimeConfigContext: () =>
      sanitizeHulyRuntimeConfigFromEnv({
        HULY_TOKEN: "stdio-drain-token",
        HULY_URL: "https://huly.example.com",
        HULY_WORKSPACE: "workspace"
      })
  }).pipe(Layer.provide(TelemetryService.testLayer()))
  const server = yield* McpServerService.pipe(Effect.provide(serverLayer))
  yield* server
    .run()
    .pipe(
      Effect.provideService(HttpServerFactoryService, {
        make: () => Effect.die("HTTP factory must not run in the stdio fixture")
      })
    )
})

void Effect.runPromise(program.pipe(Effect.scoped)).catch((error: unknown) => {
  process.stderr.write(`stdio drain fixture failed: ${String(error)}\n`)
  process.exitCode = 1
})
