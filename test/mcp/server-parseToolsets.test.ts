import { describe, it } from "@effect/vitest"
import { ConfigProvider, Context, Effect, Exit, Layer } from "effect"
import { expect } from "vitest"
import { HulyClient } from "../../src/huly/client.js"
import { HulyStorageClient } from "../../src/huly/storage.js"
import { WorkspaceClient } from "../../src/huly/workspace-client.js"
import { HttpServerFactoryService } from "../../src/mcp/http-transport.js"
import type { McpProcessPolicy } from "../../src/mcp/process-policy.js"
import { type ClientBundle, McpServerError, McpServerService } from "../../src/mcp/server.js"
import { createScopedRegistry, toolRegistry } from "../../src/mcp/tools/index.js"
import { makeToolCategory, makeToolName } from "../../src/mcp/tools/registry.js"
import { TelemetryService } from "../../src/telemetry/telemetry.js"
import { mockFn } from "../helpers/mock-fn.js"

const resolveClientsFromLayer = (
  clientLayer: Layer.Layer<HulyClient | HulyStorageClient | WorkspaceClient>
): (() => Promise<Exit.Exit<ClientBundle>>) => {
  let promise: Promise<Exit.Exit<ClientBundle>> | null = null
  return () => {
    if (promise === null) {
      promise = Effect.runPromise(
        Effect.gen(function* () {
          const ctx = yield* Layer.build(clientLayer).pipe(Effect.scoped)
          return {
            hulyClient: Context.get(ctx, HulyClient),
            storageClient: Context.get(ctx, HulyStorageClient),
            workspaceClient: Context.get(ctx, WorkspaceClient)
          }
        })
      ).then((bundle) => Exit.succeed(bundle))
    }
    return promise
  }
}

const buildTestServerLayer = (
  config: {
    transport: "stdio" | "http"
    httpPort?: number
    httpHost?: string
    authMethod?: "token" | "password"
    processPolicy?: McpProcessPolicy
  },
  layers: Layer.Layer<HulyClient | HulyStorageClient | WorkspaceClient | TelemetryService>,
  writeError?: (message: string) => void
) =>
  McpServerService.layer({
    ...config,
    ...(writeError !== undefined && { writeError }),
    resolveClients: resolveClientsFromLayer(layers)
  }).pipe(Layer.provide(layers))

const buildWithConfig = <A, E>(layer: Layer.Layer<A, E>, values: Record<string, string>) =>
  Layer.build(layer).pipe(Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown(values))))

describe("McpServerError", () => {
  it.effect("has correct _tag", () =>
    Effect.sync(function () {
      const error = new McpServerError({ message: "boom" })
      expect(error._tag).toBe("McpServerError")
    })
  )

  it.effect("message is accessible", () =>
    Effect.sync(function () {
      const error = new McpServerError({ message: "test failure" })
      expect(error.message).toBe("test failure")
    })
  )

  it.effect("cause is optional and preserved", () =>
    Effect.sync(function () {
      const cause = new TypeError("underlying")
      const error = new McpServerError({ message: "wrapped", cause })
      expect(error.cause).toBe(cause)
    })
  )

  it.effect("cause defaults to undefined when omitted", () =>
    Effect.sync(function () {
      const error = new McpServerError({ message: "no cause" })
      expect(error.cause).toBeUndefined()
    })
  )

  it.effect("can be used as Effect failure", () =>
    Effect.gen(function* () {
      const err = yield* Effect.flip(Effect.fail(new McpServerError({ message: "fail" })))
      expect(err._tag).toBe("McpServerError")
      expect(err.message).toBe("fail")
    })
  )
})

describe("McpServerService.testLayer", () => {
  it.effect("default run and stop are noop", () =>
    Effect.gen(function* () {
      const mockHttpLayer = Layer.succeed(HttpServerFactoryService, {} as never)
      const server = yield* McpServerService.pipe(Effect.provide(McpServerService.testLayer({})))
      yield* server.run().pipe(Effect.provide(mockHttpLayer))
      yield* server.stop()
    })
  )

  it.effect("allows overriding run to fail", () =>
    Effect.gen(function* () {
      const mockHttpLayer = Layer.succeed(HttpServerFactoryService, {} as never)
      const layer = McpServerService.testLayer({ run: () => new McpServerError({ message: "cannot start" }) })
      const server = yield* McpServerService.pipe(Effect.provide(layer))
      const err = yield* Effect.flip(server.run().pipe(Effect.provide(mockHttpLayer)))
      expect(err.message).toBe("cannot start")
    })
  )

  it.effect("allows overriding stop with side effect", () => {
    let stopped = false
    return Effect.gen(function* () {
      const layer = McpServerService.testLayer({
        stop: () =>
          Effect.sync(() => {
            stopped = true
          })
      })
      const server = yield* McpServerService.pipe(Effect.provide(layer))
      yield* server.stop()
      expect(stopped).toBe(true)
    })
  })
})

describe("McpServerService.layer with TOOLSETS env", () => {
  const baseLayers = Layer.mergeAll(
    HulyClient.testLayer({}),
    HulyStorageClient.testLayer({}),
    WorkspaceClient.testLayer({}),
    TelemetryService.testLayer()
  )

  it.effect("builds successfully with no TOOLSETS env", () =>
    Effect.gen(function* () {
      const serverLayer = buildTestServerLayer({ transport: "stdio" }, baseLayers)
      yield* buildWithConfig(serverLayer, {})
    })
  )

  it.effect("builds successfully with valid TOOLSETS", () =>
    Effect.gen(function* () {
      const serverLayer = buildTestServerLayer({ transport: "stdio" }, baseLayers)
      yield* buildWithConfig(serverLayer, { TOOLSETS: "issues" })
    })
  )

  it.effect("builds scoped registry from TOOLSETS and TOOLS", () => {
    let capturedToolCount = 0
    let capturedToolsets: ReadonlyArray<string> | null = null
    const expectedRegistry = createScopedRegistry({
      filteringActive: true,
      categories: new Set([makeToolCategory("issues")]),
      toolNames: new Set([makeToolName("list_documents")])
    })
    return Effect.gen(function* () {
      const telemetryLayer = TelemetryService.testLayer({
        sessionStart: (props) => {
          capturedToolCount = props.toolCount
          capturedToolsets = props.toolsets
        }
      })
      const layers = Layer.mergeAll(
        HulyClient.testLayer({}),
        HulyStorageClient.testLayer({}),
        WorkspaceClient.testLayer({}),
        telemetryLayer
      )

      const serverLayer = buildTestServerLayer({ transport: "stdio" }, layers)
      yield* buildWithConfig(serverLayer, { TOOLSETS: "issues", TOOLS: "list_documents" })

      expect(capturedToolsets).toEqual(["issues"])
      expect(capturedToolCount).toBe(expectedRegistry.definitions.length)
      expect(expectedRegistry.tools.get(makeToolName("list_documents"))).toBe(
        toolRegistry.tools.get(makeToolName("list_documents"))
      )
    })
  })

  it.effect("ignores unknown toolset categories and still builds", () => {
    const writeError = mockFn()
    return Effect.gen(function* () {
      const serverLayer = buildTestServerLayer({ transport: "stdio" }, baseLayers, writeError)
      yield* buildWithConfig(serverLayer, { TOOLSETS: "nonexistent_category" })
      expect(writeError.mock.calls).toContainEqual([expect.stringContaining("unknown toolset category")])
    })
  })

  it.effect("uses a captured process policy without rereading conflicting environment policy", () => {
    let capturedToolsets: ReadonlyArray<string> | null = null
    return Effect.gen(function* () {
      const layers = Layer.mergeAll(
        HulyClient.testLayer({}),
        HulyStorageClient.testLayer({}),
        WorkspaceClient.testLayer({}),
        TelemetryService.testLayer({
          sessionStart: (props) => {
            capturedToolsets = props.toolsets
          }
        })
      )
      const serverLayer = buildTestServerLayer(
        {
          transport: "stdio",
          processPolicy: {
            toolsets: ["issues"],
            tools: [],
            exposure: { configuredMode: "native", proxyOutputStrict: true }
          }
        },
        layers
      )
      yield* buildWithConfig(serverLayer, {
        TOOLSETS: "documents",
        HULY_TOOL_MODE: "invalid",
        PROXY_OUTPUT_STRICT: "invalid"
      })
      expect(capturedToolsets).toEqual(["issues"])
    })
  })

  it.effect("uses the default error writer for unknown toolset categories", () =>
    Effect.gen(function* () {
      const serverLayer = buildTestServerLayer({ transport: "stdio" }, baseLayers)
      yield* buildWithConfig(serverLayer, { TOOLSETS: "nonexistent_category_default_writer" })
    })
  )

  it.effect("sessionStart is called with correct transport and authMethod", () => {
    let capturedProps: unknown = null
    return Effect.gen(function* () {
      const telemetryLayer = TelemetryService.testLayer({
        sessionStart: (props) => {
          capturedProps = props
        }
      })
      const layers = Layer.mergeAll(
        HulyClient.testLayer({}),
        HulyStorageClient.testLayer({}),
        WorkspaceClient.testLayer({}),
        telemetryLayer
      )
      const serverLayer = buildTestServerLayer({ transport: "stdio", authMethod: "token" }, layers)
      yield* buildWithConfig(serverLayer, {})
      expect(capturedProps).toMatchObject({ transport: "stdio", authMethod: "token" })
    })
  })

  it.effect("fails startup when HULY_TOOL_MODE is invalid", () =>
    Effect.gen(function* () {
      const serverLayer = buildTestServerLayer({ transport: "stdio" }, baseLayers)
      const exit = yield* Effect.exit(buildWithConfig(serverLayer, { HULY_TOOL_MODE: "dynamic" }))

      expect(exit._tag).toBe("Failure")
    })
  )

  it.effect("fails startup when PROXY_OUTPUT_STRICT is invalid", () =>
    Effect.gen(function* () {
      const serverLayer = buildTestServerLayer({ transport: "stdio" }, baseLayers)
      const exit = yield* Effect.exit(buildWithConfig(serverLayer, { PROXY_OUTPUT_STRICT: "yes" }))

      expect(exit._tag).toBe("Failure")
    })
  )
})
