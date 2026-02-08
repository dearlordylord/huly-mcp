import { describe, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { expect, vi } from "vitest"
import { HulyClient } from "../../src/huly/client.js"
import { HulyStorageClient } from "../../src/huly/storage.js"
import { WorkspaceClient } from "../../src/huly/workspace-client.js"
import { HttpServerFactoryService } from "../../src/mcp/http-transport.js"
import { McpServerError, McpServerService } from "../../src/mcp/server.js"
import { TelemetryService } from "../../src/telemetry/telemetry.js"

describe("McpServerError", () => {
  // test-revizorro: approved
  it.effect("has correct _tag", () =>
    Effect.gen(function*() {
      const error = new McpServerError({ message: "boom" })
      expect(error._tag).toBe("McpServerError")
    }))

  // test-revizorro: approved
  it.effect("message is accessible", () =>
    Effect.gen(function*() {
      const error = new McpServerError({ message: "test failure" })
      expect(error.message).toBe("test failure")
    }))

  // test-revizorro: approved
  it.effect("cause is optional and preserved", () =>
    Effect.gen(function*() {
      const cause = new TypeError("underlying")
      const error = new McpServerError({ message: "wrapped", cause })
      expect(error.cause).toBe(cause)
    }))

  // test-revizorro: approved
  it.effect("cause defaults to undefined when omitted", () =>
    Effect.gen(function*() {
      const error = new McpServerError({ message: "no cause" })
      expect(error.cause).toBeUndefined()
    }))

  // test-revizorro: approved
  it.effect("can be used as Effect failure", () =>
    Effect.gen(function*() {
      const err = yield* Effect.flip(
        Effect.fail(new McpServerError({ message: "fail" }))
      )
      expect(err._tag).toBe("McpServerError")
      expect(err.message).toBe("fail")
    }))
})

describe("McpServerService.testLayer", () => {
  // test-revizorro: approved
  it.effect("default run and stop are noop", () =>
    Effect.gen(function*() {
      const mockHttpLayer = Layer.succeed(HttpServerFactoryService, {} as never)
      const server = yield* McpServerService.pipe(
        Effect.provide(McpServerService.testLayer({}))
      )
      yield* server.run().pipe(Effect.provide(mockHttpLayer))
      yield* server.stop()
    }))

  // test-revizorro: approved
  it.effect("allows overriding run to fail", () =>
    Effect.gen(function*() {
      const mockHttpLayer = Layer.succeed(HttpServerFactoryService, {} as never)
      const layer = McpServerService.testLayer({
        run: () => new McpServerError({ message: "cannot start" })
      })
      const server = yield* McpServerService.pipe(Effect.provide(layer))
      const err = yield* Effect.flip(server.run().pipe(Effect.provide(mockHttpLayer)))
      expect(err.message).toBe("cannot start")
    }))

  // test-revizorro: approved
  it.effect("allows overriding stop with side effect", () => {
    let stopped = false
    return Effect.gen(function*() {
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

  it.scoped("builds successfully with no TOOLSETS env", () =>
    Effect.gen(function*() {
      delete process.env.TOOLSETS
      const serverLayer = McpServerService.layer({ transport: "stdio" }).pipe(
        Layer.provide(baseLayers)
      )
      yield* Layer.build(serverLayer)
    }))

  it.scoped("builds successfully with valid TOOLSETS", () =>
    Effect.gen(function*() {
      process.env.TOOLSETS = "issues"
      const serverLayer = McpServerService.layer({ transport: "stdio" }).pipe(
        Layer.provide(baseLayers)
      )
      yield* Layer.build(serverLayer)
      delete process.env.TOOLSETS
    }))

  it.scoped("ignores unknown toolset categories and still builds", () => {
    const stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    return Effect.gen(function*() {
      process.env.TOOLSETS = "nonexistent_category"
      const serverLayer = McpServerService.layer({ transport: "stdio" }).pipe(
        Layer.provide(baseLayers)
      )
      yield* Layer.build(serverLayer)
      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining("unknown toolset category")
      )
      delete process.env.TOOLSETS
      stderrSpy.mockRestore()
    })
  })

  it.scoped("sessionStart is called with correct transport and authMethod", () => {
    let capturedProps: unknown = null
    return Effect.gen(function*() {
      delete process.env.TOOLSETS
      const telemetryLayer = TelemetryService.testLayer({
        sessionStart: (props) => {
          capturedProps = props
        }
      })
      const serverLayer = McpServerService.layer({
        transport: "stdio",
        authMethod: "token"
      }).pipe(
        Layer.provide(
          Layer.mergeAll(
            HulyClient.testLayer({}),
            HulyStorageClient.testLayer({}),
            WorkspaceClient.testLayer({}),
            telemetryLayer
          )
        )
      )
      yield* Layer.build(serverLayer)
      expect(capturedProps).toMatchObject({
        transport: "stdio",
        authMethod: "token"
      })
    })
  })
})
