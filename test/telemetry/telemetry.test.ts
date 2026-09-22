import { describe, it } from "@effect/vitest"
import { ConfigProvider, Effect } from "effect"
import { beforeEach, expect } from "vitest"
import { cliTelemetryContext, mcpTelemetryContext, type TelemetrySurface } from "../../src/telemetry/context.js"
import { createNoopTelemetry } from "../../src/telemetry/noop.js"
import { createPostHogTelemetry, type PostHogTelemetryDependencies } from "../../src/telemetry/posthog.js"
import { TelemetryService, type TelemetryFactories } from "../../src/telemetry/telemetry.js"
import { assertAt } from "../../src/utils/assertions.js"
import { mockFn } from "../helpers/mock-fn.js"

const mockCapture = mockFn()
const mockShutdown = mockFn().mockResolvedValue(undefined)
const debugMessages: Array<string> = []
let sessionCounter = 0

const makeDependencies = (): PostHogTelemetryDependencies => ({
  createClient: () => ({ capture: mockCapture, shutdown: mockShutdown }),
  createSessionId: () => {
    sessionCounter++
    return `00000000-0000-4000-8000-${sessionCounter.toString().padStart(12, "0")}`
  },
  writeDebug: (message) => {
    debugMessages.push(message)
  }
})

const createTelemetry = (debug: boolean) => createPostHogTelemetry(debug, makeDependencies())

const telemetryLayerFixture = () => {
  const enabledCalls: Array<{ readonly debug: boolean; readonly surface: TelemetrySurface }> = []
  let disabledCalls = 0
  let shutdownCalls = 0
  const operations = {
    ...createNoopTelemetry(),
    shutdown: () => {
      shutdownCalls++
      return Promise.resolve()
    }
  }
  const factories: TelemetryFactories = {
    enabled: (debug, context) => {
      enabledCalls.push({ debug, surface: context.surface })
      return operations
    },
    disabled: () => {
      disabledCalls++
      return operations
    }
  }
  return { factories, enabledCalls, disabledCalls: () => disabledCalls, shutdownCalls: () => shutdownCalls }
}

const envProvider = (env: Record<string, string>) => ConfigProvider.fromEnv({ env })

describe("Telemetry", () => {
  beforeEach(() => {
    mockCapture.mockClear()
    mockShutdown.mockClear()
    debugMessages.length = 0
    sessionCounter = 0
  })

  describe("createNoopTelemetry", () => {
    it("all methods are callable without throwing", () => {
      const noop = createNoopTelemetry()
      expect(() =>
        noop.sessionStart({ transport: "stdio", authMethod: "password", toolCount: 10, toolsets: null })
      ).not.toThrow()
      expect(() => noop.firstListTools()).not.toThrow()
      expect(() => noop.toolCalled({ toolName: "test", status: "success", durationMs: 100 })).not.toThrow()
    })

    it("shutdown resolves", async () => {
      const noop = createNoopTelemetry()
      await expect(noop.shutdown()).resolves.toBeUndefined()
    })
  })

  describe("createPostHogTelemetry", () => {
    it("sessionStart captures with correct event and properties", () => {
      const telemetry = createTelemetry(false)
      telemetry.sessionStart({ transport: "stdio", authMethod: "token", toolCount: 5, toolsets: ["issues"] })

      expect(mockCapture.mock.calls).toHaveLength(1)
      const call = assertAt(mockCapture.mock.calls, 0)[0]
      expect(call.event).toBe("session_start")
      expect(call.properties).toMatchObject({
        transport: "stdio",
        auth_method: "token",
        tool_count: 5,
        toolsets: ["issues"]
      })
      expect(call.properties.session_id).toBeTypeOf("string")
      expect(call.properties.version).toBeTypeOf("string")
    })

    it("toolCalled captures with correct event and properties", () => {
      const telemetry = createTelemetry(false)
      telemetry.toolCalled({ toolName: "list_issues", status: "success", durationMs: 42 })

      expect(mockCapture.mock.calls).toHaveLength(1)
      const call = assertAt(mockCapture.mock.calls, 0)[0]
      expect(call.event).toBe("tool_called")
      expect(call.properties).toMatchObject({ tool_name: "list_issues", status: "success", duration_ms: 42 })
      expect(call.properties).not.toHaveProperty("error_tag")
    })

    it("toolCalled with error captures errorTag", () => {
      const telemetry = createTelemetry(false)
      telemetry.toolCalled({ toolName: "get_issue", status: "error", errorTag: "HulyConnectionError", durationMs: 150 })

      expect(mockCapture.mock.calls).toHaveLength(1)
      const call = assertAt(mockCapture.mock.calls, 0)[0]
      expect(call.properties).toMatchObject({ status: "error", error_tag: "HulyConnectionError" })
    })

    it("sessionId is consistent across calls", () => {
      const telemetry = createTelemetry(false)
      telemetry.sessionStart({ transport: "stdio", authMethod: "password", toolCount: 1, toolsets: null })
      telemetry.toolCalled({ toolName: "x", status: "success", durationMs: 0 })

      expect(mockCapture.mock.calls).toHaveLength(2)
      const id1 = assertAt(mockCapture.mock.calls, 0)[0].distinctId
      const id2 = assertAt(mockCapture.mock.calls, 1)[0].distinctId
      expect(id1).toBe(id2)
      expect(id1).toMatch(/^[0-9a-f-]{36}$/)
    })

    it("firstListTools deduplicates — only first call captures", () => {
      const telemetry = createTelemetry(false)

      telemetry.firstListTools()
      telemetry.firstListTools()
      telemetry.firstListTools()

      const listToolsCalls = mockCapture.mock.calls.filter((c) => assertAt(c, 0).event === "first_list_tools")
      expect(listToolsCalls).toHaveLength(1)
    })

    it("debug mode logs to stderr", () => {
      const telemetry = createTelemetry(true)

      telemetry.sessionStart({ transport: "http", authMethod: "password", toolCount: 3, toolsets: null })

      expect(debugMessages).toContainEqual(expect.stringContaining("[telemetry] session_start"))
    })

    it("shutdown captures session_end then flushes", async () => {
      const telemetry = createTelemetry(false)
      await telemetry.shutdown()

      const endCalls = mockCapture.mock.calls.filter((c) => assertAt(c, 0).event === "session_end")
      expect(endCalls).toHaveLength(1)
      expect(mockShutdown.mock.calls).toHaveLength(1)
      expect(mockShutdown.mock.calls).toContainEqual([2000])
    })

    it("capture failure does not throw", () => {
      mockCapture.mockImplementationOnce(() => {
        throw new Error("network down")
      })
      const telemetry = createTelemetry(false)
      expect(() => telemetry.firstListTools()).not.toThrow()
    })
  })

  describe("TelemetryService", () => {
    it.effect("layer provides telemetry with default config (enabled)", () =>
      Effect.gen(function* () {
        const telemetry = yield* TelemetryService
        expect(telemetry.sessionStart).toBeTypeOf("function")
        expect(telemetry.firstListTools).toBeTypeOf("function")
        expect(telemetry.toolCalled).toBeTypeOf("function")
        expect(telemetry.shutdown).toBeTypeOf("function")
      }).pipe(
        Effect.provide(TelemetryService.layer),
        Effect.provideService(ConfigProvider.ConfigProvider, envProvider({}))
      )
    )

    it.effect("testLayer provides noop by default", () =>
      Effect.gen(function* () {
        const telemetry = yield* TelemetryService
        telemetry.sessionStart({ transport: "stdio", authMethod: "password", toolCount: 1, toolsets: null })
        telemetry.toolCalled({ toolName: "x", status: "success", durationMs: 0 })
        // noop should not have called the mock
        expect(mockCapture.mock.calls).toHaveLength(0)
      }).pipe(Effect.provide(TelemetryService.testLayer()))
    )

    it.effect("testLayer allows overriding operations", () => {
      let called = false
      return Effect.gen(function* () {
        const telemetry = yield* TelemetryService
        telemetry.firstListTools()
        expect(called).toBe(true)
      }).pipe(
        Effect.provide(
          TelemetryService.testLayer({
            firstListTools: () => {
              called = true
            }
          })
        )
      )
    })
  })

  describe("Layer selection via env", () => {
    it.effect("constructing a layer is lazy and defaults MCP telemetry to enabled without debug", () => {
      const fixture = telemetryLayerFixture()
      const layer = TelemetryService.layerForContext(mcpTelemetryContext, fixture.factories)
      expect(fixture.enabledCalls).toHaveLength(0)
      expect(fixture.disabledCalls()).toBe(0)

      return Effect.gen(function* () {
        const telemetry = yield* TelemetryService
        expect(fixture.enabledCalls).toEqual([{ debug: false, surface: "mcp" }])
        expect(fixture.disabledCalls()).toBe(0)
        yield* Effect.promise(() => telemetry.shutdown())
        expect(fixture.shutdownCalls()).toBe(1)
      }).pipe(Effect.provide(layer), Effect.provideService(ConfigProvider.ConfigProvider, envProvider({})))
    })

    it.effect("HULY_MCP_TELEMETRY=0 selects disabled telemetry", () => {
      const fixture = telemetryLayerFixture()
      return Effect.gen(function* () {
        yield* TelemetryService
        expect(fixture.enabledCalls).toHaveLength(0)
        expect(fixture.disabledCalls()).toBe(1)
      }).pipe(
        Effect.provide(TelemetryService.layerForContext(mcpTelemetryContext, fixture.factories)),
        Effect.provideService(
          ConfigProvider.ConfigProvider,
          envProvider({ HULY_MCP_TELEMETRY: "0", HULY_MCP_TELEMETRY_DEBUG: "1" })
        )
      )
    })

    it.effect.each([
      ["mcp", mcpTelemetryContext, "1"],
      ["cli", cliTelemetryContext, "true"]
    ] as const)("DO_NOT_TRACK disables %s telemetry even when surface variable enables it", ([, context, value]) => {
      const fixture = telemetryLayerFixture()
      return Effect.gen(function* () {
        yield* TelemetryService
        expect(fixture.enabledCalls).toHaveLength(0)
        expect(fixture.disabledCalls()).toBe(1)
      }).pipe(
        Effect.provide(TelemetryService.layerForContext(context, fixture.factories)),
        Effect.provideService(
          ConfigProvider.ConfigProvider,
          envProvider({ DO_NOT_TRACK: value, HULY_MCP_TELEMETRY: "1", HULY_CLI_TELEMETRY: "1" })
        )
      )
    })

    it.effect.each(["0", "false", ""])("DO_NOT_TRACK=%j keeps telemetry enabled", (value) => {
      const fixture = telemetryLayerFixture()
      return Effect.gen(function* () {
        yield* TelemetryService
        expect(fixture.enabledCalls).toEqual([{ debug: false, surface: "mcp" }])
      }).pipe(
        Effect.provide(TelemetryService.layerForContext(mcpTelemetryContext, fixture.factories)),
        Effect.provideService(ConfigProvider.ConfigProvider, envProvider({ DO_NOT_TRACK: value }))
      )
    })

    it.effect("MCP debug config reaches the enabled telemetry factory", () => {
      const fixture = telemetryLayerFixture()
      return Effect.gen(function* () {
        yield* TelemetryService
        expect(fixture.enabledCalls).toEqual([{ debug: true, surface: "mcp" }])
      }).pipe(
        Effect.provide(TelemetryService.layerForContext(mcpTelemetryContext, fixture.factories)),
        Effect.provideService(
          ConfigProvider.ConfigProvider,
          envProvider({ HULY_MCP_TELEMETRY: "1", HULY_MCP_TELEMETRY_DEBUG: "1" })
        )
      )
    })

    it.effect("CLI config uses its own enabled and debug variables", () => {
      const fixture = telemetryLayerFixture()
      return Effect.gen(function* () {
        yield* TelemetryService
        expect(fixture.enabledCalls).toEqual([{ debug: true, surface: "cli" }])
      }).pipe(
        Effect.provide(TelemetryService.layerForContext(cliTelemetryContext, fixture.factories)),
        Effect.provideService(
          ConfigProvider.ConfigProvider,
          envProvider({
            HULY_CLI_TELEMETRY: "1",
            HULY_CLI_TELEMETRY_DEBUG: "1",
            HULY_MCP_TELEMETRY: "0",
            HULY_MCP_TELEMETRY_DEBUG: "0"
          })
        )
      )
    })
  })
})
