import { describe, it } from "@effect/vitest"
import type { Person as HulyPerson } from "@hcengineering/contact"
import type { Doc, PersonId, Ref, Space } from "@hcengineering/core"
import { toFindResult } from "@hcengineering/core"
import { Effect } from "effect"
import { expect } from "vitest"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import type { TestCaseNotFoundError, TestSuiteNotFoundError } from "../../../src/huly/errors.js"
import { contact } from "../../../src/huly/huly-plugins.js"
import {
  createTestCase,
  createTestSuite,
  deleteTestCase,
  deleteTestSuite,
  getTestCase,
  getTestSuite,
  listTestCases,
  listTestProjects,
  listTestSuites,
  updateTestCase,
  updateTestSuite
} from "../../../src/huly/operations/test-management-core.js"
import { testManagement } from "../../../src/huly/test-management-classes.js"
import {
  type TestCase,
  TestCasePriority,
  TestCaseStatus,
  TestCaseType,
  type TestProject,
  type TestSuite
} from "../../../src/huly/test-management-types.js"
import { assertAt } from "../../../src/utils/assertions.js"
import { testCaseIdentifier, testProjectIdentifier, testSuiteIdentifier } from "../../helpers/brands.js"

const makeTestProject = (overrides?: Partial<TestProject>): TestProject => {
  const base = {
    _id: "tp-1" as Ref<TestProject>,
    _class: testManagement.class.TestProject,
    name: "QA Project",
    description: "Test project",
    private: false,
    archived: false,
    members: [],
    space: "tp-1" as Ref<Space>,
    modifiedBy: "user-1" as PersonId,
    modifiedOn: 0,
    createdBy: "user-1" as PersonId,
    createdOn: 0,
    ...overrides
  }
  return base as TestProject
}

const makeTestSuite = (overrides?: Partial<TestSuite>): TestSuite => {
  const base = {
    _id: "ts-1" as Ref<TestSuite>,
    _class: testManagement.class.TestSuite,
    space: "tp-1" as Ref<TestProject>,
    name: "Login Suite",
    description: "Login tests",
    // eslint-disable-next-line no-restricted-syntax -- Ref<Class<TestProject>> -> Ref<TestSuite> bridge for test factory
    parent: testManagement.class.TestProject as unknown as Ref<TestSuite>,
    modifiedBy: "user-1" as PersonId,
    modifiedOn: 0,
    createdBy: "user-1" as PersonId,
    createdOn: 0,
    ...overrides
  }
  return base as TestSuite
}

const makeTestCase = (overrides?: Partial<TestCase>): TestCase => {
  const base = {
    _id: "tc-1" as Ref<TestCase>,
    _class: testManagement.class.TestCase,
    space: "tp-1" as Ref<TestProject>,
    attachedTo: "ts-1" as Ref<Doc>,
    attachedToClass: testManagement.class.TestSuite,
    collection: "testCases",
    name: "Login with valid creds",
    description: null,
    type: TestCaseType.Functional,
    priority: TestCasePriority.Medium,
    status: TestCaseStatus.Draft,
    assignee: null,
    modifiedBy: "user-1" as PersonId,
    modifiedOn: 0,
    createdBy: "user-1" as PersonId,
    createdOn: 0,
    ...overrides
  }
  return base as TestCase
}

interface MockConfig {
  readonly projects?: ReadonlyArray<TestProject>
  readonly suites?: ReadonlyArray<TestSuite>
  readonly cases?: ReadonlyArray<TestCase>
  readonly persons?: ReadonlyArray<HulyPerson>
  readonly captureCreateDoc?: { attributes?: Record<string, unknown>; id?: string }
  readonly captureAddCollection?: { attributes?: Record<string, unknown>; id?: string }
  readonly captureUpdateDoc?: { operations?: Record<string, unknown> }
  readonly captureRemoveDoc?: { called?: boolean; objectId?: string }
  readonly captureUploadMarkup?: { markup?: string }
}

const createTestLayerWithMocks = (config: MockConfig) => {
  const projects = config.projects ?? []
  const suites = config.suites ?? []
  const cases = config.cases ?? []
  const persons = config.persons ?? []

  const findAllImpl: HulyClientOperations["findAll"] = ((_class: unknown, query: unknown) => {
    const q = query as Record<string, unknown>
    if (_class === testManagement.class.TestProject) {
      return Effect.succeed(toFindResult([...projects]))
    }
    if (_class === testManagement.class.TestSuite) {
      let filtered = suites.filter((s) => !q.space || s.space === q.space)
      if (q.parent) {
        filtered = filtered.filter((s) => s.parent === q.parent)
      }
      return Effect.succeed(toFindResult([...filtered]))
    }
    if (_class === testManagement.class.TestCase) {
      let filtered = cases.filter((tc) => !q.space || tc.space === q.space)
      if (q.attachedTo) {
        filtered = filtered.filter((tc) => tc.attachedTo === q.attachedTo)
      }
      if (q.assignee) {
        filtered = filtered.filter((tc) => tc.assignee === q.assignee)
      }
      return Effect.succeed(toFindResult([...filtered]))
    }
    return Effect.succeed(toFindResult([]))
  }) as HulyClientOperations["findAll"]

  const findOneImpl: HulyClientOperations["findOne"] = ((_class: unknown, query: unknown) => {
    const q = query as Record<string, unknown>
    if (_class === testManagement.class.TestProject) {
      const found = projects.find((p) => (q._id && p._id === q._id) || (q.name && p.name === q.name))
      return Effect.succeed(found)
    }
    if (_class === testManagement.class.TestSuite) {
      const found = suites.find(
        (s) =>
          ((q._id && s._id === q._id) || (q.name && s.name === q.name))
          && (!q.space || s.space === q.space)
      )
      return Effect.succeed(found)
    }
    if (_class === testManagement.class.TestCase) {
      const found = cases.find(
        (tc) =>
          ((q._id && tc._id === q._id) || (q.name && tc.name === q.name))
          && (!q.space || tc.space === q.space)
      )
      return Effect.succeed(found)
    }
    if (_class === contact.class.Person) {
      return Effect.succeed(persons.find((p) => (q._id && p._id === q._id) || (q.name && p.name === q.name)))
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
    return Effect.succeed((id ?? "new-id") as Ref<Doc>)
  }) as HulyClientOperations["createDoc"]

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
      config.captureAddCollection.attributes = attributes as Record<string, unknown>
      config.captureAddCollection.id = id as string
    }
    return Effect.succeed((id ?? "new-id") as Ref<Doc>)
  }) as HulyClientOperations["addCollection"]

  const updateDocImpl: HulyClientOperations["updateDoc"] = (
    (_class: unknown, _space: unknown, _objectId: unknown, operations: unknown) => {
      if (config.captureUpdateDoc) {
        config.captureUpdateDoc.operations = operations as Record<string, unknown>
      }
      return Effect.succeed({} as never)
    }
  ) as HulyClientOperations["updateDoc"]

  const removeDocImpl: HulyClientOperations["removeDoc"] = (
    (_class: unknown, _space: unknown, objectId: unknown) => {
      if (config.captureRemoveDoc) {
        config.captureRemoveDoc.called = true
        config.captureRemoveDoc.objectId = objectId as string
      }
      return Effect.succeed({} as never)
    }
  ) as HulyClientOperations["removeDoc"]

  const uploadMarkupImpl: HulyClientOperations["uploadMarkup"] = ((
    _class: unknown,
    _id: unknown,
    _attr: unknown,
    markup: unknown
  ) => {
    if (config.captureUploadMarkup) {
      config.captureUploadMarkup.markup = markup as string
    }
    return Effect.succeed("markup-ref" as never)
  }) as HulyClientOperations["uploadMarkup"]

  const fetchMarkupImpl: HulyClientOperations["fetchMarkup"] = (
    () => Effect.succeed("fetched content")
  ) as HulyClientOperations["fetchMarkup"]

  return HulyClient.testLayer({
    findAll: findAllImpl,
    findOne: findOneImpl,
    createDoc: createDocImpl,
    addCollection: addCollectionImpl,
    updateDoc: updateDocImpl,
    removeDoc: removeDocImpl,
    uploadMarkup: uploadMarkupImpl,
    fetchMarkup: fetchMarkupImpl
  })
}

describe("listTestProjects", () => {
  it.effect("returns projects", () =>
    Effect.gen(function*() {
      const projects = [
        makeTestProject({ _id: "tp-1" as Ref<TestProject>, name: "Alpha" }),
        makeTestProject({ _id: "tp-2" as Ref<TestProject>, name: "Beta" })
      ]
      const testLayer = createTestLayerWithMocks({ projects })

      const result = yield* listTestProjects({}).pipe(Effect.provide(testLayer))

      expect(result.projects).toHaveLength(2)
      expect(assertAt(result.projects, 0).name).toBe("Alpha")
      expect(assertAt(result.projects, 1).name).toBe("Beta")
    }))

  it.effect("returns empty when no projects", () =>
    Effect.gen(function*() {
      const testLayer = createTestLayerWithMocks({ projects: [] })

      const result = yield* listTestProjects({}).pipe(Effect.provide(testLayer))

      expect(result.projects).toHaveLength(0)
      expect(result.total).toBe(0)
    }))
})

describe("listTestSuites", () => {
  it.effect("returns suites in project", () =>
    Effect.gen(function*() {
      const project = makeTestProject()
      const suites = [
        makeTestSuite({ _id: "ts-1" as Ref<TestSuite>, name: "Suite A" }),
        makeTestSuite({ _id: "ts-2" as Ref<TestSuite>, name: "Suite B" })
      ]
      const testLayer = createTestLayerWithMocks({ projects: [project], suites })

      const result = yield* listTestSuites({
        project: testProjectIdentifier("QA Project")
      }).pipe(Effect.provide(testLayer))

      expect(result.suites).toHaveLength(2)
    }))

  it.effect("filters by parent suite", () =>
    Effect.gen(function*() {
      const project = makeTestProject()
      const parentSuite = makeTestSuite({ _id: "ts-parent" as Ref<TestSuite>, name: "Parent" })
      const childSuite = makeTestSuite({
        _id: "ts-child" as Ref<TestSuite>,
        name: "Child",
        parent: "ts-parent" as Ref<TestSuite>
      })
      const otherSuite = makeTestSuite({ _id: "ts-other" as Ref<TestSuite>, name: "Other" })

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        suites: [parentSuite, childSuite, otherSuite]
      })

      const result = yield* listTestSuites({
        project: testProjectIdentifier("QA Project"),
        parent: testSuiteIdentifier("Parent")
      }).pipe(Effect.provide(testLayer))

      expect(result.suites).toHaveLength(1)
      expect(assertAt(result.suites, 0).name).toBe("Child")
    }))
})

describe("getTestSuite", () => {
  it.effect("returns suite with case count", () =>
    Effect.gen(function*() {
      const project = makeTestProject()
      const suite = makeTestSuite()
      const tc = makeTestCase({ attachedTo: suite._id as Ref<Doc> })

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        suites: [suite],
        cases: [tc]
      })

      const result = yield* getTestSuite({
        project: testProjectIdentifier("QA Project"),
        suite: testSuiteIdentifier("Login Suite")
      }).pipe(Effect.provide(testLayer))

      expect(result.name).toBe("Login Suite")
      expect(result.testCases).toBe(1)
    }))
})

describe("createTestSuite", () => {
  it.effect("creates new suite", () =>
    Effect.gen(function*() {
      const project = makeTestProject()
      const captureCreateDoc: { attributes?: Record<string, unknown>; id?: string } = {}

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        suites: [],
        captureCreateDoc
      })

      const result = yield* createTestSuite({
        project: testProjectIdentifier("QA Project"),
        name: "New Suite"
      }).pipe(Effect.provide(testLayer))

      expect(result.name).toBe("New Suite")
      expect(result.created).toBe(true)
      expect(captureCreateDoc.attributes?.name).toBe("New Suite")
    }))

  it.effect("returns existing suite (idempotent)", () =>
    Effect.gen(function*() {
      const project = makeTestProject()
      const existing = makeTestSuite({ name: "Existing" })
      const captureCreateDoc: { attributes?: Record<string, unknown>; id?: string } = {}

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        suites: [existing],
        captureCreateDoc
      })

      const result = yield* createTestSuite({
        project: testProjectIdentifier("QA Project"),
        name: "Existing"
      }).pipe(Effect.provide(testLayer))

      expect(result.id).toBe("ts-1")
      expect(result.created).toBe(false)
      expect(captureCreateDoc.attributes).toBeUndefined()
    }))
})

describe("updateTestSuite", () => {
  it.effect("updates name", () =>
    Effect.gen(function*() {
      const project = makeTestProject()
      const suite = makeTestSuite()
      const captureUpdateDoc: { operations?: Record<string, unknown> } = {}

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        suites: [suite],
        captureUpdateDoc
      })

      const result = yield* updateTestSuite({
        project: testProjectIdentifier("QA Project"),
        suite: testSuiteIdentifier("Login Suite"),
        name: "Updated Suite"
      }).pipe(Effect.provide(testLayer))

      expect(result.updated).toBe(true)
      expect(captureUpdateDoc.operations?.name).toBe("Updated Suite")
    }))

  it.effect("fails when no fields provided", () =>
    Effect.gen(function*() {
      const project = makeTestProject()
      const suite = makeTestSuite()

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        suites: [suite]
      })

      const error = yield* Effect.flip(
        updateTestSuite({
          project: testProjectIdentifier("QA Project"),
          suite: testSuiteIdentifier("Login Suite")
        }).pipe(Effect.provide(testLayer))
      )

      expect(error._tag).toBe("NoUpdateFieldsError")
    }))

  it.effect("returns TestSuiteNotFoundError for nonexistent suite", () =>
    Effect.gen(function*() {
      const project = makeTestProject()
      const testLayer = createTestLayerWithMocks({ projects: [project], suites: [] })

      const error = yield* Effect.flip(
        updateTestSuite({
          project: testProjectIdentifier("QA Project"),
          suite: testSuiteIdentifier("nonexistent"),
          name: "new"
        }).pipe(Effect.provide(testLayer))
      )

      expect(error._tag).toBe("TestSuiteNotFoundError")
      expect((error as TestSuiteNotFoundError).identifier).toBe("nonexistent")
    }))
})

describe("deleteTestSuite", () => {
  it.effect("deletes suite", () =>
    Effect.gen(function*() {
      const project = makeTestProject()
      const suite = makeTestSuite()
      const captureRemoveDoc: { called?: boolean; objectId?: string } = {}

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        suites: [suite],
        captureRemoveDoc
      })

      const result = yield* deleteTestSuite({
        project: testProjectIdentifier("QA Project"),
        suite: testSuiteIdentifier("Login Suite")
      }).pipe(Effect.provide(testLayer))

      expect(result.id).toBe("ts-1")
      expect(result.deleted).toBe(true)
      expect(captureRemoveDoc.called).toBe(true)
    }))

  it.effect("returns TestSuiteNotFoundError for nonexistent suite", () =>
    Effect.gen(function*() {
      const project = makeTestProject()
      const testLayer = createTestLayerWithMocks({ projects: [project], suites: [] })

      const error = yield* Effect.flip(
        deleteTestSuite({
          project: testProjectIdentifier("QA Project"),
          suite: testSuiteIdentifier("nonexistent")
        }).pipe(Effect.provide(testLayer))
      )

      expect(error._tag).toBe("TestSuiteNotFoundError")
    }))
})

describe("listTestCases", () => {
  it.effect("returns cases in project", () =>
    Effect.gen(function*() {
      const project = makeTestProject()
      const tc1 = makeTestCase({ _id: "tc-1" as Ref<TestCase>, name: "Case 1" })
      const tc2 = makeTestCase({ _id: "tc-2" as Ref<TestCase>, name: "Case 2" })

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        cases: [tc1, tc2]
      })

      const result = yield* listTestCases({
        project: testProjectIdentifier("QA Project")
      }).pipe(Effect.provide(testLayer))

      expect(result.testCases).toHaveLength(2)
    }))

  it.effect("filters by suite", () =>
    Effect.gen(function*() {
      const project = makeTestProject()
      const suite = makeTestSuite()
      const inSuite = makeTestCase({
        _id: "tc-1" as Ref<TestCase>,
        name: "In suite",
        attachedTo: suite._id as Ref<Doc>
      })
      const outSuite = makeTestCase({
        _id: "tc-2" as Ref<TestCase>,
        name: "Other suite",
        attachedTo: "ts-other" as Ref<Doc>
      })

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        suites: [suite],
        cases: [inSuite, outSuite]
      })

      const result = yield* listTestCases({
        project: testProjectIdentifier("QA Project"),
        suite: testSuiteIdentifier("Login Suite")
      }).pipe(Effect.provide(testLayer))

      expect(result.testCases).toHaveLength(1)
      expect(assertAt(result.testCases, 0).name).toBe("In suite")
    }))
})

describe("getTestCase", () => {
  it.effect("returns test case", () =>
    Effect.gen(function*() {
      const project = makeTestProject()
      const tc = makeTestCase()

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        cases: [tc]
      })

      const result = yield* getTestCase({
        project: testProjectIdentifier("QA Project"),
        testCase: testCaseIdentifier("Login with valid creds")
      }).pipe(Effect.provide(testLayer))

      expect(result.name).toBe("Login with valid creds")
      expect(result.type).toBe("functional")
      expect(result.priority).toBe("medium")
      expect(result.status).toBe("draft")
    }))
})

describe("createTestCase", () => {
  it.effect("creates test case via addCollection", () =>
    Effect.gen(function*() {
      const project = makeTestProject()
      const suite = makeTestSuite()
      const captureAddCollection: { attributes?: Record<string, unknown>; id?: string } = {}

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        suites: [suite],
        cases: [],
        captureAddCollection
      })

      const result = yield* createTestCase({
        project: testProjectIdentifier("QA Project"),
        suite: testSuiteIdentifier("Login Suite"),
        name: "New Test Case"
      }).pipe(Effect.provide(testLayer))

      expect(result.name).toBe("New Test Case")
      expect(result.created).toBe(true)
      expect(captureAddCollection.attributes?.name).toBe("New Test Case")
      expect(captureAddCollection.attributes?.type).toBe(TestCaseType.Functional)
      expect(captureAddCollection.attributes?.priority).toBe(TestCasePriority.Medium)
      expect(captureAddCollection.attributes?.status).toBe(TestCaseStatus.Draft)
    }))

  it.effect("creates with explicit type and priority", () =>
    Effect.gen(function*() {
      const project = makeTestProject()
      const suite = makeTestSuite()
      const captureAddCollection: { attributes?: Record<string, unknown>; id?: string } = {}

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        suites: [suite],
        cases: [],
        captureAddCollection
      })

      const result = yield* createTestCase({
        project: testProjectIdentifier("QA Project"),
        suite: testSuiteIdentifier("Login Suite"),
        name: "Perf Test",
        type: "performance",
        priority: "high",
        status: "approved"
      }).pipe(Effect.provide(testLayer))

      expect(result.created).toBe(true)
      expect(captureAddCollection.attributes?.type).toBe(TestCaseType.Performance)
      expect(captureAddCollection.attributes?.priority).toBe(TestCasePriority.High)
      expect(captureAddCollection.attributes?.status).toBe(TestCaseStatus.Approved)
    }))
})

describe("updateTestCase", () => {
  it.effect("updates name and type", () =>
    Effect.gen(function*() {
      const project = makeTestProject()
      const tc = makeTestCase()
      const captureUpdateDoc: { operations?: Record<string, unknown> } = {}

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        cases: [tc],
        captureUpdateDoc
      })

      const result = yield* updateTestCase({
        project: testProjectIdentifier("QA Project"),
        testCase: testCaseIdentifier("Login with valid creds"),
        name: "Updated Name",
        type: "regression"
      }).pipe(Effect.provide(testLayer))

      expect(result.updated).toBe(true)
      expect(captureUpdateDoc.operations?.name).toBe("Updated Name")
      expect(captureUpdateDoc.operations?.type).toBe(TestCaseType.Regression)
    }))

  it.effect("fails when no fields provided", () =>
    Effect.gen(function*() {
      const project = makeTestProject()
      const tc = makeTestCase()

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        cases: [tc]
      })

      const error = yield* Effect.flip(
        updateTestCase({
          project: testProjectIdentifier("QA Project"),
          testCase: testCaseIdentifier("Login with valid creds")
        }).pipe(Effect.provide(testLayer))
      )

      expect(error._tag).toBe("NoUpdateFieldsError")
    }))
})

describe("deleteTestCase", () => {
  it.effect("deletes test case", () =>
    Effect.gen(function*() {
      const project = makeTestProject()
      const tc = makeTestCase()
      const captureRemoveDoc: { called?: boolean; objectId?: string } = {}

      const testLayer = createTestLayerWithMocks({
        projects: [project],
        cases: [tc],
        captureRemoveDoc
      })

      const result = yield* deleteTestCase({
        project: testProjectIdentifier("QA Project"),
        testCase: testCaseIdentifier("Login with valid creds")
      }).pipe(Effect.provide(testLayer))

      expect(result.id).toBe("tc-1")
      expect(result.deleted).toBe(true)
      expect(captureRemoveDoc.called).toBe(true)
    }))

  it.effect("returns TestCaseNotFoundError for nonexistent case", () =>
    Effect.gen(function*() {
      const project = makeTestProject()
      const testLayer = createTestLayerWithMocks({ projects: [project], cases: [] })

      const error = yield* Effect.flip(
        deleteTestCase({
          project: testProjectIdentifier("QA Project"),
          testCase: testCaseIdentifier("nonexistent")
        }).pipe(Effect.provide(testLayer))
      )

      expect(error._tag).toBe("TestCaseNotFoundError")
      expect((error as TestCaseNotFoundError).identifier).toBe("nonexistent")
    }))
})

const makePerson = (id: string, name: string): HulyPerson => {
  const base = {
    _id: id as Ref<HulyPerson>,
    _class: contact.class.Person,
    name,
    city: "",
    modifiedBy: "user-1" as PersonId,
    modifiedOn: 0,
    createdBy: "user-1" as PersonId,
    createdOn: 0
  }
  // eslint-disable-next-line no-restricted-syntax -- SDK Person nominal type has no object-literal constructor
  return base as unknown as HulyPerson
}

describe("createTestCase — optional fields", () => {
  it.effect("uploads a non-empty description and resolves an assignee", () =>
    Effect.gen(function*() {
      const captureAddCollection: { attributes?: Record<string, unknown>; id?: string } = {}
      const captureUploadMarkup: { markup?: string } = {}
      const layer = createTestLayerWithMocks({
        projects: [makeTestProject()],
        suites: [makeTestSuite()],
        persons: [makePerson("person-1", "Alice")],
        captureAddCollection,
        captureUploadMarkup
      })

      yield* createTestCase({
        project: testProjectIdentifier("QA Project"),
        suite: testSuiteIdentifier("Login Suite"),
        name: "With desc",
        description: "Detailed steps",
        assignee: "Alice"
      }).pipe(Effect.provide(layer))

      expect(captureUploadMarkup.markup).toBe("Detailed steps")
      expect(captureAddCollection.attributes?.description).toBe("markup-ref")
      expect(captureAddCollection.attributes?.assignee).toBe("person-1")
    }))

  it.effect("treats a whitespace-only description as no description", () =>
    Effect.gen(function*() {
      const captureAddCollection: { attributes?: Record<string, unknown>; id?: string } = {}
      const layer = createTestLayerWithMocks({
        projects: [makeTestProject()],
        suites: [makeTestSuite()],
        captureAddCollection
      })

      yield* createTestCase({
        project: testProjectIdentifier("QA Project"),
        suite: testSuiteIdentifier("Login Suite"),
        name: "Blank desc",
        description: "   "
      }).pipe(Effect.provide(layer))

      expect(captureAddCollection.attributes?.description).toBeNull()
    }))
})

describe("updateTestCase — optional fields", () => {
  const baseCase = () =>
    makeTestCase({ _id: "tc-1" as Ref<TestCase>, name: "Case 1", attachedTo: "ts-1" as Ref<TestSuite> })

  it.effect("uploads a new description and updates priority + status", () =>
    Effect.gen(function*() {
      const captureUpdateDoc: { operations?: Record<string, unknown> } = {}
      const captureUploadMarkup: { markup?: string } = {}
      const layer = createTestLayerWithMocks({
        projects: [makeTestProject()],
        suites: [makeTestSuite()],
        cases: [baseCase()],
        captureUpdateDoc,
        captureUploadMarkup
      })

      yield* updateTestCase({
        project: testProjectIdentifier("QA Project"),
        testCase: testCaseIdentifier("Case 1"),
        description: "Revised",
        priority: "high",
        status: "approved"
      }).pipe(Effect.provide(layer))

      expect(captureUploadMarkup.markup).toBe("Revised")
      expect(captureUpdateDoc.operations?.description).toBe("markup-ref")
      expect(captureUpdateDoc.operations?.priority).toBe(TestCasePriority.High)
      expect(captureUpdateDoc.operations?.status).toBe(TestCaseStatus.Approved)
    }))

  it.effect("clears description and assignee when set to null", () =>
    Effect.gen(function*() {
      const captureUpdateDoc: { operations?: Record<string, unknown> } = {}
      const layer = createTestLayerWithMocks({
        projects: [makeTestProject()],
        suites: [makeTestSuite()],
        cases: [baseCase()],
        captureUpdateDoc
      })

      yield* updateTestCase({
        project: testProjectIdentifier("QA Project"),
        testCase: testCaseIdentifier("Case 1"),
        description: null,
        assignee: null
      }).pipe(Effect.provide(layer))

      expect(captureUpdateDoc.operations?.description).toBeNull()
      expect(captureUpdateDoc.operations?.assignee).toBeNull()
    }))

  it.effect("resolves an assignee by name", () =>
    Effect.gen(function*() {
      const captureUpdateDoc: { operations?: Record<string, unknown> } = {}
      const layer = createTestLayerWithMocks({
        projects: [makeTestProject()],
        suites: [makeTestSuite()],
        cases: [baseCase()],
        persons: [makePerson("person-2", "Bob")],
        captureUpdateDoc
      })

      yield* updateTestCase({
        project: testProjectIdentifier("QA Project"),
        testCase: testCaseIdentifier("Case 1"),
        assignee: "Bob"
      }).pipe(Effect.provide(layer))

      expect(captureUpdateDoc.operations?.assignee).toBe("person-2")
    }))
})

describe("test-management-core summary and filter branches", () => {
  it.effect("omits description for a project without one", () =>
    Effect.gen(function*() {
      const result = yield* listTestProjects({}).pipe(
        Effect.provide(createTestLayerWithMocks({ projects: [makeTestProject({ description: "" })] }))
      )
      expect(assertAt(result.projects, 0).description).toBeUndefined()
    }))

  it.effect("filters test cases by assignee and surfaces it in the summary", () =>
    Effect.gen(function*() {
      // eslint-disable-next-line no-restricted-syntax -- Ref<Employee> brand has no runtime constructor
      const assigneeRef = "person-2" as unknown as TestCase["assignee"]
      const assignedCase = makeTestCase({ _id: "tc-9" as Ref<TestCase>, name: "Assigned", assignee: assigneeRef })
      const result = yield* listTestCases({
        project: testProjectIdentifier("QA Project"),
        assignee: "Bob"
      }).pipe(
        Effect.provide(createTestLayerWithMocks({
          projects: [makeTestProject()],
          suites: [makeTestSuite()],
          cases: [assignedCase],
          persons: [makePerson("person-2", "Bob")]
        }))
      )
      expect(result.testCases).toHaveLength(1)
      expect(assertAt(result.testCases, 0).assignee).toBe("person-2")
    }))
})

describe("updateTestSuite — description branch", () => {
  it.effect("unsets the description when set to null", () =>
    Effect.gen(function*() {
      const captureUpdateDoc: { operations?: Record<string, unknown> } = {}
      yield* updateTestSuite({
        project: testProjectIdentifier("QA Project"),
        suite: testSuiteIdentifier("Login Suite"),
        description: null
      }).pipe(Effect.provide(createTestLayerWithMocks({
        projects: [makeTestProject()],
        suites: [makeTestSuite()],
        captureUpdateDoc
      })))
      expect(captureUpdateDoc.operations?.$unset).toEqual({ description: "" })
    }))

  it.effect("sets a new description string", () =>
    Effect.gen(function*() {
      const captureUpdateDoc: { operations?: Record<string, unknown> } = {}
      yield* updateTestSuite({
        project: testProjectIdentifier("QA Project"),
        suite: testSuiteIdentifier("Login Suite"),
        description: "New description"
      }).pipe(Effect.provide(createTestLayerWithMocks({
        projects: [makeTestProject()],
        suites: [makeTestSuite()],
        captureUpdateDoc
      })))
      expect(captureUpdateDoc.operations?.description).toBe("New description")
    }))
})

describe("test suite summary and createTestSuite parent branches", () => {
  it.effect("omits description and parent for a bare suite", () =>
    Effect.gen(function*() {
      const bare = makeTestSuite({ _id: "ts-bare" as Ref<TestSuite>, name: "Bare Suite" })
      // eslint-disable-next-line no-restricted-syntax -- removing optional SDK fields from a nominal fixture
      const bareRecord = bare as unknown as Record<string, unknown>
      delete bareRecord.description
      delete bareRecord.parent
      const result = yield* listTestSuites({
        project: testProjectIdentifier("QA Project")
      }).pipe(Effect.provide(createTestLayerWithMocks({ projects: [makeTestProject()], suites: [bare] })))
      expect(assertAt(result.suites, 0).description).toBeUndefined()
      expect(assertAt(result.suites, 0).parent).toBeUndefined()
    }))

  it.effect("creates a child suite under an explicit parent suite", () =>
    Effect.gen(function*() {
      const captureCreateDoc: { attributes?: Record<string, unknown>; id?: string } = {}
      const parent = makeTestSuite({ _id: "ts-parent" as Ref<TestSuite>, name: "Parent Suite" })
      yield* createTestSuite({
        project: testProjectIdentifier("QA Project"),
        name: "Child Suite",
        parent: testSuiteIdentifier("Parent Suite")
      }).pipe(Effect.provide(createTestLayerWithMocks({
        projects: [makeTestProject()],
        suites: [parent],
        captureCreateDoc
      })))
      expect(captureCreateDoc.attributes?.parent).toBe("ts-parent")
    }))

  it.effect("includes a fetched description in the test case detail", () =>
    Effect.gen(function*() {
      const described = makeTestCase({
        _id: "tc-desc" as Ref<TestCase>,
        name: "Described",
        // eslint-disable-next-line no-restricted-syntax -- MarkupBlobRef brand has no runtime constructor
        description: "markup-ref" as unknown as TestCase["description"]
      })
      const result = yield* getTestCase({
        project: testProjectIdentifier("QA Project"),
        testCase: testCaseIdentifier("Described")
      }).pipe(Effect.provide(createTestLayerWithMocks({
        projects: [makeTestProject()],
        suites: [makeTestSuite()],
        cases: [described]
      })))
      expect(result.description).toBe("fetched content")
    }))
})

describe("createTestCase + getTestCase enum and optional branches", () => {
  it.effect("returns a case summary without description or suite when both are absent", () =>
    Effect.gen(function*() {
      // eslint-disable-next-line no-restricted-syntax -- Ref<Doc> brand has no runtime constructor
      const noSuite = null as unknown as TestCase["attachedTo"]
      const bareCase = makeTestCase({
        _id: "tc-bare" as Ref<TestCase>,
        name: "Bare",
        description: null,
        attachedTo: noSuite
      })
      const result = yield* getTestCase({
        project: testProjectIdentifier("QA Project"),
        testCase: testCaseIdentifier("Bare")
      }).pipe(Effect.provide(createTestLayerWithMocks({
        projects: [makeTestProject()],
        suites: [makeTestSuite()],
        cases: [bareCase]
      })))
      expect(result.description).toBeUndefined()
      expect(result.suite).toBeUndefined()
    }))
})
