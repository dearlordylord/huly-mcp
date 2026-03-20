import { describe, it } from "@effect/vitest"
import type { Doc, DocumentUpdate, FindResult, PersonId, Ref, Space, TxResult } from "@hcengineering/core"
import type { Document as HulyDocument } from "@hcengineering/document"
import type { TaskType } from "@hcengineering/task"
import type { Issue as HulyIssue, Project as HulyProject } from "@hcengineering/tracker"
import { IssuePriority, TimeReportDayType } from "@hcengineering/tracker"
import { Effect } from "effect"
import { expect } from "vitest"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import { documentPlugin, tracker } from "../../../src/huly/huly-plugins.js"
import { addIssueRelation, listIssueRelations, removeIssueRelation } from "../../../src/huly/operations/relations.js"
import { issueIdentifier, projectIdentifier } from "../../helpers/brands.js"

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

const makeIssue = (overrides?: Partial<HulyIssue>): HulyIssue => {
  const result: HulyIssue = {
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
  }
  return result
}

interface MockConfig {
  projects?: Array<HulyProject>
  issues?: Array<HulyIssue>
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
  const documents = config.documents ?? []
  const captured = config.capturedUpdateDocs ?? []

  const findAllImpl: HulyClientOperations["findAll"] = ((_class: unknown, query: unknown) => {
    if (_class === tracker.class.Issue) {
      const q = query as Record<string, unknown>
      const inQuery = q._id as { $in?: Array<string> } | undefined
      if (inQuery?.$in) {
        const filtered = issues.filter(i => inQuery.$in!.includes(i._id as string))
        return Effect.succeed(toFindResult(filtered))
      }
      return Effect.succeed(toFindResult(issues))
    }
    if (_class === documentPlugin.class.Document) {
      const q = query as Record<string, unknown>
      const inQuery = q._id as { $in?: Array<string> } | undefined
      if (inQuery?.$in) {
        const filtered = documents.filter(d => inQuery.$in!.includes(d._id as string))
        return Effect.succeed(toFindResult(filtered))
      }
      return Effect.succeed(toFindResult(documents))
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
      if (q.identifier || q.number) {
        const found = issues.find(i =>
          (q.identifier && i.identifier === q.identifier)
          || (q.number && i.number === q.number)
        )
        return Effect.succeed(found)
      }
      return Effect.succeed(undefined)
    }
    return Effect.succeed(undefined)
  }) as HulyClientOperations["findOne"]

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

describe("addIssueRelation", () => {
  it.effect("adds 'blocks' relation — pushes source into target's blockedBy", () =>
    Effect.gen(function*() {
      const project = makeProject({ _id: "proj-1" as Ref<HulyProject>, identifier: "TEST" })
      const source = makeIssue({
        _id: "issue-1" as Ref<HulyIssue>,
        space: "proj-1" as Ref<HulyProject>,
        identifier: "TEST-1",
        number: 1
      })
      const target = makeIssue({
        _id: "issue-2" as Ref<HulyIssue>,
        space: "proj-1" as Ref<HulyProject>,
        identifier: "TEST-2",
        number: 2
      })
      const captured: MockConfig["capturedUpdateDocs"] = []
      const testLayer = createTestLayerWithMocks({
        projects: [project],
        issues: [source, target],
        capturedUpdateDocs: captured
      })

      const result = yield* addIssueRelation({
        project: projectIdentifier("TEST"),
        issueIdentifier: issueIdentifier("TEST-1"),
        targetIssue: issueIdentifier("TEST-2"),
        relationType: "blocks"
      }).pipe(Effect.provide(testLayer))

      expect(result.added).toBe(true)
      expect(result.sourceIssue).toBe("TEST-1")
      expect(result.targetIssue).toBe("TEST-2")
      expect(result.relationType).toBe("blocks")
      expect(captured).toHaveLength(1)
      const ops = captured[0].operations as DocumentUpdate<HulyIssue>
      expect(captured[0].objectId).toBe("issue-2")
      expect(ops.$push).toBeDefined()
      const pushOps = ops.$push as Record<string, unknown>
      expect(pushOps.blockedBy).toBeDefined()
      const pushed = pushOps.blockedBy as { _id: string }
      expect(pushed._id).toBe("issue-1")
    }))

  it.effect("adds 'is-blocked-by' relation — pushes target into source's blockedBy", () =>
    Effect.gen(function*() {
      const project = makeProject({ _id: "proj-1" as Ref<HulyProject>, identifier: "TEST" })
      const source = makeIssue({
        _id: "issue-1" as Ref<HulyIssue>,
        space: "proj-1" as Ref<HulyProject>,
        identifier: "TEST-1",
        number: 1
      })
      const target = makeIssue({
        _id: "issue-2" as Ref<HulyIssue>,
        space: "proj-1" as Ref<HulyProject>,
        identifier: "TEST-2",
        number: 2
      })
      const captured: MockConfig["capturedUpdateDocs"] = []
      const testLayer = createTestLayerWithMocks({
        projects: [project],
        issues: [source, target],
        capturedUpdateDocs: captured
      })

      const result = yield* addIssueRelation({
        project: projectIdentifier("TEST"),
        issueIdentifier: issueIdentifier("TEST-1"),
        targetIssue: issueIdentifier("TEST-2"),
        relationType: "is-blocked-by"
      }).pipe(Effect.provide(testLayer))

      expect(result.added).toBe(true)
      expect(captured).toHaveLength(1)
      expect(captured[0].objectId).toBe("issue-1")
      const ops = captured[0].operations as DocumentUpdate<HulyIssue>
      const pushOps = ops.$push as Record<string, unknown>
      const pushed = pushOps.blockedBy as { _id: string }
      expect(pushed._id).toBe("issue-2")
    }))

  it.effect("adds 'relates-to' relation — bidirectional, two updateDoc calls", () =>
    Effect.gen(function*() {
      const project = makeProject({ _id: "proj-1" as Ref<HulyProject>, identifier: "TEST" })
      const source = makeIssue({
        _id: "issue-1" as Ref<HulyIssue>,
        space: "proj-1" as Ref<HulyProject>,
        identifier: "TEST-1",
        number: 1
      })
      const target = makeIssue({
        _id: "issue-2" as Ref<HulyIssue>,
        space: "proj-1" as Ref<HulyProject>,
        identifier: "TEST-2",
        number: 2
      })
      const captured: MockConfig["capturedUpdateDocs"] = []
      const testLayer = createTestLayerWithMocks({
        projects: [project],
        issues: [source, target],
        capturedUpdateDocs: captured
      })

      const result = yield* addIssueRelation({
        project: projectIdentifier("TEST"),
        issueIdentifier: issueIdentifier("TEST-1"),
        targetIssue: issueIdentifier("TEST-2"),
        relationType: "relates-to"
      }).pipe(Effect.provide(testLayer))

      expect(result.added).toBe(true)
      expect(captured).toHaveLength(2)
      // First call: push target ref into source's relations
      expect(captured[0].objectId).toBe("issue-1")
      const ops0 = captured[0].operations as DocumentUpdate<HulyIssue>
      expect((ops0.$push as Record<string, { _id: string }>).relations._id).toBe("issue-2")
      // Second call: push source ref into target's relations
      expect(captured[1].objectId).toBe("issue-2")
      const ops1 = captured[1].operations as DocumentUpdate<HulyIssue>
      expect((ops1.$push as Record<string, { _id: string }>).relations._id).toBe("issue-1")
    }))

  it.effect("returns added=false when 'blocks' relation already exists", () =>
    Effect.gen(function*() {
      const project = makeProject({ _id: "proj-1" as Ref<HulyProject>, identifier: "TEST" })
      const source = makeIssue({
        _id: "issue-1" as Ref<HulyIssue>,
        space: "proj-1" as Ref<HulyProject>,
        identifier: "TEST-1",
        number: 1
      })
      const target = makeIssue({
        _id: "issue-2" as Ref<HulyIssue>,
        space: "proj-1" as Ref<HulyProject>,
        identifier: "TEST-2",
        number: 2,
        blockedBy: [{ _id: "issue-1" as Ref<Doc>, _class: tracker.class.Issue }]
      })
      const captured: MockConfig["capturedUpdateDocs"] = []
      const testLayer = createTestLayerWithMocks({
        projects: [project],
        issues: [source, target],
        capturedUpdateDocs: captured
      })

      const result = yield* addIssueRelation({
        project: projectIdentifier("TEST"),
        issueIdentifier: issueIdentifier("TEST-1"),
        targetIssue: issueIdentifier("TEST-2"),
        relationType: "blocks"
      }).pipe(Effect.provide(testLayer))

      expect(result.added).toBe(false)
      expect(captured).toHaveLength(0)
    }))

  it.effect("returns added=false when 'relates-to' relation already exists", () =>
    Effect.gen(function*() {
      const project = makeProject({ _id: "proj-1" as Ref<HulyProject>, identifier: "TEST" })
      const source = makeIssue({
        _id: "issue-1" as Ref<HulyIssue>,
        space: "proj-1" as Ref<HulyProject>,
        identifier: "TEST-1",
        number: 1,
        relations: [{ _id: "issue-2" as Ref<Doc>, _class: tracker.class.Issue }]
      })
      const target = makeIssue({
        _id: "issue-2" as Ref<HulyIssue>,
        space: "proj-1" as Ref<HulyProject>,
        identifier: "TEST-2",
        number: 2,
        relations: [{ _id: "issue-1" as Ref<Doc>, _class: tracker.class.Issue }]
      })
      const captured: MockConfig["capturedUpdateDocs"] = []
      const testLayer = createTestLayerWithMocks({
        projects: [project],
        issues: [source, target],
        capturedUpdateDocs: captured
      })

      const result = yield* addIssueRelation({
        project: projectIdentifier("TEST"),
        issueIdentifier: issueIdentifier("TEST-1"),
        targetIssue: issueIdentifier("TEST-2"),
        relationType: "relates-to"
      }).pipe(Effect.provide(testLayer))

      expect(result.added).toBe(false)
      expect(captured).toHaveLength(0)
    }))

  it.effect("resolves cross-project target identifiers", () =>
    Effect.gen(function*() {
      const sourceProject = makeProject({
        _id: "proj-1" as Ref<HulyProject>,
        identifier: "SRC"
      })
      const targetProject = makeProject({
        _id: "proj-2" as Ref<HulyProject>,
        identifier: "TGT"
      })
      const source = makeIssue({
        _id: "issue-1" as Ref<HulyIssue>,
        space: "proj-1" as Ref<HulyProject>,
        identifier: "SRC-1",
        number: 1
      })
      const target = makeIssue({
        _id: "issue-2" as Ref<HulyIssue>,
        space: "proj-2" as Ref<HulyProject>,
        identifier: "TGT-5",
        number: 5
      })
      const captured: MockConfig["capturedUpdateDocs"] = []
      const testLayer = createTestLayerWithMocks({
        projects: [sourceProject, targetProject],
        issues: [source, target],
        capturedUpdateDocs: captured
      })

      const result = yield* addIssueRelation({
        project: projectIdentifier("SRC"),
        issueIdentifier: issueIdentifier("SRC-1"),
        targetIssue: issueIdentifier("TGT-5"),
        relationType: "blocks"
      }).pipe(Effect.provide(testLayer))

      expect(result.added).toBe(true)
      expect(result.targetIssue).toBe("TGT-5")
      expect(captured).toHaveLength(1)
      expect(captured[0].objectId).toBe("issue-2")
    }))
})

describe("removeIssueRelation", () => {
  it.effect("removes 'blocks' relation — pulls from target's blockedBy", () =>
    Effect.gen(function*() {
      const project = makeProject({ _id: "proj-1" as Ref<HulyProject>, identifier: "TEST" })
      const source = makeIssue({
        _id: "issue-1" as Ref<HulyIssue>,
        space: "proj-1" as Ref<HulyProject>,
        identifier: "TEST-1",
        number: 1
      })
      const target = makeIssue({
        _id: "issue-2" as Ref<HulyIssue>,
        space: "proj-1" as Ref<HulyProject>,
        identifier: "TEST-2",
        number: 2,
        blockedBy: [{ _id: "issue-1" as Ref<Doc>, _class: tracker.class.Issue }]
      })
      const captured: MockConfig["capturedUpdateDocs"] = []
      const testLayer = createTestLayerWithMocks({
        projects: [project],
        issues: [source, target],
        capturedUpdateDocs: captured
      })

      const result = yield* removeIssueRelation({
        project: projectIdentifier("TEST"),
        issueIdentifier: issueIdentifier("TEST-1"),
        targetIssue: issueIdentifier("TEST-2"),
        relationType: "blocks"
      }).pipe(Effect.provide(testLayer))

      expect(result.removed).toBe(true)
      expect(captured).toHaveLength(1)
      expect(captured[0].objectId).toBe("issue-2")
      const ops = captured[0].operations as DocumentUpdate<HulyIssue>
      expect(ops.$pull).toBeDefined()
      const pullOps = ops.$pull as Record<string, unknown>
      expect(pullOps.blockedBy).toBeDefined()
      const pulled = pullOps.blockedBy as { _id: string }
      expect(pulled._id).toBe("issue-1")
    }))

  it.effect("removes 'is-blocked-by' relation — pulls from source's blockedBy", () =>
    Effect.gen(function*() {
      const project = makeProject({ _id: "proj-1" as Ref<HulyProject>, identifier: "TEST" })
      const source = makeIssue({
        _id: "issue-1" as Ref<HulyIssue>,
        space: "proj-1" as Ref<HulyProject>,
        identifier: "TEST-1",
        number: 1,
        blockedBy: [{ _id: "issue-2" as Ref<Doc>, _class: tracker.class.Issue }]
      })
      const target = makeIssue({
        _id: "issue-2" as Ref<HulyIssue>,
        space: "proj-1" as Ref<HulyProject>,
        identifier: "TEST-2",
        number: 2
      })
      const captured: MockConfig["capturedUpdateDocs"] = []
      const testLayer = createTestLayerWithMocks({
        projects: [project],
        issues: [source, target],
        capturedUpdateDocs: captured
      })

      const result = yield* removeIssueRelation({
        project: projectIdentifier("TEST"),
        issueIdentifier: issueIdentifier("TEST-1"),
        targetIssue: issueIdentifier("TEST-2"),
        relationType: "is-blocked-by"
      }).pipe(Effect.provide(testLayer))

      expect(result.removed).toBe(true)
      expect(captured).toHaveLength(1)
      expect(captured[0].objectId).toBe("issue-1")
      const ops = captured[0].operations as DocumentUpdate<HulyIssue>
      const pullOps = ops.$pull as Record<string, unknown>
      const pulled = pullOps.blockedBy as { _id: string }
      expect(pulled._id).toBe("issue-2")
    }))

  it.effect("removes 'relates-to' relation — pulls from both sides", () =>
    Effect.gen(function*() {
      const project = makeProject({ _id: "proj-1" as Ref<HulyProject>, identifier: "TEST" })
      const source = makeIssue({
        _id: "issue-1" as Ref<HulyIssue>,
        space: "proj-1" as Ref<HulyProject>,
        identifier: "TEST-1",
        number: 1,
        relations: [{ _id: "issue-2" as Ref<Doc>, _class: tracker.class.Issue }]
      })
      const target = makeIssue({
        _id: "issue-2" as Ref<HulyIssue>,
        space: "proj-1" as Ref<HulyProject>,
        identifier: "TEST-2",
        number: 2,
        relations: [{ _id: "issue-1" as Ref<Doc>, _class: tracker.class.Issue }]
      })
      const captured: MockConfig["capturedUpdateDocs"] = []
      const testLayer = createTestLayerWithMocks({
        projects: [project],
        issues: [source, target],
        capturedUpdateDocs: captured
      })

      const result = yield* removeIssueRelation({
        project: projectIdentifier("TEST"),
        issueIdentifier: issueIdentifier("TEST-1"),
        targetIssue: issueIdentifier("TEST-2"),
        relationType: "relates-to"
      }).pipe(Effect.provide(testLayer))

      expect(result.removed).toBe(true)
      expect(captured).toHaveLength(2)
      // First pull: from source's relations
      expect(captured[0].objectId).toBe("issue-1")
      const ops0 = captured[0].operations as DocumentUpdate<HulyIssue>
      expect((ops0.$pull as Record<string, { _id: string }>).relations._id).toBe("issue-2")
      // Second pull: from target's relations
      expect(captured[1].objectId).toBe("issue-2")
      const ops1 = captured[1].operations as DocumentUpdate<HulyIssue>
      expect((ops1.$pull as Record<string, { _id: string }>).relations._id).toBe("issue-1")
    }))

  it.effect("returns removed=false when relation doesn't exist", () =>
    Effect.gen(function*() {
      const project = makeProject({ _id: "proj-1" as Ref<HulyProject>, identifier: "TEST" })
      const source = makeIssue({
        _id: "issue-1" as Ref<HulyIssue>,
        space: "proj-1" as Ref<HulyProject>,
        identifier: "TEST-1",
        number: 1
      })
      const target = makeIssue({
        _id: "issue-2" as Ref<HulyIssue>,
        space: "proj-1" as Ref<HulyProject>,
        identifier: "TEST-2",
        number: 2
      })
      const captured: MockConfig["capturedUpdateDocs"] = []
      const testLayer = createTestLayerWithMocks({
        projects: [project],
        issues: [source, target],
        capturedUpdateDocs: captured
      })

      const result = yield* removeIssueRelation({
        project: projectIdentifier("TEST"),
        issueIdentifier: issueIdentifier("TEST-1"),
        targetIssue: issueIdentifier("TEST-2"),
        relationType: "blocks"
      }).pipe(Effect.provide(testLayer))

      expect(result.removed).toBe(false)
      expect(captured).toHaveLength(0)
    }))
})

describe("listIssueRelations", () => {
  it.effect("returns resolved relations with identifiers", () =>
    Effect.gen(function*() {
      const project = makeProject({ _id: "proj-1" as Ref<HulyProject>, identifier: "TEST" })
      const issue = makeIssue({
        _id: "issue-1" as Ref<HulyIssue>,
        space: "proj-1" as Ref<HulyProject>,
        identifier: "TEST-1",
        number: 1,
        blockedBy: [{ _id: "issue-2" as Ref<Doc>, _class: tracker.class.Issue }],
        relations: [{ _id: "issue-3" as Ref<Doc>, _class: tracker.class.Issue }]
      })
      const blocker = makeIssue({
        _id: "issue-2" as Ref<HulyIssue>,
        space: "proj-1" as Ref<HulyProject>,
        identifier: "TEST-2",
        number: 2
      })
      const related = makeIssue({
        _id: "issue-3" as Ref<HulyIssue>,
        space: "proj-1" as Ref<HulyProject>,
        identifier: "TEST-3",
        number: 3
      })
      const testLayer = createTestLayerWithMocks({
        projects: [project],
        issues: [issue, blocker, related]
      })

      const result = yield* listIssueRelations({
        project: projectIdentifier("TEST"),
        issueIdentifier: issueIdentifier("TEST-1")
      }).pipe(Effect.provide(testLayer))

      expect(result.blockedBy).toHaveLength(1)
      expect(result.blockedBy[0].identifier).toBe("TEST-2")
      expect(result.blockedBy[0]._id).toBe("issue-2")
      expect(result.relations).toHaveLength(1)
      expect(result.relations[0].identifier).toBe("TEST-3")
      expect(result.relations[0]._id).toBe("issue-3")
      expect(result.documents).toHaveLength(0)
    }))

  it.effect("returns empty arrays when no relations exist", () =>
    Effect.gen(function*() {
      const project = makeProject({ _id: "proj-1" as Ref<HulyProject>, identifier: "TEST" })
      const issue = makeIssue({
        _id: "issue-1" as Ref<HulyIssue>,
        space: "proj-1" as Ref<HulyProject>,
        identifier: "TEST-1",
        number: 1
      })
      const testLayer = createTestLayerWithMocks({
        projects: [project],
        issues: [issue]
      })

      const result = yield* listIssueRelations({
        project: projectIdentifier("TEST"),
        issueIdentifier: issueIdentifier("TEST-1")
      }).pipe(Effect.provide(testLayer))

      expect(result.blockedBy).toHaveLength(0)
      expect(result.relations).toHaveLength(0)
      expect(result.documents).toHaveLength(0)
    }))

  it.effect("falls back to _id when issue is not resolvable", () =>
    Effect.gen(function*() {
      const project = makeProject({ _id: "proj-1" as Ref<HulyProject>, identifier: "TEST" })
      const issue = makeIssue({
        _id: "issue-1" as Ref<HulyIssue>,
        space: "proj-1" as Ref<HulyProject>,
        identifier: "TEST-1",
        number: 1,
        blockedBy: [{ _id: "deleted-issue" as Ref<Doc>, _class: tracker.class.Issue }]
      })
      const testLayer = createTestLayerWithMocks({
        projects: [project],
        issues: [issue]
      })

      const result = yield* listIssueRelations({
        project: projectIdentifier("TEST"),
        issueIdentifier: issueIdentifier("TEST-1")
      }).pipe(Effect.provide(testLayer))

      expect(result.blockedBy).toHaveLength(1)
      expect(result.blockedBy[0].identifier).toBe("deleted-issue")
      expect(result.blockedBy[0]._id).toBe("deleted-issue")
      expect(result.documents).toHaveLength(0)
    }))

  it.effect("partitions document refs from issue refs in relations", () =>
    Effect.gen(function*() {
      const project = makeProject({ _id: "proj-1" as Ref<HulyProject>, identifier: "TEST" })
      const issue = makeIssue({
        _id: "issue-1" as Ref<HulyIssue>,
        space: "proj-1" as Ref<HulyProject>,
        identifier: "TEST-1",
        number: 1,
        relations: [
          { _id: "issue-2" as Ref<Doc>, _class: tracker.class.Issue },
          { _id: "doc-1" as Ref<Doc>, _class: documentPlugin.class.Document }
        ]
      })
      const relatedIssue = makeIssue({
        _id: "issue-2" as Ref<HulyIssue>,
        space: "proj-1" as Ref<HulyProject>,
        identifier: "TEST-2",
        number: 2
      })
      const doc = Object.assign({
        _id: "doc-1" as Ref<HulyDocument>,
        _class: documentPlugin.class.Document,
        space: "teamspace-1" as Ref<Space>,
        title: "My Spec",
        content: null,
        parent: "no-parent" as Ref<HulyDocument>,
        rank: "0|aaa",
        modifiedBy: "user-1" as PersonId,
        modifiedOn: 0,
        createdBy: "user-1" as PersonId,
        createdOn: 0
      }) as HulyDocument
      const testLayer = createTestLayerWithMocks({
        projects: [project],
        issues: [issue, relatedIssue],
        documents: [doc]
      })

      const result = yield* listIssueRelations({
        project: projectIdentifier("TEST"),
        issueIdentifier: issueIdentifier("TEST-1")
      }).pipe(Effect.provide(testLayer))

      expect(result.relations).toHaveLength(1)
      expect(result.relations[0].identifier).toBe("TEST-2")
      expect(result.documents).toHaveLength(1)
      expect(result.documents[0].title).toBe("My Spec")
      expect(result.documents[0]._id).toBe("doc-1")
      expect(result.documents[0]._class).toBe(String(documentPlugin.class.Document))
    }))
})
