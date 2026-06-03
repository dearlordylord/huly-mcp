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
import { Context, Effect, Layer, Schema } from "effect"
import { describe, expect, it } from "vitest"

import { type GetHulyContextResult, GetHulyContextResultSchema } from "../../src/domain/schemas/index.js"
import { HulyClient, type HulyClientOperations } from "../../src/huly/client.js"
import { HulyStorageClient } from "../../src/huly/storage.js"
import { GET_HULY_CONTEXT_TOOL_NAME, VERSION_TOOL_NAME } from "../../src/mcp/huly-context-tool.js"
import {
  type ClientBundle,
  createMcpProtocolHandlers,
  deriveEditMode,
  fetchLatestNpmVersion,
  liveNowClock,
  type NowClock
} from "../../src/mcp/protocol-handlers.js"
import { createFilteredRegistry, toolRegistry } from "../../src/mcp/tools/index.js"
import { isNoArgumentTool, requiresArgumentsObject } from "../../src/mcp/tools/registry.js"
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

// Build a real ClientBundle from the client test layers (no mocks): the layer
// services are plain objects, so they survive scope closure.
const buildStubClients = (hulyOps: Partial<HulyClientOperations> = {}): () => Promise<ClientBundle> => () =>
  Effect.runPromise(
    Effect.gen(function*() {
      const ctx = yield* Layer.build(
        Layer.merge(HulyClient.testLayer(hulyOps), HulyStorageClient.testLayer({}))
      ).pipe(Effect.scoped)
      return { hulyClient: Context.get(ctx, HulyClient), storageClient: Context.get(ctx, HulyStorageClient) }
    })
  )

const rejectingResolveClients = (): Promise<ClientBundle> => Promise.reject(new Error("client init boom"))

// Narrow the MCP content union to the text variant (no cast).
const firstText = (content: ReadonlyArray<unknown>): string => {
  const item = content[0]
  if (typeof item === "object" && item !== null && "text" in item && typeof item.text === "string") {
    return item.text
  }
  throw new Error("expected text content")
}

// A structurally valid context, decoded so branded fields are constructed without casts.
const makeValidContext = (): GetHulyContextResult =>
  Schema.decodeUnknownSync(GetHulyContextResultSchema)({
    package: { name: "@firfi/huly-mcp", version: "1.0.0" },
    transport: { type: "stdio" },
    huly: {
      url: { configured: false },
      workspace: { configured: false },
      connectionTimeout: { configured: false, valid: true, valueMs: 30000, defaultMs: 30000, source: "default" }
    },
    auth: {
      method: "unknown",
      source: "none",
      tokenConfigured: false,
      emailConfigured: false,
      passwordConfigured: false
    },
    configSources: {
      env: {
        hulyUrl: false,
        hulyWorkspace: false,
        hulyToken: false,
        hulyEmail: false,
        hulyPassword: false,
        hulyConnectionTimeout: false,
        lazyEnvs: false
      }
    },
    toolsets: {
      filteringActive: false,
      requestedCategories: [],
      enabledCategories: [],
      ignoredCategories: [],
      availableCategories: ["issues"],
      visibleRegisteredToolCount: 1,
      totalRegisteredToolCount: 1,
      builtinTools: ["get_version", "get_huly_context"]
    }
  })

describe("createMcpProtocolHandlers — version tool", () => {
  it("returns current and the injected latest version on success", async () => {
    const probe = createTelemetryProbe()
    const handlers = createMcpProtocolHandlers(
      unusedResolveClients,
      probe.telemetry,
      emptyRegistry,
      unusedGetHulyContext,
      queuedClock([1000, 1100]),
      () => Promise.resolve("9.9.9")
    )

    const response = await handlers.callTool({ params: { name: VERSION_TOOL_NAME, arguments: {} } })

    expect(response.isError).not.toBe(true)
    expect(firstText(response.content)).toContain(VERSION)
    expect(firstText(response.content)).toContain("9.9.9")
    expect(probe.toolCalled[0]).toMatchObject({ toolName: VERSION_TOOL_NAME, status: "success", durationMs: 100 })
  })

  it("rejects unexpected arguments without fetching", async () => {
    const probe = createTelemetryProbe()
    let fetched = false
    const handlers = createMcpProtocolHandlers(
      unusedResolveClients,
      probe.telemetry,
      emptyRegistry,
      unusedGetHulyContext,
      liveNowClock,
      () => {
        fetched = true
        return Promise.resolve("0.0.0")
      }
    )

    const response = await handlers.callTool({ params: { name: VERSION_TOOL_NAME, arguments: { unexpected: 1 } } })

    expect(response.isError).toBe(true)
    expect(fetched).toBe(false)
    expect(probe.toolCalled[0]?.status).toBe("error")
  })
})

describe("createMcpProtocolHandlers — get_huly_context tool", () => {
  it("returns the validated context on success", async () => {
    const probe = createTelemetryProbe()
    const handlers = createMcpProtocolHandlers(
      unusedResolveClients,
      probe.telemetry,
      emptyRegistry,
      makeValidContext
    )

    const response = await handlers.callTool({ params: { name: GET_HULY_CONTEXT_TOOL_NAME, arguments: {} } })

    expect(response.isError).not.toBe(true)
    expect(firstText(response.content)).toContain("@firfi/huly-mcp")
    expect(probe.toolCalled[0]).toMatchObject({ toolName: GET_HULY_CONTEXT_TOOL_NAME, status: "success" })
  })

  it("maps a context that fails validation to an error", async () => {
    const probe = createTelemetryProbe()
    const handlers = createMcpProtocolHandlers(
      unusedResolveClients,
      probe.telemetry,
      emptyRegistry,
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- intentionally invalid boundary value
      () => ({ package: { name: "@firfi/huly-mcp", version: "" } }) as GetHulyContextResult
    )

    const response = await handlers.callTool({ params: { name: GET_HULY_CONTEXT_TOOL_NAME, arguments: {} } })

    expect(response.isError).toBe(true)
    expect(firstText(response.content)).toBe("Failed to build Huly context")
  })

  it("rejects unexpected arguments", async () => {
    const probe = createTelemetryProbe()
    const handlers = createMcpProtocolHandlers(
      unusedResolveClients,
      probe.telemetry,
      emptyRegistry,
      unusedGetHulyContext
    )

    const response = await handlers.callTool({ params: { name: GET_HULY_CONTEXT_TOOL_NAME, arguments: { x: 1 } } })

    expect(response.isError).toBe(true)
  })
})

describe("createMcpProtocolHandlers — tool dispatch", () => {
  it("dispatches to a registered tool with resolved clients", async () => {
    const probe = createTelemetryProbe()
    const handlers = createMcpProtocolHandlers(buildStubClients(), probe.telemetry, toolRegistry, unusedGetHulyContext)

    const response = await handlers.callTool({ params: { name: "list_projects", arguments: {} } })

    expect(response.isError).not.toBe(true)
    expect(probe.toolCalled[0]).toMatchObject({ toolName: "list_projects", status: "success" })
  })

  it("maps a client-resolution failure to an error", async () => {
    const probe = createTelemetryProbe()
    const handlers = createMcpProtocolHandlers(
      rejectingResolveClients,
      probe.telemetry,
      toolRegistry,
      unusedGetHulyContext
    )

    const response = await handlers.callTool({ params: { name: "list_projects", arguments: {} } })

    expect(response.isError).toBe(true)
    expect(probe.toolCalled[0]?.status).toBe("error")
  })

  it("threads the derived edit mode into telemetry when client resolution fails", async () => {
    const probe = createTelemetryProbe()
    const handlers = createMcpProtocolHandlers(
      rejectingResolveClients,
      probe.telemetry,
      toolRegistry,
      unusedGetHulyContext
    )

    await handlers.callTool({ params: { name: "edit_document", arguments: { old_text: "a", new_text: "b" } } })

    expect(probe.toolCalled[0]?.editMode).toBe("search_and_replace")
  })

  it("rejects arguments for a no-argument tool", async () => {
    const noArgTool = toolRegistry.definitions.find(isNoArgumentTool)
    if (noArgTool === undefined) throw new Error("expected at least one no-argument tool in the registry")
    const probe = createTelemetryProbe()
    const handlers = createMcpProtocolHandlers(
      unusedResolveClients,
      probe.telemetry,
      toolRegistry,
      unusedGetHulyContext
    )

    const response = await handlers.callTool({ params: { name: noArgTool.name, arguments: { unexpected: 1 } } })

    expect(response.isError).toBe(true)
  })

  it("requires an arguments object for a tool with required fields", async () => {
    const argsTool = toolRegistry.definitions.find(requiresArgumentsObject)
    if (argsTool === undefined) throw new Error("expected at least one tool with required arguments in the registry")
    const probe = createTelemetryProbe()
    const handlers = createMcpProtocolHandlers(
      unusedResolveClients,
      probe.telemetry,
      toolRegistry,
      unusedGetHulyContext
    )

    const response = await handlers.callTool({ params: { name: argsTool.name } })

    expect(response.isError).toBe(true)
  })
})

describe("deriveEditMode", () => {
  it("classifies edit_document argument shapes and ignores everything else", () => {
    expect(deriveEditMode("edit_document", { old_text: "a", new_text: "b" })).toBe("search_and_replace")
    expect(deriveEditMode("edit_document", { content: "x" })).toBe("full_replace")
    expect(deriveEditMode("edit_document", { title: "t" })).toBe("title_only")
    expect(deriveEditMode("edit_document", undefined)).toBeUndefined()
    expect(deriveEditMode("edit_document", "not-an-object")).toBeUndefined()
    expect(deriveEditMode("edit_document", null)).toBeUndefined()
    expect(deriveEditMode("edit_document", ["array"])).toBeUndefined()
    expect(deriveEditMode("create_issue", { old_text: "a" })).toBeUndefined()
  })
})

describe("fetchLatestNpmVersion", () => {
  const okWith = (body: unknown): typeof fetch => () =>
    Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))

  it("returns the version field on a well-formed response", async () => {
    expect(await fetchLatestNpmVersion(okWith({ version: "3.2.1" }))).toBe("3.2.1")
  })

  it("returns 'unknown' when the response status is not ok", async () => {
    const stub: typeof fetch = () => Promise.resolve(new Response("", { status: 503 }))
    expect(await fetchLatestNpmVersion(stub)).toBe("unknown")
  })

  it("returns 'unknown' when the payload version is not a string", async () => {
    expect(await fetchLatestNpmVersion(okWith({ version: 42 }))).toBe("unknown")
  })

  it("returns 'unknown' when the payload has no version key", async () => {
    expect(await fetchLatestNpmVersion(okWith({ other: true }))).toBe("unknown")
  })

  it("returns 'unknown' when the payload is not an object", async () => {
    expect(await fetchLatestNpmVersion(okWith("a string"))).toBe("unknown")
  })

  it("returns 'unknown' when the payload is null", async () => {
    expect(await fetchLatestNpmVersion(okWith(null))).toBe("unknown")
  })

  it("returns 'unknown' when the fetch rejects", async () => {
    const stub: typeof fetch = () => Promise.reject(new Error("network down"))
    expect(await fetchLatestNpmVersion(stub)).toBe("unknown")
  })
})
