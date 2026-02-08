import { describe, it } from "@effect/vitest"
import { type Doc, type Ref, type Space, type Status, toFindResult } from "@hcengineering/core"
import { type Issue as HulyIssue, IssuePriority, type Project as HulyProject } from "@hcengineering/tracker"
import { Effect, Layer } from "effect"
import { expect } from "vitest"
import { HulyClient, type HulyClientOperations } from "../../src/huly/client.js"
import { HulyStorageClient } from "../../src/huly/storage.js"
import { WorkspaceClient } from "../../src/huly/workspace-client.js"
import { McpServerError, McpServerService } from "../../src/mcp/server.js"
import { TOOL_DEFINITIONS } from "../../src/mcp/tools/index.js"
import { TelemetryService } from "../../src/telemetry/telemetry.js"

import { tracker } from "../../src/huly/huly-plugins.js"

// --- Mock Data Builders ---

const makeProject = (overrides?: Partial<HulyProject>): HulyProject => {
  const result: HulyProject = {
    _id: "project-1" as Ref<HulyProject>,
    _class: tracker.class.Project,
    space: "space-1" as Ref<Space>,
    identifier: "TEST",
    name: "Test Project",
    sequence: 1,
    defaultIssueStatus: "status-open" as Ref<Status>,
    defaultTimeReportDay: 0,
    modifiedBy: "user-1" as Ref<Doc>,
    modifiedOn: Date.now(),
    createdBy: "user-1" as Ref<Doc>,
    createdOn: Date.now(),
    ...overrides
  }
  return result
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
    kind: "task-type-1" as Ref<Doc>,
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
    modifiedBy: "user-1" as Ref<Doc>,
    modifiedOn: Date.now(),
    createdBy: "user-1" as Ref<Doc>,
    createdOn: Date.now(),
    ...overrides
  }
  return result
}

const makeStatus = (overrides?: Partial<Status>): Status => {
  const result: Status = {
    _id: "status-1" as Ref<Status>,
    _class: "core:class:Status" as Ref<Doc>,
    space: "space-1" as Ref<Space>,
    ofAttribute: "tracker:attribute:IssueStatus" as Ref<Doc>,
    name: "Open",
    modifiedBy: "user-1" as Ref<Doc>,
    modifiedOn: Date.now(),
    createdBy: "user-1" as Ref<Doc>,
    createdOn: Date.now(),
    ...overrides
  }
  return result
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

  const findAllImpl: HulyClientOperations["findAll"] = ((_class: unknown) => {
    if (_class === tracker.class.Issue) {
      return Effect.succeed(toFindResult(issues as Array<Doc>))
    }
    if (_class === tracker.class.IssueStatus) {
      return Effect.succeed(toFindResult(statuses as Array<Doc>))
    }
    return Effect.succeed(toFindResult([]))
  }) as HulyClientOperations["findAll"]

  const findOneImpl: HulyClientOperations["findOne"] = ((_class: unknown, query: unknown) => {
    if (_class === tracker.class.Project) {
      const identifier = (query as Record<string, unknown>).identifier as string
      const found = projects.find(p => p.identifier === identifier)
      return Effect.succeed(found as Doc | undefined)
    }
    if (_class === tracker.class.Issue) {
      const q = query as Record<string, unknown>
      const found = issues.find(i =>
        (q.identifier && i.identifier === q.identifier)
        || (q.number && i.number === q.number)
      )
      return Effect.succeed(found as Doc | undefined)
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
      expect(tools).toContain("update_document")
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
      expect(tools).toContain("send_channel_message")
      expect(tools).toContain("list_direct_messages")
      expect(tools).toContain("list_events")
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
      expect(tools).toContain("create_work_slot")
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
        const schema = TOOL_DEFINITIONS.list_issues.inputSchema
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
        const schema = TOOL_DEFINITIONS.get_issue.inputSchema
        expect(schema).toHaveProperty("type", "object")
        expect(schema).toHaveProperty("properties")
        expect((schema as { properties: Record<string, unknown> }).properties).toHaveProperty("project")
        expect((schema as { properties: Record<string, unknown> }).properties).toHaveProperty("identifier")
      }))

    it.effect("create_issue schema has correct structure", () =>
      Effect.gen(function*() {
        const schema = TOOL_DEFINITIONS.create_issue.inputSchema
        expect(schema).toHaveProperty("type", "object")
        expect(schema).toHaveProperty("properties")
        expect((schema as { properties: Record<string, unknown> }).properties).toHaveProperty("project")
        expect((schema as { properties: Record<string, unknown> }).properties).toHaveProperty("title")
      }))

    it.effect("update_issue schema has correct structure", () =>
      Effect.gen(function*() {
        const schema = TOOL_DEFINITIONS.update_issue.inputSchema
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
        const schema = TOOL_DEFINITIONS.add_issue_label.inputSchema
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
        const schema = TOOL_DEFINITIONS.delete_issue.inputSchema
        expect(schema).toHaveProperty("type", "object")
        expect(schema).toHaveProperty("properties")
        const props = (schema as { properties: Record<string, unknown> }).properties
        expect(props).toHaveProperty("project")
        expect(props).toHaveProperty("identifier")
      }))

    it.effect("list_teamspaces schema has correct structure", () =>
      Effect.gen(function*() {
        const schema = TOOL_DEFINITIONS.list_teamspaces.inputSchema
        expect(schema).toHaveProperty("type", "object")
        expect(schema).toHaveProperty("properties")
        const props = (schema as { properties: Record<string, unknown> }).properties
        expect(props).toHaveProperty("includeArchived")
        expect(props).toHaveProperty("limit")
      }))

    it.effect("get_document schema has correct structure", () =>
      Effect.gen(function*() {
        const schema = TOOL_DEFINITIONS.get_document.inputSchema
        expect(schema).toHaveProperty("type", "object")
        expect(schema).toHaveProperty("properties")
        const props = (schema as { properties: Record<string, unknown> }).properties
        expect(props).toHaveProperty("teamspace")
        expect(props).toHaveProperty("document")
      }))

    it.effect("create_document schema has correct structure", () =>
      Effect.gen(function*() {
        const schema = TOOL_DEFINITIONS.create_document.inputSchema
        expect(schema).toHaveProperty("type", "object")
        expect(schema).toHaveProperty("properties")
        const props = (schema as { properties: Record<string, unknown> }).properties
        expect(props).toHaveProperty("teamspace")
        expect(props).toHaveProperty("title")
        expect(props).toHaveProperty("content")
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

        const serverLayer = McpServerService.layer({ transport: "stdio" }).pipe(
          Layer.provide(hulyClientLayer),
          Layer.provide(storageClientLayer),
          Layer.provide(workspaceClientLayer),
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
          httpPort: 3000
        }).pipe(
          Layer.provide(hulyClientLayer),
          Layer.provide(storageClientLayer),
          Layer.provide(workspaceClientLayer),
          Layer.provide(TelemetryService.testLayer())
        )

        yield* Layer.build(serverLayer)
      }))
  })

  describe("testLayer", () => {
    it.effect("creates a test layer with default operations", () =>
      Effect.gen(function*() {
        const testLayer = McpServerService.testLayer({})

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

        const testLayer = McpServerService.testLayer({
          run: () =>
            Effect.sync(() => {
              runCalled = true
            })
        })

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
        const testLayer = McpServerService.testLayer({
          run: () => new McpServerError({ message: "Test error" })
        })

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
      expect(TOOL_DEFINITIONS.list_issues.description).toContain("Query")
      expect(TOOL_DEFINITIONS.list_issues.description).toContain("issues")
      expect(TOOL_DEFINITIONS.list_issues.description).toContain("filter")
    }))

  it.effect("get_issue has helpful description", () =>
    Effect.gen(function*() {
      expect(TOOL_DEFINITIONS.get_issue.description).toContain("Retrieve")
      expect(TOOL_DEFINITIONS.get_issue.description).toContain("full details")
      expect(TOOL_DEFINITIONS.get_issue.description).toContain("markdown")
    }))

  it.effect("create_issue has helpful description", () =>
    Effect.gen(function*() {
      expect(TOOL_DEFINITIONS.create_issue.description).toContain("Create")
      expect(TOOL_DEFINITIONS.create_issue.description).toContain("issue")
      expect(TOOL_DEFINITIONS.create_issue.description).toContain("markdown")
    }))

  it.effect("update_issue has helpful description", () =>
    Effect.gen(function*() {
      expect(TOOL_DEFINITIONS.update_issue.description).toContain("Update")
      expect(TOOL_DEFINITIONS.update_issue.description).toContain("modified")
      expect(TOOL_DEFINITIONS.update_issue.description.length).toBeGreaterThan(30)
    }))

  it.effect("add_issue_label has helpful description", () =>
    Effect.gen(function*() {
      expect(TOOL_DEFINITIONS.add_issue_label.description).toContain("label")
      expect(TOOL_DEFINITIONS.add_issue_label.description).toContain("tag")
    }))

  it.effect("delete_issue has helpful description", () =>
    Effect.gen(function*() {
      expect(TOOL_DEFINITIONS.delete_issue.description).toContain("delete")
      expect(TOOL_DEFINITIONS.delete_issue.description).toContain("cannot be undone")
    }))
})
