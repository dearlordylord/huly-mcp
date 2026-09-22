import { Context, Effect, Exit, Layer, Schema } from "effect"
import { McpProtocol } from "effect/unstable/ai"
import { McpServer } from "effect/unstable/ai/McpServer"
import * as McpSchema from "effect/unstable/ai/McpSchema"
import { describe, expect, it } from "vitest"

import { sanitizeHulyRuntimeConfigFromEnv } from "../../src/config/config.js"
import { CanonicalBase64ImageData } from "../../src/domain/schemas/attachments.js"
import { HulyClient } from "../../src/huly/client.js"
import { HulyConnectionError } from "../../src/huly/errors-base.js"
import { HulyStorageClient } from "../../src/huly/storage.js"
import { WorkspaceClient } from "../../src/huly/workspace-client.js"
import { ToolProvisionFailure } from "../../src/mcp/tools/operation-failure.js"
import type { ClientResolver } from "../../src/runtime/client-resolver.js"
import type { ToolCalledProps } from "../../src/telemetry/telemetry.js"
import {
  deriveEditMode,
  dispatchEffectMcpTool,
  effectMcpEditMode,
  fetchLatestNpmVersion
} from "../../src/mcp/effect-ai-dispatch.js"
import {
  effectMcpBuiltinVisible,
  effectMcpFirstListVisibility,
  effectMcpNativeVisibility,
  effectMcpNativeVisible,
  effectMcpProxyVisibility,
  effectMcpProxyVisible,
  makeEffectMcpRegistry
} from "../../src/mcp/effect-ai-registry.js"
import {
  buildHulyContext,
  getHulyContextToolDefinition,
  parseToolsets,
  versionToolDefinition
} from "../../src/mcp/huly-context-tool.js"
import {
  defaultExposureOptions,
  type ProtocolExposureOptions,
  resolveProtocolExposure
} from "../../src/mcp/protocol-tool-exposure.js"
import { handleProxyToolCall, proxyToolDefinitions } from "../../src/mcp/proxy-tools.js"
import { toolRegistry } from "../../src/mcp/tools/index.js"
import {
  createToolDefinition,
  isNoArgumentTool,
  makeToolCategory,
  makeToolDescription,
  makeToolName,
  type ToolOperationSuccess,
  type ToolDefinition
} from "../../src/mcp/tools/registry.js"
import { assertAt } from "../../src/utils/assertions.js"

const protocols = { fullRegistry: toolRegistry, scopedNativeRegistry: toolRegistry }
const warning = { code: "status_metadata_unresolved" as const, message: "Status metadata was unavailable." }
const nativeOptions = defaultExposureOptions()
const proxyOptions: ProtocolExposureOptions = {
  exposureConfig: { configuredMode: "proxy", proxyOutputStrict: false },
  toolScopeFilteringActive: false,
  currentClientInfo: () => undefined
}
const nativeExposure = () => resolveProtocolExposure(protocols, nativeOptions)
const proxyExposure = () => resolveProtocolExposure(protocols, proxyOptions)

const definitionNamed = (name: string): ToolDefinition => {
  const definition = [...proxyToolDefinitions, ...toolRegistry.definitions].find((candidate) => candidate.name === name)
  if (definition === undefined) throw new Error(`missing test definition ${name}`)
  return definition
}

const unknownDefinition = createToolDefinition({
  name: makeToolName("unknown_test_tool"),
  description: makeToolDescription("Unknown test tool used to exercise dispatch fallback behavior."),
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  outputSchema: versionToolDefinition.outputSchema,
  category: makeToolCategory("test")
})
const malformedDefinition: ToolDefinition = {
  name: " ",
  description: makeToolDescription("Malformed test definition used to exercise boundary parsing."),
  inputSchema: {},
  outputSchema: versionToolDefinition.outputSchema,
  category: makeToolCategory("test")
}

const versionDefinition: ToolDefinition = { ...versionToolDefinition, category: makeToolCategory("builtin") }
const contextDefinition: ToolDefinition = { ...getHulyContextToolDefinition, category: makeToolCategory("builtin") }

const makeResolver = (): ClientResolver => async () => {
  const services = await Effect.runPromise(
    Layer.build(Layer.merge(HulyClient.testLayer({}), HulyStorageClient.testLayer({}))).pipe(Effect.scoped)
  )
  return Exit.succeed({
    hulyClient: Context.get(services, HulyClient),
    storageClient: Context.get(services, HulyStorageClient)
  })
}

const makeWorkspaceResolver = (): ClientResolver => async () => {
  const services = await Effect.runPromise(
    Layer.build(
      Layer.mergeAll(HulyClient.testLayer({}), HulyStorageClient.testLayer({}), WorkspaceClient.testLayer({}))
    ).pipe(Effect.scoped)
  )
  return Exit.succeed({
    hulyClient: Context.get(services, HulyClient),
    storageClient: Context.get(services, HulyStorageClient),
    workspaceClient: Context.get(services, WorkspaceClient)
  })
}

const failedResolver: ClientResolver = async () =>
  Exit.fail(new HulyConnectionError({ message: "test connection unavailable" }))

const throwingResolver: ClientResolver = async () => {
  throw new Error("resolver rejected")
}

const contextResult = (exposure = nativeExposure().context) =>
  buildHulyContext(
    { transport: "stdio" },
    toolRegistry,
    parseToolsets(undefined, () => {}),
    sanitizeHulyRuntimeConfigFromEnv({}),
    exposure
  )

const dispatch = (
  definition: ToolDefinition,
  args: unknown,
  exposure = nativeExposure(),
  resolver: ClientResolver = makeResolver(),
  latest: () => Promise<string> = async () => "9.9.9"
) =>
  Effect.runPromise(
    dispatchEffectMcpTool(
      { getHulyContext: (toolExposure) => Effect.succeed(contextResult(toolExposure)) },
      exposure,
      definition,
      args,
      latest,
      resolver
    )
  )

describe("Effect AI MCP dispatch", () => {
  it("derives native and proxy document edit telemetry modes", () => {
    expect(deriveEditMode("edit_document", { old_text: "before", new_text: "after" })).toBe("search_and_replace")
    expect(deriveEditMode("edit_document", { content: "replacement" })).toBe("full_replace")
    expect(deriveEditMode("edit_document", { title: "Renamed" })).toBe("title_only")
    expect(deriveEditMode("edit_document", "not an arguments object")).toBeUndefined()
    expect(
      effectMcpEditMode("invoke_tool", {
        toolName: "edit_document",
        arguments: { old_text: "before", new_text: "after" }
      })
    ).toBe("search_and_replace")
    expect(effectMcpEditMode("invoke_tool", { toolName: "missing tool" })).toBeUndefined()
    expect(effectMcpEditMode("invoke_tool", "not an arguments object")).toBeUndefined()
    expect(effectMcpEditMode("list_projects", {})).toBeUndefined()
  })

  it("normalizes unavailable and malformed npm latest-version responses", async () => {
    await expect(fetchLatestNpmVersion(async () => new Response(JSON.stringify({ version: 7 })))).resolves.toBe(
      "unknown"
    )
    await expect(
      fetchLatestNpmVersion(async () => {
        throw new Error("offline")
      })
    ).resolves.toBe("unknown")
  })

  it("dispatches version and context builtins with strict no-argument handling", async () => {
    const version = await dispatch(versionDefinition, {})
    const context = await dispatch(contextDefinition, undefined)
    const invalidVersion = await dispatch(versionDefinition, { extra: true })
    const invalidContext = await dispatch(contextDefinition, { extra: true })
    const unavailableLatest = await dispatch(versionDefinition, {}, nativeExposure(), makeResolver(), async () => {
      throw new Error("registry unavailable")
    })
    const malformedLatest = await dispatch(versionDefinition, {}, nativeExposure(), makeResolver(), async () => "")

    expect(version.structuredContent).toMatchObject({ result: { latest: "9.9.9" } })
    expect(context.structuredContent).toHaveProperty("result.transport.type", "stdio")
    expect(invalidVersion.isError).toBe(true)
    expect(invalidContext.isError).toBe(true)
    expect(unavailableLatest.structuredContent).toMatchObject({ result: { latest: "unknown" } })
    expect(malformedLatest.isError).toBe(true)
  })

  it("builds HTTP context defaults and explicit listener metadata without a supplied exposure", () => {
    const scope = parseToolsets("issues", () => {})
    const runtime = sanitizeHulyRuntimeConfigFromEnv({})
    const defaults = buildHulyContext({ transport: "http", httpHost: " " }, toolRegistry, scope, runtime)
    const explicit = buildHulyContext(
      { transport: "http", httpHost: "127.0.0.2", httpPort: 4321 },
      toolRegistry,
      scope,
      runtime
    )

    expect(defaults.transport).toMatchObject({ type: "http", http: { host: "127.0.0.1", port: 3000 } })
    expect(defaults.toolExposure).toMatchObject({ configuredMode: "auto", resolvedMode: "native" })
    expect(explicit.transport).toMatchObject({ type: "http", http: { host: "127.0.0.2", port: 4321 } })
  })

  it("dispatches proxy catalog operations and enforces exposure", async () => {
    const categories = await dispatch(definitionNamed("list_tool_categories"), {}, proxyExposure())
    const search = await dispatch(
      definitionNamed("search_tools"),
      { query: "list projects", limit: 2 },
      proxyExposure()
    )
    const schema = await dispatch(definitionNamed("get_tool_schema"), { toolName: "list_projects" }, proxyExposure())
    const invoked = await dispatch(
      definitionNamed("invoke_tool"),
      { toolName: "list_projects", arguments: {} },
      proxyExposure()
    )
    const hidden = await dispatch(definitionNamed("search_tools"), { query: "projects" })
    const failedInvoke = await dispatch(
      definitionNamed("invoke_tool"),
      { toolName: "list_projects", arguments: {} },
      proxyExposure(),
      failedResolver
    )
    const directHiddenNative = await dispatch(definitionNamed("list_projects"), {}, proxyExposure())
    const invokedWithWorkspace = await dispatch(
      definitionNamed("invoke_tool"),
      { toolName: "list_projects", arguments: {} },
      proxyExposure(),
      makeWorkspaceResolver()
    )

    expect(categories.structuredContent).toHaveProperty("result.categories")
    expect(search.structuredContent).toHaveProperty("result.matches")
    expect(schema.structuredContent).toHaveProperty("result.name", "list_projects")
    expect(invoked.isError).not.toBe(true)
    expect(hidden.isError).toBe(true)
    expect(failedInvoke.isError).toBe(true)
    expect(directHiddenNative.isError).not.toBe(true)
    expect(invokedWithWorkspace.isError).not.toBe(true)
  })

  it("covers proxy parse failures, rejected boundaries, and unknown definitions", async () => {
    const invalidSearch = await dispatch(definitionNamed("search_tools"), {}, proxyExposure())
    const invalidSchema = await dispatch(
      definitionNamed("get_tool_schema"),
      { toolName: "missing_tool" },
      proxyExposure()
    )
    const rejectedCatalog = await dispatch(
      definitionNamed("search_tools"),
      { query: "projects" },
      proxyExposure(),
      throwingResolver
    )
    const rejectedInvoke = await dispatch(
      definitionNamed("invoke_tool"),
      { toolName: "list_projects", arguments: {} },
      proxyExposure(),
      throwingResolver
    )
    const unknown = await dispatch(unknownDefinition, {})
    const malformed = await dispatch(malformedDefinition, {})

    expect(invalidSearch.isError).toBe(true)
    expect(invalidSchema.isError).toBe(true)
    expect(rejectedCatalog.isError).not.toBe(true)
    expect(rejectedInvoke.isError).toBe(true)
    expect(unknown.isError).toBe(true)
    expect(malformed.isError).toBe(true)
  })

  it("preserves every proxy target response shape and deferred argument form", async () => {
    const services = await Effect.runPromise(
      Layer.build(
        Layer.mergeAll(HulyClient.testLayer({}), HulyStorageClient.testLayer({}), WorkspaceClient.testLayer({}))
      ).pipe(Effect.scoped)
    )
    const clients = {
      hulyClient: Context.get(services, HulyClient),
      storageClient: Context.get(services, HulyStorageClient)
    }
    const workspaceClient = Context.get(services, WorkspaceClient)
    const received: Array<unknown> = []
    const baseTool = toolRegistry.tools.get("list_projects")
    if (baseTool === undefined) throw new Error("Expected list_projects")
    const responses: Array<ToolOperationSuccess> = [
      { result: { ok: true }, warnings: [warning] },
      { result: { ok: true }, warnings: [] },
      {
        result: { ok: true },
        warnings: [],
        image: { type: "image" as const, data: CanonicalBase64ImageData.make("cG5n"), mimeType: "image/png" }
      }
    ]
    const scriptedTool = {
      ...baseTool,
      operation: {
        ...baseTool.operation,
        execute: (args: unknown) => {
          received.push(args)
          return Effect.succeed(responses.shift() ?? { result: null, warnings: [] })
        }
      }
    }
    const registry = { ...toolRegistry, tools: new Map(toolRegistry.tools).set("list_projects", scriptedTool) }
    const invoke = (argumentsValue: unknown) =>
      handleProxyToolCall({
        toolName: makeToolName("invoke_tool"),
        args: { toolName: "list_projects", arguments: argumentsValue },
        proxyCandidateRegistry: registry,
        clients
      })

    const warned = await invoke({ structured: true })
    const plain = await invoke('{"serialized":true}')
    const image = await invoke("invalid json")
    const unknownTarget = await handleProxyToolCall({
      toolName: makeToolName("invoke_tool"),
      args: { toolName: "missing_target", arguments: {} },
      proxyCandidateRegistry: registry,
      clients
    })
    const invalidInvoke = await handleProxyToolCall({
      toolName: makeToolName("invoke_tool"),
      args: {},
      proxyCandidateRegistry: registry,
      clients
    })
    const missingClients = await handleProxyToolCall({
      toolName: makeToolName("invoke_tool"),
      args: { toolName: "list_projects", arguments: {} },
      proxyCandidateRegistry: registry
    })
    const invalidCategories = await handleProxyToolCall({
      toolName: makeToolName("list_tool_categories"),
      args: "invalid",
      proxyCandidateRegistry: registry
    })
    const defaultCategories = await handleProxyToolCall({
      toolName: makeToolName("list_tool_categories"),
      args: undefined,
      proxyCandidateRegistry: registry
    })
    const invalidSchema = await handleProxyToolCall({
      toolName: makeToolName("get_tool_schema"),
      args: undefined,
      proxyCandidateRegistry: registry
    })
    const unknownProxy = await handleProxyToolCall({
      toolName: makeToolName("unknown_test_tool"),
      args: {},
      proxyCandidateRegistry: registry
    })
    const unexpectedNoArgumentInput = await handleProxyToolCall({
      toolName: makeToolName("invoke_tool"),
      args: { toolName: "get_global_space_admins", arguments: { extra: true } },
      proxyCandidateRegistry: registry,
      clients
    })
    const missingRequiredInput = await handleProxyToolCall({
      toolName: makeToolName("invoke_tool"),
      args: { toolName: "get_issue" },
      proxyCandidateRegistry: registry,
      clients
    })
    const failingTool = {
      ...baseTool,
      operation: {
        ...baseTool.operation,
        execute: () =>
          Effect.fail(new ToolProvisionFailure({ error: new HulyConnectionError({ message: "target unavailable" }) }))
      }
    }
    const failingRegistry = { ...registry, tools: new Map(registry.tools).set("list_projects", failingTool) }
    const targetFailure = await handleProxyToolCall({
      toolName: makeToolName("invoke_tool"),
      args: { toolName: "list_projects", arguments: {} },
      proxyCandidateRegistry: failingRegistry,
      clients
    })
    const noArgumentBase = toolRegistry.tools.get("get_global_space_admins")
    if (noArgumentBase === undefined) throw new Error("Expected get_global_space_admins")
    const noArgumentTool = {
      ...noArgumentBase,
      operation: { ...noArgumentBase.operation, execute: () => Effect.succeed({ result: [], warnings: [] }) }
    }
    const noArgumentRegistry = {
      ...registry,
      tools: new Map(registry.tools).set("get_global_space_admins", noArgumentTool)
    }
    const omittedNoArgumentInput = await handleProxyToolCall({
      toolName: makeToolName("invoke_tool"),
      args: { toolName: "get_global_space_admins" },
      proxyCandidateRegistry: noArgumentRegistry,
      clients
    })
    const invalidSummaryTool = {
      ...baseTool,
      name: makeToolName("invalid_summary_tool"),
      inputSchema: { type: "object", properties: { " ": { type: "string" } } }
    }
    const invalidSummaryRegistry = {
      ...registry,
      tools: new Map(registry.tools).set("invalid_summary_tool", invalidSummaryTool),
      definitions: [...registry.definitions, invalidSummaryTool]
    }
    const invalidSummarySearch = await handleProxyToolCall({
      toolName: makeToolName("search_tools"),
      args: { query: "invalid summary" },
      proxyCandidateRegistry: invalidSummaryRegistry
    })
    const missingWorkspaceClient = await handleProxyToolCall({
      toolName: makeToolName("invoke_tool"),
      args: { toolName: "create_funnel", arguments: { name: "Coverage Funnel" } },
      proxyCandidateRegistry: registry,
      clients
    })
    const suppliedWorkspaceClient = await handleProxyToolCall({
      toolName: makeToolName("invoke_tool"),
      args: { toolName: "create_funnel", arguments: { name: "Coverage Funnel" } },
      proxyCandidateRegistry: registry,
      clients: { ...clients, workspaceClient }
    })

    expect(warned.structuredContent?.warnings).toEqual([warning])
    expect(plain.structuredContent).not.toHaveProperty("warnings")
    expect("imageContent" in image ? image.imageContent : undefined).toEqual({
      type: "image",
      data: "cG5n",
      mimeType: "image/png"
    })
    expect(unknownTarget.isError).toBe(true)
    expect(invalidInvoke.isError).toBe(true)
    expect(missingClients.isError).toBe(true)
    expect(invalidCategories.isError).toBe(true)
    expect(defaultCategories.isError).not.toBe(true)
    expect(invalidSchema.isError).toBe(true)
    expect(unknownProxy.isError).toBe(true)
    expect(unexpectedNoArgumentInput.isError).toBe(true)
    expect(missingRequiredInput.isError).toBe(true)
    expect(targetFailure.isError).toBe(true)
    expect(omittedNoArgumentInput.isError).not.toBe(true)
    expect(invalidSummarySearch.structuredContent).toHaveProperty(
      "result.matches.0.parameterSummaryStatus",
      "invalid_input_schema"
    )
    expect(missingWorkspaceClient.isError).toBe(true)
    expect(suppliedWorkspaceClient.isError).toBe(true)
    expect(received).toEqual([{ structured: true }, { serialized: true }, "invalid json"])
  })

  it("dispatches native operations and argument/client failures", async () => {
    const listProjects = definitionNamed("list_projects")
    const getIssue = definitionNamed("get_issue")
    const success = await dispatch(listProjects, {})
    const missingArguments = await dispatch(getIssue, undefined)
    const clientFailure = await dispatch(listProjects, {}, nativeExposure(), failedResolver)
    const rejectedClient = await dispatch(listProjects, {}, nativeExposure(), throwingResolver)

    expect(success.isError).not.toBe(true)
    expect(missingArguments.isError).toBe(true)
    expect(clientFailure.isError).toBe(true)
    expect(rejectedClient.isError).toBe(true)
  })

  it("rejects arguments for registered native no-argument tools", async () => {
    const definition = toolRegistry.definitions.find(isNoArgumentTool)
    if (definition === undefined) throw new Error("expected a native no-argument tool")
    const result = await dispatch(definition, { unexpected: true })
    expect(result.isError).toBe(true)
  })

  it("evaluates builtin, proxy, and native visibility from initialized client data", () => {
    const nativeDefinition = definitionNamed("list_projects")
    const payload = initializePayload("codex")
    expect(effectMcpBuiltinVisible(payload)).toBe(true)
    expect(effectMcpProxyVisible(protocols, proxyOptions, payload)).toBe(true)
    expect(effectMcpProxyVisible(protocols, nativeOptions, payload)).toBe(false)
    expect(effectMcpNativeVisible(protocols, nativeOptions, nativeDefinition, payload)).toBe(true)
    expect(effectMcpNativeVisible(protocols, proxyOptions, nativeDefinition, payload)).toBe(false)
    expect(effectMcpProxyVisibility(protocols, proxyOptions)(payload)).toBe(true)
    expect(effectMcpNativeVisibility(protocols, nativeOptions, nativeDefinition)(payload)).toBe(true)
  })
})

const initializePayload = (name: string) =>
  Schema.decodeUnknownSync(McpSchema.Initialize.payloadSchema)({
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name, version: "1.0.0" }
  })

const clientService = (name: string) =>
  McpSchema.McpServerClient.of({
    clientId: 1,
    protocolVersion: McpProtocol.v2025_06_18.protocolVersion,
    clientCapabilities: {},
    clientInfo: { name, version: "1.0.0" },
    initializePayload: initializePayload(name),
    getClient: Effect.die("server-to-client requests are outside this test")
  })

describe("Effect AI registered tool handlers", () => {
  it("applies initialized-client exposure, telemetry, and quiescing", async () => {
    const calls: Array<ToolCalledProps> = []
    const firstLists: Array<unknown> = []
    const adapter = makeEffectMcpRegistry({
      resolveClients: failedResolver,
      telemetry: {
        sessionStart: () => {},
        firstListTools: (props) => firstLists.push(props),
        toolCalled: (props) => calls.push(props),
        shutdown: async () => {}
      },
      registry: toolRegistry,
      getHulyContext: (exposure) => Effect.succeed(contextResult(exposure)),
      fetchLatestVersion: async () => "8.8.8",
      exposureOptions: { exposureConfig: { configuredMode: "auto", proxyOutputStrict: false } }
    })

    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          yield* adapter.registration
          const server = yield* McpServer
          expect(
            effectMcpFirstListVisibility(
              {
                resolveClients: failedResolver,
                telemetry: {
                  sessionStart: () => {},
                  firstListTools: (props) => firstLists.push(props),
                  toolCalled: () => {},
                  shutdown: async () => {}
                },
                registry: toolRegistry,
                getHulyContext: (exposure) => Effect.succeed(contextResult(exposure))
              },
              protocols,
              proxyOptions
            )(initializePayload("codex-cli"))
          ).toBe(true)
          const version = yield* server
            .callTool({ name: "get_version", arguments: {} })
            .pipe(Effect.provideService(McpSchema.McpServerClient, clientService("codex-cli")))
          expect(version.structuredContent).toMatchObject({ result: { latest: "8.8.8" } })
          const versionWithoutArguments = yield* server
            .callTool({ name: "get_version" })
            .pipe(Effect.provideService(McpSchema.McpServerClient, clientService("codex-cli")))
          expect(versionWithoutArguments.isError).not.toBe(true)
          expect(server.tools.some(({ tool }) => tool.name === "invoke_tool")).toBe(true)
          yield* server
            .callTool({
              name: "invoke_tool",
              arguments: { toolName: "edit_document", arguments: { old_text: "before", new_text: "after" } }
            })
            .pipe(Effect.provideService(McpSchema.McpServerClient, clientService("codex-cli")))
          yield* Effect.promise(adapter.quiesce)
          const stopped = yield* server
            .callTool({ name: "get_version", arguments: {} })
            .pipe(Effect.provideService(McpSchema.McpServerClient, clientService("codex-cli")))
          expect(stopped.isError).toBe(true)
        }).pipe(Effect.provide(McpServer.layer))
      )
    )

    expect(assertAt(calls, 0)).toMatchObject({ toolName: "get_version", status: "success", clientKind: "codex" })
    expect(calls).toContainEqual(expect.objectContaining({ toolName: "invoke_tool", editMode: "search_and_replace" }))
    expect(firstLists).toHaveLength(4)
    expect(firstLists).toEqual(
      expect.arrayContaining([expect.objectContaining({ clientKind: "codex", resolvedMode: "proxy" })])
    )
  })

  it("maps handler defects without exposing Effect internals", async () => {
    const defects = [new Error("context defect"), "string context defect"]
    const adapter = makeEffectMcpRegistry({
      resolveClients: failedResolver,
      telemetry: { sessionStart: () => {}, firstListTools: () => {}, toolCalled: () => {}, shutdown: async () => {} },
      registry: toolRegistry,
      getHulyContext: () => Effect.die(defects.shift() ?? "fallback defect")
    })

    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          yield* adapter.registration
          const server = yield* McpServer
          const result = yield* server
            .callTool({ name: "get_huly_context", arguments: {} })
            .pipe(Effect.provideService(McpSchema.McpServerClient, clientService("generic-client")))
          expect(result.isError).toBe(true)
          const stringDefect = yield* server
            .callTool({ name: "get_huly_context", arguments: {} })
            .pipe(Effect.provideService(McpSchema.McpServerClient, clientService("generic-client")))
          expect(stringDefect.isError).toBe(true)
        }).pipe(Effect.provide(McpServer.layer))
      )
    )
  })
})
