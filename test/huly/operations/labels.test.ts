import { describe, it } from "@effect/vitest"
import { type Doc, type PersonId, type Ref, type Space, toFindResult } from "@hcengineering/core"
import type { TagElement as HulyTagElement, TagReference } from "@hcengineering/tags"
import type { ProjectType, TaskType } from "@hcengineering/task"
import type { Issue as HulyIssue, IssueStatus, Project as HulyProject } from "@hcengineering/tracker"
import { Effect } from "effect"
import { expect } from "vitest"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import type { TagNotFoundError } from "../../../src/huly/errors.js"
import { tags, tracker } from "../../../src/huly/huly-plugins.js"
import {
  createLabel,
  deleteLabel,
  listLabels,
  removeIssueLabel,
  updateLabel
} from "../../../src/huly/operations/labels.js"
import { assertAt } from "../../../src/utils/assertions.js"
import { colorCode, issueIdentifier, projectIdentifier, tagIdentifier } from "../../helpers/brands.js"

const makeProject = (overrides?: Partial<HulyProject>): HulyProject => {
  const base = {
    _id: "project-1" as Ref<HulyProject>,
    _class: tracker.class.Project,
    space: "space-1" as Ref<Space>,
    identifier: "TEST",
    name: "Test Project",
    description: "",
    private: false,
    members: [],
    archived: false,
    sequence: 1,
    type: "project-type-1" as Ref<ProjectType>,
    modifiedBy: "user-1" as PersonId,
    modifiedOn: 0,
    createdBy: "user-1" as PersonId,
    createdOn: 0,
    ...overrides
  }
  return base as HulyProject
}

const makeTagElement = (overrides?: Partial<HulyTagElement>): HulyTagElement => {
  const base = {
    _id: "tag-1" as Ref<HulyTagElement>,
    _class: tags.class.TagElement,
    space: "core:space:Workspace" as Ref<Space>,
    title: "bug",
    description: "",
    targetClass: tracker.class.Issue,
    color: 0,
    category: tracker.category.Other,
    modifiedBy: "user-1" as PersonId,
    modifiedOn: 0,
    createdBy: "user-1" as PersonId,
    createdOn: 0,
    ...overrides
  }
  return base as HulyTagElement
}

const makeIssue = (overrides?: Partial<HulyIssue>): HulyIssue => {
  const base = {
    _id: "issue-1" as Ref<HulyIssue>,
    _class: tracker.class.Issue,
    space: "project-1" as Ref<HulyProject>,
    identifier: "TEST-1",
    title: "Test Issue",
    description: null,
    status: "status-open" as Ref<IssueStatus>,
    priority: 3,
    assignee: null,
    kind: "task-type-1" as Ref<TaskType>,
    number: 1,
    dueDate: null,
    rank: "0|aaa",
    attachedTo: "no-parent" as Ref<HulyIssue>,
    attachedToClass: tracker.class.Issue,
    collection: "subIssues",
    component: null,
    milestone: null,
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
  return base as HulyIssue
}

const makeTagReference = (overrides?: Partial<TagReference>): TagReference => {
  const base = {
    _id: "tagref-1" as Ref<TagReference>,
    _class: tags.class.TagReference,
    space: "project-1" as Ref<Space>,
    title: "bug",
    color: 0,
    tag: "tag-1" as Ref<HulyTagElement>,
    attachedTo: "issue-1" as Ref<Doc>,
    attachedToClass: tracker.class.Issue,
    collection: "labels",
    modifiedBy: "user-1" as PersonId,
    modifiedOn: 0,
    createdBy: "user-1" as PersonId,
    createdOn: 0,
    ...overrides
  }
  return base as TagReference
}

interface MockConfig {
  projects?: Array<HulyProject>
  tagElements?: Array<HulyTagElement>
  tagReferences?: Array<TagReference>
  issues?: Array<HulyIssue>
  captureCreateDoc?: { attributes?: Record<string, unknown>; id?: string }
  captureUpdateDoc?: { operations?: Record<string, unknown> }
  captureRemoveDoc?: { called?: boolean }
}

const createTestLayerWithMocks = (config: MockConfig) => {
  const projects = config.projects ?? []
  const tagElements = config.tagElements ?? []
  const tagReferences = config.tagReferences ?? []
  const issues = config.issues ?? []

  const findAllImpl: HulyClientOperations["findAll"] = ((_class: unknown, query: unknown) => {
    if (_class === tags.class.TagElement) {
      return Effect.succeed(toFindResult(tagElements))
    }
    if (_class === tags.class.TagReference) {
      const q = query as Record<string, unknown>
      const filtered = tagReferences.filter(r =>
        (!q.attachedTo || r.attachedTo === q.attachedTo)
        && (!q.attachedToClass || r.attachedToClass === q.attachedToClass)
      )
      return Effect.succeed(toFindResult(filtered))
    }
    return Effect.succeed(toFindResult([]))
  }) as HulyClientOperations["findAll"]

  const findOneImpl: HulyClientOperations["findOne"] = ((_class: unknown, query: unknown) => {
    if (_class === tracker.class.Project) {
      const q = query as Record<string, unknown>
      return Effect.succeed(projects.find(p => p.identifier === q.identifier))
    }
    if (_class === tags.class.TagElement) {
      const q = query as Record<string, unknown>
      const found = tagElements.find(t =>
        (!q.targetClass || t.targetClass === q.targetClass)
        && ((q._id && t._id === q._id) || (q.title && t.title === q.title))
      )
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

  const createDocImpl: HulyClientOperations["createDoc"] = ((
    _class: unknown,
    _space: unknown,
    attributes: unknown,
    id?: unknown
  ) => {
    if (config.captureCreateDoc) {
      config.captureCreateDoc.attributes = attributes as Record<string, unknown>
      config.captureCreateDoc.id = id as string
    }
    return Effect.succeed((id ?? "new-tag-id") as Ref<Doc>)
  }) as HulyClientOperations["createDoc"]

  const updateDocImpl: HulyClientOperations["updateDoc"] = (
    (_class: unknown, _space: unknown, _objectId: unknown, operations: unknown) => {
      if (config.captureUpdateDoc) {
        config.captureUpdateDoc.operations = operations as Record<string, unknown>
      }
      return Effect.succeed({} as never)
    }
  ) as HulyClientOperations["updateDoc"]

  const removeDocImpl: HulyClientOperations["removeDoc"] = (
    (_class: unknown, _space: unknown, _objectId: unknown) => {
      if (config.captureRemoveDoc) {
        config.captureRemoveDoc.called = true
      }
      return Effect.succeed({} as never)
    }
  ) as HulyClientOperations["removeDoc"]

  return HulyClient.testLayer({
    findAll: findAllImpl,
    findOne: findOneImpl,
    createDoc: createDocImpl,
    updateDoc: updateDocImpl,
    removeDoc: removeDocImpl
  })
}

describe("listLabels", () => {
  it.effect("returns tag elements", () =>
    Effect.gen(function*() {
      const tagElements = [
        makeTagElement({ _id: "t-1" as Ref<HulyTagElement>, title: "bug", color: 1 }),
        makeTagElement({ _id: "t-2" as Ref<HulyTagElement>, title: "feature", color: 2 })
      ]

      const testLayer = createTestLayerWithMocks({ tagElements })

      const result = yield* listLabels({}).pipe(Effect.provide(testLayer))

      expect(result).toHaveLength(2)
      expect(assertAt(result, 0).title).toBe("bug")
      expect(assertAt(result, 1).title).toBe("feature")
    }))

  it.effect("returns empty array when no labels", () =>
    Effect.gen(function*() {
      const testLayer = createTestLayerWithMocks({ tagElements: [] })

      const result = yield* listLabels({}).pipe(Effect.provide(testLayer))

      expect(result).toHaveLength(0)
    }))
})

describe("createLabel", () => {
  it.effect("creates new tag element", () =>
    Effect.gen(function*() {
      const captureCreateDoc: MockConfig["captureCreateDoc"] = {}

      const testLayer = createTestLayerWithMocks({
        tagElements: [],
        captureCreateDoc
      })

      const result = yield* createLabel({ title: "new-label" }).pipe(Effect.provide(testLayer))

      expect(result.title).toBe("new-label")
      expect(result.created).toBe(true)
      expect(captureCreateDoc.attributes?.title).toBe("new-label")
      expect(captureCreateDoc.attributes?.color).toBe(0)
    }))

  it.effect("creates with custom color", () =>
    Effect.gen(function*() {
      const captureCreateDoc: MockConfig["captureCreateDoc"] = {}

      const testLayer = createTestLayerWithMocks({
        tagElements: [],
        captureCreateDoc
      })

      const result = yield* createLabel({ title: "colored", color: colorCode(5) }).pipe(Effect.provide(testLayer))

      expect(result.title).toBe("colored")
      expect(captureCreateDoc.attributes?.color).toBe(5)
    }))

  it.effect("returns existing label if title matches", () =>
    Effect.gen(function*() {
      const existing = makeTagElement({ _id: "existing-1" as Ref<HulyTagElement>, title: "existing" })
      const captureCreateDoc: MockConfig["captureCreateDoc"] = {}

      const testLayer = createTestLayerWithMocks({
        tagElements: [existing],
        captureCreateDoc
      })

      const result = yield* createLabel({ title: "existing" }).pipe(Effect.provide(testLayer))

      expect(result.id).toBe("existing-1")
      expect(result.title).toBe("existing")
      expect(result.created).toBe(false)
      expect(captureCreateDoc.attributes).toBeUndefined()
    }))
})

describe("updateLabel", () => {
  it.effect("updates title", () =>
    Effect.gen(function*() {
      const tag = makeTagElement({ title: "old-name" })
      const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}

      const testLayer = createTestLayerWithMocks({
        tagElements: [tag],
        captureUpdateDoc
      })

      const result = yield* updateLabel({
        label: tagIdentifier("old-name"),
        title: "new-name"
      }).pipe(Effect.provide(testLayer))

      expect(result.updated).toBe(true)
      expect(captureUpdateDoc.operations?.title).toBe("new-name")
    }))

  it.effect("updates color", () =>
    Effect.gen(function*() {
      const tag = makeTagElement({ title: "test" })
      const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}

      const testLayer = createTestLayerWithMocks({
        tagElements: [tag],
        captureUpdateDoc
      })

      const result = yield* updateLabel({
        label: tagIdentifier("test"),
        color: colorCode(7)
      }).pipe(Effect.provide(testLayer))

      expect(result.updated).toBe(true)
      expect(captureUpdateDoc.operations?.color).toBe(7)
    }))

  it.effect("clears description when set to null", () =>
    Effect.gen(function*() {
      const tag = makeTagElement({ title: "test", description: "Old description" })
      const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}

      const result = yield* updateLabel({
        label: tagIdentifier("test"),
        description: null
      }).pipe(Effect.provide(createTestLayerWithMocks({ tagElements: [tag], captureUpdateDoc })))

      expect(result.updated).toBe(true)
      expect(captureUpdateDoc.operations?.description).toBe("")
    }))

  it.effect("fails when no fields provided", () =>
    Effect.gen(function*() {
      const tag = makeTagElement({ title: "test" })

      const testLayer = createTestLayerWithMocks({ tagElements: [tag] })

      const error = yield* Effect.flip(
        updateLabel({
          label: tagIdentifier("test")
        }).pipe(Effect.provide(testLayer))
      )

      expect(error._tag).toBe("NoUpdateFieldsError")
    }))

  it.effect("returns TagNotFoundError for nonexistent label", () =>
    Effect.gen(function*() {
      const testLayer = createTestLayerWithMocks({ tagElements: [] })

      const error = yield* Effect.flip(
        updateLabel({
          label: tagIdentifier("nonexistent"),
          title: "new"
        }).pipe(Effect.provide(testLayer))
      )

      expect(error._tag).toBe("TagNotFoundError")
      expect((error as TagNotFoundError).identifier).toBe("nonexistent")
    }))
})

describe("deleteLabel", () => {
  it.effect("deletes tag element by title", () =>
    Effect.gen(function*() {
      const tag = makeTagElement({ _id: "t-1" as Ref<HulyTagElement>, title: "to-delete" })
      const captureRemoveDoc: MockConfig["captureRemoveDoc"] = {}

      const testLayer = createTestLayerWithMocks({
        tagElements: [tag],
        captureRemoveDoc
      })

      const result = yield* deleteLabel({
        label: tagIdentifier("to-delete")
      }).pipe(Effect.provide(testLayer))

      expect(result.id).toBe("t-1")
      expect(result.deleted).toBe(true)
      expect(captureRemoveDoc.called).toBe(true)
    }))

  it.effect("deletes tag element by ID", () =>
    Effect.gen(function*() {
      const tag = makeTagElement({ _id: "tag-abc" as Ref<HulyTagElement>, title: "my-tag" })
      const captureRemoveDoc: MockConfig["captureRemoveDoc"] = {}

      const testLayer = createTestLayerWithMocks({
        tagElements: [tag],
        captureRemoveDoc
      })

      const result = yield* deleteLabel({
        label: tagIdentifier("tag-abc")
      }).pipe(Effect.provide(testLayer))

      expect(result.id).toBe("tag-abc")
      expect(result.deleted).toBe(true)
      expect(captureRemoveDoc.called).toBe(true)
    }))

  it.effect("returns TagNotFoundError for nonexistent label", () =>
    Effect.gen(function*() {
      const testLayer = createTestLayerWithMocks({ tagElements: [] })

      const error = yield* Effect.flip(
        deleteLabel({
          label: tagIdentifier("nonexistent")
        }).pipe(Effect.provide(testLayer))
      )

      expect(error._tag).toBe("TagNotFoundError")
    }))
})

describe("removeIssueLabel", () => {
  it.effect("removes label from issue", () =>
    Effect.gen(function*() {
      const project = makeProject()
      const issue = makeIssue()
      const tagRef = makeTagReference({ title: "bug", attachedTo: issue._id })
      const captureRemoveDoc: MockConfig["captureRemoveDoc"] = {}

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        issues: [issue],
        tagReferences: [tagRef],
        captureRemoveDoc
      })

      const result = yield* removeIssueLabel({
        project: projectIdentifier("TEST"),
        identifier: issueIdentifier("TEST-1"),
        label: "bug"
      }).pipe(Effect.provide(testLayer))

      expect(result.identifier).toBe("TEST-1")
      expect(result.labelRemoved).toBe(true)
      expect(captureRemoveDoc.called).toBe(true)
    }))

  it.effect("returns TagNotFoundError when label not on issue", () =>
    Effect.gen(function*() {
      const project = makeProject()
      const issue = makeIssue()

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        issues: [issue],
        tagReferences: []
      })

      const error = yield* Effect.flip(
        removeIssueLabel({
          project: projectIdentifier("TEST"),
          identifier: issueIdentifier("TEST-1"),
          label: "nonexistent"
        }).pipe(Effect.provide(testLayer))
      )

      expect(error._tag).toBe("TagNotFoundError")
    }))
})
