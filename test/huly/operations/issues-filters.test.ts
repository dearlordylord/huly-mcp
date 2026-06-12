import { describe, it } from "@effect/vitest"
import type { Attribute, Class, Doc, FindResult, PersonId, Ref, Space, Status } from "@hcengineering/core"
import { type Issue as HulyIssue, type Project as HulyProject, TimeReportDayType } from "@hcengineering/tracker"
import type { ParseResult } from "effect"
import { Effect, Exit, Schema } from "effect"
import { expect } from "vitest"

import { ListIssuesParamsSchema } from "../../../src/domain/schemas/issues.js"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import { core, tracker } from "../../../src/huly/huly-plugins.js"
import { listIssues } from "../../../src/huly/operations/issues.js"
import { projectIdentifier } from "../../helpers/brands.js"
import { withDiagnostics } from "../../helpers/diagnostics.js"

const toFindResult = <T extends Doc>(docs: Array<T>): FindResult<T> => {
  const result = docs as FindResult<T>
  result.total = docs.length
  return result
}

const makeProject = (overrides?: Partial<HulyProject>): HulyProject => {
  const base = {
    _id: "project-1" as Ref<HulyProject>,
    _class: tracker.class.Project,
    space: "space-1" as Ref<Space>,
    identifier: "TEST",
    name: "Test Project",
    sequence: 1,
    defaultIssueStatus: "status-open" as Ref<Status>,
    defaultTimeReportDay: TimeReportDayType.CurrentWorkDay,
    modifiedBy: "user-1" as PersonId,
    modifiedOn: 0,
    createdBy: "user-1" as PersonId,
    createdOn: 0
  }
  return Object.assign(base, overrides) as HulyProject
}

const makeStatus = (overrides?: Partial<Status>): Status => {
  const result: Status = {
    _id: "status-1" as Ref<Status>,
    _class: "core:class:Status" as Ref<Class<Status>>,
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

interface MockConfig {
  projects?: Array<HulyProject>
  issues?: Array<HulyIssue>
  statuses?: Array<Status>
  captureIssueQuery?: { query?: Record<string, unknown>; options?: Record<string, unknown> }
}

const createTestLayer = (config: MockConfig) => {
  const projects = config.projects ?? []
  const issues = config.issues ?? []
  const statuses = config.statuses ?? []

  const findAllImpl: HulyClientOperations["findAll"] = ((_class: unknown, query: unknown, options: unknown) => {
    if (_class === tracker.class.Issue) {
      if (config.captureIssueQuery) {
        config.captureIssueQuery.query = query as Record<string, unknown>
        config.captureIssueQuery.options = options as Record<string, unknown>
      }
      return Effect.succeed(toFindResult([...issues]))
    }
    if (String(_class) === String(core.class.Status)) {
      const q = query as Record<string, unknown>
      const inQuery = q._id as { $in?: Array<Ref<Status>> } | undefined
      if (inQuery?.$in) {
        const filtered = statuses.filter(s => inQuery.$in!.includes(s._id))
        return Effect.succeed(toFindResult(filtered))
      }
      return Effect.succeed(toFindResult(statuses))
    }
    return Effect.succeed(toFindResult([]))
  }) as HulyClientOperations["findAll"]

  const findOneImpl: HulyClientOperations["findOne"] = ((_class: unknown, query: unknown, options?: unknown) => {
    if (_class === tracker.class.Project) {
      const identifier = (query as Record<string, unknown>).identifier as string
      const found = projects.find(p => p.identifier === identifier)
      if (found === undefined) return Effect.succeed(undefined)
      const opts = options as { lookup?: Record<string, unknown> } | undefined
      if (opts?.lookup?.type) {
        return Effect.succeed({
          ...found,
          $lookup: {
            type: {
              _id: "project-type-1",
              statuses: statuses.map(s => ({ _id: s._id }))
            }
          }
        })
      }
      return Effect.succeed(found)
    }
    return Effect.succeed(undefined)
  }) as HulyClientOperations["findOne"]

  return HulyClient.testLayer({
    findAll: findAllImpl,
    findOne: findOneImpl
  })
}

const expectParseFailure = (exit: Exit.Exit<unknown, ParseResult.ParseError>): string => {
  expect(Exit.isFailure(exit)).toBe(true)
  if (!Exit.isFailure(exit)) throw new Error("unreachable")
  const fail = exit.cause
  if (fail._tag !== "Fail") throw new Error("expected Fail cause")
  return fail.error.message
}

describe("listIssues filters", () => {
  const project = makeProject({ identifier: "TEST" })
  const statuses = [makeStatus({ _id: "status-open" as Ref<Status>, name: "Open" })]

  describe("titleRegex", () => {
    it.effect("builds $regex query", () =>
      Effect.gen(function*() {
        const captureQuery: MockConfig["captureIssueQuery"] = {}
        const testLayer = createTestLayer({
          projects: [project],
          issues: [],
          statuses,
          captureIssueQuery: captureQuery
        })

        yield* listIssues({ project: projectIdentifier("TEST"), titleRegex: "BUG%" }).pipe(
          Effect.provide(testLayer),
          withDiagnostics
        )

        expect(captureQuery.query?.title).toEqual({ $regex: "BUG%" })
      }))

    it.effect("ignores empty titleRegex", () =>
      Effect.gen(function*() {
        const captureQuery: MockConfig["captureIssueQuery"] = {}
        const testLayer = createTestLayer({
          projects: [project],
          issues: [],
          statuses,
          captureIssueQuery: captureQuery
        })

        yield* listIssues({ project: projectIdentifier("TEST"), titleRegex: "  " }).pipe(
          Effect.provide(testLayer),
          withDiagnostics
        )

        expect(captureQuery.query?.title).toBeUndefined()
      }))
  })

  describe("hasAssignee", () => {
    it.effect("true builds $ne: null query", () =>
      Effect.gen(function*() {
        const captureQuery: MockConfig["captureIssueQuery"] = {}
        const testLayer = createTestLayer({
          projects: [project],
          issues: [],
          statuses,
          captureIssueQuery: captureQuery
        })

        yield* listIssues({ project: projectIdentifier("TEST"), hasAssignee: true }).pipe(
          Effect.provide(testLayer),
          withDiagnostics
        )

        expect(captureQuery.query?.assignee).toEqual({ $ne: null })
      }))

    it.effect("false builds null query", () =>
      Effect.gen(function*() {
        const captureQuery: MockConfig["captureIssueQuery"] = {}
        const testLayer = createTestLayer({
          projects: [project],
          issues: [],
          statuses,
          captureIssueQuery: captureQuery
        })

        yield* listIssues({ project: projectIdentifier("TEST"), hasAssignee: false }).pipe(
          Effect.provide(testLayer),
          withDiagnostics
        )

        expect(captureQuery.query?.assignee).toBeNull()
      }))
  })

  describe("hasDueDate", () => {
    it.effect("true builds $ne: null query", () =>
      Effect.gen(function*() {
        const captureQuery: MockConfig["captureIssueQuery"] = {}
        const testLayer = createTestLayer({
          projects: [project],
          issues: [],
          statuses,
          captureIssueQuery: captureQuery
        })

        yield* listIssues({ project: projectIdentifier("TEST"), hasDueDate: true }).pipe(
          Effect.provide(testLayer),
          withDiagnostics
        )

        expect(captureQuery.query?.dueDate).toEqual({ $ne: null })
      }))

    it.effect("false builds null query", () =>
      Effect.gen(function*() {
        const captureQuery: MockConfig["captureIssueQuery"] = {}
        const testLayer = createTestLayer({
          projects: [project],
          issues: [],
          statuses,
          captureIssueQuery: captureQuery
        })

        yield* listIssues({ project: projectIdentifier("TEST"), hasDueDate: false }).pipe(
          Effect.provide(testLayer),
          withDiagnostics
        )

        expect(captureQuery.query?.dueDate).toBeNull()
      }))
  })

  describe("hasComponent", () => {
    it.effect("true builds $ne: null query", () =>
      Effect.gen(function*() {
        const captureQuery: MockConfig["captureIssueQuery"] = {}
        const testLayer = createTestLayer({
          projects: [project],
          issues: [],
          statuses,
          captureIssueQuery: captureQuery
        })

        yield* listIssues({ project: projectIdentifier("TEST"), hasComponent: true }).pipe(
          Effect.provide(testLayer),
          withDiagnostics
        )

        expect(captureQuery.query?.component).toEqual({ $ne: null })
      }))

    it.effect("false builds null query", () =>
      Effect.gen(function*() {
        const captureQuery: MockConfig["captureIssueQuery"] = {}
        const testLayer = createTestLayer({
          projects: [project],
          issues: [],
          statuses,
          captureIssueQuery: captureQuery
        })

        yield* listIssues({ project: projectIdentifier("TEST"), hasComponent: false }).pipe(
          Effect.provide(testLayer),
          withDiagnostics
        )

        expect(captureQuery.query?.component).toBeNull()
      }))
  })

  describe("isTopLevel", () => {
    it.effect("true sets attachedToClass to Project", () =>
      Effect.gen(function*() {
        const captureQuery: MockConfig["captureIssueQuery"] = {}
        const testLayer = createTestLayer({
          projects: [project],
          issues: [],
          statuses,
          captureIssueQuery: captureQuery
        })

        yield* listIssues({ project: projectIdentifier("TEST"), isTopLevel: true }).pipe(
          Effect.provide(testLayer),
          withDiagnostics
        )

        expect(captureQuery.query?.attachedToClass).toBe(tracker.class.Project)
      }))

    it.effect("false does not set attachedToClass", () =>
      Effect.gen(function*() {
        const captureQuery: MockConfig["captureIssueQuery"] = {}
        const testLayer = createTestLayer({
          projects: [project],
          issues: [],
          statuses,
          captureIssueQuery: captureQuery
        })

        yield* listIssues({ project: projectIdentifier("TEST"), isTopLevel: false }).pipe(
          Effect.provide(testLayer),
          withDiagnostics
        )

        expect(captureQuery.query?.attachedToClass).toBeUndefined()
      }))

    it.effect("undefined does not set attachedToClass", () =>
      Effect.gen(function*() {
        const captureQuery: MockConfig["captureIssueQuery"] = {}
        const testLayer = createTestLayer({
          projects: [project],
          issues: [],
          statuses,
          captureIssueQuery: captureQuery
        })

        yield* listIssues({ project: projectIdentifier("TEST") }).pipe(Effect.provide(testLayer), withDiagnostics)

        expect(captureQuery.query?.attachedToClass).toBeUndefined()
      }))
  })

  describe("mutual exclusion", () => {
    it("rejects titleSearch + titleRegex", async () => {
      const result = await Effect.runPromiseExit(
        Schema.decodeUnknown(ListIssuesParamsSchema)({
          project: "TEST",
          titleSearch: "bug",
          titleRegex: "BUG%"
        })
      )

      const msg = expectParseFailure(result)
      expect(msg).toContain("titleSearch")
      expect(msg).toContain("titleRegex")
    })

    it("rejects assignee + hasAssignee", async () => {
      const result = await Effect.runPromiseExit(
        Schema.decodeUnknown(ListIssuesParamsSchema)({
          project: "TEST",
          assignee: "test@test.com",
          hasAssignee: true
        })
      )

      const msg = expectParseFailure(result)
      expect(msg).toContain("assignee")
      expect(msg).toContain("hasAssignee")
    })

    it("rejects component + hasComponent", async () => {
      const result = await Effect.runPromiseExit(
        Schema.decodeUnknown(ListIssuesParamsSchema)({
          project: "TEST",
          component: "frontend",
          hasComponent: true
        })
      )

      const msg = expectParseFailure(result)
      expect(msg).toContain("component")
      expect(msg).toContain("hasComponent")
    })

    it("rejects parentIssue + isTopLevel: true", async () => {
      const result = await Effect.runPromiseExit(
        Schema.decodeUnknown(ListIssuesParamsSchema)({
          project: "TEST",
          parentIssue: "TEST-1",
          isTopLevel: true
        })
      )

      const msg = expectParseFailure(result)
      expect(msg).toContain("parentIssue")
      expect(msg).toContain("isTopLevel")
    })

    it("allows parentIssue + isTopLevel: false", async () => {
      const result = await Effect.runPromiseExit(
        Schema.decodeUnknown(ListIssuesParamsSchema)({
          project: "TEST",
          parentIssue: "TEST-1",
          isTopLevel: false
        })
      )

      expect(Exit.isSuccess(result)).toBe(true)
    })
  })
})
