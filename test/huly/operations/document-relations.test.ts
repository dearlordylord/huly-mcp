import { describe, it } from "@effect/vitest"
import type { Doc, DocumentUpdate, FindResult, PersonId, Ref, Space, TxResult } from "@hcengineering/core"
import type { Document as HulyDocument, Teamspace as HulyTeamspace } from "@hcengineering/document"
import type { TaskType } from "@hcengineering/task"
import type { Issue as HulyIssue, Project as HulyProject } from "@hcengineering/tracker"
import { IssuePriority, TimeReportDayType } from "@hcengineering/tracker"
import { Effect } from "effect"
import { expect } from "vitest"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import { documentPlugin, tracker } from "../../../src/huly/huly-plugins.js"
import { linkDocumentToIssue, unlinkDocumentFromIssue } from "../../../src/huly/operations/document-relations.js"
import { documentIdentifier, issueIdentifier, projectIdentifier, teamspaceIdentifier } from "../../helpers/brands.js"

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
    defaultIssueStatus: "status-open" as Ref<never>,
    defaultTimeReportDay: TimeReportDayType.CurrentWorkDay,
    modifiedBy: "user-1" as PersonId,
    modifiedOn: 0,
    createdBy: "user-1" as PersonId,
    createdOn: 0
  }
  return Object.assign(base, overrides) as HulyProject
}

const makeIssue = (overrides?: Partial<HulyIssue>): HulyIssue => ({
  _id: "issue-1" as Ref<HulyIssue>,
  _class: tracker.class.Issue,
  space: "project-1" as Ref<HulyProject>,
  identifier: "TEST-1",
  title: "Test Issue",
  description: null,
  status: "status-open" as Ref<never>,
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

const makeTeamspace = (overrides?: Partial<HulyTeamspace>): HulyTeamspace => {
  const base = {
    _id: "ts-1" as Ref<HulyTeamspace>,
    _class: documentPlugin.class.Teamspace,
    space: "space-1" as Ref<Space>,
    name: "MyTeamspace",
    description: "",
    private: false,
    archived: false,
    members: [],
    owners: [],
    type: "" as Ref<never>,
    modifiedBy: "user-1" as PersonId,
    modifiedOn: 0,
    createdBy: "user-1" as PersonId,
    createdOn: 0
  }
  return Object.assign(base, overrides) as HulyTeamspace
}

const makeDocument = (overrides?: Partial<HulyDocument>): HulyDocument => {
  const base = {
    _id: "doc-1" as Ref<HulyDocument>,
    _class: documentPlugin.class.Document,
    space: "ts-1" as Ref<HulyTeamspace>,
    title: "My Spec",
    content: null,
    parent: "no-parent" as Ref<HulyDocument>,
    rank: "0|aaa",
    modifiedBy: "user-1" as PersonId,
    modifiedOn: 0,
    createdBy: "user-1" as PersonId,
    createdOn: 0
  }
  return Object.assign(base, overrides) as HulyDocument
}

interface MockConfig {
  projects?: Array<HulyProject>
  issues?: Array<HulyIssue>
  teamspaces?: Array<HulyTeamspace>
  documents?: Array<HulyDocument>
  capturedUpdateDocs?: Array<{
    _class: unknown
    space: unknown
    objectId: unknown
    operations: unknown
  }>
}

const createTestLayerWithMocks = (config: MockConfig) => {
  const projects = config.projects ?? []
  const issues = config.issues ?? []
  const teamspaces = config.teamspaces ?? []
  const documents = config.documents ?? []
  const captured = config.capturedUpdateDocs ?? []

  const findOneImpl: HulyClientOperations["findOne"] = ((_class: unknown, query: unknown) => {
    if (_class === tracker.class.Project) {
      const identifier = (query as Record<string, unknown>).identifier as string
      return Effect.succeed(projects.find(p => p.identifier === identifier))
    }
    if (_class === tracker.class.Issue) {
      const q = query as Record<string, unknown>
      return Effect.succeed(
        issues.find(i =>
          (q.identifier && i.identifier === q.identifier)
          || (q.number && i.number === q.number)
        )
      )
    }
    if (_class === documentPlugin.class.Teamspace) {
      const q = query as Record<string, unknown>
      return Effect.succeed(
        teamspaces.find(ts => ts.name === q.name) ?? teamspaces.find(ts => ts._id === q._id)
      )
    }
    if (_class === documentPlugin.class.Document) {
      const q = query as Record<string, unknown>
      return Effect.succeed(
        documents.find(d => d.space === q.space && d.title === q.title)
          ?? documents.find(d => d.space === q.space && d._id === q._id)
      )
    }
    return Effect.succeed(undefined)
  }) as HulyClientOperations["findOne"]

  const findAllImpl: HulyClientOperations["findAll"] =
    (() => Effect.succeed(toFindResult([]))) as HulyClientOperations["findAll"]

  const updateDocImpl: HulyClientOperations["updateDoc"] = ((
    _class: unknown,
    space: unknown,
    objectId: unknown,
    operations: unknown
  ) => {
    captured.push({ _class, space, objectId, operations })
    return Effect.succeed({} as TxResult)
  }) as HulyClientOperations["updateDoc"]

  return HulyClient.testLayer({
    findAll: findAllImpl,
    findOne: findOneImpl,
    updateDoc: updateDocImpl
  })
}

describe("linkDocumentToIssue", () => {
  it.effect("links a document to an issue via $push to relations", () =>
    Effect.gen(function*() {
      const project = makeProject({ _id: "proj-1" as Ref<HulyProject>, identifier: "TEST" })
      const issue = makeIssue({
        _id: "issue-1" as Ref<HulyIssue>,
        space: "proj-1" as Ref<HulyProject>,
        identifier: "TEST-1",
        number: 1
      })
      const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "Docs" })
      const doc = makeDocument({
        _id: "doc-1" as Ref<HulyDocument>,
        space: "ts-1" as Ref<HulyTeamspace>,
        title: "Design Spec"
      })
      const captured: MockConfig["capturedUpdateDocs"] = []
      const testLayer = createTestLayerWithMocks({
        projects: [project],
        issues: [issue],
        teamspaces: [teamspace],
        documents: [doc],
        capturedUpdateDocs: captured
      })

      const result = yield* linkDocumentToIssue({
        project: projectIdentifier("TEST"),
        issueIdentifier: issueIdentifier("TEST-1"),
        teamspace: teamspaceIdentifier("Docs"),
        document: documentIdentifier("Design Spec")
      }).pipe(Effect.provide(testLayer))

      expect(result.linked).toBe(true)
      expect(result.issue).toBe("TEST-1")
      expect(result.document).toBe("doc-1")
      expect(result.documentTitle).toBe("Design Spec")
      expect(captured).toHaveLength(1)
      const ops = captured[0].operations as DocumentUpdate<HulyIssue>
      const pushOps = ops.$push as Record<string, { _id: string; _class: unknown }>
      expect(pushOps.relations._id).toBe("doc-1")
      expect(String(pushOps.relations._class)).toBe(String(documentPlugin.class.Document))
    }))

  it.effect("returns linked=false when document is already linked", () =>
    Effect.gen(function*() {
      const project = makeProject({ _id: "proj-1" as Ref<HulyProject>, identifier: "TEST" })
      const issue = makeIssue({
        _id: "issue-1" as Ref<HulyIssue>,
        space: "proj-1" as Ref<HulyProject>,
        identifier: "TEST-1",
        number: 1,
        relations: [{ _id: "doc-1" as Ref<Doc>, _class: documentPlugin.class.Document }]
      })
      const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "Docs" })
      const doc = makeDocument({
        _id: "doc-1" as Ref<HulyDocument>,
        space: "ts-1" as Ref<HulyTeamspace>,
        title: "Design Spec"
      })
      const captured: MockConfig["capturedUpdateDocs"] = []
      const testLayer = createTestLayerWithMocks({
        projects: [project],
        issues: [issue],
        teamspaces: [teamspace],
        documents: [doc],
        capturedUpdateDocs: captured
      })

      const result = yield* linkDocumentToIssue({
        project: projectIdentifier("TEST"),
        issueIdentifier: issueIdentifier("TEST-1"),
        teamspace: teamspaceIdentifier("Docs"),
        document: documentIdentifier("Design Spec")
      }).pipe(Effect.provide(testLayer))

      expect(result.linked).toBe(false)
      expect(captured).toHaveLength(0)
    }))
})

describe("unlinkDocumentFromIssue", () => {
  it.effect("unlinks a document from an issue via $pull from relations", () =>
    Effect.gen(function*() {
      const project = makeProject({ _id: "proj-1" as Ref<HulyProject>, identifier: "TEST" })
      const issue = makeIssue({
        _id: "issue-1" as Ref<HulyIssue>,
        space: "proj-1" as Ref<HulyProject>,
        identifier: "TEST-1",
        number: 1,
        relations: [{ _id: "doc-1" as Ref<Doc>, _class: documentPlugin.class.Document }]
      })
      const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "Docs" })
      const doc = makeDocument({
        _id: "doc-1" as Ref<HulyDocument>,
        space: "ts-1" as Ref<HulyTeamspace>,
        title: "Design Spec"
      })
      const captured: MockConfig["capturedUpdateDocs"] = []
      const testLayer = createTestLayerWithMocks({
        projects: [project],
        issues: [issue],
        teamspaces: [teamspace],
        documents: [doc],
        capturedUpdateDocs: captured
      })

      const result = yield* unlinkDocumentFromIssue({
        project: projectIdentifier("TEST"),
        issueIdentifier: issueIdentifier("TEST-1"),
        teamspace: teamspaceIdentifier("Docs"),
        document: documentIdentifier("Design Spec")
      }).pipe(Effect.provide(testLayer))

      expect(result.unlinked).toBe(true)
      expect(result.issue).toBe("TEST-1")
      expect(result.document).toBe("doc-1")
      expect(result.documentTitle).toBe("Design Spec")
      expect(captured).toHaveLength(1)
      const ops = captured[0].operations as DocumentUpdate<HulyIssue>
      const pullOps = ops.$pull as Record<string, { _id: string }>
      expect(pullOps.relations._id).toBe("doc-1")
    }))

  it.effect("returns unlinked=false when document is not linked", () =>
    Effect.gen(function*() {
      const project = makeProject({ _id: "proj-1" as Ref<HulyProject>, identifier: "TEST" })
      const issue = makeIssue({
        _id: "issue-1" as Ref<HulyIssue>,
        space: "proj-1" as Ref<HulyProject>,
        identifier: "TEST-1",
        number: 1
      })
      const teamspace = makeTeamspace({ _id: "ts-1" as Ref<HulyTeamspace>, name: "Docs" })
      const doc = makeDocument({
        _id: "doc-1" as Ref<HulyDocument>,
        space: "ts-1" as Ref<HulyTeamspace>,
        title: "Design Spec"
      })
      const captured: MockConfig["capturedUpdateDocs"] = []
      const testLayer = createTestLayerWithMocks({
        projects: [project],
        issues: [issue],
        teamspaces: [teamspace],
        documents: [doc],
        capturedUpdateDocs: captured
      })

      const result = yield* unlinkDocumentFromIssue({
        project: projectIdentifier("TEST"),
        issueIdentifier: issueIdentifier("TEST-1"),
        teamspace: teamspaceIdentifier("Docs"),
        document: documentIdentifier("Design Spec")
      }).pipe(Effect.provide(testLayer))

      expect(result.unlinked).toBe(false)
      expect(captured).toHaveLength(0)
    }))
})
