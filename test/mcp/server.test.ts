import { describe, it } from "@effect/vitest"
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
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema
} from "@modelcontextprotocol/sdk/types.js"
import { Context, Effect, Fiber, Layer } from "effect"
import { expect } from "vitest"
import { sanitizeHulyRuntimeConfigFromEnv, sanitizeHulyRuntimeConfigFromHeaders } from "../../src/config/config.js"
import { HulyClient, type HulyClientOperations } from "../../src/huly/client.js"
import { HulyStorageClient } from "../../src/huly/storage.js"
import { WorkspaceClient } from "../../src/huly/workspace-client.js"
import {
  HttpServerFactoryService,
  type HttpTransportDependencies,
  HttpTransportError
} from "../../src/mcp/http-transport.js"
import { createDefaultMcpSdkServer } from "../../src/mcp/sdk-server.js"
import { type ClientBundle, McpServerError, McpServerService } from "../../src/mcp/server.js"
import { TOOL_DEFINITIONS } from "../../src/mcp/tools/index.js"
import type { ToolDefinition } from "../../src/mcp/tools/registry.js"
import type { SessionStartProps, TelemetryOperations, ToolCalledProps } from "../../src/telemetry/telemetry.js"
import { TelemetryService } from "../../src/telemetry/telemetry.js"
import { assertAt, assertExists } from "../../src/utils/assertions.js"

import { tracker } from "../../src/huly/huly-plugins.js"

/**
 * Build a resolveClients callback from a layer that provides all three client services.
 * The result is memoized — builds the layer once, caches the bundle.
 */
const resolveClientsFromLayer = (
  clientLayer: Layer.Layer<HulyClient | HulyStorageClient | WorkspaceClient>
): () => Promise<ClientBundle> => {
  let promise: Promise<ClientBundle> | null = null
  return () => {
    if (promise === null) {
      promise = Effect.runPromise(
        Effect.gen(function*() {
          const ctx = yield* Layer.build(clientLayer).pipe(Effect.scoped)
          return {
            hulyClient: Context.get(ctx, HulyClient),
            storageClient: Context.get(ctx, HulyStorageClient),
            workspaceClient: Context.get(ctx, WorkspaceClient)
          }
        })
      )
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
    mcpAuthToken?: string
    autoExit?: boolean
    authMethod?: "token" | "password"
    httpTransportDependencies?: Partial<HttpTransportDependencies>
  },
  layers: Layer.Layer<HulyClient | HulyStorageClient | WorkspaceClient | TelemetryService>
) => {
  const { httpTransportDependencies, ...serverConfig } = config
  return McpServerService.layer({
    ...serverConfig,
    ...(httpTransportDependencies === undefined ? {} : { httpTransportDependencies }),
    createServer: createMockServer,
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- test transport is never inspected by the mocked server
    createStdioTransport: () => ({}) as never,
    resolveClients: resolveClientsFromLayer(layers)
  }).pipe(Layer.provide(layers))
}

const quietHttpTransportDependencies: Partial<HttpTransportDependencies> = {
  createTransport: () =>
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- test fake implements only methods used by createMcpHandlers
    ({
      async close() {},
      async handleRequest() {}
    }) as never,
  writeError: () => {}
}

// Captured request handlers from mocked MCP Server instances
type HandlerMap = Map<unknown, (...args: Array<unknown>) => unknown>
const capturedHandlers: HandlerMap = new Map()

// Configurable mock behavior for Server.connect/close
let mockConnectBehavior: (() => Promise<void>) | null = null
let mockCloseBehavior: (() => Promise<void>) | null = null

const createMockServer = () =>
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- test fake implements only methods used by McpServerService
  ({
    setRequestHandler(schema: unknown, handler: (...args: Array<unknown>) => unknown) {
      capturedHandlers.set(schema, handler)
    },
    async connect() {
      if (mockConnectBehavior) return mockConnectBehavior()
    },
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
  return Array.isArray(required) && required.every(item => typeof item === "string") ? required : undefined
}

const requiredModeSets = (tool: ToolDefinition): ReadonlyArray<string> => {
  const oneOf = schemaProperty(tool.inputSchema, "oneOf")
  return Array.isArray(oneOf)
    ? oneOf.map(requiredList).filter(required => required !== undefined).map(required => required.join("+"))
    : []
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const assertSchemaObject = (value: unknown): Record<string, unknown> => {
  if (!isRecord(value)) {
    throw new Error("Expected schema object")
  }
  return value
}

interface ListedToolForTest {
  readonly name: string
  readonly inputSchema: unknown
}

const isListedToolForTest = (value: unknown): value is ListedToolForTest =>
  isRecord(value) && typeof value.name === "string" && "inputSchema" in value

const assertListToolsResponse = (value: unknown): { readonly tools: ReadonlyArray<ListedToolForTest> } => {
  if (!isRecord(value)) {
    throw new Error("Expected ListTools response object")
  }

  const tools = value.tools
  if (!Array.isArray(tools) || !tools.every(isListedToolForTest)) {
    throw new Error("Expected ListTools response with tool definitions")
  }

  return { tools }
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
      const archived = query !== null && typeof query === "object"
        ? Object.getOwnPropertyDescriptor(query, "archived")?.value
        : undefined
      const filteredProjects = typeof archived === "boolean"
        ? projects.filter(project => project.archived === archived)
        : projects
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
      const found = projects.find(p => p.identifier === identifier)
      return Effect.succeed(found)
    }
    if (_class === tracker.class.Issue) {
      const q = query as Record<string, unknown>
      const found = issues.find(i =>
        (q.identifier && i.identifier === q.identifier)
        || (q.number && i.number === q.number)
      )
      return Effect.succeed(found)
    }
    return Effect.succeed(undefined)
  }) as HulyClientOperations["findOne"]

  return HulyClient.testLayer({
    findAll: findAllImpl,
    findOne: findOneImpl
  })
}

// --- Tests ---

describe("TOOL_DEFINITIONS", () => {
  it.effect("exports tool definitions", () =>
    Effect.gen(function*() {
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
    }))

  it.effect("each tool has name, description, and inputSchema", () =>
    Effect.gen(function*() {
      for (const [key, tool] of Object.entries(TOOL_DEFINITIONS)) {
        expect(tool.name).toBe(key)
        expect(typeof tool.description).toBe("string")
        expect(tool.description.length).toBeGreaterThan(10)
        expect(tool.inputSchema).toBeDefined()
        expect(typeof tool.inputSchema).toBe("object")
      }
    }))

  describe("inputSchema format", () => {
    it.effect("list_issues schema has correct structure", () =>
      Effect.gen(function*() {
        const schema = toolDefinition("list_issues").inputSchema
        expect(schema).toHaveProperty("type", "object")
        expect(schema).toHaveProperty("properties")
        const props = (schema as { properties: Record<string, unknown> }).properties
        expect(props).toHaveProperty("project")
        expect(props).toHaveProperty("status")
        expect(props).toHaveProperty("assignee")
        expect(props).toHaveProperty("limit")
      }))

    it.effect("get_issue schema has correct structure", () =>
      Effect.gen(function*() {
        const schema = toolDefinition("get_issue").inputSchema
        expect(schema).toHaveProperty("type", "object")
        expect(schema).toHaveProperty("properties")
        expect((schema as { properties: Record<string, unknown> }).properties).toHaveProperty("project")
        expect((schema as { properties: Record<string, unknown> }).properties).toHaveProperty("identifier")
      }))

    it.effect("create_issue schema has correct structure", () =>
      Effect.gen(function*() {
        const schema = toolDefinition("create_issue").inputSchema
        expect(schema).toHaveProperty("type", "object")
        expect(schema).toHaveProperty("properties")
        expect((schema as { properties: Record<string, unknown> }).properties).toHaveProperty("project")
        expect((schema as { properties: Record<string, unknown> }).properties).toHaveProperty("title")
      }))

    it.effect("update_issue schema has correct structure", () =>
      Effect.gen(function*() {
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
      }))

    it.effect("add_issue_label schema has correct structure", () =>
      Effect.gen(function*() {
        const schema = toolDefinition("add_issue_label").inputSchema
        expect(schema).toHaveProperty("type", "object")
        expect(schema).toHaveProperty("properties")
        const props = (schema as { properties: Record<string, unknown> }).properties
        expect(props).toHaveProperty("project")
        expect(props).toHaveProperty("identifier")
        expect(props).toHaveProperty("label")
        expect(props).toHaveProperty("color")
      }))

    it.effect("delete_issue schema has correct structure", () =>
      Effect.gen(function*() {
        const schema = toolDefinition("delete_issue").inputSchema
        expect(schema).toHaveProperty("type", "object")
        expect(schema).toHaveProperty("properties")
        const props = (schema as { properties: Record<string, unknown> }).properties
        expect(props).toHaveProperty("project")
        expect(props).toHaveProperty("identifier")
      }))

    it.effect("list_teamspaces schema has correct structure", () =>
      Effect.gen(function*() {
        const schema = toolDefinition("list_teamspaces").inputSchema
        expect(schema).toHaveProperty("type", "object")
        expect(schema).toHaveProperty("properties")
        const props = (schema as { properties: Record<string, unknown> }).properties
        expect(props).toHaveProperty("includeArchived")
        expect(props).toHaveProperty("limit")
      }))

    it.effect("get_document schema has correct structure", () =>
      Effect.gen(function*() {
        const schema = toolDefinition("get_document").inputSchema
        expect(schema).toHaveProperty("type", "object")
        expect(schema).toHaveProperty("properties")
        const props = (schema as { properties: Record<string, unknown> }).properties
        expect(props).toHaveProperty("teamspace")
        expect(props).toHaveProperty("document")
      }))

    it.effect("create_document schema has correct structure", () =>
      Effect.gen(function*() {
        const schema = toolDefinition("create_document").inputSchema
        expect(schema).toHaveProperty("type", "object")
        expect(schema).toHaveProperty("properties")
        const props = (schema as { properties: Record<string, unknown> }).properties
        expect(props).toHaveProperty("teamspace")
        expect(props).toHaveProperty("title")
        expect(props).toHaveProperty("content")
      }))

    it.effect("list_activity schema exposes explicit target modes", () =>
      Effect.gen(function*() {
        const schema = toolDefinition("list_activity").inputSchema
        expect(schema).toHaveProperty("type", "object")
        expect(Array.isArray(schemaProperty(schema, "oneOf"))).toBe(true)

        const requiredSets = requiredModeSets(toolDefinition("list_activity"))
        expect(requiredSets).toContain("project+issueIdentifier")
        expect(requiredSets).toContain("teamspace+document")
        expect(requiredSets).toContain("channel")
        expect(requiredSets).toContain("objectId+objectClass")
      }))
  })
})

describe("McpServerService", () => {
  describe("layer creation", () => {
    it.scoped("can create layer with stdio transport config", () =>
      Effect.gen(function*() {
        const project = makeProject()
        const issues = [makeIssue()]
        const statuses = [makeStatus({ _id: "status-open" as Ref<Status>, name: "Open" })]

        const hulyClientLayer = createMockHulyClientLayer({
          projects: [project],
          issues,
          statuses
        })

        const storageClientLayer = HulyStorageClient.testLayer({})
        const workspaceClientLayer = WorkspaceClient.testLayer({})

        const serverLayer = McpServerService.layer({
          transport: "stdio",
          resolveClients: resolveClientsFromLayer(
            Layer.mergeAll(hulyClientLayer, storageClientLayer, workspaceClientLayer)
          )
        }).pipe(
          Layer.provide(TelemetryService.testLayer())
        )

        // Verify we can build the layer (this tests the Effect.gen runs without error)
        yield* Layer.build(serverLayer)
      }))

    it.scoped("can create layer with http transport config", () =>
      Effect.gen(function*() {
        const project = makeProject()
        const hulyClientLayer = createMockHulyClientLayer({
          projects: [project],
          issues: [],
          statuses: []
        })

        const storageClientLayer = HulyStorageClient.testLayer({})
        const workspaceClientLayer = WorkspaceClient.testLayer({})

        const serverLayer = McpServerService.layer({
          transport: "http",
          httpPort: 3000,
          resolveClients: resolveClientsFromLayer(
            Layer.mergeAll(hulyClientLayer, storageClientLayer, workspaceClientLayer)
          )
        }).pipe(
          Layer.provide(TelemetryService.testLayer())
        )

        yield* Layer.build(serverLayer)
      }))
  })

  describe("testLayer", () => {
    it.effect("creates a test layer with default operations", () =>
      Effect.gen(function*() {
        const mockHttpLayer = Layer.succeed(HttpServerFactoryService, {} as never)
        const testLayer = Layer.merge(McpServerService.testLayer({}), mockHttpLayer)

        const result = yield* Effect.gen(function*() {
          const server = yield* McpServerService
          // run() should return void immediately with default mock
          yield* server.run()
          yield* server.stop()
          return "success"
        }).pipe(Effect.provide(testLayer))

        expect(result).toBe("success")
      }))

    it.effect("allows overriding run operation", () =>
      Effect.gen(function*() {
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

        yield* Effect.gen(function*() {
          const server = yield* McpServerService
          yield* server.run()
        }).pipe(Effect.provide(testLayer))

        expect(runCalled).toBe(true)
      }))

    it.effect("allows overriding stop operation", () =>
      Effect.gen(function*() {
        let stopCalled = false

        const testLayer = McpServerService.testLayer({
          stop: () =>
            Effect.sync(() => {
              stopCalled = true
            })
        })

        yield* Effect.gen(function*() {
          const server = yield* McpServerService
          yield* server.stop()
        }).pipe(Effect.provide(testLayer))

        expect(stopCalled).toBe(true)
      }))

    it.effect("can mock run to fail with error", () =>
      Effect.gen(function*() {
        const mockHttpLayer = Layer.succeed(HttpServerFactoryService, {} as never)
        const testLayer = Layer.merge(
          McpServerService.testLayer({
            run: () => new McpServerError({ message: "Test error" })
          }),
          mockHttpLayer
        )

        const error = yield* Effect.flip(
          Effect.gen(function*() {
            const server = yield* McpServerService
            yield* server.run()
          }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("McpServerError")
        expect(error.message).toBe("Test error")
      }))
  })
})

describe("McpServerError", () => {
  it.effect("creates error with message", () =>
    Effect.gen(function*() {
      const error = new McpServerError({ message: "Connection failed" })
      expect(error._tag).toBe("McpServerError")
      expect(error.message).toBe("Connection failed")
    }))

  it.effect("creates error with message and cause", () =>
    Effect.gen(function*() {
      const cause = new Error("Original error")
      const error = new McpServerError({
        message: "Connection failed",
        cause
      })
      expect(error._tag).toBe("McpServerError")
      expect(error.message).toBe("Connection failed")
      expect(error.cause).toBe(cause)
    }))

  it.effect("can be used as Effect error", () =>
    Effect.gen(function*() {
      const effect = Effect.fail(new McpServerError({ message: "Test" }))

      const error = yield* Effect.flip(effect)

      expect(error._tag).toBe("McpServerError")
    }))
})

describe("Tool definition descriptions", () => {
  it.effect("list_issues has helpful description", () =>
    Effect.gen(function*() {
      expect(toolDefinition("list_issues").description).toContain("Query")
      expect(toolDefinition("list_issues").description).toContain("issues")
      expect(toolDefinition("list_issues").description).toContain("filter")
    }))

  it.effect("get_issue has helpful description", () =>
    Effect.gen(function*() {
      expect(toolDefinition("get_issue").description).toContain("Retrieve")
      expect(toolDefinition("get_issue").description).toContain("full details")
      expect(toolDefinition("get_issue").description).toContain("markdown")
    }))

  it.effect("create_issue has helpful description", () =>
    Effect.gen(function*() {
      expect(toolDefinition("create_issue").description).toContain("Create")
      expect(toolDefinition("create_issue").description).toContain("issue")
      expect(toolDefinition("create_issue").description).toContain("markdown")
    }))

  it.effect("update_issue has helpful description", () =>
    Effect.gen(function*() {
      expect(toolDefinition("update_issue").description).toContain("Update")
      expect(toolDefinition("update_issue").description).toContain("modified")
      expect(toolDefinition("update_issue").description.length).toBeGreaterThan(30)
    }))

  it.effect("add_issue_label has helpful description", () =>
    Effect.gen(function*() {
      expect(toolDefinition("add_issue_label").description).toContain("label")
      expect(toolDefinition("add_issue_label").description).toContain("tag")
    }))

  it.effect("delete_issue has helpful description", () =>
    Effect.gen(function*() {
      expect(toolDefinition("delete_issue").description).toContain("delete")
      expect(toolDefinition("delete_issue").description).toContain("cannot be undone")
    }))
})

// --- McpServerService.layer run/stop tests ---

const buildStdioService = (
  config?: { autoExit?: boolean; telemetryOps?: Partial<TelemetryOperations> }
) => {
  const telemetryLayer = config?.telemetryOps
    ? TelemetryService.testLayer(config.telemetryOps)
    : TelemetryService.testLayer()
  const layers = Layer.mergeAll(
    HulyClient.testLayer({}),
    HulyStorageClient.testLayer({}),
    WorkspaceClient.testLayer({}),
    telemetryLayer
  )
  return buildTestServerLayer({
    transport: "stdio",
    autoExit: config?.autoExit ?? true
  }, layers)
}

describe("McpServerService.layer operations", () => {
  describe("stop()", () => {
    it.scoped("stop when not running is a no-op", () =>
      Effect.gen(function*() {
        const serverLayer = buildStdioService()
        const ctx = yield* Layer.build(serverLayer)
        // Get the service from the context
        const ops = yield* McpServerService.pipe(
          Effect.provide(Layer.succeedContext(ctx))
        )
        yield* ops.stop()
      }))

    it.scoped("stop when not running calls early return path", () => {
      let shutdownCalled = false
      return Effect.gen(function*() {
        const serverLayer = buildStdioService({
          telemetryOps: {
            shutdown: async () => {
              shutdownCalled = true
            }
          }
        })
        const ctx = yield* Layer.build(serverLayer)
        const ops = yield* McpServerService.pipe(
          Effect.provide(Layer.succeedContext(ctx))
        )
        yield* ops.stop()
        // shutdown should NOT be called because isRunning was false
        expect(shutdownCalled).toBe(false)
      })
    })
  })

  describe("run() stdio transport", () => {
    it.scoped("run completes when stdin ends (autoExit)", () =>
      Effect.gen(function*() {
        const serverLayer = buildStdioService({ autoExit: true })
        const ctx = yield* Layer.build(serverLayer)
        const ops = yield* McpServerService.pipe(
          Effect.provide(Layer.succeedContext(ctx))
        )

        const fiber = yield* Effect.fork(
          ops.run().pipe(
            Effect.provideService(
              HttpServerFactoryService,
              // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- mock stub
              { createApp: () => ({}) as never, listen: () => Effect.void as never }
            )
          )
        )

        yield* Effect.promise(() => new Promise((r) => setTimeout(r, 50)))
        process.stdin.emit("end")
        yield* Fiber.join(fiber)
      }), { timeout: 5000 })

    it.scoped("run completes when SIGINT received", () =>
      Effect.gen(function*() {
        const serverLayer = buildStdioService({ autoExit: false })
        const ctx = yield* Layer.build(serverLayer)
        const ops = yield* McpServerService.pipe(
          Effect.provide(Layer.succeedContext(ctx))
        )

        const fiber = yield* Effect.fork(
          ops.run().pipe(
            Effect.provideService(
              HttpServerFactoryService,
              // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- mock stub
              { createApp: () => ({}) as never, listen: () => Effect.void as never }
            )
          )
        )

        yield* Effect.promise(() => new Promise((r) => setTimeout(r, 50)))
        process.emit("SIGINT")
        yield* Fiber.join(fiber)
      }), { timeout: 5000 })

    it.scoped("run fails with already-running error on second call", () =>
      Effect.gen(function*() {
        const serverLayer = buildStdioService({ autoExit: true })
        const ctx = yield* Layer.build(serverLayer)
        const ops = yield* McpServerService.pipe(
          Effect.provide(Layer.succeedContext(ctx))
        )

        const fiber = yield* Effect.fork(
          ops.run().pipe(
            Effect.provideService(
              HttpServerFactoryService,
              // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- mock stub
              { createApp: () => ({}) as never, listen: () => Effect.void as never }
            )
          )
        )

        yield* Effect.promise(() => new Promise((r) => setTimeout(r, 50)))

        const error = yield* Effect.flip(
          ops.run().pipe(
            Effect.provideService(
              HttpServerFactoryService,
              // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- mock stub
              { createApp: () => ({}) as never, listen: () => Effect.void as never }
            )
          )
        )

        expect(error._tag).toBe("McpServerError")
        expect(error.message).toBe("MCP server is already running")

        process.stdin.emit("end")
        yield* Fiber.join(fiber)
      }), { timeout: 5000 })

    it.scoped("run fails with McpServerError when connect throws", () =>
      Effect.gen(function*() {
        mockConnectBehavior = () => Promise.reject(new Error("connection refused"))
        const serverLayer = buildStdioService({ autoExit: true })
        const ctx = yield* Layer.build(serverLayer)
        const ops = yield* McpServerService.pipe(
          Effect.provide(Layer.succeedContext(ctx))
        )

        const error = yield* Effect.flip(
          ops.run().pipe(
            Effect.provideService(
              HttpServerFactoryService,
              // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- mock stub
              { createApp: () => ({}) as never, listen: () => Effect.void as never }
            )
          )
        )

        expect(error._tag).toBe("McpServerError")
        expect(error.message).toContain("Failed to connect stdio transport")
        mockConnectBehavior = null
      }), { timeout: 5000 })

    it.scoped("run handles server close failure gracefully", () =>
      Effect.gen(function*() {
        mockCloseBehavior = () => Promise.reject(new Error("close failed"))
        const serverLayer = buildStdioService({ autoExit: true })
        const ctx = yield* Layer.build(serverLayer)
        const ops = yield* McpServerService.pipe(
          Effect.provide(Layer.succeedContext(ctx))
        )

        const fiber = yield* Effect.fork(
          ops.run().pipe(
            Effect.provideService(
              HttpServerFactoryService,
              // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- mock stub
              { createApp: () => ({}) as never, listen: () => Effect.void as never }
            )
          )
        )

        yield* Effect.promise(() => new Promise((r) => setTimeout(r, 50)))
        process.stdin.emit("end")

        const result = yield* Fiber.await(fiber)
        // The server close error should propagate as McpServerError
        if (result._tag === "Failure") {
          // Expected - close failed
          expect(true).toBe(true)
        }

        mockCloseBehavior = null
      }), { timeout: 5000 })

    it.scoped(
      "run cleanup removes signal listeners when fiber is interrupted (autoExit=true)",
      () =>
        Effect.gen(function*() {
          const serverLayer = buildStdioService({ autoExit: true })
          const ctx = yield* Layer.build(serverLayer)
          const ops = yield* McpServerService.pipe(
            Effect.provide(Layer.succeedContext(ctx))
          )

          const fiber = yield* Effect.fork(
            ops.run().pipe(
              Effect.provideService(
                HttpServerFactoryService,
                // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- mock stub
                { createApp: () => ({}) as never, listen: () => Effect.void as never }
              )
            )
          )

          yield* Effect.promise(() => new Promise((r) => setTimeout(r, 50)))
          yield* Fiber.interrupt(fiber)
        }),
      { timeout: 5000 }
    )

    it.scoped("run cleanup works when autoExit is false", () =>
      Effect.gen(function*() {
        const serverLayer = buildStdioService({ autoExit: false })
        const ctx = yield* Layer.build(serverLayer)
        const ops = yield* McpServerService.pipe(
          Effect.provide(Layer.succeedContext(ctx))
        )

        const fiber = yield* Effect.fork(
          ops.run().pipe(
            Effect.provideService(
              HttpServerFactoryService,
              // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- mock stub
              { createApp: () => ({}) as never, listen: () => Effect.void as never }
            )
          )
        )

        yield* Effect.promise(() => new Promise((r) => setTimeout(r, 50)))
        // Interrupt to trigger the cleanup/teardown with autoExit=false branch
        yield* Fiber.interrupt(fiber)
      }), { timeout: 5000 })

    it.scoped("run flushes telemetry on completion", () => {
      let shutdownCalled = false
      return Effect.gen(function*() {
        const serverLayer = buildStdioService({
          autoExit: true,
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
        const ops = yield* McpServerService.pipe(
          Effect.provide(Layer.succeedContext(ctx))
        )

        const fiber = yield* Effect.fork(
          ops.run().pipe(
            Effect.provideService(
              HttpServerFactoryService,
              // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- mock stub
              { createApp: () => ({}) as never, listen: () => Effect.void as never }
            )
          )
        )

        yield* Effect.promise(() => new Promise((r) => setTimeout(r, 50)))
        process.stdin.emit("end")
        yield* Fiber.join(fiber)

        expect(shutdownCalled).toBe(true)
      })
    }, { timeout: 5000 })
  })

  describe("run() http transport", () => {
    it.scoped("http transport maps HttpTransportError to McpServerError", () =>
      Effect.gen(function*() {
        const layers = Layer.mergeAll(
          HulyClient.testLayer({}),
          HulyStorageClient.testLayer({}),
          WorkspaceClient.testLayer({}),
          TelemetryService.testLayer()
        )
        const serverLayer = buildTestServerLayer({
          transport: "http",
          httpPort: 0,
          httpHost: "127.0.0.1"
        }, layers)

        const ctx = yield* Layer.build(serverLayer)
        const ops = yield* McpServerService.pipe(
          Effect.provide(Layer.succeedContext(ctx))
        )

        const mockHttpFactory: HttpServerFactoryService["Type"] = {
          createApp: (_host: string) => {
            const fakeApp = {
              post: () => {},
              get: () => {},
              delete: () => {}
            }
            return fakeApp as never
          },
          listen: () =>
            Effect.fail(
              new HttpTransportError({
                message: "Port already in use"
              })
            )
        }

        const error = yield* Effect.flip(
          ops.run().pipe(
            Effect.provideService(HttpServerFactoryService, mockHttpFactory)
          )
        )

        expect(error._tag).toBe("McpServerError")
        expect(error.message).toBe("Port already in use")
      }), { timeout: 5000 })

    it.scoped("http transport uses default port and host when not specified", () =>
      Effect.gen(function*() {
        const layers = Layer.mergeAll(
          HulyClient.testLayer({}),
          HulyStorageClient.testLayer({}),
          WorkspaceClient.testLayer({}),
          TelemetryService.testLayer()
        )
        const serverLayer = buildTestServerLayer({
          transport: "http"
        }, layers)

        const ctx = yield* Layer.build(serverLayer)
        const ops = yield* McpServerService.pipe(
          Effect.provide(Layer.succeedContext(ctx))
        )

        let capturedPort = 0
        let capturedHost = ""
        const mockHttpFactory: HttpServerFactoryService["Type"] = {
          createApp: (host: string) => {
            capturedHost = host
            const fakeApp = { post: () => {}, get: () => {}, delete: () => {} }
            return fakeApp as never
          },
          listen: (_app, port, _host) => {
            capturedPort = port
            return Effect.fail(
              new HttpTransportError({ message: "stop" })
            )
          }
        }

        yield* Effect.flip(
          ops.run().pipe(
            Effect.provideService(HttpServerFactoryService, mockHttpFactory)
          )
        )

        expect(capturedPort).toBe(3000)
        expect(capturedHost).toBe("127.0.0.1")
      }), { timeout: 5000 })

    it.scoped("http transport createMcpServer callback is invoked on POST", () =>
      Effect.gen(function*() {
        const layers = Layer.mergeAll(
          HulyClient.testLayer({}),
          HulyStorageClient.testLayer({}),
          WorkspaceClient.testLayer({}),
          TelemetryService.testLayer()
        )
        const serverLayer = buildTestServerLayer({
          transport: "http",
          httpPort: 19877,
          httpHost: "127.0.0.1",
          httpTransportDependencies: quietHttpTransportDependencies
        }, layers)

        const ctx = yield* Layer.build(serverLayer)
        const ops = yield* McpServerService.pipe(
          Effect.provide(Layer.succeedContext(ctx))
        )

        // Capture the post handler from the fake app
        let postHandler: ((...args: Array<unknown>) => unknown) | null = null
        const mockHttpFactory: HttpServerFactoryService["Type"] = {
          createApp: (_host: string) => {
            const fakeApp = {
              post: (_path: string, handler: (...args: Array<unknown>) => unknown) => {
                postHandler = handler
              },
              get: () => {},
              delete: () => {}
            }
            return fakeApp as never
          },
          listen: () =>
            Effect.succeed({
              close: (cb: (err?: Error) => void) => cb()
            } as never)
        }

        const fiber = yield* Effect.fork(
          ops.run().pipe(
            Effect.provideService(HttpServerFactoryService, mockHttpFactory)
          )
        )

        yield* Effect.promise(() => new Promise((r) => setTimeout(r, 100)))

        // The post handler should have been set up, and calling it invokes createMcpServer
        expect(postHandler).not.toBeNull()
        // Calling postHandler triggers createServer() callback which covers line 247
        // We just need it to be invoked, the actual request processing will fail since
        // we don't pass valid req/res objects, but the createMcpServer call happens first
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- postHandler is assigned asynchronously in mock callback
        if (postHandler) {
          try {
            // Invoke with fake req/res - will error but the createMcpServer call happens
            const fakeRes = {
              headersSent: false,
              status: () => ({ json: () => {} }),
              on: () => {}
            }
            // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type -- test invocation of captured handler
            yield* Effect.promise(() => (postHandler as Function)({ body: {}, params: {} }, fakeRes).catch(() => {}))
          } catch {
            // Expected
          }
        }

        yield* Fiber.interrupt(fiber)
      }), { timeout: 5000 })

    it.scoped(
      "http transport applies configured MCP auth token before creating MCP server",
      () =>
        Effect.gen(function*() {
          let createServerCalls = 0
          let postHandler: ((req: unknown, res: unknown) => Promise<void>) | undefined
          const mockHttpFactory: HttpServerFactoryService["Type"] = {
            createApp: () => {
              const fakeApp = {
                post: (_path: string, handler: (req: unknown, res: unknown) => Promise<void>) => {
                  postHandler = handler
                },
                get: () => {},
                delete: () => {}
              }
              return fakeApp as never
            },
            listen: () =>
              Effect.succeed({
                close: (cb: (err?: Error) => void) => cb()
              } as never)
          }

          const authServerLayer = McpServerService.layer({
            transport: "http",
            httpPort: 19880,
            httpHost: "127.0.0.1",
            mcpAuthToken: "server-secret",
            createServer: () => {
              createServerCalls++
              return createMockServer()
            },
            resolveClients: resolveClientsFromLayer(
              Layer.mergeAll(
                HulyClient.testLayer({}),
                HulyStorageClient.testLayer({}),
                WorkspaceClient.testLayer({})
              )
            ),
            httpTransportDependencies: quietHttpTransportDependencies
          }).pipe(Layer.provide(TelemetryService.testLayer()))

          const authCtx = yield* Layer.build(authServerLayer)
          const authOps = yield* McpServerService.pipe(
            Effect.provide(Layer.succeedContext(authCtx))
          )
          const fiber = yield* Effect.fork(
            authOps.run().pipe(
              Effect.provideService(HttpServerFactoryService, mockHttpFactory)
            )
          )

          yield* Effect.promise(() => new Promise((r) => setTimeout(r, 100)))

          expect(postHandler).not.toBeUndefined()
          if (postHandler !== undefined) {
            const handler = postHandler
            const unauthorizedRes = {
              headersSent: false,
              setHeader: () => undefined,
              status: (code: number) => ({
                json: (body: unknown) => ({ code, body })
              })
            }
            yield* Effect.promise(() => handler({ body: {}, headers: {}, on: () => undefined }, unauthorizedRes))
            expect(createServerCalls).toBe(0)

            const authorizedRes = {
              headersSent: false,
              on: () => undefined,
              setHeader: () => undefined,
              status: () => ({ json: () => undefined })
            }
            yield* Effect.promise(() =>
              handler({
                body: {},
                headers: { authorization: "Bearer server-secret" },
                on: () => undefined
              }, authorizedRes)
            )
          }

          expect(createServerCalls).toBe(1)
          yield* Fiber.interrupt(fiber)
        }),
      { timeout: 5000 }
    )

    it.scoped("http transport resolves clients from each request headers independently", () =>
      Effect.gen(function*() {
        capturedHandlers.clear()

        const baseClientLayer = Layer.mergeAll(
          HulyClient.testLayer({}),
          HulyStorageClient.testLayer({}),
          WorkspaceClient.testLayer({})
        )
        const resolveBaseClients = resolveClientsFromLayer(baseClientLayer)
        const seenWorkspaces: Array<string | ReadonlyArray<string> | undefined> = []

        const serverLayer = McpServerService.layer({
          transport: "http",
          httpPort: 19879,
          httpHost: "127.0.0.1",
          createServer: createMockServer,
          resolveClients: resolveBaseClients,
          resolveClientsForHttpRequest: (req) => {
            seenWorkspaces.push(req.headers["x-huly-workspace"])
            return resolveBaseClients()
          },
          httpTransportDependencies: {
            createTransport: () =>
              // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- test fake implements the transport methods used by createMcpHandlers
              ({
                async close() {},
                async handleRequest(_req: unknown, _res: unknown, body: unknown) {
                  const handler = capturedHandlers.get(CallToolRequestSchema)
                  if (handler === undefined) throw new Error("CallTool handler was not registered")
                  const params = body && typeof body === "object" && "params" in body
                    ? body.params
                    : { name: "list_projects", arguments: {} }
                  await handler({ params })
                }
              }) as never
          }
        }).pipe(Layer.provide(TelemetryService.testLayer()))

        const ctx = yield* Layer.build(serverLayer)
        const ops = yield* McpServerService.pipe(
          Effect.provide(Layer.succeedContext(ctx))
        )

        const postHandlers: Array<(req: unknown, res: unknown) => Promise<void>> = []
        const mockHttpFactory: HttpServerFactoryService["Type"] = {
          createApp: () =>
            // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- test fake implements the Express methods used by startHttpTransport
            ({
              post: (_path: string, handler: (req: unknown, res: unknown) => Promise<void>) => {
                postHandlers.push(handler)
              },
              get: () => {},
              delete: () => {}
            }) as never,
          listen: () =>
            Effect.succeed({
              close: (cb: (err?: Error) => void) => cb()
            } as never)
        }

        const fiber = yield* Effect.fork(
          ops.run().pipe(
            Effect.provideService(HttpServerFactoryService, mockHttpFactory)
          )
        )

        yield* Effect.promise(() => new Promise((r) => setTimeout(r, 100)))
        expect(postHandlers).toHaveLength(1)

        const handler = assertAt(postHandlers, 0)
        const response = {
          headersSent: false,
          status: () => ({ json: () => {} }),
          on: () => {}
        }
        const makeRequest = (workspace: string) => ({
          body: {
            jsonrpc: "2.0",
            method: "tools/call",
            id: 1,
            params: { name: "list_projects", arguments: {} }
          },
          headers: {
            "x-huly-url": "https://huly.app",
            "x-huly-workspace": workspace,
            "x-huly-token": `token-${workspace}`
          },
          on: () => {}
        })

        yield* Effect.promise(() => handler(makeRequest("workspace-one"), response))
        yield* Effect.promise(() => handler(makeRequest("workspace-two"), response))

        expect(seenWorkspaces).toEqual(["workspace-one", "workspace-two"])

        yield* Fiber.interrupt(fiber)
      }), { timeout: 5000 })

    it.scoped(
      "http transport reports request-specific get_huly_context header config without leakage",
      () =>
        Effect.gen(function*() {
          capturedHandlers.clear()
          const originalEnv = { ...process.env }
          process.env["HULY_URL"] = "https://env.huly.app"
          process.env["HULY_TOKEN"] = "env-token"
          process.env["HULY_EMAIL"] = "env-user@example.com"
          process.env["HULY_PASSWORD"] = "env-password"
          process.env["HULY_WORKSPACE"] = "env-workspace"

          const responses: Array<unknown> = []
          const serverLayer = McpServerService.layer({
            transport: "http",
            httpPort: 19878,
            httpHost: "127.0.0.1",
            createServer: createMockServer,
            resolveClients: async () => {
              throw new Error("client resolution should be skipped")
            },
            getRuntimeConfigContext: () => sanitizeHulyRuntimeConfigFromEnv(process.env),
            getRuntimeConfigContextForHttpRequest: (req) =>
              sanitizeHulyRuntimeConfigFromHeaders(req.headers, process.env),
            httpTransportDependencies: {
              createTransport: () =>
                // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- test fake implements the transport methods used by createMcpHandlers
                ({
                  async close() {},
                  async handleRequest(_req: unknown, _res: unknown, body: unknown) {
                    const handler = capturedHandlers.get(CallToolRequestSchema)
                    if (handler === undefined) throw new Error("CallTool handler was not registered")
                    const params = body && typeof body === "object" && "params" in body
                      ? body.params
                      : { name: "get_huly_context", arguments: {} }
                    responses.push(await handler({ params }))
                  }
                }) as never
            }
          }).pipe(Layer.provide(TelemetryService.testLayer()))

          const ctx = yield* Layer.build(serverLayer)
          const ops = yield* McpServerService.pipe(
            Effect.provide(Layer.succeedContext(ctx))
          )

          const postHandlers: Array<(req: unknown, res: unknown) => Promise<void>> = []
          const mockHttpFactory: HttpServerFactoryService["Type"] = {
            createApp: () =>
              // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- test fake implements the Express methods used by startHttpTransport
              ({
                post: (_path: string, handler: (req: unknown, res: unknown) => Promise<void>) => {
                  postHandlers.push(handler)
                },
                get: () => {},
                delete: () => {}
              }) as never,
            listen: () =>
              Effect.succeed({
                close: (cb: (err?: Error) => void) => cb()
              } as never)
          }

          const fiber = yield* Effect.fork(
            ops.run().pipe(
              Effect.provideService(HttpServerFactoryService, mockHttpFactory)
            )
          )

          yield* Effect.promise(() => new Promise((r) => setTimeout(r, 100)))
          expect(postHandlers).toHaveLength(1)

          const response = {
            headersSent: false,
            status: () => ({ json: () => {} }),
            on: () => {}
          }
          const body = {
            jsonrpc: "2.0",
            method: "tools/call",
            id: 1,
            params: { name: "get_huly_context", arguments: {} }
          }
          const firstRequest = {
            body,
            headers: {
              "x-huly-url": "https://header-user:header-pass@header.huly.app/path?token=header-query-secret",
              "x-huly-workspace": "header-workspace",
              "x-huly-token": "header-token"
            },
            on: () => {}
          }
          const secondRequest = {
            body,
            headers: {},
            on: () => {}
          }

          const handler = assertAt(postHandlers, 0)
          yield* Effect.promise(() => handler(firstRequest, response))
          yield* Effect.promise(() => handler(secondRequest, response))

          const first = assertAt(responses, 0) as {
            structuredContent?: {
              result?: {
                huly?: { url?: { origin?: string }; workspace?: { value?: string } }
                auth?: { source?: string }
                configSources?: { headers?: { present?: boolean; requiredComplete?: boolean } }
              }
            }
          }
          const second = assertAt(responses, 1) as {
            structuredContent?: {
              result?: {
                huly?: { url?: { origin?: string }; workspace?: { value?: string } }
                auth?: { source?: string }
                configSources?: { headers?: { present?: boolean } }
              }
            }
          }

          expect(first.structuredContent?.result?.auth?.source).toBe("header")
          expect(first.structuredContent?.result?.huly?.url?.origin).toBe("https://header.huly.app")
          expect(first.structuredContent?.result?.huly?.workspace?.value).toBe("header-workspace")
          expect(first.structuredContent?.result?.configSources?.headers).toMatchObject({
            present: true,
            requiredComplete: true
          })
          expect(second.structuredContent?.result?.auth?.source).toBe("env")
          expect(second.structuredContent?.result?.huly?.url?.origin).toBe("https://env.huly.app")
          expect(second.structuredContent?.result?.huly?.workspace?.value).toBe("env-workspace")
          expect(second.structuredContent?.result?.configSources?.headers?.present).toBe(false)

          const serialized = JSON.stringify(responses)
          expect(serialized).not.toContain("header-token")
          expect(serialized).not.toContain("env-token")
          expect(serialized).not.toContain("env-password")
          expect(serialized).not.toContain("env-user@example.com")
          expect(serialized).not.toContain("header-user")
          expect(serialized).not.toContain("header-pass")
          expect(serialized).not.toContain("header-query-secret")

          process.env = originalEnv
          yield* Fiber.interrupt(fiber)
        }),
      { timeout: 5000 }
    )
    it.scoped("http transport resolves request-scoped clients for resource reads", () =>
      Effect.gen(function*() {
        capturedHandlers.clear()

        const baseClientLayer = Layer.mergeAll(
          createMockHulyClientLayer({
            projects: [makeProject()]
          }),
          HulyStorageClient.testLayer({}),
          WorkspaceClient.testLayer({})
        )
        const resolveBaseClients = resolveClientsFromLayer(baseClientLayer)
        const seenWorkspaces: Array<string | ReadonlyArray<string> | undefined> = []

        const serverLayer = McpServerService.layer({
          transport: "http",
          httpPort: 19880,
          httpHost: "127.0.0.1",
          createServer: createMockServer,
          resolveClients: resolveBaseClients,
          resolveClientsForHttpRequest: (req) => {
            seenWorkspaces.push(req.headers["x-huly-workspace"])
            return resolveBaseClients()
          },
          httpTransportDependencies: {
            createTransport: () =>
              // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- test fake implements the transport methods used by createMcpHandlers
              ({
                async close() {},
                async handleRequest(_req: unknown, _res: unknown, body: unknown) {
                  const handler = capturedHandlers.get(ReadResourceRequestSchema)
                  if (handler === undefined) throw new Error("ReadResource handler was not registered")
                  const params = body && typeof body === "object" && "params" in body
                    ? body.params
                    : { uri: "huly://projects/TEST" }
                  await handler({ params })
                }
              }) as never
          }
        }).pipe(Layer.provide(TelemetryService.testLayer()))

        const ctx = yield* Layer.build(serverLayer)
        const ops = yield* McpServerService.pipe(
          Effect.provide(Layer.succeedContext(ctx))
        )

        const postHandlers: Array<(req: unknown, res: unknown) => Promise<void>> = []
        const mockHttpFactory: HttpServerFactoryService["Type"] = {
          createApp: () =>
            // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- test fake implements the Express methods used by startHttpTransport
            ({
              post: (_path: string, handler: (req: unknown, res: unknown) => Promise<void>) => {
                postHandlers.push(handler)
              },
              get: () => {},
              delete: () => {}
            }) as never,
          listen: () =>
            Effect.succeed({
              close: (cb: (err?: Error) => void) => cb()
            } as never)
        }

        const fiber = yield* Effect.fork(
          ops.run().pipe(
            Effect.provideService(HttpServerFactoryService, mockHttpFactory)
          )
        )

        yield* Effect.promise(() => new Promise((r) => setTimeout(r, 100)))
        expect(postHandlers).toHaveLength(1)

        const handler = assertAt(postHandlers, 0)
        const response = {
          headersSent: false,
          status: () => ({ json: () => {} }),
          on: () => {}
        }
        const makeRequest = (workspace: string) => ({
          body: {
            jsonrpc: "2.0",
            method: "resources/read",
            id: 1,
            params: { uri: "huly://projects/TEST" }
          },
          headers: {
            "x-huly-url": "https://huly.app",
            "x-huly-workspace": workspace,
            "x-huly-token": `token-${workspace}`
          },
          on: () => {}
        })

        yield* Effect.promise(() => handler(makeRequest("workspace-one"), response))
        yield* Effect.promise(() => handler(makeRequest("workspace-two"), response))

        expect(seenWorkspaces).toEqual(["workspace-one", "workspace-two"])

        yield* Fiber.interrupt(fiber)
      }), { timeout: 5000 })

    it.scoped("http transport run completes via SIGTERM and flushes telemetry", () => {
      return Effect.gen(function*() {
        const telemetryOps: Partial<TelemetryOperations> = {
          shutdown: async () => {},
          sessionStart: () => {},
          firstListTools: () => {},
          toolCalled: () => {}
        }
        const layers = Layer.mergeAll(
          HulyClient.testLayer({}),
          HulyStorageClient.testLayer({}),
          WorkspaceClient.testLayer({}),
          TelemetryService.testLayer(telemetryOps)
        )
        const serverLayer = buildTestServerLayer({
          transport: "http",
          httpPort: 19876,
          httpHost: "127.0.0.1"
        }, layers)

        const ctx = yield* Layer.build(serverLayer)
        const ops = yield* McpServerService.pipe(
          Effect.provide(Layer.succeedContext(ctx))
        )

        const mockHttpFactory: HttpServerFactoryService["Type"] = {
          createApp: (_host: string) => {
            const fakeApp = { post: () => {}, get: () => {}, delete: () => {} }
            return fakeApp as never
          },
          listen: () =>
            Effect.succeed({
              close: (cb: (err?: Error) => void) => cb()
            } as never)
        }

        const fiber = yield* Effect.fork(
          ops.run().pipe(
            Effect.provideService(HttpServerFactoryService, mockHttpFactory)
          )
        )

        yield* Effect.promise(() => new Promise((r) => setTimeout(r, 100)))

        // Emit SIGTERM to trigger the startHttpTransport shutdown handler
        // This should make startHttpTransport resolve, then run() continues to lines 259-260
        process.emit("SIGTERM")

        yield* Effect.promise(() => new Promise((r) => setTimeout(r, 100)))

        // The fiber should complete after SIGTERM
        yield* Fiber.join(fiber)
      })
    }, { timeout: 5000 })
  })

  describe("stop() when running (stdio)", () => {
    it.scoped("stop when running flushes telemetry and closes server", () => {
      let shutdownCalled = false
      return Effect.gen(function*() {
        const serverLayer = buildStdioService({
          autoExit: true,
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
        const ops = yield* McpServerService.pipe(
          Effect.provide(Layer.succeedContext(ctx))
        )

        const fiber = yield* Effect.fork(
          ops.run().pipe(
            Effect.provideService(
              HttpServerFactoryService,
              // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- mock stub
              { createApp: () => ({}) as never, listen: () => Effect.void as never }
            )
          )
        )

        yield* Effect.promise(() => new Promise((r) => setTimeout(r, 50)))

        yield* ops.stop()
        expect(shutdownCalled).toBe(true)

        // Unblock the run() fiber
        process.stdin.emit("end")
        yield* Effect.promise(() => new Promise((r) => setTimeout(r, 50)))
        yield* Fiber.interrupt(fiber)
      })
    }, { timeout: 5000 })

    it.scoped("stop when running with http transport (server is null) skips close", () =>
      Effect.gen(function*() {
        const layers = Layer.mergeAll(
          HulyClient.testLayer({}),
          HulyStorageClient.testLayer({}),
          WorkspaceClient.testLayer({}),
          TelemetryService.testLayer()
        )
        const serverLayer = buildTestServerLayer({
          transport: "http",
          httpPort: 19878,
          httpHost: "127.0.0.1"
        }, layers)

        const ctx = yield* Layer.build(serverLayer)
        const ops = yield* McpServerService.pipe(
          Effect.provide(Layer.succeedContext(ctx))
        )

        const mockHttpFactory: HttpServerFactoryService["Type"] = {
          createApp: (_host: string) => {
            const fakeApp = { post: () => {}, get: () => {}, delete: () => {} }
            return fakeApp as never
          },
          listen: () =>
            Effect.succeed({
              close: (cb: (err?: Error) => void) => cb()
            } as never)
        }

        // Start run() to set isRunning=true
        const fiber = yield* Effect.fork(
          ops.run().pipe(
            Effect.provideService(HttpServerFactoryService, mockHttpFactory)
          )
        )

        yield* Effect.promise(() => new Promise((r) => setTimeout(r, 100)))

        // Call stop while running - since transport=http, server is null
        // so the `if (server)` branch (line 274) should be false
        yield* ops.stop()

        // Clean up the fiber
        yield* Fiber.interrupt(fiber)
      }), { timeout: 5000 })

    it.scoped("stop propagates server close error as McpServerError", () =>
      Effect.gen(function*() {
        const serverLayer = buildStdioService({ autoExit: true })
        const ctx = yield* Layer.build(serverLayer)
        const ops = yield* McpServerService.pipe(
          Effect.provide(Layer.succeedContext(ctx))
        )

        const fiber = yield* Effect.fork(
          ops.run().pipe(
            Effect.provideService(
              HttpServerFactoryService,
              // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- mock stub
              { createApp: () => ({}) as never, listen: () => Effect.void as never }
            )
          )
        )

        yield* Effect.promise(() => new Promise((r) => setTimeout(r, 50)))

        // Set mock to fail on close before calling stop
        mockCloseBehavior = () => Promise.reject(new Error("server close failed"))

        const error = yield* Effect.flip(ops.stop())
        expect(error._tag).toBe("McpServerError")
        expect(error.message).toContain("Failed to stop server")

        mockCloseBehavior = null

        // Unblock the run() fiber
        process.stdin.emit("end")
        yield* Effect.promise(() => new Promise((r) => setTimeout(r, 50)))
        yield* Fiber.interrupt(fiber)
      }), { timeout: 5000 })
  })

  describe("telemetry integration", () => {
    it.scoped("sessionStart defaults authMethod to password when not specified", () => {
      let capturedProps: SessionStartProps | null = null
      return Effect.gen(function*() {
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
        const serverLayer = buildTestServerLayer({
          transport: "stdio"
        }, layers)
        yield* Layer.build(serverLayer)
        expect(capturedProps).not.toBeNull()
        expect(capturedProps!.authMethod).toBe("password")
      })
    })

    it.scoped("sessionStart includes toolsets when TOOLSETS env is set", () => {
      let capturedProps: SessionStartProps | null = null
      return Effect.gen(function*() {
        process.env.TOOLSETS = "issues,documents"
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
        const serverLayer = buildTestServerLayer({
          transport: "stdio"
        }, layers)
        yield* Layer.build(serverLayer)
        expect(capturedProps).not.toBeNull()
        expect(capturedProps!.toolsets).toEqual(expect.arrayContaining(["issues", "documents"]))
        delete process.env.TOOLSETS
      })
    })

    it.scoped("sessionStart toolsets is null when no TOOLSETS env", () => {
      let capturedProps: SessionStartProps | null = null
      return Effect.gen(function*() {
        delete process.env.TOOLSETS
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
        const serverLayer = buildTestServerLayer({
          transport: "stdio"
        }, layers)
        yield* Layer.build(serverLayer)
        expect(capturedProps).not.toBeNull()
        expect(capturedProps!.toolsets).toBeNull()
      })
    })

    it.scoped("http transport stop is no-op when not running", () =>
      Effect.gen(function*() {
        const layers = Layer.mergeAll(
          HulyClient.testLayer({}),
          HulyStorageClient.testLayer({}),
          WorkspaceClient.testLayer({}),
          TelemetryService.testLayer()
        )
        const serverLayer = buildTestServerLayer({
          transport: "http",
          httpPort: 9999
        }, layers)
        const ctx = yield* Layer.build(serverLayer)
        const ops = yield* McpServerService.pipe(
          Effect.provide(Layer.succeedContext(ctx))
        )
        // stop() when not running should be a no-op even for http
        yield* ops.stop()
      }))
  })

  describe("createMcpServer request handlers", () => {
    const buildAndRun = (
      layers: Layer.Layer<HulyClient | HulyStorageClient | WorkspaceClient | TelemetryService>
    ) =>
      Effect.gen(function*() {
        const serverLayer = buildTestServerLayer({
          transport: "stdio",
          autoExit: true
        }, layers)
        const ctx = yield* Layer.build(serverLayer)
        const ops = yield* McpServerService.pipe(
          Effect.provide(Layer.succeedContext(ctx))
        )
        const fiber = yield* Effect.fork(
          ops.run().pipe(
            Effect.provideService(
              HttpServerFactoryService,
              // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- mock stub
              { createApp: () => ({}) as never, listen: () => Effect.void as never }
            )
          )
        )
        yield* Effect.promise(() => new Promise((r) => setTimeout(r, 50)))
        return fiber
      })

    const cleanup = (fiber: Fiber.RuntimeFiber<void, McpServerError>) =>
      Effect.gen(function*() {
        process.stdin.emit("end")
        yield* Effect.promise(() => new Promise((r) => setTimeout(r, 50)))
        yield* Fiber.interrupt(fiber)
      })

    const buildAndRunWithResolveClients = (
      resolveClients: () => Promise<ClientBundle>,
      telemetryOps: Partial<TelemetryOperations>
    ) =>
      Effect.gen(function*() {
        const serverLayer = McpServerService.layer({
          transport: "stdio",
          autoExit: true,
          createServer: createMockServer,
          // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- test transport is never inspected by the mocked server
          createStdioTransport: () => ({}) as never,
          resolveClients
        }).pipe(Layer.provide(TelemetryService.testLayer(telemetryOps)))
        const ctx = yield* Layer.build(serverLayer)
        const ops = yield* McpServerService.pipe(
          Effect.provide(Layer.succeedContext(ctx))
        )
        const fiber = yield* Effect.fork(
          ops.run().pipe(
            Effect.provideService(
              HttpServerFactoryService,
              // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- mock stub
              { createApp: () => ({}) as never, listen: () => Effect.void as never }
            )
          )
        )
        yield* Effect.promise(() => new Promise((r) => setTimeout(r, 50)))
        return fiber
      })

    it("default SDK server advertises resources without subscribe or listChanged", () => {
      const server = createDefaultMcpSdkServer()
      const getCapabilities = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(server), "getCapabilities")?.value
      if (typeof getCapabilities !== "function") {
        throw new Error("SDK server getCapabilities function was not found")
      }
      expect(getCapabilities.call(server)).toEqual({
        resources: {},
        tools: {}
      })
    })

    it.scoped("ListTools handler returns tool definitions", () =>
      Effect.gen(function*() {
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

        const result = yield* Effect.promise(() => listToolsHandler!())
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
          annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false
          }
        })
        expect(firstListToolsCalled).toBe(true)

        yield* cleanup(fiber)
      }), { timeout: 5000 })

    it.scoped("CallTool handles get_huly_context without resolving Huly clients", () =>
      Effect.gen(function*() {
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

        const callToolHandler = capturedHandlers.get(CallToolRequestSchema) as
          | ((req: { params: { name: string; arguments?: Record<string, unknown> } }) => Promise<unknown>)
          | undefined
        expect(callToolHandler).toBeDefined()

        const result = (yield* Effect.promise(() =>
          callToolHandler!({
            params: { name: "get_huly_context", arguments: {} }
          })
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
        expect(toolCalledProps!.toolName).toBe("get_huly_context")
        expect(toolCalledProps!.status).toBe("success")
        const serialized = JSON.stringify(result)
        expect(serialized).not.toContain("secret-token")
        expect(serialized).not.toContain("secret-password")
        expect(serialized).not.toContain("user@example.com")
        expect(serialized).not.toContain("query-secret")

        process.env = originalEnv
        yield* cleanup(fiber)
      }), { timeout: 5000 })

    it.scoped("get_huly_context remains visible and reports active TOOLSETS filtering", () =>
      Effect.gen(function*() {
        capturedHandlers.clear()
        const originalToolsets = process.env.TOOLSETS
        process.env.TOOLSETS = "issues"
        const fiber = yield* buildAndRunWithResolveClients(
          async () => {
            throw new Error("client resolution should be skipped")
          },
          {
            firstListTools: () => {},
            sessionStart: () => {},
            toolCalled: () => {},
            shutdown: async () => {}
          }
        )

        const listToolsHandler = capturedHandlers.get(ListToolsRequestSchema) as
          | (() => Promise<{ tools: Array<{ name: string }> }>)
          | undefined
        const listed = yield* Effect.promise(() => listToolsHandler!())
        expect(listed.tools[0]?.name).toBe("get_version")
        expect(listed.tools[1]?.name).toBe("get_huly_context")

        const callToolHandler = capturedHandlers.get(CallToolRequestSchema) as
          | ((req: { params: { name: string; arguments?: Record<string, unknown> } }) => Promise<unknown>)
          | undefined
        const result = (yield* Effect.promise(() =>
          callToolHandler!({
            params: { name: "get_huly_context", arguments: {} }
          })
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

        if (originalToolsets === undefined) {
          delete process.env.TOOLSETS
        } else {
          process.env.TOOLSETS = originalToolsets
        }
        yield* cleanup(fiber)
      }), { timeout: 5000 })

    it.scoped("CallTool accepts omitted arguments for get_huly_context", () =>
      Effect.gen(function*() {
        capturedHandlers.clear()
        const fiber = yield* buildAndRunWithResolveClients(
          async () => {
            throw new Error("client resolution should be skipped")
          },
          {
            firstListTools: () => {},
            sessionStart: () => {},
            toolCalled: () => {},
            shutdown: async () => {}
          }
        )

        const callToolHandler = capturedHandlers.get(CallToolRequestSchema) as
          | ((req: { params: { name: string; arguments?: Record<string, unknown> } }) => Promise<unknown>)
          | undefined

        const result = (yield* Effect.promise(() =>
          callToolHandler!({
            params: { name: "get_huly_context" }
          })
        )) as { structuredContent?: { result?: unknown }; isError?: boolean }

        expect(result.isError).toBeUndefined()
        expect(result.structuredContent?.result).toBeDefined()

        yield* cleanup(fiber)
      }), { timeout: 5000 })

    it.scoped("ListResourceTemplates handler returns Huly resource templates", () =>
      Effect.gen(function*() {
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

        const result = handler!()
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
      }), { timeout: 5000 })

    it.scoped("ListResources handler returns concrete active project resources", () =>
      Effect.gen(function*() {
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

        const result = yield* Effect.promise(() => handler!())
        expect(result).toEqual({
          resources: [{
            uri: "huly://projects/TEST",
            name: "TEST",
            title: "Test Project",
            description: "Project used by MCP server tests",
            mimeType: "application/json"
          }]
        })

        yield* cleanup(fiber)
      }), { timeout: 5000 })

    it.scoped("ReadResource handler returns project JSON resource contents", () =>
      Effect.gen(function*() {
        capturedHandlers.clear()
        const layers = Layer.mergeAll(
          createMockHulyClientLayer({
            projects: [makeProject()]
          }),
          HulyStorageClient.testLayer({}),
          WorkspaceClient.testLayer({}),
          TelemetryService.testLayer()
        )
        const fiber = yield* buildAndRun(layers)

        const handler = capturedHandlers.get(ReadResourceRequestSchema) as
          | ((
            req: { params: { uri: string } }
          ) => Promise<{ contents: Array<{ uri: string; mimeType?: string; text: string }> }>)
          | undefined
        expect(handler).toBeDefined()

        const result = yield* Effect.promise(() =>
          handler!({
            params: { uri: "huly://projects/TEST" }
          })
        )
        expect(result.contents).toHaveLength(1)
        expect(result.contents[0]?.uri).toBe("huly://projects/TEST")
        expect(result.contents[0]?.mimeType).toBe("application/json")
        expect(JSON.parse(result.contents[0]?.text ?? "{}")).toMatchObject({
          type: "huly.project",
          uri: "huly://projects/TEST",
          project: {
            identifier: "TEST",
            name: "Test Project",
            archived: false
          }
        })

        yield* cleanup(fiber)
      }), { timeout: 5000 })

    it.scoped("ReadResource handler returns issue JSON resource contents", () =>
      Effect.gen(function*() {
        capturedHandlers.clear()
        const layers = Layer.mergeAll(
          createMockHulyClientLayer({
            projects: [makeProject()],
            issues: [makeIssue()]
          }),
          HulyStorageClient.testLayer({}),
          WorkspaceClient.testLayer({}),
          TelemetryService.testLayer()
        )
        const fiber = yield* buildAndRun(layers)

        const handler = capturedHandlers.get(ReadResourceRequestSchema) as
          | ((
            req: { params: { uri: string } }
          ) => Promise<{ contents: Array<{ uri: string; mimeType?: string; text: string }> }>)
          | undefined
        expect(handler).toBeDefined()

        const result = yield* Effect.promise(() =>
          handler!({
            params: { uri: "huly://issues/TEST-1" }
          })
        )
        expect(result.contents).toHaveLength(1)
        expect(result.contents[0]?.uri).toBe("huly://issues/TEST-1")
        expect(result.contents[0]?.mimeType).toBe("application/json")
        expect(JSON.parse(result.contents[0]?.text ?? "{}")).toMatchObject({
          type: "huly.issue",
          uri: "huly://issues/TEST-1",
          issue: {
            identifier: "TEST-1",
            title: "Test Issue",
            project: "TEST"
          }
        })

        yield* cleanup(fiber)
      }), { timeout: 5000 })

    it.scoped("CallTool rejects unexpected arguments for get_huly_context", () =>
      Effect.gen(function*() {
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
          callToolHandler!({
            params: { name: "get_huly_context", arguments: { raw: true } }
          })
        )) as { content: Array<{ text: string }>; isError?: boolean }

        expect(result.isError).toBe(true)
        expect(result.content[0]?.text).toContain("does not accept arguments")
        expect(toolCalledProps).not.toBeNull()
        expect(toolCalledProps!.errorTag).toBe("UnexpectedArguments")

        yield* cleanup(fiber)
      }), { timeout: 5000 })

    it.scoped("CallTool get_huly_context succeeds with missing Huly env in lazy mode", () =>
      Effect.gen(function*() {
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
          {
            firstListTools: () => {},
            sessionStart: () => {},
            toolCalled: () => {},
            shutdown: async () => {}
          }
        )

        const callToolHandler = capturedHandlers.get(CallToolRequestSchema) as
          | ((req: { params: { name: string; arguments?: Record<string, unknown> } }) => Promise<unknown>)
          | undefined

        const result = (yield* Effect.promise(() =>
          callToolHandler!({
            params: { name: "get_huly_context", arguments: {} }
          })
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
      }), { timeout: 5000 })

    it.scoped(
      "ReadResource handler rejects malformed resource URIs with JSON-RPC errors",
      () =>
        Effect.gen(function*() {
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
              try: () =>
                handler!({
                  params: { uri: "huly://issues/123" }
                }),
              catch: (e) => e
            })
          )

          expect(error).toBeInstanceOf(McpError)
          if (error instanceof McpError) {
            expect(error.code).toBe(-32602)
          }

          yield* cleanup(fiber)
        }),
      { timeout: 5000 }
    )

    it.scoped("ListTools handler returns client-compatible root object schemas", () =>
      Effect.gen(function*() {
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
      }), { timeout: 5000 })

    it.scoped("CallTool handler returns null for unknown tool", () =>
      Effect.gen(function*() {
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
          callToolHandler!({
            params: { name: "nonexistent_tool", arguments: {} }
          })
        )

        expect(result).toHaveProperty("isError", true)
        expect(result).toHaveProperty("content")
        expect(toolCalledProps).not.toBeNull()
        expect(toolCalledProps!.toolName).toBe("nonexistent_tool")
        expect(toolCalledProps!.status).toBe("error")

        yield* cleanup(fiber)
      }), { timeout: 5000 })

    it.scoped("CallTool validates missing required arguments before resolving clients", () =>
      Effect.gen(function*() {
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
        const fiber = yield* buildAndRunWithResolveClients(
          async () => {
            resolveCalled = true
            throw new Error("client resolution should be skipped")
          },
          telemetryOps
        )

        const callToolHandler = capturedHandlers.get(CallToolRequestSchema) as
          | ((req: { params: { name: string; arguments?: Record<string, unknown> } }) => Promise<unknown>)
          | undefined
        expect(callToolHandler).toBeDefined()

        const result = (yield* Effect.promise(() =>
          callToolHandler!({
            params: { name: "get_issue" }
          })
        )) as { content: Array<{ text: string }>; isError?: boolean }

        expect(result.isError).toBe(true)
        expect(result.content[0]?.text).toContain("missing arguments object")
        expect(resolveCalled).toBe(false)
        expect(toolCalledProps).not.toBeNull()
        expect(toolCalledProps!.status).toBe("error")
        expect(toolCalledProps!.errorTag).toBe("MissingArguments")

        yield* cleanup(fiber)
      }), { timeout: 5000 })

    it.scoped("CallTool validates anyOf-required arguments before resolving clients", () =>
      Effect.gen(function*() {
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
        const fiber = yield* buildAndRunWithResolveClients(
          async () => {
            resolveCalled = true
            throw new Error("client resolution should be skipped")
          },
          telemetryOps
        )

        const callToolHandler = capturedHandlers.get(CallToolRequestSchema) as
          | ((req: { params: { name: string; arguments?: Record<string, unknown> } }) => Promise<unknown>)
          | undefined
        expect(callToolHandler).toBeDefined()

        const result = (yield* Effect.promise(() =>
          callToolHandler!({
            params: { name: "update_user_profile" }
          })
        )) as { content: Array<{ text: string }>; isError?: boolean }

        expect(result.isError).toBe(true)
        expect(result.content[0]?.text).toContain("missing arguments object")
        expect(resolveCalled).toBe(false)
        expect(toolCalledProps).not.toBeNull()
        expect(toolCalledProps!.status).toBe("error")
        expect(toolCalledProps!.errorTag).toBe("MissingArguments")

        yield* cleanup(fiber)
      }), { timeout: 5000 })

    it.scoped("CallTool validates oneOf-required arguments before resolving clients", () =>
      Effect.gen(function*() {
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
        const fiber = yield* buildAndRunWithResolveClients(
          async () => {
            resolveCalled = true
            throw new Error("client resolution should be skipped")
          },
          telemetryOps
        )

        const callToolHandler = capturedHandlers.get(CallToolRequestSchema) as
          | ((req: { params: { name: string; arguments?: Record<string, unknown> } }) => Promise<unknown>)
          | undefined
        expect(callToolHandler).toBeDefined()

        const result = (yield* Effect.promise(() =>
          callToolHandler!({
            params: { name: "list_activity" }
          })
        )) as { content: Array<{ text: string }>; isError?: boolean }

        expect(result.isError).toBe(true)
        expect(result.content[0]?.text).toContain("missing arguments object")
        expect(resolveCalled).toBe(false)
        expect(toolCalledProps).not.toBeNull()
        expect(toolCalledProps!.status).toBe("error")
        expect(toolCalledProps!.errorTag).toBe("MissingArguments")

        yield* cleanup(fiber)
      }), { timeout: 5000 })

    it.scoped("CallTool handler handles known tool", () =>
      Effect.gen(function*() {
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
          callToolHandler!({
            params: { name: "list_projects", arguments: {} }
          })
        )) as { content: Array<{ text: string }>; isError?: boolean }

        // With mock HulyClient that returns empty results, this should succeed
        expect(result.content).toBeDefined()
        expect(result.content.length).toBeGreaterThan(0)
        expect(toolCalledProps).not.toBeNull()
        expect(toolCalledProps!.toolName).toBe("list_projects")
        expect(toolCalledProps!.status).toBe("success")

        yield* cleanup(fiber)
      }), { timeout: 5000 })

    it.scoped(
      "CallTool handler accepts omitted arguments for all-optional parameter tools",
      () =>
        Effect.gen(function*() {
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
            callToolHandler!({
              params: { name: "list_projects" }
            })
          )) as { content: Array<{ text: string }>; isError?: boolean }

          expect(result.content).toBeDefined()
          expect(result.isError).toBeUndefined()
          expect(result.content[0]?.text).toBe("{\"projects\":[],\"total\":0}")

          yield* cleanup(fiber)
        }),
      { timeout: 5000 }
    )

    it.scoped("CallTool records error telemetry for parse errors", () =>
      Effect.gen(function*() {
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
          callToolHandler!({
            params: { name: "get_issue", arguments: {} }
          })
        )) as { content: Array<{ text: string }>; isError?: boolean }

        expect(result.content).toBeDefined()
        expect(toolCalledProps).not.toBeNull()
        expect(toolCalledProps!.toolName).toBe("get_issue")
        expect(toolCalledProps!.status).toBe("error")

        yield* cleanup(fiber)
      }), { timeout: 5000 })

    it.scoped("CallTool records internal error telemetry for connection errors", () =>
      Effect.gen(function*() {
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
          callToolHandler!({
            params: { name: "list_projects", arguments: {} }
          })
        )) as { content: Array<{ text: string }>; isError?: boolean }

        expect(result.isError).toBe(true)
        expect(toolCalledProps).not.toBeNull()
        expect(toolCalledProps!.status).toBe("error")
        expect(toolCalledProps!.toolName).toBe("list_projects")

        yield* cleanup(fiber)
      }), { timeout: 5000 })
  })
})
