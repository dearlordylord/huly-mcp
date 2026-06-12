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
import { McpError } from "@modelcontextprotocol/sdk/types.js"
import { Effect } from "effect"
import { expect } from "vitest"

import { HulyClient, type HulyClientOperations } from "../../src/huly/client.js"
import { HulyAuthError, HulyConnectionError } from "../../src/huly/errors.js"
import { tracker } from "../../src/huly/huly-plugins.js"
import {
  HULY_RESOURCE_MIME_TYPE,
  listResources,
  listResourceTemplates,
  parseHulyResourceUri,
  readHulyResource,
  resourceTemplates
} from "../../src/mcp/resources.js"
import { withDiagnostics } from "../helpers/diagnostics.js"

const makeProject = (overrides?: Partial<HulyProject>): HulyProject => {
  const result = {
    _id: "project-1" as Ref<HulyProject>,
    _class: tracker.class.Project,
    space: "space-1" as Ref<Space>,
    identifier: "TEST",
    name: "Test Project",
    description: "Project used by MCP resource tests",
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
  // Huly SDK project types include branded refs that do not have public test constructors.

  return result as HulyProject
}

const makeIssue = (overrides?: Partial<HulyIssue>): HulyIssue => ({
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
})

const makeStatus = (overrides?: Partial<Status>): Status => ({
  _id: "status-open" as Ref<Status>,
  _class: "core:class:Status" as Ref<HulyClass<Status>>,
  space: "space-1" as Ref<Space>,
  ofAttribute: "tracker:attribute:IssueStatus" as Ref<Attribute<Status>>,
  name: "Open",
  modifiedBy: "user-1" as PersonId,
  modifiedOn: 0,
  createdBy: "user-1" as PersonId,
  createdOn: 0,
  ...overrides
})

const queryValue = (query: unknown, key: string): unknown =>
  typeof query === "object" && query !== null ? Object.getOwnPropertyDescriptor(query, key)?.value : undefined

const createClientLayer = (config?: {
  readonly projects?: ReadonlyArray<HulyProject>
  readonly issues?: ReadonlyArray<HulyIssue>
  readonly statuses?: ReadonlyArray<Status>
}) => {
  const projects = config?.projects ?? []
  const issues = config?.issues ?? []
  const statuses = config?.statuses ?? []

  const findAllImpl: HulyClientOperations["findAll"] = ((_class: unknown, query: unknown) => {
    if (_class === tracker.class.Project) {
      const archived = queryValue(query, "archived")
      const filteredProjects = typeof archived === "boolean"
        ? projects.filter(project => project.archived === archived)
        : projects
      return Effect.succeed(toFindResult([...filteredProjects]))
    }

    if (_class === "core:class:Status") {
      return Effect.succeed(toFindResult([...statuses]))
    }
    return Effect.succeed(toFindResult([]))
  }) as HulyClientOperations["findAll"]

  const findOneImpl: HulyClientOperations["findOne"] = ((_class: unknown, query: unknown) => {
    if (_class === tracker.class.Project) {
      const identifier = queryValue(query, "identifier")
      return Effect.succeed(projects.find(project => project.identifier === identifier))
    }

    if (_class === tracker.class.Issue) {
      const identifier = queryValue(query, "identifier")
      const number = queryValue(query, "number")
      return Effect.succeed(
        issues.find(issue =>
          (typeof identifier === "string" && issue.identifier === identifier)
          || (typeof number === "number" && issue.number === number)
        )
      )
    }

    return Effect.succeed(undefined)
  }) as HulyClientOperations["findOne"]

  return HulyClient.testLayer({
    findAll: findAllImpl,
    findOne: findOneImpl
  })
}

const readJson = (text: string): unknown => JSON.parse(text)

const textContent = (content: { readonly text: string } | { readonly blob: string } | undefined): string =>
  content !== undefined && "text" in content ? content.text : ""

describe("MCP resources", () => {
  it("advertises the conservative Huly resource templates", () => {
    expect(resourceTemplates).toEqual([
      {
        uriTemplate: "huly://projects/{project}",
        name: "huly-project",
        title: "Huly Project",
        description:
          "Read full details for a Huly tracker project by project identifier, for example huly://projects/HULY.",
        mimeType: HULY_RESOURCE_MIME_TYPE
      },
      {
        uriTemplate: "huly://issues/{issue}",
        name: "huly-issue",
        title: "Huly Issue",
        description: "Read full details for a Huly issue by full issue identifier, for example huly://issues/HULY-123.",
        mimeType: HULY_RESOURCE_MIME_TYPE
      },
      {
        uriTemplate: "huly://projects/{project}/issues/{issue}",
        name: "huly-project-issue",
        title: "Huly Project Issue",
        description:
          "Read full details for a Huly issue by project identifier and issue number, for example huly://projects/HULY/issues/123.",
        mimeType: HULY_RESOURCE_MIME_TYPE
      }
    ])
    expect(listResourceTemplates()).toEqual({ resourceTemplates })
  })

  it.effect("lists active projects as concrete MCP resources", () =>
    Effect.gen(function*() {
      const result = yield* listResources().pipe(
        Effect.provide(createClientLayer({
          projects: [
            makeProject(),
            makeProject({
              _id: "project-2" as Ref<HulyProject>,
              identifier: "OLD",
              name: "Archived Project",
              description: "",
              archived: true
            })
          ]
        })),
        withDiagnostics
      )

      expect(result).toEqual({
        resources: [{
          uri: "huly://projects/TEST",
          name: "TEST",
          title: "Test Project",
          description: "Project used by MCP resource tests",
          mimeType: HULY_RESOURCE_MIME_TYPE
        }]
      })
    }))

  it.effect("falls back to a synthesized description for projects without one", () =>
    Effect.gen(function*() {
      const result = yield* listResources().pipe(
        Effect.provide(createClientLayer({
          projects: [makeProject({ identifier: "NODESC", description: "" })]
        })),
        withDiagnostics
      )
      expect(result.resources[0]?.description).toBe("Huly project NODESC")
    }))

  it.effect("does not hide backend connection errors while listing resources", () =>
    Effect.gen(function*() {
      const backendSecret = "https://user:password@example.huly.app/path?token=secret"
      const error = yield* Effect.flip(
        listResources().pipe(
          Effect.provide(HulyClient.testLayer({
            findAll: () =>
              Effect.fail(
                new HulyConnectionError({
                  message: `Connection failed for ${backendSecret}`
                })
              )
          })),
          withDiagnostics
        )
      )

      expect(error).toBeInstanceOf(McpError)
      expect(error.message).toContain("Connection error while listing Huly resources")
      expect(error.message).not.toContain(backendSecret)
      expect(error.message).not.toContain("password")
      expect(error.message).not.toContain("secret")
    }))

  it("parses accepted Huly resource URIs", () => {
    expect(parseHulyResourceUri("huly://projects/HULY")).toEqual({
      _tag: "project",
      uri: "huly://projects/HULY",
      project: "HULY"
    })
    expect(parseHulyResourceUri("huly://issues/HULY-123")).toEqual({
      _tag: "issue",
      uri: "huly://issues/HULY-123",
      project: "HULY",
      identifier: "HULY-123"
    })
    expect(parseHulyResourceUri("huly://projects/HULY/issues/123")).toEqual({
      _tag: "issue",
      uri: "huly://projects/HULY/issues/123",
      project: "HULY",
      identifier: "123"
    })
  })

  it("rejects malformed or unsupported Huly resource URIs", () => {
    for (
      const uri of [
        "huly://issues/123",
        "huly://issues/HULY-1/extra",
        "huly://projects",
        "huly://projects/",
        "huly://projects/%20HULY",
        "huly://projects/HULY%20",
        "huly://projects/HULY%2FCORE",
        "huly://projects/%FF",
        "huly://projects/HULY/extra",
        "huly://documents/DOC-1",
        "https://huly.app/projects/HULY",
        "not-a-uri"
      ]
    ) {
      expect(() => parseHulyResourceUri(uri)).toThrow(McpError)
    }
  })

  it.effect("reads a project resource as one JSON content block", () =>
    Effect.gen(function*() {
      const result = yield* readHulyResource("huly://projects/TEST").pipe(
        Effect.provide(createClientLayer({
          projects: [makeProject()],
          statuses: [makeStatus()]
        })),
        withDiagnostics
      )

      expect(result.contents).toHaveLength(1)
      expect(result.contents[0]).toMatchObject({
        uri: "huly://projects/TEST",
        mimeType: HULY_RESOURCE_MIME_TYPE
      })
      expect(readJson(textContent(result.contents[0]))).toEqual({
        type: "huly.project",
        uri: "huly://projects/TEST",
        project: {
          identifier: "TEST",
          name: "Test Project",
          description: "Project used by MCP resource tests",
          archived: false,
          statuses: []
        }
      })
    }))

  it.effect("reads an issue resource as one JSON content block", () =>
    Effect.gen(function*() {
      const result = yield* readHulyResource("huly://issues/TEST-1").pipe(
        Effect.provide(createClientLayer({
          projects: [makeProject()],
          issues: [makeIssue()]
        })),
        withDiagnostics
      )

      expect(result.contents).toHaveLength(1)
      expect(result.contents[0]).toMatchObject({
        uri: "huly://issues/TEST-1",
        mimeType: HULY_RESOURCE_MIME_TYPE
      })
      expect(readJson(textContent(result.contents[0]))).toMatchObject({
        type: "huly.issue",
        uri: "huly://issues/TEST-1",
        issue: {
          identifier: "TEST-1",
          title: "Test Issue",
          project: "TEST",
          status: "Unknown"
        }
      })
    }))

  it.effect("maps missing resources to the MCP resource not found code", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(
        readHulyResource("huly://projects/MISSING").pipe(
          Effect.provide(createClientLayer()),
          withDiagnostics
        )
      )

      expect(error).toBeInstanceOf(McpError)
      expect(error.code).toBe(-32002)
      expect(error.data).toEqual({ uri: "huly://projects/MISSING" })
    }))

  it.effect("does not expose backend connection error details in resource read errors", () =>
    Effect.gen(function*() {
      const backendSecret = "https://user:password@example.huly.app/path?token=secret"
      const error = yield* Effect.flip(
        readHulyResource("huly://projects/TEST").pipe(
          Effect.provide(HulyClient.testLayer({
            findOne: () =>
              Effect.fail(
                new HulyConnectionError({
                  message: `Connection failed for ${backendSecret}`
                })
              )
          })),
          withDiagnostics
        )
      )

      expect(error).toBeInstanceOf(McpError)
      expect(error.message).toContain("Connection error while reading Huly resource")
      expect(error.message).not.toContain(backendSecret)
      expect(error.message).not.toContain("password")
      expect(error.message).not.toContain("secret")
    }))

  it.effect("maps an auth failure while listing to a redacted internal error", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(
        listResources().pipe(
          Effect.provide(
            HulyClient.testLayer({ findAll: () => Effect.fail(new HulyAuthError({ message: "bad token" })) })
          )
        )
      )
      expect(error).toBeInstanceOf(McpError)
      expect(error.message).toContain("Authentication error while listing Huly resources")
      expect(error.message).not.toContain("bad token")
    }))

  it.effect("maps an auth failure while reading to a redacted internal error", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(
        readHulyResource("huly://projects/TEST").pipe(
          Effect.provide(
            HulyClient.testLayer({ findOne: () => Effect.fail(new HulyAuthError({ message: "bad token" })) })
          ),
          withDiagnostics
        )
      )
      expect(error).toBeInstanceOf(McpError)
      expect(error.message).toContain("Authentication error while reading Huly resource")
      expect(error.message).not.toContain("bad token")
    }))

  it.effect("maps an invalid resource URI passed to readHulyResource to an McpError", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(
        readHulyResource("not-a-uri").pipe(Effect.provide(createClientLayer()), withDiagnostics)
      )
      expect(error).toBeInstanceOf(McpError)
      expect(error.message).toContain("Invalid Huly resource URI")
    }))

  it.effect("maps a missing issue resource to the MCP resource not found code", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(
        readHulyResource("huly://issues/TEST-404").pipe(
          Effect.provide(createClientLayer({ projects: [makeProject()], issues: [] })),
          withDiagnostics
        )
      )
      expect(error).toBeInstanceOf(McpError)
      expect(error.code).toBe(-32002)
      expect(error.data).toEqual({ uri: "huly://issues/TEST-404" })
    }))
})
