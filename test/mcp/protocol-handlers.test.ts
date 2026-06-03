/**
 * Tests for the shared MCP protocol handlers (src/mcp/protocol-handlers.ts).
 *
 * These exercise the REAL createMcpProtocolHandlers implementation (not the stubbed
 * handlers used by the HTTP dispatcher tests), covering server/discover, the listTools
 * schema conversion, and the injected clock seam used for telemetry timing.
 *
 * Dependencies are provided as real stubs through the factory's parameters — no mocks.
 *
 * @module
 */
import { describe, expect, it } from "vitest"

import type { GetHulyContextResult } from "../../src/domain/schemas/index.js"
import { GET_HULY_CONTEXT_TOOL_NAME, VERSION_TOOL_NAME } from "../../src/mcp/huly-context-tool.js"
import {
  type ClientBundle,
  createMcpProtocolHandlers,
  liveNowClock,
  type NowClock
} from "../../src/mcp/protocol-handlers.js"
import { createFilteredRegistry } from "../../src/mcp/tools/index.js"
import { createNoopTelemetry } from "../../src/telemetry/noop.js"
import type { TelemetryOperations, ToolCalledProps } from "../../src/telemetry/telemetry.js"
import { VERSION } from "../../src/version.js"

// A real, empty tool registry (no category tools) — used for the builtin-only paths.
const emptyRegistry = createFilteredRegistry(new Set<string>())

// Clients/context are never reached on the paths under test; throwing makes accidental
// use loud instead of silently passing.
const unusedResolveClients = (): Promise<ClientBundle> =>
  Promise.reject(new Error("resolveClients must not be called on this path"))
const unusedGetHulyContext = (): GetHulyContextResult => {
  throw new Error("getHulyContext must not be called on this path")
}

const createTelemetryProbe = (): {
  telemetry: TelemetryOperations
  toolCalled: Array<ToolCalledProps>
  firstListTools: Array<true>
} => {
  const toolCalled: Array<ToolCalledProps> = []
  const firstListTools: Array<true> = []
  const telemetry: TelemetryOperations = {
    ...createNoopTelemetry(),
    firstListTools: () => {
      firstListTools.push(true)
    },
    toolCalled: (props) => {
      toolCalled.push(props)
    }
  }
  return { telemetry, toolCalled, firstListTools }
}

// Deterministic clock: returns successive queued readings (then 0 once exhausted).
const queuedClock = (readings: ReadonlyArray<number>): NowClock => {
  const queue = [...readings]
  return { currentTimeMillis: () => queue.shift() ?? 0 }
}

describe("createMcpProtocolHandlers", () => {
  describe("serverDiscover", () => {
    it("returns the 2026 capability envelope carrying the package version", () => {
      const handlers = createMcpProtocolHandlers(
        unusedResolveClients,
        createTelemetryProbe().telemetry,
        emptyRegistry,
        unusedGetHulyContext
      )

      expect(handlers.serverDiscover()).toEqual({
        resultType: "complete",
        supportedVersions: ["2026-07-28"],
        capabilities: { tools: {}, resources: {} },
        serverInfo: { name: "huly-mcp", version: VERSION }
      })
    })
  })

  describe("listTools", () => {
    it("lists builtin tools with object input/output schemas and records firstListTools", async () => {
      const probe = createTelemetryProbe()
      const handlers = createMcpProtocolHandlers(
        unusedResolveClients,
        probe.telemetry,
        emptyRegistry,
        unusedGetHulyContext
      )

      const result = await handlers.listTools()
      const names = result.tools.map((tool) => tool.name)

      expect(names).toContain(VERSION_TOOL_NAME)
      expect(names).toContain(GET_HULY_CONTEXT_TOOL_NAME)
      for (const tool of result.tools) {
        expect(tool.inputSchema.type).toBe("object")
        expect(tool.outputSchema?.type).toBe("object")
      }
      expect(probe.firstListTools).toHaveLength(1)
    })
  })

  describe("callTool telemetry clock seam", () => {
    it("measures durationMs from the injected clock", async () => {
      const probe = createTelemetryProbe()
      const handlers = createMcpProtocolHandlers(
        unusedResolveClients,
        probe.telemetry,
        emptyRegistry,
        unusedGetHulyContext,
        queuedClock([1000, 1042])
      )

      const response = await handlers.callTool({ params: { name: "does_not_exist", arguments: {} } })

      expect(response.isError).toBe(true)
      expect(probe.toolCalled).toHaveLength(1)
      expect(probe.toolCalled[0]).toMatchObject({
        toolName: "does_not_exist",
        status: "error",
        durationMs: 42
      })
    })

    it("defaults to the live Effect clock when none is injected", async () => {
      const probe = createTelemetryProbe()
      const handlers = createMcpProtocolHandlers(
        unusedResolveClients,
        probe.telemetry,
        emptyRegistry,
        unusedGetHulyContext
      )

      await handlers.callTool({ params: { name: "does_not_exist", arguments: {} } })

      expect(probe.toolCalled[0]?.durationMs).toBeTypeOf("number")
      expect(probe.toolCalled[0]?.durationMs).toBeGreaterThanOrEqual(0)
    })
  })

  describe("liveNowClock", () => {
    it("reads a positive wall-clock time via Effect's Clock", () => {
      expect(liveNowClock.currentTimeMillis()).toBeGreaterThan(0)
    })
  })
})
