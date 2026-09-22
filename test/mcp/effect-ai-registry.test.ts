import { Effect, Exit, Schema } from "effect"
import { McpProtocol } from "effect/unstable/ai"
import { McpServer } from "effect/unstable/ai/McpServer"
import * as McpSchema from "effect/unstable/ai/McpSchema"
import { describe, it } from "@effect/vitest"
import { expect } from "vitest"

import { CanonicalBase64ImageData } from "../../src/domain/schemas/attachments.js"
import { HulyConnectionError } from "../../src/huly/errors-base.js"
import {
  createImageSuccessResponse,
  createInvalidParamsError,
  createSuccessResponse,
  McpErrorCode
} from "../../src/mcp/error-mapping.js"
import {
  effectMcpNativeVisible,
  effectMcpProxyVisible,
  makeEffectMcpRegistry,
  toEffectCallToolResult
} from "../../src/mcp/effect-ai-registry.js"
import { dispatchEffectMcpTool, fetchLatestNpmVersion } from "../../src/mcp/effect-ai-dispatch.js"
import { getHulyContextToolDefinition, versionToolDefinition } from "../../src/mcp/huly-context-tool.js"
import { defaultExposureOptions, resolveProtocolExposure } from "../../src/mcp/protocol-tool-exposure.js"
import { PROXY_TOOL_NAMES } from "../../src/mcp/proxy-tools.js"
import { toolRegistry } from "../../src/mcp/tools/index.js"
import { makeToolCategory } from "../../src/mcp/tools/registry.js"
import type { TelemetryOperations } from "../../src/telemetry/telemetry.js"

const telemetry: TelemetryOperations = {
  sessionStart: () => {},
  firstListTools: () => {},
  toolCalled: () => {},
  shutdown: async () => {}
}

const failedResolver = async () => Exit.fail(new HulyConnectionError({ message: "not used" }))
const WireCallToolResult = Schema.Struct({
  content: Schema.Array(
    Schema.Union([
      Schema.Struct({ type: Schema.Literal("text"), text: Schema.String }),
      Schema.Struct({ type: Schema.Literal("image"), data: Schema.String, mimeType: Schema.String })
    ])
  ),
  structuredContent: Schema.optionalKey(Schema.Unknown),
  isError: Schema.optionalKey(Schema.Boolean),
  _meta: Schema.optionalKey(Schema.Record(Schema.String, Schema.Unknown))
})

const encodeWire = (result: typeof McpSchema.CallToolResult.Type) =>
  Schema.decodeUnknownSync(WireCallToolResult)(
    Schema.encodeUnknownSync(Schema.toCodecJson(McpSchema.CallToolResult))(result)
  )

const clientService = (name: string) =>
  McpSchema.McpServerClient.of({
    clientId: 1,
    protocolVersion: McpProtocol.v2025_06_18.protocolVersion,
    clientCapabilities: {},
    clientInfo: { name, version: "1.0.0" },
    initializePayload: Schema.decodeUnknownSync(McpSchema.Initialize.payloadSchema)({
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name, version: "1.0.0" }
    }),
    getClient: Effect.die("reverse requests are outside this test")
  })

describe("Effect AI MCP registry", () => {
  it("normalizes successful, malformed, and unavailable npm version responses", async () => {
    await expect(fetchLatestNpmVersion(async () => new Response(JSON.stringify({ version: "9.9.9" })))).resolves.toBe(
      "9.9.9"
    )
    await expect(fetchLatestNpmVersion(async () => new Response(JSON.stringify({ version: 9 })))).resolves.toBe(
      "unknown"
    )
    await expect(fetchLatestNpmVersion(async () => Promise.reject(new Error("offline")))).resolves.toBe("unknown")
  })

  it("maps rich success and typed error responses to the wire codec", () => {
    const image = createImageSuccessResponse(
      { name: "shot.png" },
      { type: "image", data: CanonicalBase64ImageData.make("cG5n"), mimeType: "image/png" }
    )
    const error = createInvalidParamsError("Invalid issue", "UnknownTool")

    expect(encodeWire(toEffectCallToolResult(image))).toMatchObject({
      content: [
        { type: "text", text: JSON.stringify({ name: "shot.png" }) },
        { type: "image", data: "cG5n", mimeType: "image/png" }
      ]
    })
    expect(encodeWire(toEffectCallToolResult(error))).toMatchObject({
      content: [{ type: "text", text: "Invalid issue" }],
      isError: true,
      _meta: { errorCode: McpErrorCode.InvalidParams, errorTag: "UnknownTool" }
    })
  })

  it("normalizes undefined values once for text and structured tool output", () => {
    const response = createSuccessResponse({
      nested: { omitted: undefined, kept: "value" },
      items: [undefined, "value"]
    })
    const encoded = encodeWire(toEffectCallToolResult(response))
    const normalized = { nested: { kept: "value" }, items: [null, "value"] }

    expect(encoded.content).toEqual([{ type: "text", text: JSON.stringify(normalized) }])
    expect(encoded.structuredContent).toEqual({ result: normalized })
  })

  it("derives native and proxy visibility from each request profile", () => {
    const registries = { fullRegistry: toolRegistry, scopedNativeRegistry: toolRegistry }
    const options = {
      ...defaultExposureOptions(),
      exposureConfig: { configuredMode: "auto" as const, proxyOutputStrict: false }
    }
    const nativeTool = toolRegistry.definitions.find((tool) => tool.name === "list_projects")
    if (nativeTool === undefined) throw new Error("Expected list_projects")

    expect(
      effectMcpNativeVisible(registries, options, nativeTool, { clientInfo: { name: "claude-code", version: "1" } })
    ).toBe(true)
    expect(effectMcpProxyVisible(registries, options, { clientInfo: { name: "claude-ai", version: "1" } })).toBe(true)
    expect(
      effectMcpNativeVisible(registries, options, nativeTool, { clientInfo: { name: "claude-ai", version: "1" } })
    ).toBe(false)
  })

  it("dispatches builtins and preserves argument and client-resolution failures", async () => {
    const exposure = resolveProtocolExposure(
      { fullRegistry: toolRegistry, scopedNativeRegistry: toolRegistry },
      defaultExposureOptions()
    )
    const options = { getHulyContext: () => Effect.die("not used after argument rejection") }
    const versionDefinition = { ...versionToolDefinition, category: makeToolCategory("builtin") }
    const contextDefinition = { ...getHulyContextToolDefinition, category: makeToolCategory("builtin") }
    const version = await Effect.runPromise(
      dispatchEffectMcpTool(options, exposure, versionDefinition, {}, async () => "9.9.9", failedResolver)
    )
    const invalidVersion = await Effect.runPromise(
      dispatchEffectMcpTool(
        options,
        exposure,
        versionDefinition,
        { unexpected: true },
        async () => "9.9.9",
        failedResolver
      )
    )
    const invalidContext = await Effect.runPromise(
      dispatchEffectMcpTool(
        options,
        exposure,
        contextDefinition,
        { unexpected: true },
        async () => "9.9.9",
        failedResolver
      )
    )
    const native = toolRegistry.definitions.find((tool) => tool.name === "list_projects")
    if (native === undefined) throw new Error("Expected list_projects")
    const unavailable = await Effect.runPromise(
      dispatchEffectMcpTool(options, exposure, native, {}, async () => "9.9.9", failedResolver)
    )

    expect(version.isError).not.toBe(true)
    expect(invalidVersion.isError).toBe(true)
    expect(invalidContext.isError).toBe(true)
    expect(unavailable.isError).toBe(true)
  })

  it.effect("registers tools and resources and honors quiescing", () =>
    Effect.gen(function* () {
      const adapter = makeEffectMcpRegistry({
        resolveClients: failedResolver,
        discoverConcreteResources: false,
        telemetry,
        registry: toolRegistry,
        getHulyContext: () => Effect.die("not used"),
        fetchLatestVersion: async () => "9.9.9"
      })
      yield* adapter.registration
      const server = yield* McpServer
      expect(server.tools.map(({ tool }) => tool.name)).toEqual(
        expect.arrayContaining([...PROXY_TOOL_NAMES, "list_projects", "get_version"])
      )
      expect(server.resourceTemplates).toHaveLength(3)

      const version = yield* server
        .callTool({ name: "get_version", arguments: {} })
        .pipe(Effect.provideService(McpSchema.McpServerClient, clientService("claude-ai")))
      expect(version.structuredContent).toMatchObject({ result: { latest: "9.9.9" } })
      yield* Effect.promise(adapter.quiesce)
      const stopped = yield* server
        .callTool({ name: "get_version", arguments: {} })
        .pipe(Effect.provideService(McpSchema.McpServerClient, clientService("claude-ai")))
      expect(stopped.isError).toBe(true)
      const unknownWhileStopped = yield* server
        .callTool({ name: "unknown_huly_tool", arguments: {} })
        .pipe(Effect.provideService(McpSchema.McpServerClient, clientService("claude-ai")))
      expect(unknownWhileStopped.isError).toBe(true)
      expect(unknownWhileStopped.content).toEqual([
        { type: "text", text: "Huly MCP is shutting down; start a new connection before retrying" }
      ])
    }).pipe(Effect.provide(McpServer.layer))
  )
})
