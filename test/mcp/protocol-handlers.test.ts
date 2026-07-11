import { assertAt } from "../../src/utils/assertions.js"
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
import type { Class, Doc, FindResult, PersonId, Ref, Space, Status, WithLookup } from "@hcengineering/core"
import { toFindResult } from "@hcengineering/core"
import type { ProjectType } from "@hcengineering/task"
import { type Project as HulyProject, TimeReportDayType } from "@hcengineering/tracker"
import { McpError } from "@modelcontextprotocol/sdk/types.js"
import { Context, Effect, Layer, Schema } from "effect"
import { describe, expect, it } from "vitest"

import { ConfigValidationError, sanitizeHulyRuntimeConfigFromEnv } from "../../src/config/config.js"
import { type GetHulyContextResult, GetHulyContextResultSchema } from "../../src/domain/schemas/index.js"
import { HulyClient, type HulyClientOperations } from "../../src/huly/client.js"
import { Diagnostics } from "../../src/huly/diagnostics.js"
import { HulyConnectionError } from "../../src/huly/errors.js"
import { task, tracker } from "../../src/huly/huly-plugins.js"
import { HulyStorageClient } from "../../src/huly/storage.js"
import { WorkspaceClient } from "../../src/huly/workspace-client.js"
import { createInvalidParamsError } from "../../src/mcp/error-mapping.js"
import {
  buildHulyContext,
  GET_HULY_CONTEXT_TOOL_NAME,
  parseToolsets,
  VERSION_TOOL_NAME
} from "../../src/mcp/huly-context-tool.js"
import {
  type ClientBundle,
  createMcpProtocolHandlers,
  deriveEditMode,
  fetchLatestNpmVersion,
  liveNowClock,
  type NowClock
} from "../../src/mcp/protocol-handlers.js"
import { resolveProtocolExposure, toListedTool } from "../../src/mcp/protocol-tool-exposure.js"
import { handleProxyToolCall } from "../../src/mcp/proxy-tools.js"
import { parseMcpClientInfo } from "../../src/mcp/tool-mode.js"
import { createToolOutputSchema } from "../../src/mcp/tool-output-schema.js"
import { createFilteredRegistry, type ToolRegistry, toolRegistry } from "../../src/mcp/tools/index.js"
import {
  createToolDefinition,
  defineTool,
  isNoArgumentTool,
  makeToolCategory,
  makeToolDescription,
  makeToolName,
  type RegisteredTool,
  requiresArgumentsObject
} from "../../src/mcp/tools/registry.js"
import { createNoopTelemetry } from "../../src/telemetry/noop.js"
import type { FirstListToolsProps, TelemetryOperations, ToolCalledProps } from "../../src/telemetry/telemetry.js"
import { VERSION } from "../../src/version.js"

// A real, empty tool registry (no category tools) — used for the builtin-only paths.
const categorySet = (...categories: ReadonlyArray<string>) => new Set(categories.map(makeToolCategory))
const emptyRegistry = createFilteredRegistry(categorySet())

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
  firstListTools: Array<FirstListToolsProps | undefined>
} => {
  const toolCalled: Array<ToolCalledProps> = []
  const firstListTools: Array<FirstListToolsProps | undefined> = []
  const telemetry: TelemetryOperations = {
    ...createNoopTelemetry(),
    firstListTools: (props) => {
      firstListTools.push(props)
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

const isJsonObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const decodeJsonPointerSegment = (segment: string): string => segment.replace(/~1/g, "/").replace(/~0/g, "~")

const resolvesLocalJsonSchemaRef = (schema: unknown, ref: string): boolean => {
  if (ref === "#") return true
  if (!ref.startsWith("#/")) return false

  let current = schema
  for (const segment of ref.slice(2).split("/").map(decodeJsonPointerSegment)) {
    if (Array.isArray(current)) {
      const index = Number(segment)
      if (!Number.isInteger(index) || index < 0 || index >= current.length) return false
      current = current[index]
    } else if (isJsonObject(current)) {
      if (!(segment in current)) return false
      current = current[segment]
    } else {
      return false
    }
  }

  return current !== undefined
}

const collectJsonSchemaRefs = (
  value: unknown,
  path: string = "$"
): ReadonlyArray<{ readonly path: string; readonly ref: string }> => {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectJsonSchemaRefs(item, `${path}[${index}]`))
  }
  if (!isJsonObject(value)) return []

  const ownRefs = typeof value.$ref === "string" ? [{ path: `${path}.$ref`, ref: value.$ref }] : []
  return [
    ...ownRefs,
    ...Object.entries(value).flatMap(([key, nested]) =>
      key === "$ref" ? [] : collectJsonSchemaRefs(nested, `${path}.${key}`)
    )
  ]
}

const unresolvedLocalJsonSchemaRefs = (
  schema: unknown
): ReadonlyArray<{ readonly path: string; readonly ref: string }> =>
  collectJsonSchemaRefs(schema).filter(({ ref }) => !resolvesLocalJsonSchemaRef(schema, ref))

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
      const contextTool = result.tools.find(tool => tool.name === GET_HULY_CONTEXT_TOOL_NAME)
      expect(contextTool?.outputSchema).toHaveProperty(["$defs", "NonEmptyTrimmedString"])
      expect(contextTool?.outputSchema?.properties?.result).not.toHaveProperty("$defs")
      expect(probe.firstListTools).toHaveLength(1)
      expect(assertAt(probe.firstListTools, 0)).toMatchObject({
        clientKind: "unknown",
        resolvedMode: "native"
      })
    })

    it("records resolved client classification on first listTools", async () => {
      const probe = createTelemetryProbe()
      const handlers = createMcpProtocolHandlers(
        unusedResolveClients,
        probe.telemetry,
        emptyRegistry,
        unusedGetHulyContext,
        liveNowClock,
        () => Promise.resolve("0.0.0"),
        proxyExposureOptions({ clientName: "codex-cli" })
      )

      await handlers.listTools()

      expect(assertAt(probe.firstListTools, 0)).toMatchObject({
        clientKind: "codex",
        resolvedMode: "proxy"
      })
    })

    it("omits properties when a registered object schema does not declare them", async () => {
      const handlers = createMcpProtocolHandlers(
        unusedResolveClients,
        createTelemetryProbe().telemetry,
        propertylessObjectRegistry,
        unusedGetHulyContext
      )

      const result = await handlers.listTools()
      const listed = result.tools.find(tool => tool.name === "propertyless_tool")

      expect(listed).toBeDefined()
      expect(listed?.inputSchema).not.toHaveProperty("properties")
    })

    it("omits optional output schema and annotations when converting a bare listed tool", () => {
      const listed = toListedTool({
        name: makeToolName("bare_tool"),
        description: makeToolDescription("Tool used to exercise protocol schema conversion."),
        inputSchema: {
          type: "object",
          properties: {
            valid: { type: "string" },
            ignored: "not an object"
          },
          required: ["valid"],
          additionalProperties: false
        }
      })

      expect(listed.outputSchema).toBeUndefined()
      expect(listed.annotations).toBeUndefined()
      expect(listed.inputSchema.properties).toEqual({ valid: { type: "string" } })
    })

    it("lists every registered category tool after schema compatibility conversion", async () => {
      const handlers = createMcpProtocolHandlers(
        unusedResolveClients,
        createTelemetryProbe().telemetry,
        toolRegistry,
        unusedGetHulyContext
      )

      const result = await handlers.listTools()
      const listedNames = result.tools.map((tool) => tool.name)
      const expectedNames = [
        VERSION_TOOL_NAME,
        GET_HULY_CONTEXT_TOOL_NAME,
        ...toolRegistry.definitions.map((tool) => tool.name)
      ]

      expect(listedNames).toEqual(expectedNames)
      expect(new Set(listedNames).size).toBe(listedNames.length)
      expect(listedNames).toContain("get_person")
      expect(listedNames).toContain("list_person_organizations")
      expect(listedNames).toContain("unschedule_todo")
      expect(listedNames).toContain("create_access_link")
      expect(listedNames).toContain("list_project_types")
      expect(result.tools.every((tool) => Object.hasOwn(tool.inputSchema, "type"))).toBe(true)
    })

    it("advertises tools/list schemas with resolvable local JSON Schema refs", async () => {
      const handlers = createMcpProtocolHandlers(
        unusedResolveClients,
        createTelemetryProbe().telemetry,
        toolRegistry,
        unusedGetHulyContext
      )

      const result = await handlers.listTools()
      const unresolvedRefs = result.tools.flatMap((tool) =>
        [
          { kind: "inputSchema", schema: tool.inputSchema },
          { kind: "outputSchema", schema: tool.outputSchema }
        ].flatMap(({ kind, schema }) =>
          unresolvedLocalJsonSchemaRefs(schema).map(({ path, ref }) => `${tool.name}.${kind}${path}: ${ref}`)
        )
      )

      expect(unresolvedRefs).toEqual([])
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
      expect(assertAt(probe.toolCalled, 0)).toMatchObject({
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

const buildStubClientsWithWorkspace = (): () => Promise<ClientBundle> => () =>
  Effect.runPromise(
    Effect.gen(function*() {
      const ctx = yield* Layer.build(
        Layer.mergeAll(HulyClient.testLayer({}), HulyStorageClient.testLayer({}), WorkspaceClient.testLayer({}))
      ).pipe(Effect.scoped)
      return {
        hulyClient: Context.get(ctx, HulyClient),
        storageClient: Context.get(ctx, HulyStorageClient),
        workspaceClient: Context.get(ctx, WorkspaceClient)
      }
    })
  )

const emptyFindResult = <T extends Doc>(): FindResult<T> => toFindResult([] satisfies Array<T>)

type ProjectWithTypeLookup = WithLookup<HulyProject> & { readonly $lookup: { readonly type: ProjectType } }

// Huly SDK document interfaces include generated/branded fields and plugin metadata
// that do not have public test constructors. These helpers build the minimal
// SDK-shaped documents read by getProject; brands are erased at runtime.
const projectTypeFixture = (statusId: Ref<Status>): ProjectType =>
  // eslint-disable-next-line no-restricted-syntax -- SDK ProjectType has generated plugin fields and branded refs with no public fixture constructor.
  ({
    _id: "project-type-1" as Ref<ProjectType>,
    _class: task.class.ProjectType,
    space: "space-1" as Ref<Space>,
    name: "Classic",
    descriptor: tracker.descriptors.ProjectType,
    statuses: [{ _id: statusId }],
    tasks: [],
    modifiedBy: "user-1" as PersonId,
    modifiedOn: 0,
    createdBy: "user-1" as PersonId,
    createdOn: 0
  } as unknown) as ProjectType

const projectWithTypeLookupFixture = (statusId: Ref<Status>, projectType: ProjectType): ProjectWithTypeLookup =>
  // eslint-disable-next-line no-restricted-syntax -- SDK Project plus lookup metadata has branded refs and generated fields with no public fixture constructor.
  ({
    _id: "project-1" as Ref<HulyProject>,
    _class: tracker.class.Project,
    space: "space-1" as Ref<Space>,
    identifier: "TEST",
    name: "Test Project",
    description: "Project used by resource warning tests",
    private: false,
    members: [],
    owners: [],
    archived: false,
    sequence: 1,
    defaultIssueStatus: statusId,
    defaultTimeReportDay: TimeReportDayType.CurrentWorkDay,
    modifiedBy: "user-1" as PersonId,
    modifiedOn: 0,
    createdBy: "user-1" as PersonId,
    createdOn: 0,
    $lookup: { type: projectType }
  } as unknown) as ProjectWithTypeLookup

const buildResourceWarningClients = (): () => Promise<ClientBundle> => {
  const statusId = "plainstatus" as Ref<Status>
  const projectType = projectTypeFixture(statusId)
  const project = projectWithTypeLookupFixture(statusId, projectType)

  // HulyClientOperations.findOne is generic by requested SDK class. This fixture
  // returns a project only when the class ref is tracker.class.Project and returns
  // undefined for every other class, so the generic contract is preserved.
  const findOne =
    ((_class: Ref<Class<Doc>>) =>
      Effect.succeed(_class === tracker.class.Project ? project : undefined)) as HulyClientOperations["findOne"]

  const findAll: HulyClientOperations["findAll"] = () => Effect.succeed(emptyFindResult())
  const findAllInModel: HulyClientOperations["findAllInModel"] = () => Effect.succeed(emptyFindResult())

  return buildStubClients({ findOne, findAll, findAllInModel })
}

const rejectingResolveClients = (): Promise<ClientBundle> => Promise.reject(new Error("client init boom"))
const rejectingResolveClientsWithString = (): Promise<ClientBundle> => Promise.reject("client init boom")
const configValidationError = (): ConfigValidationError =>
  new ConfigValidationError({
    message: "Configuration error: Expected HULY_URL to exist",
    field: "HULY_URL"
  })
const rejectingDirectConfigResolveClients = (): Promise<ClientBundle> => Promise.reject(configValidationError())
const rejectingFiberConfigResolveClients = (): Promise<ClientBundle> =>
  Effect.runPromise(Effect.fail(configValidationError()))

const makeContextFromEnv = (env: Record<string, string>): GetHulyContextResult =>
  buildHulyContext(
    { transport: "stdio" },
    emptyRegistry,
    parseToolsets(undefined, () => {}),
    sanitizeHulyRuntimeConfigFromEnv(env)
  )

const propertylessToolOutputSchema = createToolOutputSchema(Schema.Struct({ ok: Schema.String }))
const propertylessToolDefinition = createToolDefinition({
  name: "propertyless_tool",
  description: "Tool with an object schema that does not declare properties.",
  inputSchema: { type: "object" },
  outputSchema: propertylessToolOutputSchema,
  category: "test"
})
const propertylessTool: RegisteredTool = {
  ...propertylessToolDefinition,
  operation: {
    ...propertylessToolDefinition,
    execute: () => Effect.succeed({ result: { ok: "ok" }, warnings: [] })
  },
  handler: async () => ({
    content: [{ type: "text", text: "ok" }]
  })
}

const propertylessObjectRegistry: ToolRegistry = {
  tools: new Map([[propertylessTool.name, propertylessTool]]),
  definitions: [propertylessTool],
  handleToolCall: async () => null
}

const DiagnosticProbeParams = Schema.Struct({ subject: Schema.String })
type DiagnosticProbeParams = typeof DiagnosticProbeParams.Type
const DiagnosticProbeResult = Schema.Struct({ subject: Schema.String, degraded: Schema.Boolean })

const diagnosticProbeTool = defineTool(
  {
    name: "diagnostic_probe",
    description: "Test-only tool that emits an agent-visible diagnostic warning.",
    inputSchema: {
      type: "object",
      properties: { subject: { type: "string" } },
      required: ["subject"],
      additionalProperties: false
    },
    resultSchema: DiagnosticProbeResult,
    category: "test"
  },
  Schema.decodeUnknown(DiagnosticProbeParams),
  (params: DiagnosticProbeParams) =>
    Effect.gen(function*() {
      const diagnostics = yield* Diagnostics
      yield* diagnostics.warnAgent({
        code: "status_metadata_unresolved",
        message: `Status metadata was degraded for ${params.subject}.`
      })
      return { subject: params.subject, degraded: true }
    })
)

const arraySchemaProbeTool = defineTool(
  {
    name: "array_schema_probe",
    description: "array schema probe tool",
    inputSchema: [],
    resultSchema: Schema.Struct({ ok: Schema.Boolean }),
    category: "test"
  },
  Schema.decodeUnknown(Schema.Unknown),
  () => Effect.succeed({ ok: true })
)

const malformedSummaryProbeTool = defineTool(
  {
    name: "malformed_summary_probe",
    description: "malformed summary probe tool",
    inputSchema: {
      type: "object",
      properties: {
        "": { type: "string" },
        kept: { type: "string" }
      },
      required: ["kept"]
    },
    resultSchema: Schema.Struct({ ok: Schema.Boolean }),
    category: "test"
  },
  Schema.decodeUnknown(Schema.Unknown),
  () => Effect.succeed({ ok: true })
)

const malformedRequiredProbeTool = defineTool(
  {
    name: "malformed_required_probe",
    description: "malformed required probe tool",
    inputSchema: {
      type: "object",
      properties: {
        kept: { type: "string" }
      },
      required: [""]
    },
    resultSchema: Schema.Struct({ ok: Schema.Boolean }),
    category: "test"
  },
  Schema.decodeUnknown(Schema.Unknown),
  () => Effect.succeed({ ok: true })
)

const undeclaredRequiredProbeTool = defineTool(
  {
    name: "undeclared_required_probe",
    description: "undeclared required probe tool",
    inputSchema: {
      type: "object",
      properties: {
        kept: { type: "string" }
      },
      required: ["missing"]
    },
    resultSchema: Schema.Struct({ ok: Schema.Boolean }),
    category: "test"
  },
  Schema.decodeUnknown(Schema.Unknown),
  () => Effect.succeed({ ok: true })
)

const diagnosticProbeRegistry: ToolRegistry = {
  tools: new Map([[diagnosticProbeTool.name, diagnosticProbeTool]]),
  definitions: [diagnosticProbeTool],
  handleToolCall: async (toolName, args, hulyClient, storageClient, workspaceClient) => {
    if (toolName !== diagnosticProbeTool.name) return null
    return diagnosticProbeTool.handler(args ?? {}, hulyClient, storageClient, workspaceClient)
  }
}

const contentOnlyProxyRegistry: ToolRegistry = {
  ...diagnosticProbeRegistry,
  handleToolCall: async () => ({
    content: [{ type: "text", text: "plain target output" }]
  })
}

const errorProxyRegistry: ToolRegistry = {
  ...diagnosticProbeRegistry,
  handleToolCall: async () => createInvalidParamsError("target rejected arguments", "TargetRejected")
}

const nullDispatchProxyRegistry: ToolRegistry = {
  ...diagnosticProbeRegistry,
  handleToolCall: async () => null
}

const arraySchemaProbeRegistry: ToolRegistry = {
  tools: new Map([[arraySchemaProbeTool.name, arraySchemaProbeTool]]),
  definitions: [arraySchemaProbeTool],
  handleToolCall: async () => null
}

const malformedSummaryProbeRegistry: ToolRegistry = {
  tools: new Map<string, RegisteredTool>([
    [malformedSummaryProbeTool.name, malformedSummaryProbeTool],
    [malformedRequiredProbeTool.name, malformedRequiredProbeTool],
    [undeclaredRequiredProbeTool.name, undeclaredRequiredProbeTool]
  ]),
  definitions: [malformedSummaryProbeTool, malformedRequiredProbeTool, undeclaredRequiredProbeTool],
  handleToolCall: async () => null
}

const protocolRegistries = (fullRegistry: ToolRegistry, scopedNativeRegistry: ToolRegistry = fullRegistry) => ({
  fullRegistry,
  scopedNativeRegistry
})

const proxyExposureOptions = (config?: {
  proxyOutputStrict?: boolean
  toolScopeFilteringActive?: boolean
  clientName?: string
}) => ({
  exposureConfig: {
    configuredMode: "proxy" as const,
    proxyOutputStrict: config?.proxyOutputStrict ?? false
  },
  toolScopeFilteringActive: config?.toolScopeFilteringActive ?? false,
  currentClientInfo: () =>
    config?.clientName === undefined ? undefined : parseMcpClientInfo({ name: config.clientName })
})

// Narrow the MCP content union to the text variant (no cast).
const firstText = (content: ReadonlyArray<unknown>): string => {
  const item = assertAt(content, 0)
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
    },
    toolScope: {
      active: false,
      requestedToolsets: [],
      enabledToolsets: [],
      ignoredToolsets: [],
      requestedTools: [],
      enabledTools: [],
      ignoredTools: [],
      availableCategories: ["issues"],
      visibleRegisteredToolCount: 1,
      totalRegisteredToolCount: 1,
      builtinTools: ["get_version", "get_huly_context"]
    },
    toolExposure: {
      configuredMode: "auto",
      resolvedMode: "native",
      clientKind: "unknown",
      proxyOutputStrict: false,
      visibleToolCount: 3,
      nativeVisibleToolCount: 1,
      proxyCandidateToolCount: 1,
      proxyToolNames: []
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
      () => Promise.resolve("9.9.9"),
      proxyExposureOptions({ clientName: "codex-cli" })
    )

    const response = await handlers.callTool({ params: { name: VERSION_TOOL_NAME, arguments: {} } })

    expect(response.isError).not.toBe(true)
    expect(firstText(response.content)).toContain(VERSION)
    expect(firstText(response.content)).toContain("9.9.9")
    expect(assertAt(probe.toolCalled, 0)).toMatchObject({
      toolName: VERSION_TOOL_NAME,
      status: "success",
      clientKind: "codex",
      resolvedMode: "proxy",
      durationMs: 100
    })
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

  it("rejects malformed tool names before native registry lookup", async () => {
    const probe = createTelemetryProbe()
    const handlers = createMcpProtocolHandlers(
      unusedResolveClients,
      probe.telemetry,
      emptyRegistry,
      unusedGetHulyContext,
      liveNowClock,
      () => Promise.resolve("0.0.0"),
      proxyExposureOptions({ clientName: "codex-cli" })
    )

    const response = await handlers.callTool({ params: { name: " ", arguments: {} } })

    expect(response.isError).toBe(true)
    expect(firstText(response.content)).toContain("Unknown tool")
    expect(assertAt(probe.toolCalled, 0)).toMatchObject({
      toolName: " ",
      status: "error",
      clientKind: "codex",
      resolvedMode: "proxy"
    })
  })

  it("maps an invalid fetched latest version to an error", async () => {
    const probe = createTelemetryProbe()
    const handlers = createMcpProtocolHandlers(
      unusedResolveClients,
      probe.telemetry,
      emptyRegistry,
      unusedGetHulyContext,
      queuedClock([1000, 1100]),
      () => Promise.resolve(""),
      proxyExposureOptions({ clientName: "codex-cli" })
    )

    const response = await handlers.callTool({ params: { name: VERSION_TOOL_NAME, arguments: {} } })

    expect(response.isError).toBe(true)
    expect(firstText(response.content)).toBe("Failed to build version result")
    expect(assertAt(probe.toolCalled, 0)).toMatchObject({
      toolName: VERSION_TOOL_NAME,
      status: "error",
      clientKind: "codex",
      resolvedMode: "proxy"
    })
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
    expect(assertAt(probe.toolCalled, 0)).toMatchObject({ toolName: GET_HULY_CONTEXT_TOOL_NAME, status: "success" })
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

  it("passes resolved proxy exposure into the context result", async () => {
    const handlers = createMcpProtocolHandlers(
      unusedResolveClients,
      createTelemetryProbe().telemetry,
      protocolRegistries(toolRegistry),
      (toolExposure) =>
        buildHulyContext(
          { transport: "stdio" },
          toolRegistry,
          parseToolsets(undefined, () => {}),
          sanitizeHulyRuntimeConfigFromEnv({}),
          toolExposure
        ),
      liveNowClock,
      () => Promise.resolve("0.0.0"),
      proxyExposureOptions({ clientName: "codex-cli" })
    )

    const response = await handlers.callTool({ params: { name: GET_HULY_CONTEXT_TOOL_NAME, arguments: {} } })

    expect(response.structuredContent?.result).toMatchObject({
      toolExposure: {
        configuredMode: "proxy",
        resolvedMode: "proxy",
        clientKind: "codex",
        proxyToolNames: ["list_tool_categories", "search_tools", "get_tool_schema", "invoke_tool"]
      }
    })
  })
})

describe("buildHulyContext", () => {
  it("uses default HTTP host and port when omitted or blank", () => {
    const context = buildHulyContext(
      { transport: "http", httpHost: "   " },
      emptyRegistry,
      parseToolsets(undefined, () => {}),
      sanitizeHulyRuntimeConfigFromEnv({})
    )

    expect(context.transport.type).toBe("http")
    expect(context.transport.http?.host).toBe("127.0.0.1")
    expect(context.transport.http?.port).toBe(3000)
  })
})

describe("createMcpProtocolHandlers — tool dispatch", () => {
  it("dispatches to a registered tool with resolved clients", async () => {
    const probe = createTelemetryProbe()
    const handlers = createMcpProtocolHandlers(buildStubClients(), probe.telemetry, toolRegistry, unusedGetHulyContext)

    const response = await handlers.callTool({ params: { name: "list_projects", arguments: {} } })

    expect(response.isError).not.toBe(true)
    expect(assertAt(probe.toolCalled, 0)).toMatchObject({ toolName: "list_projects", status: "success" })
  })

  it("carries diagnostics warnings through the MCP callTool response", async () => {
    const probe = createTelemetryProbe()
    const handlers = createMcpProtocolHandlers(
      buildStubClients(),
      probe.telemetry,
      diagnosticProbeRegistry,
      unusedGetHulyContext
    )

    const response = await handlers.callTool({
      params: { name: "diagnostic_probe", arguments: { subject: "workflow status refs" } }
    })

    const warning = {
      code: "status_metadata_unresolved",
      message: "Status metadata was degraded for workflow status refs."
    }

    expect(response.isError).not.toBe(true)
    expect(response.structuredContent).toEqual({
      result: { subject: "workflow status refs", degraded: true },
      warnings: [warning]
    })
    expect(response.content).toHaveLength(2)
    expect(JSON.parse(firstText([assertAt(response.content, 1)]))).toEqual({ warnings: [warning] })
    expect(assertAt(probe.toolCalled, 0)).toMatchObject({ toolName: "diagnostic_probe", status: "success" })
    expect(JSON.stringify(assertAt(probe.toolCalled, 0))).not.toContain(warning.message)
    expect(assertAt(probe.toolCalled, 0)).not.toHaveProperty("warnings")
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

  it("maps a non-Error client-resolution rejection to an error", async () => {
    const probe = createTelemetryProbe()
    const handlers = createMcpProtocolHandlers(
      rejectingResolveClientsWithString,
      probe.telemetry,
      toolRegistry,
      unusedGetHulyContext
    )

    const response = await handlers.callTool({ params: { name: "list_projects", arguments: {} } })

    expect(response.isError).toBe(true)
    expect(firstText(response.content)).toBe("Failed to initialize Huly clients")
  })

  it("maps a null registry dispatch response to an unknown-tool error", async () => {
    const probe = createTelemetryProbe()
    const handlers = createMcpProtocolHandlers(
      buildStubClients(),
      probe.telemetry,
      propertylessObjectRegistry,
      unusedGetHulyContext
    )

    const response = await handlers.callTool({ params: { name: "propertyless_tool", arguments: {} } })

    expect(response.isError).toBe(true)
    expect(firstText(response.content)).toContain("Unknown tool")
    expect(assertAt(probe.toolCalled, 0)).toMatchObject({ toolName: "propertyless_tool", status: "error" })
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

describe("createMcpProtocolHandlers — proxy mode", () => {
  it("uses an empty visible native registry for unscoped proxy mode", async () => {
    const exposure = resolveProtocolExposure(
      protocolRegistries(toolRegistry),
      proxyExposureOptions()
    )
    const clients = await buildStubClients()()

    const response = await exposure.visibleNativeRegistry.handleToolCall(
      makeToolName("list_projects"),
      {},
      clients.hulyClient,
      clients.storageClient
    )

    expect(exposure.visibleNativeRegistry.definitions).toEqual([])
    expect(response).toBeNull()
  })

  it("lists builtins and proxy meta-tools while hiding native tools when unscoped", async () => {
    const handlers = createMcpProtocolHandlers(
      unusedResolveClients,
      createTelemetryProbe().telemetry,
      protocolRegistries(toolRegistry),
      makeValidContext,
      liveNowClock,
      () => Promise.resolve("0.0.0"),
      proxyExposureOptions()
    )

    const listed = await handlers.listTools()
    const names = listed.tools.map((tool) => tool.name)

    expect(names).toEqual([
      "get_version",
      "get_huly_context",
      "list_tool_categories",
      "search_tools",
      "get_tool_schema",
      "invoke_tool"
    ])
    expect(names).not.toContain("list_projects")
  })

  it("lists proxy categories from the active candidate registry", async () => {
    const handlers = createMcpProtocolHandlers(
      unusedResolveClients,
      createTelemetryProbe().telemetry,
      protocolRegistries(diagnosticProbeRegistry),
      makeValidContext,
      liveNowClock,
      () => Promise.resolve("0.0.0"),
      proxyExposureOptions()
    )

    const response = await handlers.callTool({ params: { name: "list_tool_categories", arguments: {} } })

    expect(response.isError).not.toBe(true)
    expect(response.structuredContent?.result).toEqual({
      categories: [{ name: "test", description: "Huly test tools.", toolCount: 1 }]
    })
  })

  it("uses descriptive category metadata for category listing and search", async () => {
    const handlers = createMcpProtocolHandlers(
      unusedResolveClients,
      createTelemetryProbe().telemetry,
      protocolRegistries(toolRegistry),
      makeValidContext,
      liveNowClock,
      () => Promise.resolve("0.0.0"),
      proxyExposureOptions()
    )

    const categories = await handlers.callTool({ params: { name: "list_tool_categories", arguments: {} } })
    const search = await handlers.callTool({ params: { name: "search_tools", arguments: { query: "messaging" } } })
    const categoryResult = categories.structuredContent?.result
    const searchResult = search.structuredContent?.result

    if (!isJsonObject(categoryResult) || !Array.isArray(categoryResult.categories)) {
      throw new Error("expected category result")
    }
    const channelsCategory = categoryResult.categories.find((category) =>
      isJsonObject(category) && category.name === "channels"
    )
    if (!isJsonObject(channelsCategory)) throw new Error("expected channels category")
    expect(channelsCategory.description).toContain("Messaging")

    if (!isJsonObject(searchResult) || !Array.isArray(searchResult.matches)) {
      throw new Error("expected search result")
    }
    expect(searchResult.matches.some((match) => isJsonObject(match) && match.category === "channels")).toBe(true)
  })

  it("dispatches direct hidden native calls through proxy candidates for compatibility", async () => {
    const handlers = createMcpProtocolHandlers(
      buildStubClients(),
      createTelemetryProbe().telemetry,
      protocolRegistries(toolRegistry),
      makeValidContext,
      liveNowClock,
      () => Promise.resolve("0.0.0"),
      proxyExposureOptions()
    )

    const direct = await handlers.callTool({ params: { name: "list_projects", arguments: {} } })
    const search = await handlers.callTool({ params: { name: "search_tools", arguments: { query: "list projects" } } })
    const schema = await handlers.callTool({
      params: { name: "get_tool_schema", arguments: { toolName: "list_projects" } }
    })

    expect(direct.isError).not.toBe(true)
    expect(firstText(search.content)).toContain("list_projects")
    expect(schema.isError).not.toBe(true)
    expect(firstText(schema.content)).toContain("\"name\":\"list_projects\"")
  })

  it("keeps search param summaries root-required only and returns exact schemas for proxy lookup", async () => {
    const handlers = createMcpProtocolHandlers(
      unusedResolveClients,
      createTelemetryProbe().telemetry,
      protocolRegistries(toolRegistry),
      makeValidContext,
      liveNowClock,
      () => Promise.resolve("0.0.0"),
      proxyExposureOptions()
    )

    const search = await handlers.callTool({ params: { name: "search_tools", arguments: { query: "edit_document" } } })
    const schema = await handlers.callTool({
      params: { name: "get_tool_schema", arguments: { toolName: "edit_document" } }
    })
    const searchResult = search.structuredContent?.result
    const schemaResult = schema.structuredContent?.result

    if (!isJsonObject(searchResult) || !Array.isArray(searchResult.matches)) {
      throw new Error("expected search result matches")
    }
    const editMatch = searchResult.matches.find((match) => isJsonObject(match) && match.name === "edit_document")
    if (!isJsonObject(editMatch)) throw new Error("expected edit_document search match")
    expect(editMatch.requiredParams).toEqual(["teamspace", "document"])
    expect(editMatch.optionalParams).toEqual(
      expect.arrayContaining(["title", "content", "old_text", "new_text"])
    )
    expect(editMatch.parameterSummaryStatus).toBe("available")

    if (!isJsonObject(schemaResult) || !isJsonObject(schemaResult.inputSchema)) {
      throw new Error("expected schema lookup result")
    }
    expect(schemaResult.inputSchema.anyOf).toEqual([
      { required: ["title"] },
      { required: ["content"] },
      { required: ["old_text", "new_text"] }
    ])
    expect(schemaResult.inputSchema).toHaveProperty("allOf")
  })

  it("ranks exact tool-name matches first and flags non-record input schema summaries", async () => {
    const handlers = createMcpProtocolHandlers(
      unusedResolveClients,
      createTelemetryProbe().telemetry,
      protocolRegistries(arraySchemaProbeRegistry),
      makeValidContext,
      liveNowClock,
      () => Promise.resolve("0.0.0"),
      proxyExposureOptions()
    )

    const response = await handlers.callTool({
      params: { name: "search_tools", arguments: { query: "array_schema_probe" } }
    })

    expect(response.isError).not.toBe(true)
    expect(response.structuredContent?.result).toEqual({
      matches: [{
        name: "array_schema_probe",
        category: "test",
        description: "array schema probe tool",
        requiredParams: [],
        optionalParams: [],
        parameterSummaryStatus: "invalid_input_schema",
        parameterSummaryIssue:
          "inputSchema summary must expose object properties keyed by non-empty strings and an optional string required array"
      }]
    })
  })

  it("surfaces invalid proxy search summary schemas instead of dropping parameter names", async () => {
    const handlers = createMcpProtocolHandlers(
      unusedResolveClients,
      createTelemetryProbe().telemetry,
      protocolRegistries(malformedSummaryProbeRegistry),
      makeValidContext,
      liveNowClock,
      () => Promise.resolve("0.0.0"),
      proxyExposureOptions()
    )

    const response = await handlers.callTool({
      params: { name: "search_tools", arguments: { query: "malformed_summary_probe", limit: 1 } }
    })

    expect(response.isError).not.toBe(true)
    expect(response.structuredContent?.result).toEqual({
      matches: [{
        name: "malformed_summary_probe",
        category: "test",
        description: "malformed summary probe tool",
        requiredParams: [],
        optionalParams: [],
        parameterSummaryStatus: "invalid_input_schema",
        parameterSummaryIssue:
          "inputSchema summary must expose object properties keyed by non-empty strings and an optional string required array"
      }]
    })
  })

  it("surfaces invalid proxy search required summaries", async () => {
    const handlers = createMcpProtocolHandlers(
      unusedResolveClients,
      createTelemetryProbe().telemetry,
      protocolRegistries(malformedSummaryProbeRegistry),
      makeValidContext,
      liveNowClock,
      () => Promise.resolve("0.0.0"),
      proxyExposureOptions()
    )

    const malformedRequired = await handlers.callTool({
      params: { name: "search_tools", arguments: { query: "malformed_required_probe", limit: 1 } }
    })
    const undeclaredRequired = await handlers.callTool({
      params: { name: "search_tools", arguments: { query: "undeclared_required_probe", limit: 1 } }
    })

    expect(malformedRequired.structuredContent?.result).toEqual({
      matches: [{
        name: "malformed_required_probe",
        category: "test",
        description: "malformed required probe tool",
        requiredParams: [],
        optionalParams: [],
        parameterSummaryStatus: "invalid_input_schema",
        parameterSummaryIssue:
          "inputSchema summary must expose object properties keyed by non-empty strings and an optional string required array"
      }]
    })
    expect(undeclaredRequired.structuredContent?.result).toEqual({
      matches: [{
        name: "undeclared_required_probe",
        category: "test",
        description: "undeclared required probe tool",
        requiredParams: [],
        optionalParams: [],
        parameterSummaryStatus: "invalid_input_schema",
        parameterSummaryIssue: "inputSchema required entries must refer to declared properties"
      }]
    })
  })

  it("rejects proxy meta-tools directly in native mode", async () => {
    const handlers = createMcpProtocolHandlers(
      unusedResolveClients,
      createTelemetryProbe().telemetry,
      protocolRegistries(toolRegistry),
      makeValidContext
    )

    const response = await handlers.callTool({ params: { name: "search_tools", arguments: { query: "projects" } } })

    expect(response.isError).toBe(true)
    expect(firstText(response.content)).toContain("Unknown tool")
  })

  it("validates proxy meta-tool arguments before returning catalog data", async () => {
    const probe = createTelemetryProbe()
    const handlers = createMcpProtocolHandlers(
      buildStubClients(),
      probe.telemetry,
      protocolRegistries(toolRegistry),
      makeValidContext,
      liveNowClock,
      () => Promise.resolve("0.0.0"),
      proxyExposureOptions()
    )

    const search = await handlers.callTool({ params: { name: "search_tools" } })
    const schema = await handlers.callTool({ params: { name: "get_tool_schema", arguments: { toolName: "   " } } })
    const invoked = await handlers.callTool({ params: { name: "invoke_tool", arguments: { toolName: "   " } } })

    expect(search.isError).toBe(true)
    expect(schema.isError).toBe(true)
    expect(invoked.isError).toBe(true)
    expect(assertAt(probe.toolCalled, 2).editMode).toBeUndefined()
  })

  it("invokes a proxy candidate and wraps the target result with warnings", async () => {
    const handlers = createMcpProtocolHandlers(
      buildStubClients(),
      createTelemetryProbe().telemetry,
      protocolRegistries(diagnosticProbeRegistry),
      makeValidContext,
      liveNowClock,
      () => Promise.resolve("0.0.0"),
      proxyExposureOptions()
    )

    const response = await handlers.callTool({
      params: {
        name: "invoke_tool",
        arguments: {
          toolName: "diagnostic_probe",
          arguments: { subject: "proxy invoke" }
        }
      }
    })

    expect(response.isError).not.toBe(true)
    expect(response.structuredContent?.result).toEqual({
      toolName: "diagnostic_probe",
      result: { subject: "proxy invoke", degraded: true },
      warnings: [{
        code: "status_metadata_unresolved",
        message: "Status metadata was degraded for proxy invoke."
      }]
    })
  })

  it("passes workspace clients into proxy invocation when available", async () => {
    const handlers = createMcpProtocolHandlers(
      buildStubClientsWithWorkspace(),
      createTelemetryProbe().telemetry,
      protocolRegistries(diagnosticProbeRegistry),
      makeValidContext,
      liveNowClock,
      () => Promise.resolve("0.0.0"),
      proxyExposureOptions()
    )

    const response = await handlers.callTool({
      params: {
        name: "invoke_tool",
        arguments: {
          toolName: "diagnostic_probe",
          arguments: { subject: "with workspace" }
        }
      }
    })

    expect(response.isError).not.toBe(true)
    expect(response.structuredContent?.result).toMatchObject({
      toolName: "diagnostic_probe",
      result: { subject: "with workspace", degraded: true }
    })
  })

  it("maps proxy invoke client-resolution failures to tool errors", async () => {
    const probe = createTelemetryProbe()
    const errorHandlers = createMcpProtocolHandlers(
      rejectingResolveClients,
      probe.telemetry,
      protocolRegistries(diagnosticProbeRegistry),
      makeValidContext,
      liveNowClock,
      () => Promise.resolve("0.0.0"),
      proxyExposureOptions()
    )
    const nonErrorHandlers = createMcpProtocolHandlers(
      rejectingResolveClientsWithString,
      probe.telemetry,
      protocolRegistries(diagnosticProbeRegistry),
      makeValidContext,
      liveNowClock,
      () => Promise.resolve("0.0.0"),
      proxyExposureOptions()
    )

    const errorResponse = await errorHandlers.callTool({
      params: {
        name: "invoke_tool",
        arguments: {
          toolName: "diagnostic_probe",
          arguments: { subject: "client failure" }
        }
      }
    })
    const nonErrorResponse = await nonErrorHandlers.callTool({
      params: {
        name: "invoke_tool",
        arguments: {
          toolName: "diagnostic_probe",
          arguments: { subject: "client failure" }
        }
      }
    })

    expect(errorResponse.isError).toBe(true)
    expect(firstText(errorResponse.content)).toBe("Failed to initialize Huly clients")
    expect(nonErrorResponse.isError).toBe(true)
    expect(firstText(nonErrorResponse.content)).toBe("Failed to initialize Huly clients")
    expect(probe.toolCalled.map(call => call.status)).toEqual(["error", "error"])
  })

  it("wraps content-only proxy target output without warnings", async () => {
    const handlers = createMcpProtocolHandlers(
      buildStubClients(),
      createTelemetryProbe().telemetry,
      protocolRegistries(contentOnlyProxyRegistry),
      makeValidContext,
      liveNowClock,
      () => Promise.resolve("0.0.0"),
      proxyExposureOptions()
    )

    const response = await handlers.callTool({
      params: { name: "invoke_tool", arguments: { toolName: "diagnostic_probe", arguments: {} } }
    })

    expect(response.isError).not.toBe(true)
    expect(response.structuredContent?.result).toEqual({
      toolName: "diagnostic_probe",
      result: [{ type: "text", text: "plain target output" }]
    })
  })

  it("returns target proxy errors and null dispatches without wrapping them as successes", async () => {
    const clients = await buildStubClients()()
    const errorResponse = await handleProxyToolCall({
      toolName: makeToolName("invoke_tool"),
      args: { toolName: "diagnostic_probe", arguments: {} },
      proxyCandidateRegistry: errorProxyRegistry,
      clients
    })
    const nullResponse = await handleProxyToolCall({
      toolName: makeToolName("invoke_tool"),
      args: { toolName: "diagnostic_probe", arguments: {} },
      proxyCandidateRegistry: nullDispatchProxyRegistry,
      clients
    })

    expect(errorResponse.isError).toBe(true)
    expect(firstText(errorResponse.content)).toContain("target rejected arguments")
    expect(nullResponse.isError).toBe(true)
    expect(firstText(nullResponse.content)).toContain("Unknown tool")
  })

  it("reports missing proxy clients and unknown proxy meta-tool names", async () => {
    const invalidListCategories = await handleProxyToolCall({
      toolName: makeToolName("list_tool_categories"),
      args: "not an object",
      proxyCandidateRegistry: diagnosticProbeRegistry
    })
    const missingClients = await handleProxyToolCall({
      toolName: makeToolName("invoke_tool"),
      args: { toolName: "diagnostic_probe", arguments: {} },
      proxyCandidateRegistry: diagnosticProbeRegistry
    })
    const unknown = await handleProxyToolCall({
      toolName: makeToolName("missing_proxy_meta_tool"),
      args: {},
      proxyCandidateRegistry: diagnosticProbeRegistry
    })

    expect(invalidListCategories.isError).toBe(true)
    expect(missingClients.isError).toBe(true)
    expect(firstText(missingClients.content)).toContain("requires initialized Huly clients")
    expect(unknown.isError).toBe(true)
    expect(firstText(unknown.content)).toContain("Unknown tool")
  })

  it("lists scoped native pins in non-strict proxy mode while keeping full proxy discovery", async () => {
    const scopedIssuesRegistry = createFilteredRegistry(categorySet("issues"))
    const handlers = createMcpProtocolHandlers(
      buildStubClients(),
      createTelemetryProbe().telemetry,
      protocolRegistries(toolRegistry, scopedIssuesRegistry),
      makeValidContext,
      liveNowClock,
      () => Promise.resolve("0.0.0"),
      proxyExposureOptions({ toolScopeFilteringActive: true })
    )

    const listed = await handlers.listTools()
    const search = await handlers.callTool({ params: { name: "search_tools", arguments: { query: "documents" } } })
    const directHidden = await handlers.callTool({ params: { name: "list_projects", arguments: {} } })

    expect(listed.tools.map((tool) => tool.name)).toContain("list_issues")
    expect(listed.tools.map((tool) => tool.name)).not.toContain("list_documents")
    expect(firstText(search.content)).toContain("list_documents")
    expect(directHidden.isError).not.toBe(true)
  })

  it("uses active scope as a hard allow-list when proxy output strict is true", async () => {
    const scopedProjectsRegistry = createFilteredRegistry(categorySet("projects"))
    const handlers = createMcpProtocolHandlers(
      buildStubClients(),
      createTelemetryProbe().telemetry,
      protocolRegistries(toolRegistry, scopedProjectsRegistry),
      makeValidContext,
      liveNowClock,
      () => Promise.resolve("0.0.0"),
      proxyExposureOptions({ proxyOutputStrict: true, toolScopeFilteringActive: true })
    )

    const listed = await handlers.listTools()
    const search = await handlers.callTool({ params: { name: "search_tools", arguments: { query: "projects" } } })
    const schema = await handlers.callTool({
      params: { name: "get_tool_schema", arguments: { toolName: "list_documents" } }
    })
    const directScoped = await handlers.callTool({ params: { name: "list_projects", arguments: {} } })
    const directHidden = await handlers.callTool({ params: { name: "list_documents", arguments: {} } })

    expect(listed.tools.map((tool) => tool.name)).not.toContain("list_projects")
    expect(firstText(search.content)).not.toContain("list_documents")
    expect(firstText(search.content)).toContain("\"category\":\"projects\"")
    expect(schema.isError).toBe(true)
    expect(directScoped.isError).not.toBe(true)
    expect(directHidden.isError).toBe(true)
  })

  it("blocks search, schema, and invocation candidates when strict active scope resolves to no tools", async () => {
    const handlers = createMcpProtocolHandlers(
      buildStubClients(),
      createTelemetryProbe().telemetry,
      protocolRegistries(diagnosticProbeRegistry, createFilteredRegistry(categorySet("missing_category"))),
      makeValidContext,
      liveNowClock,
      () => Promise.resolve("0.0.0"),
      proxyExposureOptions({ proxyOutputStrict: true, toolScopeFilteringActive: true })
    )

    const search = await handlers.callTool({ params: { name: "search_tools", arguments: { query: "diagnostic" } } })
    const schema = await handlers.callTool({
      params: { name: "get_tool_schema", arguments: { toolName: "diagnostic_probe" } }
    })
    const invoked = await handlers.callTool({
      params: { name: "invoke_tool", arguments: { toolName: "diagnostic_probe", arguments: { subject: "x" } } }
    })

    expect(firstText(search.content)).toBe("{\"matches\":[]}")
    expect(schema.isError).toBe(true)
    expect(invoked.isError).toBe(true)
  })
})

describe("createMcpProtocolHandlers — resource handlers", () => {
  it("lists resources when clients resolve and the backend succeeds", async () => {
    const handlers = createMcpProtocolHandlers(
      buildStubClients(),
      createTelemetryProbe().telemetry,
      emptyRegistry,
      unusedGetHulyContext
    )
    const result = await handlers.listResources()
    expect(Array.isArray(result.resources)).toBe(true)
  })

  it("attaches Diagnostics warnings to resource read metadata", async () => {
    const handlers = createMcpProtocolHandlers(
      buildResourceWarningClients(),
      createTelemetryProbe().telemetry,
      emptyRegistry,
      unusedGetHulyContext
    )

    const result = await handlers.readResource({ params: { uri: "huly://projects/TEST" } })

    expect(result._meta).toEqual({
      warnings: [
        expect.objectContaining({
          code: "status_metadata_unresolved"
        })
      ]
    })
    const content = assertAt(result.contents, 0)
    if (!("text" in content)) throw new Error("expected text resource content")
    expect(JSON.parse(content.text)).toMatchObject({
      project: {
        identifier: "TEST",
        statuses: ["plainstatus"]
      }
    })
  })

  it("returns an empty resource list when no Huly config is present during registry inspection", async () => {
    const handlers = createMcpProtocolHandlers(
      rejectingFiberConfigResolveClients,
      createTelemetryProbe().telemetry,
      emptyRegistry,
      makeValidContext
    )

    await expect(handlers.listResources()).resolves.toEqual({ resources: [] })
  })

  it("returns an empty resource list for direct config validation failures without Huly config", async () => {
    const handlers = createMcpProtocolHandlers(
      rejectingDirectConfigResolveClients,
      createTelemetryProbe().telemetry,
      emptyRegistry,
      makeValidContext
    )

    await expect(handlers.listResources()).resolves.toEqual({ resources: [] })
  })

  it("throws an McpError when client resolution fails while listing resources", async () => {
    const handlers = createMcpProtocolHandlers(
      rejectingResolveClients,
      createTelemetryProbe().telemetry,
      emptyRegistry,
      unusedGetHulyContext
    )
    await expect(handlers.listResources()).rejects.toThrow(McpError)
  })

  it("returns an empty resource list when registry inspection provides empty Huly config placeholders", async () => {
    const handlers = createMcpProtocolHandlers(
      rejectingFiberConfigResolveClients,
      createTelemetryProbe().telemetry,
      emptyRegistry,
      () => makeContextFromEnv({ HULY_URL: "", HULY_WORKSPACE: "", HULY_TOKEN: "" })
    )

    await expect(handlers.listResources()).resolves.toEqual({ resources: [] })
  })

  it("returns an empty resource list for config validation failures even when runtime context construction fails", async () => {
    const handlers = createMcpProtocolHandlers(
      rejectingFiberConfigResolveClients,
      createTelemetryProbe().telemetry,
      emptyRegistry,
      unusedGetHulyContext
    )

    await expect(handlers.listResources()).resolves.toEqual({ resources: [] })
  })

  it("surfaces an McpError when the backend fails while listing resources", async () => {
    const handlers = createMcpProtocolHandlers(
      buildStubClients({ findAll: () => Effect.fail(new HulyConnectionError({ message: "backend down" })) }),
      createTelemetryProbe().telemetry,
      emptyRegistry,
      unusedGetHulyContext
    )
    await expect(handlers.listResources()).rejects.toThrow(McpError)
  })

  it("throws an McpError when client resolution fails while reading a resource", async () => {
    const handlers = createMcpProtocolHandlers(
      rejectingResolveClients,
      createTelemetryProbe().telemetry,
      emptyRegistry,
      unusedGetHulyContext
    )
    await expect(handlers.readResource({ params: { uri: "huly://projects/TEST" } })).rejects.toThrow(McpError)
  })

  it("wraps a non-McpError defect into an McpError while listing resources", async () => {
    const handlers = createMcpProtocolHandlers(
      buildStubClients({ findAll: () => Effect.die(new Error("kaboom")) }),
      createTelemetryProbe().telemetry,
      emptyRegistry,
      unusedGetHulyContext
    )
    await expect(handlers.listResources()).rejects.toThrow(McpError)
  })

  it("wraps a non-McpError defect into an McpError while reading a resource", async () => {
    const handlers = createMcpProtocolHandlers(
      buildStubClients({ findOne: () => Effect.die(new Error("kaboom")) }),
      createTelemetryProbe().telemetry,
      emptyRegistry,
      unusedGetHulyContext
    )
    await expect(handlers.readResource({ params: { uri: "huly://projects/TEST" } })).rejects.toThrow(McpError)
  })
})

describe("createMcpProtocolHandlers — drainInflight", () => {
  it("resolves immediately when nothing is in flight", async () => {
    const handlers = createMcpProtocolHandlers(
      buildStubClients(),
      createTelemetryProbe().telemetry,
      emptyRegistry,
      unusedGetHulyContext
    )
    await expect(handlers.drainInflight()).resolves.toBeUndefined()
  })

  it("waits for an in-flight call to complete, then resolves", async () => {
    let release: (bundle: ClientBundle) => void = () => {}
    const gate = new Promise<ClientBundle>((resolve) => {
      release = resolve
    })
    const handlers = createMcpProtocolHandlers(
      () => gate,
      createTelemetryProbe().telemetry,
      toolRegistry,
      unusedGetHulyContext
    )

    // enter() runs synchronously, so inflight becomes 1 before the first await
    const callPromise = handlers.callTool({ params: { name: "list_projects", arguments: {} } })
    const drainPromise = handlers.drainInflight()

    release(await buildStubClients()())
    await callPromise
    await expect(drainPromise).resolves.toBeUndefined()
  })

  it("stops draining once the timeout elapses even if a call is still in flight", async () => {
    const neverResolves = new Promise<ClientBundle>(() => {})
    // Clock readings: callTool start, drain start, drain check (> 30s after start) -> timeout branch
    const clock = queuedClock([0, 0, 31_000])
    const handlers = createMcpProtocolHandlers(
      () => neverResolves,
      createTelemetryProbe().telemetry,
      toolRegistry,
      unusedGetHulyContext,
      clock
    )

    void handlers.callTool({ params: { name: "list_projects", arguments: {} } })
    await expect(handlers.drainInflight()).resolves.toBeUndefined()
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
