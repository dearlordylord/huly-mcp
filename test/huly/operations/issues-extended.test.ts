import { describe, it } from "@effect/vitest"
import type { Channel, Person } from "@hcengineering/contact"
import type { Doc, FindResult, MarkupBlobRef, Ref, Space, Status } from "@hcengineering/core"
import type { TagElement, TagReference } from "@hcengineering/tags"
import { type Issue as HulyIssue, IssuePriority, type Project as HulyProject } from "@hcengineering/tracker"
import { Effect } from "effect"
import { expect } from "vitest"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import type { IssueNotFoundError, ProjectNotFoundError } from "../../../src/huly/errors.js"
import { addLabel, createIssue, deleteIssue, updateIssue } from "../../../src/huly/operations/issues.js"

import { contact, core, tags, tracker } from "../../../src/huly/huly-plugins.js"

const toFindResult = <T extends Doc>(docs: Array<T>): FindResult<T> => {
  const result = docs as FindResult<T>
  result.total = docs.length
  return result
}

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

const makeTagElement = (overrides?: Partial<TagElement>): TagElement => {
  const result: TagElement = {
    _id: "tag-element-1" as Ref<TagElement>,
    _class: tags.class.TagElement,
    space: "space-1" as Ref<Space>,
    title: "Bug",
    description: "",
    targetClass: tracker.class.Issue,
    color: 0,
    category: tracker.category.Other,
    modifiedBy: "user-1" as Ref<Doc>,
    modifiedOn: Date.now(),
    createdBy: "user-1" as Ref<Doc>,
    createdOn: Date.now(),
    ...overrides
  }
  return result
}

interface MockConfig {
  projects?: Array<HulyProject>
  issues?: Array<HulyIssue>
  statuses?: Array<Status>
  persons?: Array<Person>
  channels?: Array<Channel>
  tagElements?: Array<TagElement>
  tagReferences?: Array<TagReference>
  markupContent?: Record<string, string>
  captureUpdateDoc?: { operations?: Record<string, unknown> }
  captureAddCollection?: { attributes?: Record<string, unknown>; id?: string; class?: unknown }
  captureCreateDoc?: { attributes?: Record<string, unknown>; id?: string }
  captureUploadMarkup?: { markup?: string }
  captureUpdateMarkup?: { markup?: string }
  captureRemoveDoc?: { id?: string }
  updateDocResult?: { object?: { sequence?: number } }
  // For addLabel: simulate tagElement not found after creation
  tagElementCreateReturnsUndefined?: boolean
}

const createTestLayerWithMocks = (config: MockConfig) => {
  const projects = config.projects ?? []
  const issues = config.issues ?? []
  const statuses = config.statuses ?? []
  const persons = config.persons ?? []
  const channels = config.channels ?? []
  let tagElements = config.tagElements ?? []
  const tagReferences = config.tagReferences ?? []

  const findAllImpl: HulyClientOperations["findAll"] = ((_class: unknown, query: unknown, options: unknown) => {
    if (_class === tracker.class.Issue) {
      const opts = options as { sort?: Record<string, number>; lookup?: Record<string, unknown> } | undefined
      let result = [...issues]
      if (opts?.sort?.modifiedOn !== undefined) {
        const direction = opts.sort.modifiedOn
        result = result.sort((a, b) => direction * (a.modifiedOn - b.modifiedOn))
      }
      if (opts?.lookup?.assignee) {
        result = result.map(issue => {
          const assigneePerson = issue.assignee
            ? persons.find(p => String(p._id) === String(issue.assignee))
            : undefined
          return { ...issue, $lookup: { assignee: assigneePerson } }
        })
      }
      return Effect.succeed(toFindResult(result as Array<Doc>))
    }
    if (String(_class) === String(core.class.Status)) {
      const q = query as Record<string, unknown>
      const inQuery = q._id as { $in?: Array<Ref<Status>> } | undefined
      if (inQuery?.$in) {
        const filtered = statuses.filter(s => inQuery.$in!.includes(s._id))
        return Effect.succeed(toFindResult(filtered as Array<Doc>))
      }
      return Effect.succeed(toFindResult(statuses as Array<Doc>))
    }
    if (_class === contact.class.Channel) {
      const value = (query as Record<string, unknown>).value as string
      const filtered = channels.filter(c => c.value === value)
      return Effect.succeed(toFindResult(filtered as Array<Doc>))
    }
    if (_class === contact.class.Person) {
      return Effect.succeed(toFindResult(persons as Array<Doc>))
    }
    if (_class === tags.class.TagReference) {
      const q = query as Record<string, unknown>
      const filtered = tagReferences.filter(tr =>
        tr.attachedTo === q.attachedTo
        && tr.attachedToClass === q.attachedToClass
      )
      return Effect.succeed(toFindResult(filtered as Array<Doc>))
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
        const projectWithLookup = {
          ...found,
          $lookup: {
            type: {
              _id: "project-type-1",
              statuses: statuses.map(s => ({ _id: s._id }))
            }
          }
        }
        return Effect.succeed(projectWithLookup as Doc)
      }
      return Effect.succeed(found as Doc)
    }
    if (_class === tracker.class.Issue) {
      const q = query as Record<string, unknown>
      const found = issues.find(i =>
        (q.identifier && i.identifier === q.identifier)
        || (q.number && i.number === q.number)
        || (q.space && i.space === q.space && !q.identifier && !q.number)
      )
      return Effect.succeed(found as Doc | undefined)
    }
    if (_class === contact.class.Channel) {
      const q = query as Record<string, unknown>
      const value = q.value as string | { $like: string } | undefined
      if (typeof value === "string") {
        const found = channels.find(c => c.value === value && (q.provider === undefined || c.provider === q.provider))
        return Effect.succeed(found as Doc | undefined)
      }
      if (value && typeof value === "object" && "$like" in value) {
        const pattern = value.$like.replace(/%/g, "")
        const found = channels.find(c =>
          c.value.includes(pattern) && (q.provider === undefined || c.provider === q.provider)
        )
        return Effect.succeed(found as Doc | undefined)
      }
      return Effect.succeed(undefined)
    }
    if (_class === contact.class.Person) {
      const q = query as Record<string, unknown>
      if (q._id) {
        const found = persons.find(p => p._id === q._id)
        return Effect.succeed(found as Doc | undefined)
      }
      if (q.name) {
        if (typeof q.name === "string") {
          const found = persons.find(p => p.name === q.name)
          return Effect.succeed(found as Doc | undefined)
        }
        if (typeof q.name === "object" && "$like" in (q.name as Record<string, unknown>)) {
          const pattern = (q.name as Record<string, string>).$like.replace(/%/g, "")
          const found = persons.find(p => p.name.includes(pattern))
          return Effect.succeed(found as Doc | undefined)
        }
      }
      return Effect.succeed(undefined)
    }
    if (_class === tags.class.TagElement) {
      const q = query as Record<string, unknown>
      if (config.tagElementCreateReturnsUndefined && q._id) {
        return Effect.succeed(undefined)
      }
      const found = tagElements.find(te =>
        (q._id && te._id === q._id)
        || (q.title && q.targetClass && te.title === q.title && te.targetClass === q.targetClass)
      )
      return Effect.succeed(found as Doc | undefined)
    }
    return Effect.succeed(undefined)
  }) as HulyClientOperations["findOne"]

  const fetchMarkupImpl: HulyClientOperations["fetchMarkup"] = (
    (_objectClass: unknown, _objectId: unknown, _objectAttr: unknown, id: unknown) => {
      const content = (config.markupContent ?? {})[id as string] ?? ""
      return Effect.succeed(content)
    }
  ) as HulyClientOperations["fetchMarkup"]

  const updateDocImpl: HulyClientOperations["updateDoc"] = (
    (_class: unknown, _space: unknown, _objectId: unknown, operations: unknown) => {
      if (config.captureUpdateDoc) {
        config.captureUpdateDoc.operations = operations as Record<string, unknown>
      }
      const project = projects[0]
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- project may be undefined from array access
      const sequence = (config.updateDocResult?.object?.sequence) ?? (project ? project.sequence + 1 : 1)
      return Effect.succeed({ object: { sequence } } as never)
    }
  ) as HulyClientOperations["updateDoc"]

  const addCollectionImpl: HulyClientOperations["addCollection"] = ((
    _class: unknown,
    _space: unknown,
    _attachedTo: unknown,
    _attachedToClass: unknown,
    _collection: unknown,
    attributes: unknown,
    id?: unknown
  ) => {
    if (config.captureAddCollection) {
      config.captureAddCollection.class = _class
      config.captureAddCollection.attributes = attributes as Record<string, unknown>
      config.captureAddCollection.id = id as string
    }
    return Effect.succeed((id ?? "new-issue-id") as Ref<Doc>)
  }) as HulyClientOperations["addCollection"]

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
    if (_class === tags.class.TagElement && id && !config.tagElementCreateReturnsUndefined) {
      const newTag = makeTagElement({
        _id: id as Ref<TagElement>,
        ...(attributes as Partial<TagElement>)
      })
      tagElements = [...tagElements, newTag]
    }
    return Effect.succeed((id ?? "new-doc-id") as Ref<Doc>)
  }) as HulyClientOperations["createDoc"]

  const uploadMarkupImpl: HulyClientOperations["uploadMarkup"] = ((
    _objectClass: unknown,
    _objectId: unknown,
    _objectAttr: unknown,
    markup: unknown
  ) => {
    if (config.captureUploadMarkup) {
      config.captureUploadMarkup.markup = markup as string
    }
    return Effect.succeed("markup-ref-123")
  }) as HulyClientOperations["uploadMarkup"]

  const updateMarkupImpl: HulyClientOperations["updateMarkup"] = ((
    _objectClass: unknown,
    _objectId: unknown,
    _objectAttr: unknown,
    markup: unknown
  ) => {
    if (config.captureUpdateMarkup) {
      config.captureUpdateMarkup.markup = markup as string
    }
    return Effect.succeed(undefined)
  }) as HulyClientOperations["updateMarkup"]

  const removeDocImpl: HulyClientOperations["removeDoc"] = ((
    _class: unknown,
    _space: unknown,
    objectId: unknown
  ) => {
    if (config.captureRemoveDoc) {
      config.captureRemoveDoc.id = String(objectId)
    }
    return Effect.succeed({})
  }) as HulyClientOperations["removeDoc"]

  return HulyClient.testLayer({
    findAll: findAllImpl,
    findOne: findOneImpl,
    fetchMarkup: fetchMarkupImpl,
    updateDoc: updateDocImpl,
    addCollection: addCollectionImpl,
    uploadMarkup: uploadMarkupImpl,
    updateMarkup: updateMarkupImpl,
    createDoc: createDocImpl,
    removeDoc: removeDocImpl
  })
}

describe("Issues Extended Coverage", () => {
  describe("extractUpdatedSequence fallback (line 121 None branch)", () => {
    // test-revizorro: scheduled
    it.effect("falls back to project.sequence + 1 when updateDoc returns non-decodable result", () =>
      Effect.gen(function*() {
        const project = makeProject({ identifier: "TEST", sequence: 10 })

        const captureAddCollection: MockConfig["captureAddCollection"] = {}

        // Create a custom test layer where updateDoc returns a non-matching shape
        const findAllImpl: HulyClientOperations["findAll"] = ((_class: unknown, _query: unknown, _options: unknown) => {
          if (String(_class) === String(core.class.Status)) {
            return Effect.succeed(toFindResult([]))
          }
          if (_class === tracker.class.Issue) {
            return Effect.succeed(toFindResult([]))
          }
          return Effect.succeed(toFindResult([]))
        }) as HulyClientOperations["findAll"]

        const findOneImpl: HulyClientOperations["findOne"] = ((_class: unknown, query: unknown, options?: unknown) => {
          if (_class === tracker.class.Project) {
            const opts = options as { lookup?: Record<string, unknown> } | undefined
            if (opts?.lookup?.type) {
              return Effect.succeed({
                ...project,
                $lookup: { type: { _id: "pt-1", statuses: [] } }
              } as Doc)
            }
            return Effect.succeed(project as Doc)
          }
          if (_class === tracker.class.Issue) {
            return Effect.succeed(undefined)
          }
          return Effect.succeed(undefined)
        }) as HulyClientOperations["findOne"]

        const updateDocImpl: HulyClientOperations["updateDoc"] = (() => {
          // Return something that doesn't match TxIncResult schema
          return Effect.succeed({ notAnObject: true } as never)
        }) as HulyClientOperations["updateDoc"]

        const addCollectionImpl: HulyClientOperations["addCollection"] = ((
          _class: unknown,
          _space: unknown,
          _attachedTo: unknown,
          _attachedToClass: unknown,
          _collection: unknown,
          attributes: unknown,
          id?: unknown
        ) => {
          captureAddCollection.attributes = attributes as Record<string, unknown>
          return Effect.succeed((id ?? "new-issue-id") as Ref<Doc>)
        }) as HulyClientOperations["addCollection"]

        const uploadMarkupImpl: HulyClientOperations["uploadMarkup"] = (() => {
          return Effect.succeed("markup-ref" as never)
        }) as HulyClientOperations["uploadMarkup"]

        const testLayer = HulyClient.testLayer({
          findAll: findAllImpl,
          findOne: findOneImpl,
          updateDoc: updateDocImpl,
          addCollection: addCollectionImpl,
          uploadMarkup: uploadMarkupImpl
        })

        const result = yield* createIssue({
          project: "TEST",
          title: "Fallback Sequence"
        }).pipe(Effect.provide(testLayer))

        // project.sequence is 10, so fallback should be 10 + 1 = 11
        expect(result.identifier).toBe("TEST-11")
      }))
  })

  describe("deleteIssue", () => {
    // test-revizorro: approved
    it.effect("deletes an existing issue", () =>
      Effect.gen(function*() {
        const project = makeProject({ identifier: "TEST" })
        const issue = makeIssue({ identifier: "TEST-1", number: 1 })
        const statuses = [makeStatus({ _id: "status-open" as Ref<Status>, name: "Open" })]
        const captureRemoveDoc: MockConfig["captureRemoveDoc"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          statuses,
          captureRemoveDoc
        })

        const result = yield* deleteIssue({
          project: "TEST",
          identifier: "TEST-1"
        }).pipe(Effect.provide(testLayer))

        expect(result.identifier).toBe("TEST-1")
        expect(result.deleted).toBe(true)
        expect(captureRemoveDoc.id).toBe("issue-1")
      }))

    // test-revizorro: approved
    it.effect("returns ProjectNotFoundError when project does not exist", () =>
      Effect.gen(function*() {
        const testLayer = createTestLayerWithMocks({
          projects: [],
          issues: [],
          statuses: []
        })

        const error = yield* Effect.flip(
          deleteIssue({
            project: "NONEXISTENT",
            identifier: "1"
          }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("ProjectNotFoundError")
        expect((error as ProjectNotFoundError).identifier).toBe("NONEXISTENT")
      }))

    // test-revizorro: approved
    it.effect("returns IssueNotFoundError when issue does not exist", () =>
      Effect.gen(function*() {
        const project = makeProject({ identifier: "TEST" })
        const statuses = [makeStatus({ _id: "status-open" as Ref<Status>, name: "Open" })]

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [],
          statuses
        })

        const error = yield* Effect.flip(
          deleteIssue({
            project: "TEST",
            identifier: "TEST-999"
          }).pipe(Effect.provide(testLayer))
        )

        expect(error._tag).toBe("IssueNotFoundError")
        expect((error as IssueNotFoundError).identifier).toBe("TEST-999")
      }))

    // test-revizorro: approved
    it.effect("deletes issue found by numeric identifier", () =>
      Effect.gen(function*() {
        const project = makeProject({ identifier: "TEST" })
        const issue = makeIssue({ identifier: "TEST-42", number: 42 })
        const statuses = [makeStatus({ _id: "status-open" as Ref<Status>, name: "Open" })]
        const captureRemoveDoc: MockConfig["captureRemoveDoc"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          statuses,
          captureRemoveDoc
        })

        const result = yield* deleteIssue({
          project: "TEST",
          identifier: "42"
        }).pipe(Effect.provide(testLayer))

        expect(result.identifier).toBe("TEST-42")
        expect(result.deleted).toBe(true)
      }))
  })

  describe("addLabel - tagElement undefined after creation (line 622-623)", () => {
    // test-revizorro: approved
    it.effect("returns labelAdded=false when tag element not found after creation", () =>
      Effect.gen(function*() {
        const project = makeProject({ identifier: "TEST" })
        const issue = makeIssue({ identifier: "TEST-1", number: 1 })

        const captureAddCollection: MockConfig["captureAddCollection"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          tagElements: [],
          tagReferences: [],
          captureAddCollection,
          tagElementCreateReturnsUndefined: true
        })

        const result = yield* addLabel({
          project: "TEST",
          identifier: "TEST-1",
          label: "NewTag"
        }).pipe(Effect.provide(testLayer))

        expect(result.identifier).toBe("TEST-1")
        expect(result.labelAdded).toBe(false)
        // addCollection for TagReference should not have been called
        expect(captureAddCollection.attributes).toBeUndefined()
      }))
  })

  describe("updateIssue - description update in place (line 503-512)", () => {
    // test-revizorro: approved
    it.effect("updates description in place when issue already has one", () =>
      Effect.gen(function*() {
        const project = makeProject({ identifier: "TEST" })
        const issue = makeIssue({
          identifier: "TEST-1",
          description: "existing-markup-ref" as MarkupBlobRef
        })
        const statuses = [makeStatus({ _id: "status-open" as Ref<Status>, name: "Open" })]

        const captureUpdateDoc: MockConfig["captureUpdateDoc"] = {}
        const captureUpdateMarkup: MockConfig["captureUpdateMarkup"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          statuses,
          captureUpdateDoc,
          captureUpdateMarkup
        })

        const result = yield* updateIssue({
          project: "TEST",
          identifier: "TEST-1",
          description: "# Updated Description"
        }).pipe(Effect.provide(testLayer))

        expect(result.updated).toBe(true)
        expect(captureUpdateMarkup.markup).toBe("# Updated Description")
        // Should NOT have set description in updateOps (it was updated in place)
        expect(captureUpdateDoc.operations?.description).toBeUndefined()
      }))

    // test-revizorro: scheduled
    it.effect("returns updated=true when only description is updated in place (no other updateOps)", () =>
      Effect.gen(function*() {
        const project = makeProject({ identifier: "TEST" })
        const issue = makeIssue({
          identifier: "TEST-1",
          description: "existing-markup-ref" as MarkupBlobRef
        })
        const statuses = [makeStatus({ _id: "status-open" as Ref<Status>, name: "Open" })]

        const captureUpdateMarkup: MockConfig["captureUpdateMarkup"] = {}

        const testLayer = createTestLayerWithMocks({
          projects: [project],
          issues: [issue],
          statuses,
          captureUpdateMarkup
        })

        const result = yield* updateIssue({
          project: "TEST",
          identifier: "TEST-1",
          description: "# Only desc updated"
        }).pipe(Effect.provide(testLayer))

        // Even though updateOps is empty, descriptionUpdatedInPlace should be true
        expect(result.updated).toBe(true)
        expect(captureUpdateMarkup.markup).toBe("# Only desc updated")
      }))
  })
})
