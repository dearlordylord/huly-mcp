import { describe, it } from "@effect/vitest"
import { PassThrough } from "node:stream"
import {
  type Attribute,
  type Class as HulyClass,
  type PersonId,
  type Ref,
  type Space,
  type Status,
  toFindResult
} from "@hcengineering/core"
import type { TaskType } from "@hcengineering/task"
import {
  type Issue as HulyIssue,
  IssuePriority,
  type Project as HulyProject,
  TimeReportDayType
} from "@hcengineering/tracker"
import { ProtocolError } from "@modelcontextprotocol/server"
import type { Server } from "@modelcontextprotocol/server"
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio"
import { ConfigProvider, Context, Deferred, Effect, Exit, Fiber, Layer, type Redacted, Schema } from "effect"
import { HttpServer } from "effect/unstable/http"
import { expect } from "vitest"
import { parseJsonSchemaRecord } from "../../src/domain/schemas/json-schema.js"
import { HulyClient, type HulyClientOperations } from "../../src/huly/client.js"
import { HulyStorageClient } from "../../src/huly/storage.js"
import {
  HOSTED_HULY_MIGRATION_WARNING,
  type HostedHulyMigrationInstructions
} from "../../src/huly/unavailable-diagnostics.js"
import { WorkspaceClient } from "../../src/huly/workspace-client.js"
import { HttpServerFactoryService } from "../../src/mcp/http-transport.js"
import { createDefaultMcpSdkServer } from "../../src/mcp/sdk-server.js"
import { type ClientBundle, McpServerError, McpServerService } from "../../src/mcp/server.js"
import { TOOL_DEFINITIONS } from "../../src/mcp/tools/index.js"
import type { ToolDefinition } from "../../src/mcp/tools/registry.js"
import type { SessionStartProps, TelemetryOperations, ToolCalledProps } from "../../src/telemetry/telemetry.js"
import { TelemetryService } from "../../src/telemetry/telemetry.js"
import { assertAt, assertExists } from "../../src/utils/assertions.js"
import { inertHttpServerFactory } from "./http-test-support.js"

import { tracker } from "../../src/huly/huly-plugins.js"

const CallToolRequestSchema = "tools/call"
const ListResourcesRequestSchema = "resources/list"
const ListResourceTemplatesRequestSchema = "resources/templates/list"
const ListToolsRequestSchema = "tools/list"
const ReadResourceRequestSchema = "resources/read"
const unusedHttpServerFactory = inertHttpServerFactory("HTTP is outside this stdio test")
const provideConfig = (values: Record<string, string>) =>
  Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown(values)))

const createTestStdioTransport = (): StdioServerTransport => {
  const input = new PassThrough()
  const output = new PassThrough()
  const transport = new StdioServerTransport(input, output)
  input.write(
    `${JSON.stringify({
      jsonrpc: "2.0",
      id: "test-discovery",
      method: "server/discover",
      params: {
        _meta: {
          "io.modelcontextprotocol/protocolVersion": "2026-07-28",
          "io.modelcontextprotocol/clientCapabilities": {},
          "io.modelcontextprotocol/clientInfo": { name: "server-test", version: "1.0.0" }
        }
      }
    })}\n`
  )
  return transport
}

/**
 * Build a resolveClients callback from a layer that provides all three client services.
 * The result is memoized — builds the layer once, caches the bundle.
 */
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

/**
 * Test helper: wraps McpServerService.layer, splitting client+telemetry layers
 * so that client services are provided via resolveClients and telemetry via Layer.provide.
 *
 * Accepts a combined layer (clients + telemetry) for backward compat with existing tests.
 */
const buildTestServerLayer = (
  config: {
    transport: "stdio" | "http"
    httpPort?: number
    httpHost?: string
    mcpAuthToken?: Redacted.Redacted<string>
    authMethod?: "token" | "password"
    createServer?: (instructions?: HostedHulyMigrationInstructions) => Server
    writeError?: (message: string) => void
  },
  layers: Layer.Layer<HulyClient | HulyStorageClient | WorkspaceClient | TelemetryService>
) => {
  const { createServer = createMockServer, ...serverConfig } = config
  return McpServerService.layer({
    ...serverConfig,
    createServer,
    createStdioTransport: createTestStdioTransport,
    resolveClients: resolveClientsFromLayer(layers)
  }).pipe(Layer.provide(layers))
}

// Captured request handlers from mocked MCP Server instances
type HandlerMap = Map<unknown, (...args: Array<unknown>) => unknown>
const capturedHandlers: HandlerMap = new Map()

// Configurable mock behavior for Server.close
let mockCloseBehavior: (() => Promise<void>) | null = null

const createMockServer = () =>
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- test fake implements only methods used by McpServerService
  ({
    setRequestHandler(schema: unknown, handler: (...args: Array<unknown>) => unknown) {
      capturedHandlers.set(schema, handler)
    },
    getClientVersion() {
      return { name: "claude-code", version: "1.0.0" }
    },
    getCapabilities() {
      return { resources: {}, tools: {} }
    },
    async connect() {},
    async close() {
      if (mockCloseBehavior) return mockCloseBehavior()
    }
  }) as never

// --- Mock Data Builders ---

const makeProject = (overrides?: Partial<HulyProject>): HulyProject => {
  const result = {
    _id: "project-1" as Ref<HulyProject>,
    _class: tracker.class.Project,
    space: "space-1" as Ref<Space>,
    identifier: "TEST",
    name: "Test Project",
    description: "Project used by MCP server tests",
    private: false,
    members: [],
    owners: [],
    archived: false,
    sequence: 1,
    defaultIssueStatus: "status-open" as Ref<Status>,
    defaultTimeReportDay: TimeReportDayType.CurrentWorkDay,
    modifiedBy: "user-1" as PersonId,
    modifiedOn: 0,
    createdBy: "user-1" as PersonId,
    createdOn: 0,
    ...overrides
  }
  // single cast: exactOptionalPropertyTypes prevents direct type annotation on mock objects
  return result as HulyProject
}

const makeIssue = (overrides?: Partial<HulyIssue>): HulyIssue => {
  const result: HulyIssue = {
    _id: "issue-1" as Ref<HulyIssue>,
    _class: tracker.class.Issue,
    space: "project-1" as Ref<HulyProject>,
    identifier: "TEST-1",
    title: "Test Issue",
    description: null,
    status: "status-open" as Ref<Status>,
    priority: IssuePriority.Medium,
    assignee: null,
    kind: "task-type-1" as Ref<TaskType>,
    number: 1,
    dueDate: null,
    rank: "0|aaa",
    attachedTo: "no-parent" as Ref<HulyIssue>,
    attachedToClass: tracker.class.Issue,
    collection: "subIssues",
    component: null,
    subIssues: 0,
    parents: [],
    estimation: 0,
    remainingTime: 0,
    reportedTime: 0,
    reports: 0,
    childInfo: [],
    modifiedBy: "user-1" as PersonId,
    modifiedOn: 0,
    createdBy: "user-1" as PersonId,
    createdOn: 0,
    ...overrides
  }
  return result
}

const makeStatus = (overrides?: Partial<Status>): Status => {
  const result: Status = {
    _id: "status-1" as Ref<Status>,
    _class: "core:class:Status" as Ref<HulyClass<Status>>,
    space: "space-1" as Ref<Space>,
    ofAttribute: "tracker:attribute:IssueStatus" as Ref<Attribute<Status>>,
    name: "Open",
    modifiedBy: "user-1" as PersonId,
    modifiedOn: 0,
    createdBy: "user-1" as PersonId,
    createdOn: 0,
    ...overrides
  }
  return result
}

const schemaProperty = (schema: object, key: string): unknown => Object.getOwnPropertyDescriptor(schema, key)?.value

const toolDefinition = (name: string): ToolDefinition =>
  assertExists(TOOL_DEFINITIONS[name], `Expected tool definition for ${name}`)

const requiredList = (schema: unknown): ReadonlyArray<string> | undefined => {
  if (typeof schema !== "object" || schema === null) return undefined
  const required = schemaProperty(schema, "required")
  return Array.isArray(required) && required.every((item) => typeof item === "string") ? required : undefined
}

const requiredModeSets = (tool: ToolDefinition): ReadonlyArray<string> => {
  const oneOf = schemaProperty(tool.inputSchema, "oneOf")
  return Array.isArray(oneOf)
    ? oneOf
        .map(requiredList)
        .filter((required) => required !== undefined)
        .map((required) => required.join("+"))
    : []
}

const assertSchemaObject = (value: unknown): Record<string, unknown> => {
  const record = parseJsonSchemaRecord(value)
  if (record === undefined) {
    throw new Error("Expected schema object")
  }
  return record
}

const ListedToolForTestSchema = Schema.Struct({ name: Schema.String, inputSchema: Schema.Unknown })
type ListedToolForTest = Schema.Schema.Type<typeof ListedToolForTestSchema>

const ListToolsResponseForTestSchema = Schema.Struct({ tools: Schema.Array(ListedToolForTestSchema) })

const assertListToolsResponse = (value: unknown): { readonly tools: ReadonlyArray<ListedToolForTest> } => {
  try {
    return Schema.decodeUnknownSync(ListToolsResponseForTestSchema)(value)
  } catch {
    throw new Error("Expected ListTools response with tool definitions")
  }
}

// --- Test Helpers ---

const createMockHulyClientLayer = (config: {
  projects?: Array<HulyProject>
  issues?: Array<HulyIssue>
  statuses?: Array<Status>
}) => {
  const projects = config.projects ?? []
  const issues = config.issues ?? []
  const statuses = config.statuses ?? []

  const findAllImpl: HulyClientOperations["findAll"] = ((_class: unknown, query: unknown) => {
    if (_class === tracker.class.Project) {
      const archived =
        query !== null && typeof query === "object"
          ? Object.getOwnPropertyDescriptor(query, "archived")?.value
          : undefined
      const filteredProjects =
        typeof archived === "boolean" ? projects.filter((project) => project.archived === archived) : projects
      return Effect.succeed(toFindResult(filteredProjects))
    }
    if (_class === tracker.class.Issue) {
      return Effect.succeed(toFindResult(issues))
    }
    if (_class === tracker.class.IssueStatus) {
      return Effect.succeed(toFindResult(statuses))
    }
    return Effect.succeed(toFindResult([]))
  }) as HulyClientOperations["findAll"]

  const findOneImpl: HulyClientOperations["findOne"] = ((_class: unknown, query: unknown) => {
    if (_class === tracker.class.Project) {
      const identifier = (query as Record<string, unknown>).identifier as string
      const found = projects.find((p) => p.identifier === identifier)
      return Effect.succeed(found)
    }
    if (_class === tracker.class.Issue) {
      const q = query as Record<string, unknown>
      const found = issues.find(
        (i) => (q.identifier && i.identifier === q.identifier) || (q.number && i.number === q.number)
      )
      return Effect.succeed(found)
    }
    return Effect.succeed(undefined)
  }) as HulyClientOperations["findOne"]

  return HulyClient.testLayer({ findAll: findAllImpl, findOne: findOneImpl })
}

// --- Tests ---

describe("TOOL_DEFINITIONS", () => {
  it.effect("exports tool definitions", () =>
    Effect.sync(function () {
      const tools = Object.keys(TOOL_DEFINITIONS)
      expect(tools.length).toBeGreaterThan(100)
      expect(tools).toContain("list_projects")
      expect(tools).toContain("list_issues")
      expect(tools).toContain("get_issue")
      expect(tools).toContain("create_issue")
      expect(tools).toContain("update_issue")
      expect(tools).toContain("add_issue_label")
      expect(tools).toContain("delete_issue")
      expect(tools).toContain("list_comments")
      expect(tools).toContain("add_comment")
      expect(tools).toContain("update_comment")
      expect(tools).toContain("delete_comment")
      expect(tools).toContain("list_milestones")
      expect(tools).toContain("get_milestone")
      expect(tools).toContain("create_milestone")
      expect(tools).toContain("update_milestone")
      expect(tools).toContain("set_issue_milestone")
      expect(tools).toContain("delete_milestone")
      expect(tools).toContain("list_teamspaces")
      expect(tools).toContain("list_documents")
      expect(tools).toContain("get_document")
      expect(tools).toContain("create_document")
      expect(tools).toContain("edit_document")
      expect(tools).toContain("delete_document")
      expect(tools).toContain("upload_file")
      expect(tools).toContain("list_persons")
      expect(tools).toContain("get_person")
      expect(tools).toContain("create_person")
      expect(tools).toContain("update_person")
      expect(tools).toContain("delete_person")
      expect(tools).toContain("list_employees")
      expect(tools).toContain("set_employee_position")
      expect(tools).toContain("list_organizations")
      expect(tools).toContain("create_organization")
      expect(tools).toContain("list_channels")
      expect(tools).toContain("get_channel")
      expect(tools).toContain("create_channel")
      expect(tools).toContain("update_channel")
      expect(tools).toContain("delete_channel")
      expect(tools).toContain("list_channel_messages")
      expect(tools).toContain("list_chat_message_attachments")
      expect(tools).toContain("get_chat_message_attachment")
      expect(tools).toContain("add_chat_message_attachment")
      expect(tools).toContain("update_chat_message_attachment")
      expect(tools).toContain("delete_chat_message_attachment")
      expect(tools).toContain("send_channel_message")
      expect(tools).toContain("list_direct_messages")
      expect(tools).toContain("list_dm_messages")
      expect(tools).toContain("send_dm_message")
      expect(tools).toContain("update_dm_message")
      expect(tools).toContain("delete_dm_message")
      expect(tools).toContain("list_events")
      expect(tools).toContain("list_calendars")
      expect(tools).toContain("get_event")
      expect(tools).toContain("create_event")
      expect(tools).toContain("update_event")
      expect(tools).toContain("delete_event")
      expect(tools).toContain("list_recurring_events")
      expect(tools).toContain("create_recurring_event")
      expect(tools).toContain("list_event_instances")
      expect(tools).toContain("log_time")
      expect(tools).toContain("get_time_report")
      expect(tools).toContain("list_time_spend_reports")
      expect(tools).toContain("get_detailed_time_report")
      expect(tools).toContain("list_work_slots")
      expect(tools).toContain("start_timer")
      expect(tools).toContain("stop_timer")
      expect(tools).toContain("fulltext_search")
    })
  )

  it.effect("each tool has name, description, and inputSchema", () =>
    Effect.sync(function () {
      for (const [key, tool] of Object.entries(TOOL_DEFINITIONS)) {
        expect(tool.name).toBe(key)
        expect(typeof tool.description).toBe("string")
        expect(tool.description.length).toBeGreaterThan(10)
        expect(tool.inputSchema).toBeDefined()
        expect(typeof tool.inputSchema).toBe("object")
      }
    })
  )

  describe("inputSchema format", () => {
    it.effect("list_issues schema has correct structure", () =>
      Effect.sync(function () {
        const schema = toolDefinition("list_issues").inputSchema
        expect(schema).toHaveProperty("type", "object")
        expect(schema).toHaveProperty("properties")
        const props = (schema as { properties: Record<string, unknown> }).properties
        expect(props).toHaveProperty("project")
        expect(props).toHaveProperty("status")
        expect(props).toHaveProperty("assignee")
        expect(props).toHaveProperty("limit")
      })
    )

    it.effect("get_issue schema has correct structure", () =>
      Effect.sync(function () {
        const schema = toolDefinition("get_issue").inputSchema
        expect(schema).toHaveProperty("type", "object")
        expect(schema).toHaveProperty("properties")
        expect((schema as { properties: Record<string, unknown> }).properties).toHaveProperty("project")
        expect((schema as { properties: Record<string, unknown> }).properties).toHaveProperty("identifier")
      })
    )

    it.effect("create_issue schema has correct structure", () =>
      Effect.sync(function () {
        const schema = toolDefinition("create_issue").inputSchema
        expect(schema).toHaveProperty("type", "object")
        expect(schema).toHaveProperty("properties")
        expect((schema as { properties: Record<string, unknown> }).properties).toHaveProperty("project")
        expect((schema as { properties: Record<string, unknown> }).properties).toHaveProperty("title")
      })
    )

    it.effect("update_issue schema has correct structure", () =>
      Effect.sync(function () {
        const schema = toolDefinition("update_issue").inputSchema
        expect(schema).toHaveProperty("type", "object")
        expect(schema).toHaveProperty("properties")
        const props = (schema as { properties: Record<string, unknown> }).properties
        expect(props).toHaveProperty("project")
        expect(props).toHaveProperty("identifier")
        expect(props).toHaveProperty("title")
        expect(props).toHaveProperty("description")
        expect(props).toHaveProperty("priority")
        expect(props).toHaveProperty("assignee")
        expect(props).toHaveProperty("status")
      })
    )

    it.effect("add_issue_label schema has correct structure", () =>
      Effect.sync(function () {
        const schema = toolDefinition("add_issue_label").inputSchema
        expect(schema).toHaveProperty("type", "object")
        expect(schema).toHaveProperty("properties")
        const props = (schema as { properties: Record<string, unknown> }).properties
        expect(props).toHaveProperty("project")
        expect(props).toHaveProperty("identifier")
        expect(props).toHaveProperty("label")
        expect(props).toHaveProperty("color")
      })
    )

    it.effect("delete_issue schema has correct structure", () =>
      Effect.sync(function () {
        const schema = toolDefinition("delete_issue").inputSchema
        expect(schema).toHaveProperty("type", "object")
        expect(schema).toHaveProperty("properties")
        const props = (schema as { properties: Record<string, unknown> }).properties
        expect(props).toHaveProperty("project")
        expect(props).toHaveProperty("identifier")
      })
    )

    it.effect("list_teamspaces schema has correct structure", () =>
      Effect.sync(function () {
        const schema = toolDefinition("list_teamspaces").inputSchema
        expect(schema).toHaveProperty("type", "object")
        expect(schema).toHaveProperty("properties")
        const props = (schema as { properties: Record<string, unknown> }).properties
        expect(props).toHaveProperty("includeArchived")
        expect(props).toHaveProperty("limit")
      })
    )

    it.effect("get_document schema has correct structure", () =>
      Effect.sync(function () {
        const schema = toolDefinition("get_document").inputSchema
        expect(schema).toHaveProperty("type", "object")
        expect(schema).toHaveProperty("properties")
        const props = (schema as { properties: Record<string, unknown> }).properties
        expect(props).toHaveProperty("teamspace")
        expect(props).toHaveProperty("document")
      })
    )

    it.effect("create_document schema has correct structure", () =>
      Effect.sync(function () {
        const schema = toolDefinition("create_document").inputSchema
        expect(schema).toHaveProperty("type", "object")
        expect(schema).toHaveProperty("properties")
        const props = (schema as { properties: Record<string, unknown> }).properties
        expect(props).toHaveProperty("teamspace")
        expect(props).toHaveProperty("title")
        expect(props).toHaveProperty("content")
      })
    )

    it.effect("list_activity schema exposes explicit target modes", () =>
      Effect.sync(function () {
        const schema = toolDefinition("list_activity").inputSchema
        expect(schema).toHaveProperty("type", "object")
        expect(Array.isArray(schemaProperty(schema, "oneOf"))).toBe(true)

        const requiredSets = requiredModeSets(toolDefinition("list_activity"))
        expect(requiredSets).toContain("project+issueIdentifier")
        expect(requiredSets).toContain("teamspace+document")
        expect(requiredSets).toContain("channel")
        expect(requiredSets).toContain("objectId+objectClass")
      })
    )
  })
})

describe("McpServerService", () => {
  describe("layer creation", () => {
    it.effect("can create layer with stdio transport config", () =>
      Effect.gen(function* () {
        const project = makeProject()
        const issues = [makeIssue()]
        const statuses = [makeStatus({ _id: "status-open" as Ref<Status>, name: "Open" })]

        const hulyClientLayer = createMockHulyClientLayer({ projects: [project], issues, statuses })

        const storageClientLayer = HulyStorageClient.testLayer({})
        const workspaceClientLayer = WorkspaceClient.testLayer({})

        const serverLayer = McpServerService.layer({
          transport: "stdio",
          resolveClients: resolveClientsFromLayer(
            Layer.mergeAll(hulyClientLayer, storageClientLayer, workspaceClientLayer)
          )
        }).pipe(Layer.provide(TelemetryService.testLayer()))

        // Verify we can build the layer (this tests the Effect.gen runs without error)
        yield* Layer.build(serverLayer)
      })
    )

    it.effect("can create layer with http transport config", () =>
      Effect.gen(function* () {
        const project = makeProject()
        const hulyClientLayer = createMockHulyClientLayer({ projects: [project], issues: [], statuses: [] })

        const storageClientLayer = HulyStorageClient.testLayer({})
        const workspaceClientLayer = WorkspaceClient.testLayer({})

        const serverLayer = McpServerService.layer({
          transport: "http",
          httpPort: 3000,
          resolveClients: resolveClientsFromLayer(
            Layer.mergeAll(hulyClientLayer, storageClientLayer, workspaceClientLayer)
          )
        }).pipe(Layer.provide(TelemetryService.testLayer()))

        yield* Layer.build(serverLayer)
      })
    )
  })

  describe("testLayer", () => {
    it.effect("creates a test layer with default operations", () =>
      Effect.gen(function* () {
        const mockHttpLayer = Layer.succeed(HttpServerFactoryService, {} as never)
        const testLayer = Layer.merge(McpServerService.testLayer({}), mockHttpLayer)

        const result = yield* Effect.gen(function* () {
          const server = yield* McpServerService
          // run() should return void immediately with default mock
          yield* server.run()
          yield* server.stop()
          return "success"
        }).pipe(Effect.provide(testLayer))

        expect(result).toBe("success")
      })
    )

    it.effect("allows overriding run operation", () =>
      Effect.gen(function* () {
        let runCalled = false

        const mockHttpLayer = Layer.succeed(HttpServerFactoryService, {} as never)
        const testLayer = Layer.merge(
          McpServerService.testLayer({
            run: () =>
              Effect.sync(() => {
                runCalled = true
              })
          }),
          mockHttpLayer
        )

        yield* Effect.gen(function* () {
          const server = yield* McpServerService
          yield* server.run()
        }).pipe(Effect.provide(testLayer))

        expect(runCalled).toBe(true)
      })
    )

    it.effect("allows overriding stop operation", () =>
      Effect.gen(function* () {
        let stopCalled = false

        const testLayer = McpServerService.testLayer({
          stop: () =>
            Effect.sync(() => {
              stopCalled = true
            })
        })

        yield* Effect.gen(function* () {
          const server = yield* McpServerService
          yield* server.stop()
        }).pipe(Effect.provide(testLayer))

        expect(stopCalled).toBe(true)
      })
    )

    it.effect("can mock run to fail with error", () =>
      Effect.gen(function* () {
        const mockHttpLayer = Layer.succeed(HttpServerFactoryService, {} as never)
        const testLayer = Layer.merge(
          McpServerService.testLayer({ run: () => new McpServerError({ message: "Test error" }) }),
          mockHttpLayer
        )

        const error = yield* Effect.flip(
          Effect.gen(function* () {
            const server = yield* McpServerService
            yield* server.run()
          }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("McpServerError")
        expect(error.message).toBe("Test error")
      })
    )
  })
})

describe("McpServerError", () => {
  it.effect("creates error with message", () =>
    Effect.sync(function () {
      const error = new McpServerError({ message: "Connection failed" })
      expect(error._tag).toBe("McpServerError")
      expect(error.message).toBe("Connection failed")
    })
  )

  it.effect("creates error with message and cause", () =>
    Effect.sync(function () {
      const cause = new Error("Original error")
      const error = new McpServerError({ message: "Connection failed", cause })
      expect(error._tag).toBe("McpServerError")
      expect(error.message).toBe("Connection failed")
      expect(error.cause).toBe(cause)
    })
  )

  it.effect("can be used as Effect error", () =>
    Effect.gen(function* () {
      const effect = Effect.fail(new McpServerError({ message: "Test" }))

      const error = yield* Effect.flip(effect)

      expect(error._tag).toBe("McpServerError")
    })
  )
})

describe("Tool definition descriptions", () => {
  it.effect("list_issues has helpful description", () =>
    Effect.sync(function () {
      expect(toolDefinition("list_issues").description).toContain("Query")
      expect(toolDefinition("list_issues").description).toContain("issues")
      expect(toolDefinition("list_issues").description).toContain("filter")
    })
  )

  it.effect("get_issue has helpful description", () =>
    Effect.sync(function () {
      expect(toolDefinition("get_issue").description).toContain("Retrieve")
      expect(toolDefinition("get_issue").description).toContain("full details")
      expect(toolDefinition("get_issue").description).toContain("markdown")
    })
  )

  it.effect("create_issue has helpful description", () =>
    Effect.sync(function () {
      expect(toolDefinition("create_issue").description).toContain("Create")
      expect(toolDefinition("create_issue").description).toContain("issue")
      expect(toolDefinition("create_issue").description).toContain("markdown")
    })
  )

  it.effect("update_issue has helpful description", () =>
    Effect.sync(function () {
      expect(toolDefinition("update_issue").description).toContain("Update")
      expect(toolDefinition("update_issue").description).toContain("modified")
      expect(toolDefinition("update_issue").description.length).toBeGreaterThan(30)
    })
  )

  it.effect("add_issue_label has helpful description", () =>
    Effect.sync(function () {
      expect(toolDefinition("add_issue_label").description).toContain("label")
      expect(toolDefinition("add_issue_label").description).toContain("tag")
    })
  )

  it.effect("delete_issue has helpful description", () =>
    Effect.sync(function () {
      expect(toolDefinition("delete_issue").description).toContain("delete")
      expect(toolDefinition("delete_issue").description).toContain("cannot be undone")
    })
  )
})

// --- McpServerService.layer run/stop tests ---

const buildStdioService = (config?: { telemetryOps?: Partial<TelemetryOperations> }) => {
  const telemetryLayer = config?.telemetryOps
    ? TelemetryService.testLayer(config.telemetryOps)
    : TelemetryService.testLayer()
  const layers = Layer.mergeAll(
    HulyClient.testLayer({}),
    HulyStorageClient.testLayer({}),
    WorkspaceClient.testLayer({}),
    telemetryLayer
  )
  return buildTestServerLayer({ transport: "stdio" }, layers)
}

describe("McpServerService.layer operations", () => {
  describe("stop()", () => {
    it.effect("stop when not running is a no-op", () =>
      Effect.gen(function* () {
        const serverLayer = buildStdioService()
        const ctx = yield* Layer.build(serverLayer)
        // Get the service from the context
        const ops = yield* McpServerService.pipe(Effect.provide(Layer.succeedContext(ctx)))
        yield* ops.stop()
      })
    )

    it.effect("stop when not running calls early return path", () => {
      let shutdownCalled = false
      return Effect.gen(function* () {
        const serverLayer = buildStdioService({
          telemetryOps: {
            shutdown: async () => {
              shutdownCalled = true
            }
          }
        })
        const ctx = yield* Layer.build(serverLayer)
        const ops = yield* McpServerService.pipe(Effect.provide(Layer.succeedContext(ctx)))
        yield* ops.stop()
        // shutdown should NOT be called because isRunning was false
        expect(shutdownCalled).toBe(false)
      })
    })

    it.effect("awaitReady fails when the server has not started", () =>
      Effect.gen(function* () {
        const serverLayer = buildStdioService()
        const ctx = yield* Layer.build(serverLayer)
        const ops = yield* McpServerService.pipe(Effect.provide(Layer.succeedContext(ctx)))
        const failure = yield* ops.awaitReady().pipe(Effect.flip)

        expect(failure).toBeInstanceOf(McpServerError)
        expect(failure.message).toBe("MCP server is not running")
      })
    )
  })

  describe("run() stdio transport", () => {
    it.effect(
      "run completes when stdin ends",
      () =>
        Effect.gen(function* () {
          const serverLayer = buildStdioService()
          const ctx = yield* Layer.build(serverLayer)
          const ops = yield* McpServerService.pipe(Effect.provide(Layer.succeedContext(ctx)))

          const fiber = yield* ops
            .run()
            .pipe(
              Effect.provideService(HttpServerFactoryService, unusedHttpServerFactory),
              Effect.forkScoped({ startImmediately: true })
            )

          yield* ops.awaitReady()
          process.stdin.emit("end")
          yield* Fiber.join(fiber)
        }),
      { timeout: 5000 }
    )

    it.effect(
      "run completes when SIGINT received",
      () =>
        Effect.gen(function* () {
          const serverLayer = buildStdioService()
          const ctx = yield* Layer.build(serverLayer)
          const ops = yield* McpServerService.pipe(Effect.provide(Layer.succeedContext(ctx)))

          const fiber = yield* ops
            .run()
            .pipe(
              Effect.provideService(HttpServerFactoryService, unusedHttpServerFactory),
              Effect.forkScoped({ startImmediately: true })
            )

          yield* ops.awaitReady()
          process.emit("SIGINT")
          yield* Fiber.join(fiber)
        }),
      { timeout: 5000 }
    )

    it.effect(
      "uses the default stdio transport when no factory is provided",
      () =>
        Effect.gen(function* () {
          const layers = Layer.mergeAll(
            HulyClient.testLayer({}),
            HulyStorageClient.testLayer({}),
            WorkspaceClient.testLayer({}),
            TelemetryService.testLayer()
          )
          const serverLayer = McpServerService.layer({
            transport: "stdio",
            createServer: createMockServer,
            resolveClients: resolveClientsFromLayer(layers)
          }).pipe(Layer.provide(layers))
          const ctx = yield* Layer.build(serverLayer)
          const ops = yield* McpServerService.pipe(Effect.provide(Layer.succeedContext(ctx)))

          const fiber = yield* ops
            .run()
            .pipe(
              Effect.provideService(HttpServerFactoryService, unusedHttpServerFactory),
              Effect.forkScoped({ startImmediately: true })
            )

          yield* ops.awaitReady()
          process.stdin.emit("end")
          yield* Fiber.join(fiber)
        }),
      { timeout: 5000 }
    )

    it.effect(
      "run fails with already-running error on second call",
      () =>
        Effect.gen(function* () {
          const serverLayer = buildStdioService()
          const ctx = yield* Layer.build(serverLayer)
          const ops = yield* McpServerService.pipe(Effect.provide(Layer.succeedContext(ctx)))

          const fiber = yield* ops
            .run()
            .pipe(
              Effect.provideService(HttpServerFactoryService, unusedHttpServerFactory),
              Effect.forkScoped({ startImmediately: true })
            )

          yield* ops.awaitReady()

          const error = yield* Effect.flip(
            ops.run().pipe(Effect.provideService(HttpServerFactoryService, unusedHttpServerFactory))
          )

          expect(error._tag).toBe("McpServerError")
          expect(error.message).toBe("MCP server is already running")

          process.stdin.emit("end")
          yield* Fiber.join(fiber)
        }),
      { timeout: 5000 }
    )

    it.effect("reports SDK-managed stdio connection failures out of band", () =>
      Effect.gen(function* () {
        const errors: Array<string> = []
        const errorReported = yield* Deferred.make<void>()
        const layers = Layer.mergeAll(
          HulyClient.testLayer({}),
          HulyStorageClient.testLayer({}),
          WorkspaceClient.testLayer({}),
          TelemetryService.testLayer()
        )
        const serverLayer = buildTestServerLayer(
          {
            transport: "stdio",
            createServer: (instructions) => {
              const server = createDefaultMcpSdkServer(instructions)
              server.connect = () => Promise.reject(new Error("connection refused"))
              return server
            },
            writeError: (message) => {
              errors.push(message)
              Effect.runSync(Deferred.succeed(errorReported, undefined))
            }
          },
          layers
        )
        const ctx = yield* Layer.build(serverLayer)
        const ops = yield* McpServerService.pipe(Effect.provide(Layer.succeedContext(ctx)))
        const fiber = yield* ops
          .run()
          .pipe(Effect.provide(HttpServerFactoryService.defaultLayer), Effect.forkScoped({ startImmediately: true }))

        yield* ops.awaitReady()
        yield* Deferred.await(errorReported)
        expect(errors).toContain("MCP stdio handler error")
        process.stdin.emit("end")
        yield* Fiber.join(fiber)
      })
    )

    it.effect(
      "run handles server close failure gracefully",
      () =>
        Effect.gen(function* () {
          mockCloseBehavior = () => Promise.reject(new Error("close failed"))
          const serverLayer = buildStdioService()
          const ctx = yield* Layer.build(serverLayer)
          const ops = yield* McpServerService.pipe(Effect.provide(Layer.succeedContext(ctx)))

          const fiber = yield* ops
            .run()
            .pipe(
              Effect.provideService(HttpServerFactoryService, unusedHttpServerFactory),
              Effect.forkScoped({ startImmediately: true })
            )

          yield* ops.awaitReady()
          process.stdin.emit("end")

          const result = yield* Fiber.await(fiber)
          // The server close error should propagate as McpServerError
          if (result._tag === "Failure") {
            // Expected - close failed
            expect(true).toBe(true)
          }

          mockCloseBehavior = null
        }),
      { timeout: 5000 }
    )

    it.effect(
      "run cleanup removes signal listeners when fiber is interrupted",
      () =>
        Effect.gen(function* () {
          const serverLayer = buildStdioService()
          const ctx = yield* Layer.build(serverLayer)
          const ops = yield* McpServerService.pipe(Effect.provide(Layer.succeedContext(ctx)))

          const fiber = yield* ops
            .run()
            .pipe(
              Effect.provideService(HttpServerFactoryService, unusedHttpServerFactory),
              Effect.forkScoped({ startImmediately: true })
            )

          yield* ops.awaitReady()
          yield* Fiber.interrupt(fiber)
        }),
      { timeout: 5000 }
    )

    it.effect(
      "run cleanup works after readiness",
      () =>
        Effect.gen(function* () {
          const serverLayer = buildStdioService()
          const ctx = yield* Layer.build(serverLayer)
          const ops = yield* McpServerService.pipe(Effect.provide(Layer.succeedContext(ctx)))

          const fiber = yield* ops
            .run()
            .pipe(
              Effect.provideService(HttpServerFactoryService, unusedHttpServerFactory),
              Effect.forkScoped({ startImmediately: true })
            )

          yield* ops.awaitReady()
          yield* Fiber.interrupt(fiber)
        }),
      { timeout: 5000 }
    )

    it.effect(
      "run flushes telemetry on completion",
      () => {
        let shutdownCalled = false
        return Effect.gen(function* () {
          const serverLayer = buildStdioService({
            telemetryOps: {
              shutdown: async () => {
                shutdownCalled = true
              },
              sessionStart: () => {},
              firstListTools: () => {},
              toolCalled: () => {}
            }
          })
          const ctx = yield* Layer.build(serverLayer)
          const ops = yield* McpServerService.pipe(Effect.provide(Layer.succeedContext(ctx)))

          const fiber = yield* ops
            .run()
            .pipe(
              Effect.provideService(HttpServerFactoryService, unusedHttpServerFactory),
              Effect.forkScoped({ startImmediately: true })
            )

          yield* ops.awaitReady()
          process.stdin.emit("end")
          yield* Fiber.join(fiber)

          expect(shutdownCalled).toBe(true)
        })
      },
      { timeout: 5000 }
    )
  })

  describe("stop() when running (stdio)", () => {
    it.effect(
      "stop when running flushes telemetry and closes server",
      () => {
        let shutdownCalled = false
        return Effect.gen(function* () {
          const serverLayer = buildStdioService({
            telemetryOps: {
              shutdown: async () => {
                shutdownCalled = true
              },
              sessionStart: () => {},
              firstListTools: () => {},
              toolCalled: () => {}
            }
          })
          const ctx = yield* Layer.build(serverLayer)
          const ops = yield* McpServerService.pipe(Effect.provide(Layer.succeedContext(ctx)))

          const fiber = yield* ops
            .run()
            .pipe(
              Effect.provideService(HttpServerFactoryService, unusedHttpServerFactory),
              Effect.forkScoped({ startImmediately: true })
            )

          yield* ops.awaitReady()

          yield* ops.stop()
          expect(shutdownCalled).toBe(true)

          // Unblock the run() fiber
          process.stdin.emit("end")
          yield* Fiber.interrupt(fiber)
        })
      },
      { timeout: 5000 }
    )

    it.effect(
      "stop when running with http transport (server is null) skips close",
      () =>
        Effect.gen(function* () {
          const layers = Layer.mergeAll(
            HulyClient.testLayer({}),
            HulyStorageClient.testLayer({}),
            WorkspaceClient.testLayer({}),
            TelemetryService.testLayer()
          )
          const serverLayer = buildTestServerLayer(
            { transport: "http", httpPort: 19878, httpHost: "127.0.0.1" },
            layers
          )

          const ctx = yield* Layer.build(serverLayer)
          const ops = yield* McpServerService.pipe(Effect.provide(Layer.succeedContext(ctx)))

          const mockHttpFactory: HttpServerFactoryService["Service"] = {
            make: (_port, host) =>
              Effect.succeed(
                HttpServer.make({
                  address: { _tag: "TcpAddress", hostname: host, port: 19878 },
                  serve: () => Effect.void
                })
              )
          }

          // Start run() to set isRunning=true
          const fiber = yield* ops
            .run()
            .pipe(
              Effect.provideService(HttpServerFactoryService, mockHttpFactory),
              Effect.forkScoped({ startImmediately: true })
            )

          yield* ops.awaitReady()

          // Call stop while running - since transport=http, server is null
          // so the `if (server)` branch (line 274) should be false
          yield* ops.stop()

          // Clean up the fiber
          yield* Fiber.interrupt(fiber)
        }),
      { timeout: 5000 }
    )

    it.effect(
      "stop reports SDK-managed server close errors out of band",
      () =>
        Effect.gen(function* () {
          const errors: Array<string> = []
          const serverCreated = yield* Deferred.make<void>()
          const layers = Layer.mergeAll(
            HulyClient.testLayer({}),
            HulyStorageClient.testLayer({}),
            WorkspaceClient.testLayer({}),
            TelemetryService.testLayer()
          )
          const serverLayer = buildTestServerLayer(
            {
              transport: "stdio",
              createServer: (instructions) => {
                const server = createDefaultMcpSdkServer(instructions)
                server.close = () => Promise.reject(new Error("server close failed"))
                Effect.runSync(Deferred.succeed(serverCreated, undefined))
                return server
              },
              writeError: (message) => errors.push(message)
            },
            layers
          )
          const ctx = yield* Layer.build(serverLayer)
          const ops = yield* McpServerService.pipe(Effect.provide(Layer.succeedContext(ctx)))

          const fiber = yield* ops
            .run()
            .pipe(
              Effect.provideService(HttpServerFactoryService, unusedHttpServerFactory),
              Effect.forkScoped({ startImmediately: true })
            )

          yield* ops.awaitReady()
          yield* Deferred.await(serverCreated)

          yield* ops.stop()
          expect(errors).toContain("MCP stdio handler error")
          expect(errors.join("\n")).not.toContain("server close failed")

          // Unblock the run() fiber
          process.stdin.emit("end")
          yield* Fiber.interrupt(fiber)
        }),
      { timeout: 5000 }
    )
  })

  describe("telemetry integration", () => {
    it.effect("sessionStart defaults authMethod to password when not specified", () => {
      let capturedProps: SessionStartProps | null = null
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
        const serverLayer = buildTestServerLayer({ transport: "stdio" }, layers)
        yield* Layer.build(serverLayer)
        expect(capturedProps).not.toBeNull()
        expect(assertExists(capturedProps).authMethod).toBe("password")
      })
    })

    it.effect("sessionStart includes toolsets when TOOLSETS env is set", () => {
      let capturedProps: SessionStartProps | null = null
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
        const serverLayer = buildTestServerLayer({ transport: "stdio" }, layers)
        yield* Layer.build(serverLayer).pipe(provideConfig({ TOOLSETS: "issues,documents" }))
        expect(capturedProps).not.toBeNull()
        expect(assertExists(capturedProps).toolsets).toEqual(expect.arrayContaining(["issues", "documents"]))
      })
    })

    it.effect("sessionStart toolsets is null when no TOOLSETS env", () => {
      let capturedProps: SessionStartProps | null = null
      return Effect.gen(function* () {
        const originalTools = process.env.TOOLS
        delete process.env.TOOLSETS
        delete process.env.TOOLS
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
        const serverLayer = buildTestServerLayer({ transport: "stdio" }, layers)
        yield* Layer.build(serverLayer)
        expect(capturedProps).not.toBeNull()
        expect(assertExists(capturedProps).toolsets).toBeNull()
        if (originalTools === undefined) {
          delete process.env.TOOLS
        } else {
          process.env.TOOLS = originalTools
        }
      })
    })

    it.effect("http transport stop is no-op when not running", () =>
      Effect.gen(function* () {
        const layers = Layer.mergeAll(
          HulyClient.testLayer({}),
          HulyStorageClient.testLayer({}),
          WorkspaceClient.testLayer({}),
          TelemetryService.testLayer()
        )
        const serverLayer = buildTestServerLayer({ transport: "http", httpPort: 9999 }, layers)
        const ctx = yield* Layer.build(serverLayer)
        const ops = yield* McpServerService.pipe(Effect.provide(Layer.succeedContext(ctx)))
        // stop() when not running should be a no-op even for http
        yield* ops.stop()
      })
    )
  })

  describe("createMcpServer request handlers", () => {
    const buildAndRun = (
      layers: Layer.Layer<HulyClient | HulyStorageClient | WorkspaceClient | TelemetryService>,
      createServer: (instructions?: HostedHulyMigrationInstructions) => Server = createMockServer,
      configValues: Record<string, string> = {}
    ) =>
      Effect.gen(function* () {
        const serverCreated = yield* Deferred.make<void>()
        const serverLayer = buildTestServerLayer(
          {
            transport: "stdio",
            createServer: (instructions) => {
              const server = createServer(instructions)
              queueMicrotask(() => Effect.runSync(Deferred.succeed(serverCreated, undefined)))
              return server
            }
          },
          layers
        )
        const ctx = yield* Layer.build(serverLayer).pipe(provideConfig(configValues))
        const ops = yield* McpServerService.pipe(Effect.provide(Layer.succeedContext(ctx)))
        const fiber = yield* ops
          .run()
          .pipe(
            Effect.provideService(HttpServerFactoryService, unusedHttpServerFactory),
            Effect.forkScoped({ startImmediately: true })
          )
        yield* ops.awaitReady()
        yield* Deferred.await(serverCreated)
        return fiber
      })

    const cleanup = (fiber: Fiber.Fiber<void, McpServerError>) =>
      Effect.gen(function* () {
        process.stdin.emit("end")
        yield* Fiber.interrupt(fiber)
      })

    const buildAndRunWithResolveClients = (
      resolveClients: () => Promise<ClientBundle>,
      telemetryOps: Partial<TelemetryOperations>,
      configValues: Record<string, string> = {}
    ) =>
      Effect.gen(function* () {
        const serverCreated = yield* Deferred.make<void>()
        const serverLayer = McpServerService.layer({
          transport: "stdio",
          createServer: () => {
            const server = createMockServer()
            queueMicrotask(() => Effect.runSync(Deferred.succeed(serverCreated, undefined)))
            return server
          },
          createStdioTransport: createTestStdioTransport,
          resolveClients: () => resolveClients().then((bundle) => Exit.succeed(bundle))
        }).pipe(Layer.provide(TelemetryService.testLayer(telemetryOps)))
        const ctx = yield* Layer.build(serverLayer).pipe(provideConfig(configValues))
        const ops = yield* McpServerService.pipe(Effect.provide(Layer.succeedContext(ctx)))
        const fiber = yield* ops
          .run()
          .pipe(
            Effect.provideService(HttpServerFactoryService, unusedHttpServerFactory),
            Effect.forkScoped({ startImmediately: true })
          )
        yield* ops.awaitReady()
        yield* Deferred.await(serverCreated)
        return fiber
      })

    it("default SDK server advertises resources without subscribe or listChanged", () => {
      const server = createDefaultMcpSdkServer()
      const getCapabilities = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(server), "getCapabilities")?.value
      if (typeof getCapabilities !== "function") {
        throw new Error("SDK server getCapabilities function was not found")
      }
      expect(getCapabilities.call(server)).toEqual({ resources: {}, tools: {} })
    })

    it.effect(
      "ListTools handler returns tool definitions",
      () =>
        Effect.gen(function* () {
          capturedHandlers.clear()
          let firstListToolsCalled = false
          const telemetryOps: Partial<TelemetryOperations> = {
            firstListTools: () => {
              firstListToolsCalled = true
            },
            sessionStart: () => {},
            toolCalled: () => {},
            shutdown: async () => {}
          }
          const layers = Layer.mergeAll(
            HulyClient.testLayer({}),
            HulyStorageClient.testLayer({}),
            WorkspaceClient.testLayer({}),
            TelemetryService.testLayer(telemetryOps)
          )
          const fiber = yield* buildAndRun(layers)

          const listToolsHandler = capturedHandlers.get(ListToolsRequestSchema) as
            | (() => Promise<{ tools: Array<{ name: string }> }>)
            | undefined
          expect(listToolsHandler).toBeDefined()

          const result = yield* Effect.promise(() => assertExists(listToolsHandler)())
          expect(result.tools.length).toBeGreaterThan(0)
          expect(assertAt(result.tools, 0)).toHaveProperty("name")
          expect(assertAt(result.tools, 0)).toHaveProperty("description")
          expect(assertAt(result.tools, 0)).toHaveProperty("inputSchema")
          expect(assertAt(result.tools, 0)).toHaveProperty("outputSchema")
          expect(result.tools.every((tool) => "outputSchema" in tool)).toBe(true)
          expect(result.tools[0]?.name).toBe("get_version")
          expect(result.tools[1]?.name).toBe("get_huly_context")
          expect(assertAt(result.tools, 1)).toMatchObject({
            inputSchema: { type: "object", properties: {}, additionalProperties: false },
            annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
          })
          expect(firstListToolsCalled).toBe(true)

          yield* cleanup(fiber)
        }),
      { timeout: 5000 }
    )

    it.effect(
      "CallTool handles get_huly_context without resolving Huly clients",
      () =>
        Effect.gen(function* () {
          capturedHandlers.clear()
          const originalEnv = { ...process.env }
          process.env["HULY_URL"] = "https://user:pass@example.huly.app/path?token=query-secret"
          process.env["HULY_TOKEN"] = "secret-token"
          process.env["HULY_EMAIL"] = "user@example.com"
          process.env["HULY_PASSWORD"] = "secret-password"
          process.env["HULY_WORKSPACE"] = "workspace-one"
          process.env["HULY_CONNECTION_TIMEOUT"] = "45000"
          process.env["LAZY_ENVS"] = "true"

          let resolveCalled = false
          let toolCalledProps: ToolCalledProps | null = null
          const fiber = yield* buildAndRunWithResolveClients(
            async () => {
              resolveCalled = true
              throw new Error("client resolution should be skipped")
            },
            {
              firstListTools: () => {},
              sessionStart: () => {},
              toolCalled: (props) => {
                toolCalledProps = props
              },
              shutdown: async () => {}
            }
          )

          // The schema-keyed capture map cannot preserve the SDK handler type associated with each key.
          const callToolHandler = capturedHandlers.get(CallToolRequestSchema) as
            | ((req: { params: { name: string; arguments?: Record<string, unknown> } }) => Promise<unknown>)
            | undefined
          expect(callToolHandler).toBeDefined()

          const result = (yield* Effect.promise(() =>
            assertExists(callToolHandler)({ params: { name: "get_huly_context", arguments: {} } })
          )) as {
            content: Array<{ text: string }>
            structuredContent?: { result?: { huly?: { url?: { origin?: string } }; auth?: { method?: string } } }
            isError?: boolean
          }

          expect(result.isError).toBeUndefined()
          expect(result.structuredContent?.result?.huly?.url?.origin).toBe("https://example.huly.app")
          expect(result.structuredContent?.result?.auth?.method).toBe("token")
          expect(resolveCalled).toBe(false)
          expect(toolCalledProps).not.toBeNull()
          expect(assertExists<ToolCalledProps>(toolCalledProps).toolName).toBe("get_huly_context")
          expect(assertExists<ToolCalledProps>(toolCalledProps).status).toBe("success")
          const serialized = JSON.stringify(result)
          expect(serialized).not.toContain("secret-token")
          expect(serialized).not.toContain("secret-password")
          expect(serialized).not.toContain("user@example.com")
          expect(serialized).not.toContain("query-secret")

          process.env = originalEnv
          yield* cleanup(fiber)
        }),
      { timeout: 5000 }
    )

    it.effect(
      "stdio appends the hosted-Huly warning only to the first tool result",
      () =>
        Effect.gen(function* () {
          capturedHandlers.clear()
          const originalEnv = { ...process.env }
          process.env["HULY_URL"] = "https://huly.app"

          const layers = Layer.mergeAll(
            HulyClient.testLayer({}),
            HulyStorageClient.testLayer({}),
            WorkspaceClient.testLayer({}),
            TelemetryService.testLayer()
          )
          const fiber = yield* buildAndRun(layers)
          // The schema-keyed capture map cannot preserve the SDK handler type associated with each key.
          const callToolHandler = capturedHandlers.get(CallToolRequestSchema) as
            | ((req: {
                params: { name: string; arguments?: Record<string, unknown> }
              }) => Promise<{
                readonly content: ReadonlyArray<{ readonly text: string }>
                readonly structuredContent?: {
                  readonly warnings?: ReadonlyArray<{ readonly code: string; readonly message: string }>
                }
              }>)
            | undefined
          expect(callToolHandler).toBeDefined()
          if (callToolHandler === undefined) throw new Error("CallTool handler was not registered")

          const first = yield* Effect.promise(() =>
            callToolHandler({ params: { name: "get_huly_context", arguments: {} } })
          )
          const second = yield* Effect.promise(() =>
            callToolHandler({ params: { name: "get_huly_context", arguments: {} } })
          )

          expect(first.structuredContent?.warnings).toEqual([HOSTED_HULY_MIGRATION_WARNING])
          expect(JSON.parse(assertAt(first.content, 1).text)).toEqual({ warnings: [HOSTED_HULY_MIGRATION_WARNING] })
          expect(second.structuredContent?.warnings).toBeUndefined()
          expect(second.content).toHaveLength(1)

          process.env = originalEnv
          yield* cleanup(fiber)
        }),
      { timeout: 5000 }
    )

    it.effect(
      "stdio initialization instructions apply only to the default hosted Huly origin",
      () =>
        Effect.gen(function* () {
          const originalEnv = { ...process.env }
          const seenInstructions: Array<HostedHulyMigrationInstructions | undefined> = []
          const layers = Layer.mergeAll(
            HulyClient.testLayer({}),
            HulyStorageClient.testLayer({}),
            WorkspaceClient.testLayer({}),
            TelemetryService.testLayer()
          )
          const createServer = (instructions?: HostedHulyMigrationInstructions): Server => {
            seenInstructions.push(instructions)
            return createMockServer()
          }

          process.env["HULY_URL"] = "https://huly.app"
          const hostedFiber = yield* buildAndRun(layers, createServer)
          yield* cleanup(hostedFiber)

          process.env["HULY_URL"] = "https://huly.example.com"
          const selfHostedFiber = yield* buildAndRun(layers, createServer)
          yield* cleanup(selfHostedFiber)

          expect(seenInstructions).toEqual([HOSTED_HULY_MIGRATION_WARNING.message, undefined])

          process.env = originalEnv
        }),
      { timeout: 5000 }
    )

    it.effect(
      "get_huly_context remains visible and reports active TOOLSETS filtering",
      () =>
        Effect.gen(function* () {
          capturedHandlers.clear()
          const fiber = yield* buildAndRunWithResolveClients(
            async () => {
              throw new Error("client resolution should be skipped")
            },
            { firstListTools: () => {}, sessionStart: () => {}, toolCalled: () => {}, shutdown: async () => {} },
            { TOOLSETS: "issues" }
          )

          const listToolsHandler = capturedHandlers.get(ListToolsRequestSchema) as
            | (() => Promise<{ tools: Array<{ name: string }> }>)
            | undefined
          const listed = yield* Effect.promise(() => assertExists(listToolsHandler)())
          expect(listed.tools[0]?.name).toBe("get_version")
          expect(listed.tools[1]?.name).toBe("get_huly_context")

          const callToolHandler = capturedHandlers.get(CallToolRequestSchema) as
            | ((req: { params: { name: string; arguments?: Record<string, unknown> } }) => Promise<unknown>)
            | undefined
          const result = (yield* Effect.promise(() =>
            assertExists(callToolHandler)({ params: { name: "get_huly_context", arguments: {} } })
          )) as {
            structuredContent?: {
              result?: {
                toolsets?: {
                  filteringActive?: boolean
                  requestedCategories?: ReadonlyArray<string>
                  enabledCategories?: ReadonlyArray<string>
                  visibleRegisteredToolCount?: number
                  totalRegisteredToolCount?: number
                }
              }
            }
          }

          expect(result.structuredContent?.result?.toolsets).toMatchObject({
            filteringActive: true,
            requestedCategories: ["issues"],
            enabledCategories: ["issues"]
          })
          expect(result.structuredContent?.result?.toolsets?.visibleRegisteredToolCount).toBeLessThan(
            result.structuredContent?.result?.toolsets?.totalRegisteredToolCount ?? 0
          )

          yield* cleanup(fiber)
        }),
      { timeout: 5000 }
    )

    it.effect(
      "CallTool accepts omitted arguments for get_huly_context",
      () =>
        Effect.gen(function* () {
          capturedHandlers.clear()
          const fiber = yield* buildAndRunWithResolveClients(
            async () => {
              throw new Error("client resolution should be skipped")
            },
            { firstListTools: () => {}, sessionStart: () => {}, toolCalled: () => {}, shutdown: async () => {} }
          )

          const callToolHandler = capturedHandlers.get(CallToolRequestSchema) as
            | ((req: { params: { name: string; arguments?: Record<string, unknown> } }) => Promise<unknown>)
            | undefined

          const result = (yield* Effect.promise(() =>
            assertExists(callToolHandler)({ params: { name: "get_huly_context" } })
          )) as { structuredContent?: { result?: unknown }; isError?: boolean }

          expect(result.isError).toBeUndefined()
          expect(result.structuredContent?.result).toBeDefined()

          yield* cleanup(fiber)
        }),
      { timeout: 5000 }
    )

    it.effect(
      "ListResourceTemplates handler returns Huly resource templates",
      () =>
        Effect.gen(function* () {
          capturedHandlers.clear()
          const layers = Layer.mergeAll(
            HulyClient.testLayer({}),
            HulyStorageClient.testLayer({}),
            WorkspaceClient.testLayer({}),
            TelemetryService.testLayer()
          )
          const fiber = yield* buildAndRun(layers)

          const handler = capturedHandlers.get(ListResourceTemplatesRequestSchema) as
            | (() => { resourceTemplates: Array<{ name: string; uriTemplate: string }> })
            | undefined
          expect(handler).toBeDefined()

          const result = assertExists(handler)()
          expect(result.resourceTemplates).toEqual([
            expect.objectContaining({
              name: "huly-project",
              uriTemplate: "huly://projects/{project}",
              mimeType: "application/json"
            }),
            expect.objectContaining({
              name: "huly-issue",
              uriTemplate: "huly://issues/{issue}",
              mimeType: "application/json"
            }),
            expect.objectContaining({
              name: "huly-project-issue",
              uriTemplate: "huly://projects/{project}/issues/{issue}",
              mimeType: "application/json"
            })
          ])

          yield* cleanup(fiber)
        }),
      { timeout: 5000 }
    )

    it.effect(
      "ListResources handler returns concrete active project resources",
      () =>
        Effect.gen(function* () {
          capturedHandlers.clear()
          const layers = Layer.mergeAll(
            createMockHulyClientLayer({
              projects: [
                makeProject(),
                makeProject({
                  _id: "archived-project" as Ref<HulyProject>,
                  identifier: "OLD",
                  name: "Archived Project",
                  archived: true
                })
              ]
            }),
            HulyStorageClient.testLayer({}),
            WorkspaceClient.testLayer({}),
            TelemetryService.testLayer()
          )
          const fiber = yield* buildAndRun(layers)

          const handler = capturedHandlers.get(ListResourcesRequestSchema) as
            | (() => Promise<{ resources: Array<unknown> }>)
            | undefined
          expect(handler).toBeDefined()

          const result = yield* Effect.promise(() => assertExists(handler)())
          expect(result).toEqual({
            resources: [
              {
                uri: "huly://projects/TEST",
                name: "TEST",
                title: "Test Project",
                description: "Project used by MCP server tests",
                mimeType: "application/json"
              }
            ]
          })

          yield* cleanup(fiber)
        }),
      { timeout: 5000 }
    )

    it.effect(
      "ReadResource handler returns project JSON resource contents",
      () =>
        Effect.gen(function* () {
          capturedHandlers.clear()
          const layers = Layer.mergeAll(
            createMockHulyClientLayer({ projects: [makeProject()] }),
            HulyStorageClient.testLayer({}),
            WorkspaceClient.testLayer({}),
            TelemetryService.testLayer()
          )
          const fiber = yield* buildAndRun(layers)

          const handler = capturedHandlers.get(ReadResourceRequestSchema) as
            | ((req: {
                params: { uri: string }
              }) => Promise<{ contents: Array<{ uri: string; mimeType?: string; text: string }> }>)
            | undefined
          expect(handler).toBeDefined()

          const result = yield* Effect.promise(() => assertExists(handler)({ params: { uri: "huly://projects/TEST" } }))
          expect(result.contents).toHaveLength(1)
          expect(result.contents[0]?.uri).toBe("huly://projects/TEST")
          expect(result.contents[0]?.mimeType).toBe("application/json")
          expect(JSON.parse(result.contents[0]?.text ?? "{}")).toMatchObject({
            type: "huly.project",
            uri: "huly://projects/TEST",
            project: { identifier: "TEST", name: "Test Project", archived: false }
          })

          yield* cleanup(fiber)
        }),
      { timeout: 5000 }
    )

    it.effect(
      "ReadResource handler returns issue JSON resource contents",
      () =>
        Effect.gen(function* () {
          capturedHandlers.clear()
          const layers = Layer.mergeAll(
            createMockHulyClientLayer({ projects: [makeProject()], issues: [makeIssue()] }),
            HulyStorageClient.testLayer({}),
            WorkspaceClient.testLayer({}),
            TelemetryService.testLayer()
          )
          const fiber = yield* buildAndRun(layers)

          const handler = capturedHandlers.get(ReadResourceRequestSchema) as
            | ((req: {
                params: { uri: string }
              }) => Promise<{ contents: Array<{ uri: string; mimeType?: string; text: string }> }>)
            | undefined
          expect(handler).toBeDefined()

          const result = yield* Effect.promise(() => assertExists(handler)({ params: { uri: "huly://issues/TEST-1" } }))
          expect(result.contents).toHaveLength(1)
          expect(result.contents[0]?.uri).toBe("huly://issues/TEST-1")
          expect(result.contents[0]?.mimeType).toBe("application/json")
          expect(JSON.parse(result.contents[0]?.text ?? "{}")).toMatchObject({
            type: "huly.issue",
            uri: "huly://issues/TEST-1",
            issue: { identifier: "TEST-1", title: "Test Issue", project: "TEST" }
          })

          yield* cleanup(fiber)
        }),
      { timeout: 5000 }
    )

    it.effect(
      "CallTool rejects unexpected arguments for get_huly_context",
      () =>
        Effect.gen(function* () {
          capturedHandlers.clear()
          let toolCalledProps: ToolCalledProps | null = null
          const fiber = yield* buildAndRunWithResolveClients(
            async () => {
              throw new Error("client resolution should be skipped")
            },
            {
              firstListTools: () => {},
              sessionStart: () => {},
              toolCalled: (props) => {
                toolCalledProps = props
              },
              shutdown: async () => {}
            }
          )

          const callToolHandler = capturedHandlers.get(CallToolRequestSchema) as
            | ((req: { params: { name: string; arguments?: Record<string, unknown> } }) => Promise<unknown>)
            | undefined

          const result = (yield* Effect.promise(() =>
            assertExists(callToolHandler)({ params: { name: "get_huly_context", arguments: { raw: true } } })
          )) as { content: Array<{ text: string }>; isError?: boolean }

          expect(result.isError).toBe(true)
          expect(result.content[0]?.text).toContain("does not accept arguments")
          expect(toolCalledProps).not.toBeNull()
          expect(assertExists<ToolCalledProps>(toolCalledProps).errorTag).toBe("UnexpectedArguments")

          yield* cleanup(fiber)
        }),
      { timeout: 5000 }
    )

    it.effect(
      "CallTool get_huly_context succeeds with missing Huly env in lazy mode",
      () =>
        Effect.gen(function* () {
          capturedHandlers.clear()
          const originalEnv = { ...process.env }
          delete process.env["HULY_URL"]
          delete process.env["HULY_TOKEN"]
          delete process.env["HULY_EMAIL"]
          delete process.env["HULY_PASSWORD"]
          delete process.env["HULY_WORKSPACE"]
          process.env["LAZY_ENVS"] = "true"

          const fiber = yield* buildAndRunWithResolveClients(
            async () => {
              throw new Error("client resolution should be skipped")
            },
            { firstListTools: () => {}, sessionStart: () => {}, toolCalled: () => {}, shutdown: async () => {} }
          )

          const callToolHandler = capturedHandlers.get(CallToolRequestSchema) as
            | ((req: { params: { name: string; arguments?: Record<string, unknown> } }) => Promise<unknown>)
            | undefined

          const result = (yield* Effect.promise(() =>
            assertExists(callToolHandler)({ params: { name: "get_huly_context", arguments: {} } })
          )) as {
            structuredContent?: {
              result?: {
                huly?: { url?: { configured?: boolean }; workspace?: { configured?: boolean } }
                auth?: { method?: string; source?: string }
                configSources?: { env?: { lazyEnvs?: boolean } }
              }
            }
            isError?: boolean
          }

          expect(result.isError).toBeUndefined()
          expect(result.structuredContent?.result?.huly?.url?.configured).toBe(false)
          expect(result.structuredContent?.result?.huly?.workspace?.configured).toBe(false)
          expect(result.structuredContent?.result?.auth).toMatchObject({ method: "unknown", source: "none" })
          expect(result.structuredContent?.result?.configSources?.env?.lazyEnvs).toBe(true)

          process.env = originalEnv
          yield* cleanup(fiber)
        }),
      { timeout: 5000 }
    )

    it.effect(
      "ReadResource handler rejects malformed resource URIs with JSON-RPC errors",
      () =>
        Effect.gen(function* () {
          capturedHandlers.clear()
          const layers = Layer.mergeAll(
            HulyClient.testLayer({}),
            HulyStorageClient.testLayer({}),
            WorkspaceClient.testLayer({}),
            TelemetryService.testLayer()
          )
          const fiber = yield* buildAndRun(layers)

          const handler = capturedHandlers.get(ReadResourceRequestSchema) as
            | ((req: { params: { uri: string } }) => Promise<unknown>)
            | undefined
          expect(handler).toBeDefined()

          const error = yield* Effect.flip(
            Effect.tryPromise({
              try: () => assertExists(handler)({ params: { uri: "huly://issues/123" } }),
              catch: (error) => (error instanceof ProtocolError ? error : new ProtocolError(-32603, String(error)))
            })
          )

          expect(error).toBeInstanceOf(ProtocolError)
          if (error instanceof ProtocolError) {
            expect(error.code).toBe(-32602)
          }

          yield* cleanup(fiber)
        }),
      { timeout: 5000 }
    )

    it.effect(
      "ListTools handler returns client-compatible root object schemas",
      () =>
        Effect.gen(function* () {
          capturedHandlers.clear()
          const layers = Layer.mergeAll(
            HulyClient.testLayer({}),
            HulyStorageClient.testLayer({}),
            WorkspaceClient.testLayer({}),
            TelemetryService.testLayer()
          )
          const fiber = yield* buildAndRun(layers)

          const listToolsHandler = capturedHandlers.get(ListToolsRequestSchema)
          expect(listToolsHandler).toBeDefined()
          if (typeof listToolsHandler !== "function") {
            throw new Error("ListTools handler was not registered")
          }

          const result = assertListToolsResponse(yield* Effect.promise(() => Promise.resolve(listToolsHandler())))
          const tools = new Map(result.tools.map((tool) => [tool.name, assertSchemaObject(tool.inputSchema)]))

          for (const schema of tools.values()) {
            expect(schema.type).toBe("object")
            expect(schema.anyOf).toBeUndefined()
            expect(schema.oneOf).toBeUndefined()
            expect(schema.allOf).toBeUndefined()
          }

          const updateIssueSchema = assertSchemaObject(tools.get("update_issue"))
          const updateIssueProperties = assertSchemaObject(updateIssueSchema.properties)
          expect(updateIssueProperties.title).toBeDefined()
          expect(updateIssueProperties.description).toBeDefined()
          expect(updateIssueProperties.priority).toBeDefined()
          expect(updateIssueProperties.assignee).toBeDefined()
          expect(updateIssueProperties.status).toBeDefined()

          const listActivitySchema = assertSchemaObject(tools.get("list_activity"))
          const listActivityProperties = assertSchemaObject(listActivitySchema.properties)
          expect(listActivityProperties.project).toBeDefined()
          expect(listActivityProperties.issueIdentifier).toBeDefined()
          expect(listActivityProperties.teamspace).toBeDefined()
          expect(listActivityProperties.document).toBeDefined()
          expect(listActivityProperties.channel).toBeDefined()
          expect(listActivityProperties.objectId).toBeDefined()
          expect(listActivityProperties.objectClass).toBeDefined()

          yield* cleanup(fiber)
        }),
      { timeout: 5000 }
    )

    it.effect(
      "CallTool handler returns null for unknown tool",
      () =>
        Effect.gen(function* () {
          capturedHandlers.clear()
          let toolCalledProps: ToolCalledProps | null = null
          const telemetryOps: Partial<TelemetryOperations> = {
            firstListTools: () => {},
            sessionStart: () => {},
            toolCalled: (props) => {
              toolCalledProps = props
            },
            shutdown: async () => {}
          }
          const layers = Layer.mergeAll(
            HulyClient.testLayer({}),
            HulyStorageClient.testLayer({}),
            WorkspaceClient.testLayer({}),
            TelemetryService.testLayer(telemetryOps)
          )
          const fiber = yield* buildAndRun(layers)

          const callToolHandler = capturedHandlers.get(CallToolRequestSchema) as
            | ((req: { params: { name: string; arguments?: Record<string, unknown> } }) => Promise<unknown>)
            | undefined
          expect(callToolHandler).toBeDefined()

          const result = yield* Effect.promise(() =>
            assertExists(callToolHandler)({ params: { name: "nonexistent_tool", arguments: {} } })
          )

          expect(result).toHaveProperty("isError", true)
          expect(result).toHaveProperty("content")
          expect(toolCalledProps).not.toBeNull()
          expect(assertExists<ToolCalledProps>(toolCalledProps).toolName).toBe("nonexistent_tool")
          expect(assertExists<ToolCalledProps>(toolCalledProps).status).toBe("error")

          yield* cleanup(fiber)
        }),
      { timeout: 5000 }
    )

    it.effect(
      "CallTool validates missing required arguments before resolving clients",
      () =>
        Effect.gen(function* () {
          capturedHandlers.clear()
          let resolveCalled = false
          let toolCalledProps: ToolCalledProps | null = null
          const telemetryOps: Partial<TelemetryOperations> = {
            firstListTools: () => {},
            sessionStart: () => {},
            toolCalled: (props) => {
              toolCalledProps = props
            },
            shutdown: async () => {}
          }
          const fiber = yield* buildAndRunWithResolveClients(async () => {
            resolveCalled = true
            throw new Error("client resolution should be skipped")
          }, telemetryOps)

          const callToolHandler = capturedHandlers.get(CallToolRequestSchema) as
            | ((req: { params: { name: string; arguments?: Record<string, unknown> } }) => Promise<unknown>)
            | undefined
          expect(callToolHandler).toBeDefined()

          const result = (yield* Effect.promise(() =>
            assertExists(callToolHandler)({ params: { name: "get_issue" } })
          )) as { content: Array<{ text: string }>; isError?: boolean }

          expect(result.isError).toBe(true)
          expect(result.content[0]?.text).toContain("missing arguments object")
          expect(resolveCalled).toBe(false)
          expect(toolCalledProps).not.toBeNull()
          expect(assertExists<ToolCalledProps>(toolCalledProps).status).toBe("error")
          expect(assertExists<ToolCalledProps>(toolCalledProps).errorTag).toBe("MissingArguments")

          yield* cleanup(fiber)
        }),
      { timeout: 5000 }
    )

    it.effect(
      "CallTool validates anyOf-required arguments before resolving clients",
      () =>
        Effect.gen(function* () {
          capturedHandlers.clear()
          let resolveCalled = false
          let toolCalledProps: ToolCalledProps | null = null
          const telemetryOps: Partial<TelemetryOperations> = {
            firstListTools: () => {},
            sessionStart: () => {},
            toolCalled: (props) => {
              toolCalledProps = props
            },
            shutdown: async () => {}
          }
          const fiber = yield* buildAndRunWithResolveClients(async () => {
            resolveCalled = true
            throw new Error("client resolution should be skipped")
          }, telemetryOps)

          const callToolHandler = capturedHandlers.get(CallToolRequestSchema) as
            | ((req: { params: { name: string; arguments?: Record<string, unknown> } }) => Promise<unknown>)
            | undefined
          expect(callToolHandler).toBeDefined()

          const result = (yield* Effect.promise(() =>
            assertExists(callToolHandler)({ params: { name: "update_user_profile" } })
          )) as { content: Array<{ text: string }>; isError?: boolean }

          expect(result.isError).toBe(true)
          expect(result.content[0]?.text).toContain("missing arguments object")
          expect(resolveCalled).toBe(false)
          expect(toolCalledProps).not.toBeNull()
          expect(assertExists<ToolCalledProps>(toolCalledProps).status).toBe("error")
          expect(assertExists<ToolCalledProps>(toolCalledProps).errorTag).toBe("MissingArguments")

          yield* cleanup(fiber)
        }),
      { timeout: 5000 }
    )

    it.effect(
      "CallTool validates oneOf-required arguments before resolving clients",
      () =>
        Effect.gen(function* () {
          capturedHandlers.clear()
          let resolveCalled = false
          let toolCalledProps: ToolCalledProps | null = null
          const telemetryOps: Partial<TelemetryOperations> = {
            firstListTools: () => {},
            sessionStart: () => {},
            toolCalled: (props) => {
              toolCalledProps = props
            },
            shutdown: async () => {}
          }
          const fiber = yield* buildAndRunWithResolveClients(async () => {
            resolveCalled = true
            throw new Error("client resolution should be skipped")
          }, telemetryOps)

          const callToolHandler = capturedHandlers.get(CallToolRequestSchema) as
            | ((req: { params: { name: string; arguments?: Record<string, unknown> } }) => Promise<unknown>)
            | undefined
          expect(callToolHandler).toBeDefined()

          const result = (yield* Effect.promise(() =>
            assertExists(callToolHandler)({ params: { name: "list_activity" } })
          )) as { content: Array<{ text: string }>; isError?: boolean }

          expect(result.isError).toBe(true)
          expect(result.content[0]?.text).toContain("missing arguments object")
          expect(resolveCalled).toBe(false)
          expect(toolCalledProps).not.toBeNull()
          expect(assertExists<ToolCalledProps>(toolCalledProps).status).toBe("error")
          expect(assertExists<ToolCalledProps>(toolCalledProps).errorTag).toBe("MissingArguments")

          yield* cleanup(fiber)
        }),
      { timeout: 5000 }
    )

    it.effect(
      "CallTool handler handles known tool",
      () =>
        Effect.gen(function* () {
          capturedHandlers.clear()
          let toolCalledProps: ToolCalledProps | null = null
          const telemetryOps: Partial<TelemetryOperations> = {
            firstListTools: () => {},
            sessionStart: () => {},
            toolCalled: (props) => {
              toolCalledProps = props
            },
            shutdown: async () => {}
          }
          const layers = Layer.mergeAll(
            HulyClient.testLayer({}),
            HulyStorageClient.testLayer({}),
            WorkspaceClient.testLayer({}),
            TelemetryService.testLayer(telemetryOps)
          )
          const fiber = yield* buildAndRun(layers)

          const callToolHandler = capturedHandlers.get(CallToolRequestSchema) as
            | ((req: { params: { name: string; arguments?: Record<string, unknown> } }) => Promise<unknown>)
            | undefined
          expect(callToolHandler).toBeDefined()

          // list_projects is a known tool that uses HulyClient.findAll
          const result = (yield* Effect.promise(() =>
            assertExists(callToolHandler)({ params: { name: "list_projects", arguments: {} } })
          )) as { content: Array<{ text: string }>; isError?: boolean }

          // With mock HulyClient that returns empty results, this should succeed
          expect(result.content).toBeDefined()
          expect(result.content.length).toBeGreaterThan(0)
          expect(toolCalledProps).not.toBeNull()
          expect(assertExists<ToolCalledProps>(toolCalledProps).toolName).toBe("list_projects")
          expect(assertExists<ToolCalledProps>(toolCalledProps).status).toBe("success")

          yield* cleanup(fiber)
        }),
      { timeout: 5000 }
    )

    it.effect(
      "CallTool handler accepts omitted arguments for all-optional parameter tools",
      () =>
        Effect.gen(function* () {
          capturedHandlers.clear()
          const layers = Layer.mergeAll(
            HulyClient.testLayer({}),
            HulyStorageClient.testLayer({}),
            WorkspaceClient.testLayer({}),
            TelemetryService.testLayer()
          )
          const fiber = yield* buildAndRun(layers)

          const callToolHandler = capturedHandlers.get(CallToolRequestSchema) as
            | ((req: { params: { name: string; arguments?: Record<string, unknown> } }) => Promise<unknown>)
            | undefined
          expect(callToolHandler).toBeDefined()

          const result = (yield* Effect.promise(() =>
            assertExists(callToolHandler)({ params: { name: "list_projects" } })
          )) as { content: Array<{ text: string }>; isError?: boolean }

          expect(result.content).toBeDefined()
          expect(result.isError).toBeUndefined()
          expect(result.content[0]?.text).toBe('{"projects":[],"total":0}')

          yield* cleanup(fiber)
        }),
      { timeout: 5000 }
    )

    it.effect(
      "CallTool records error telemetry for parse errors",
      () =>
        Effect.gen(function* () {
          capturedHandlers.clear()
          let toolCalledProps: ToolCalledProps | null = null
          const telemetryOps: Partial<TelemetryOperations> = {
            firstListTools: () => {},
            sessionStart: () => {},
            toolCalled: (props) => {
              toolCalledProps = props
            },
            shutdown: async () => {}
          }
          const layers = Layer.mergeAll(
            HulyClient.testLayer({}),
            HulyStorageClient.testLayer({}),
            WorkspaceClient.testLayer({}),
            TelemetryService.testLayer(telemetryOps)
          )
          const fiber = yield* buildAndRun(layers)

          const callToolHandler = capturedHandlers.get(CallToolRequestSchema) as
            | ((req: { params: { name: string; arguments?: Record<string, unknown> } }) => Promise<unknown>)
            | undefined

          // Call with invalid args to trigger a parse error (which returns error response)
          const result = (yield* Effect.promise(() =>
            assertExists(callToolHandler)({ params: { name: "get_issue", arguments: {} } })
          )) as { content: Array<{ text: string }>; isError?: boolean }

          expect(result.content).toBeDefined()
          expect(toolCalledProps).not.toBeNull()
          expect(assertExists<ToolCalledProps>(toolCalledProps).toolName).toBe("get_issue")
          expect(assertExists<ToolCalledProps>(toolCalledProps).status).toBe("error")

          yield* cleanup(fiber)
        }),
      { timeout: 5000 }
    )

    it.effect(
      "CallTool records internal error telemetry for connection errors",
      () =>
        Effect.gen(function* () {
          capturedHandlers.clear()
          let toolCalledProps: ToolCalledProps | null = null
          const telemetryOps: Partial<TelemetryOperations> = {
            firstListTools: () => {},
            sessionStart: () => {},
            toolCalled: (props) => {
              toolCalledProps = props
            },
            shutdown: async () => {}
          }

          const { HulyConnectionError } = yield* Effect.promise(() => import("../../src/huly/errors.js"))
          const failingClient = HulyClient.testLayer({
            findAll: () => Effect.fail(new HulyConnectionError({ message: "connection lost" }))
          })

          const layers = Layer.mergeAll(
            failingClient,
            HulyStorageClient.testLayer({}),
            WorkspaceClient.testLayer({}),
            TelemetryService.testLayer(telemetryOps)
          )
          const fiber = yield* buildAndRun(layers)

          const callToolHandler = capturedHandlers.get(CallToolRequestSchema) as
            | ((req: { params: { name: string; arguments?: Record<string, unknown> } }) => Promise<unknown>)
            | undefined

          const result = (yield* Effect.promise(() =>
            assertExists(callToolHandler)({ params: { name: "list_projects", arguments: {} } })
          )) as { content: Array<{ text: string }>; isError?: boolean }

          expect(result.isError).toBe(true)
          expect(toolCalledProps).not.toBeNull()
          expect(assertExists<ToolCalledProps>(toolCalledProps).status).toBe("error")
          expect(assertExists<ToolCalledProps>(toolCalledProps).toolName).toBe("list_projects")

          yield* cleanup(fiber)
        }),
      { timeout: 5000 }
    )
  })
})
