/* eslint-disable no-restricted-syntax -- test mocks require double assertion since local interfaces extend SDK base types not structurally compatible with object literals */
import { describe, it } from "@effect/vitest"
import { type Doc, type MarkupBlobRef, type PersonId, type Ref, toFindResult } from "@hcengineering/core"
import { Effect } from "effect"
import { expect } from "vitest"

import type { Employee, Person as HulyPerson } from "@hcengineering/contact"
import { Timestamp } from "../../../src/domain/schemas/shared.js"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import { contact } from "../../../src/huly/huly-plugins.js"
import {
  createTestResult,
  createTestRun,
  deleteTestResult,
  deleteTestRun,
  getTestResult,
  getTestRun,
  listTestResults,
  listTestRuns,
  runTestPlan,
  updateTestResult,
  updateTestRun
} from "../../../src/huly/operations/test-management-runs.js"
import { testManagement } from "../../../src/huly/test-management-classes.js"
import type {
  TestCase,
  TestPlan,
  TestPlanItem,
  TestProject,
  TestResult,
  TestRun,
  TestSuite
} from "../../../src/huly/test-management-types.js"
import { TestRunStatus } from "../../../src/huly/test-management-types.js"
import {
  testCaseIdentifier,
  testPlanIdentifier,
  testProjectIdentifier,
  testResultIdentifier,
  testRunIdentifier
} from "../../helpers/brands.js"

const PROJECT_ID = "proj-1" as Ref<TestProject>
const RUN_ID = "run-1" as Ref<TestRun>

const makeProject = (): TestProject =>
  ({
    _id: PROJECT_ID,
    _class: testManagement.class.TestProject,
    name: "QA Project",
    description: "",
    private: false,
    archived: false,
    members: [],
    modifiedBy: "u" as PersonId,
    modifiedOn: 0,
    createdBy: "u" as PersonId,
    createdOn: 0
  }) as unknown as TestProject

const makeRun = (overrides?: Partial<TestRun>): TestRun =>
  ({
    _id: RUN_ID,
    _class: testManagement.class.TestRun,
    space: PROJECT_ID,
    name: "Nightly Run",
    description: null,
    modifiedBy: "u" as PersonId,
    modifiedOn: 0,
    createdBy: "u" as PersonId,
    createdOn: 0,
    ...overrides
  }) as unknown as TestRun

const makeResult = (id: string, tcId: string, overrides?: Partial<TestResult>): TestResult =>
  ({
    _id: id as Ref<TestResult>,
    _class: testManagement.class.TestResult,
    space: PROJECT_ID,
    attachedTo: RUN_ID,
    testCase: tcId as Ref<TestCase>,
    name: `Result-${id}`,
    status: TestRunStatus.Untested,
    description: null,
    modifiedBy: "u" as PersonId,
    modifiedOn: 0,
    createdBy: "u" as PersonId,
    createdOn: 0,
    attachedToClass: testManagement.class.TestRun,
    collection: "results",
    ...overrides
  }) as unknown as TestResult

const makeTestCase = (id: string, name: string): TestCase =>
  ({
    _id: id as Ref<TestCase>,
    _class: testManagement.class.TestCase,
    space: PROJECT_ID,
    name,
    description: null,
    modifiedBy: "u" as PersonId,
    modifiedOn: 0,
    createdBy: "u" as PersonId,
    createdOn: 0
  }) as unknown as TestCase

const makePlan = (id: string, name: string): TestPlan =>
  ({
    _id: id as Ref<TestPlan>,
    _class: testManagement.class.TestPlan,
    space: PROJECT_ID,
    name,
    description: null,
    modifiedBy: "u" as PersonId,
    modifiedOn: 0,
    createdBy: "u" as PersonId,
    createdOn: 0
  }) as unknown as TestPlan

const makePlanItem = (id: string, tcId: string, planId: string): TestPlanItem =>
  ({
    _id: id as Ref<TestPlanItem>,
    _class: testManagement.class.TestPlanItem,
    space: PROJECT_ID,
    attachedTo: planId as Ref<TestPlan>,
    testCase: tcId as Ref<TestCase>,
    modifiedBy: "u" as PersonId,
    modifiedOn: 0,
    createdBy: "u" as PersonId,
    createdOn: 0,
    attachedToClass: testManagement.class.TestPlan,
    collection: "items"
  }) as unknown as TestPlanItem

interface MockConfig {
  runs?: Array<TestRun>
  results?: Array<TestResult>
  testCases?: Array<TestCase>
  plans?: Array<TestPlan>
  planItems?: Array<TestPlanItem>
  persons?: Array<HulyPerson>
  captureCreateDoc?: { attributes?: Record<string, unknown>; id?: string }
  captureAddCollection?: Array<Record<string, unknown>>
  captureUpdateDoc?: { operations?: Record<string, unknown> }
  captureRemoveDoc?: { called?: boolean }
}

const makePerson = (id: string, name: string): HulyPerson =>
  ({ _id: id as Ref<HulyPerson>, _class: contact.class.Person, name, city: "" }) as unknown as HulyPerson

const buildLayer = (c: MockConfig) => {
  const project = makeProject()
  const runs = c.runs ?? []
  const results = c.results ?? []
  const testCases = c.testCases ?? []
  const plans = c.plans ?? []
  const planItems = c.planItems ?? []
  const persons = c.persons ?? []

  const findAllImpl: HulyClientOperations["findAll"] = ((_class: unknown, query: unknown) => {
    const q = query as Record<string, unknown>
    if (_class === testManagement.class.TestProject) return Effect.succeed(toFindResult([project]))
    if (_class === testManagement.class.TestRun) {
      return Effect.succeed(toFindResult(runs.filter(r => !q.space || r.space === q.space)))
    }
    if (_class === testManagement.class.TestResult) {
      return Effect.succeed(toFindResult(results.filter(r => !q.attachedTo || r.attachedTo === q.attachedTo)))
    }
    if (_class === testManagement.class.TestPlanItem) {
      return Effect.succeed(toFindResult(planItems.filter(i => !q.attachedTo || i.attachedTo === q.attachedTo)))
    }
    return Effect.succeed(toFindResult([]))
  }) as HulyClientOperations["findAll"]

  const findOneImpl: HulyClientOperations["findOne"] = ((_class: unknown, query: unknown) => {
    const q = query as Record<string, unknown>
    if (_class === testManagement.class.TestProject) {
      return Effect.succeed(q._id === project._id || q.name === project.name ? project : undefined)
    }
    if (_class === testManagement.class.TestRun) {
      return Effect.succeed(runs.find(r => (q._id && r._id === q._id) || (q.name && r.name === q.name)))
    }
    if (_class === testManagement.class.TestResult) {
      return Effect.succeed(results.find(r => (q._id && r._id === q._id) || (q.name && r.name === q.name)))
    }
    if (_class === testManagement.class.TestCase) {
      return Effect.succeed(testCases.find(tc => (q._id && tc._id === q._id) || (q.name && tc.name === q.name)))
    }
    if (_class === testManagement.class.TestPlan) {
      return Effect.succeed(plans.find(p => (q._id && p._id === q._id) || (q.name && p.name === q.name)))
    }
    if (_class === contact.class.Person) {
      return Effect.succeed(persons.find(p => (q._id && p._id === q._id) || (q.name && p.name === q.name)))
    }
    return Effect.succeed(undefined)
  }) as HulyClientOperations["findOne"]

  const createDocImpl: HulyClientOperations["createDoc"] = ((
    _c: unknown,
    _s: unknown,
    attrs: unknown,
    id?: unknown
  ) => {
    if (c.captureCreateDoc) {
      c.captureCreateDoc.attributes = attrs as Record<string, unknown>
      c.captureCreateDoc.id = id as string
    }
    return Effect.succeed((id ?? "new-id") as Ref<Doc>)
  }) as HulyClientOperations["createDoc"]

  let addCollectionCounter = 0
  const addCollectionImpl: HulyClientOperations["addCollection"] = ((
    _c: unknown,
    _s: unknown,
    _at: unknown,
    _ac: unknown,
    _col: unknown,
    attrs: unknown
  ) => {
    const newId = `result-${addCollectionCounter++}` as Ref<Doc>
    if (c.captureAddCollection) c.captureAddCollection.push(attrs as Record<string, unknown>)
    return Effect.succeed(newId)
  }) as HulyClientOperations["addCollection"]

  const updateDocImpl: HulyClientOperations["updateDoc"] = (
    (_c: unknown, _s: unknown, _id: unknown, ops: unknown) => {
      if (c.captureUpdateDoc) c.captureUpdateDoc.operations = ops as Record<string, unknown>
      return Effect.succeed({} as never)
    }
  ) as HulyClientOperations["updateDoc"]

  const removeDocImpl: HulyClientOperations["removeDoc"] = (
    (_c: unknown, _s: unknown, _id: unknown) => {
      if (c.captureRemoveDoc) c.captureRemoveDoc.called = true
      return Effect.succeed({} as never)
    }
  ) as HulyClientOperations["removeDoc"]

  const uploadMarkupImpl: HulyClientOperations["uploadMarkup"] = (
    () => Effect.succeed("markup-ref" as never)
  ) as HulyClientOperations["uploadMarkup"]

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

describe("listTestRuns", () => {
  it.effect("returns runs", () =>
    Effect.gen(function*() {
      const runs = [makeRun(), makeRun({ _id: "run-2" as Ref<TestRun>, name: "Smoke" })]
      const result = yield* listTestRuns({
        project: testProjectIdentifier("QA Project")
      }).pipe(Effect.provide(buildLayer({ runs })))
      expect(result.runs).toHaveLength(2)
    }))
})

describe("getTestRun", () => {
  it.effect("returns run with results", () =>
    Effect.gen(function*() {
      const results = [makeResult("r-1", "tc-1"), makeResult("r-2", "tc-2")]
      const result = yield* getTestRun({
        project: testProjectIdentifier("QA Project"),
        run: testRunIdentifier("Nightly Run")
      }).pipe(Effect.provide(buildLayer({ runs: [makeRun()], results })))
      expect(result.name).toBe("Nightly Run")
      expect(result.results).toHaveLength(2)
    }))
})

describe("createTestRun", () => {
  it.effect("creates run", () =>
    Effect.gen(function*() {
      const cap: MockConfig["captureCreateDoc"] = {}
      const result = yield* createTestRun({
        project: testProjectIdentifier("QA Project"),
        name: "New Run"
      }).pipe(Effect.provide(buildLayer({ captureCreateDoc: cap })))
      expect(result.created).toBe(true)
      expect(cap.attributes?.name).toBe("New Run")
    }))
})

describe("updateTestRun", () => {
  it.effect("fails when no update fields are provided", () =>
    Effect.gen(function*() {
      const err = yield* Effect.flip(
        updateTestRun({
          project: testProjectIdentifier("QA Project"),
          run: testRunIdentifier("Nightly Run")
        }).pipe(Effect.provide(buildLayer({})))
      )
      expect(err._tag).toBe("NoUpdateFieldsError")
    }))

  it.effect("updates run name", () =>
    Effect.gen(function*() {
      const cap: MockConfig["captureUpdateDoc"] = {}
      const result = yield* updateTestRun({
        project: testProjectIdentifier("QA Project"),
        run: testRunIdentifier("Nightly Run"),
        name: "Renamed"
      }).pipe(Effect.provide(buildLayer({ runs: [makeRun()], captureUpdateDoc: cap })))
      expect(result.updated).toBe(true)
      expect(cap.operations?.name).toBe("Renamed")
    }))
})

describe("deleteTestRun", () => {
  it.effect("deletes run", () =>
    Effect.gen(function*() {
      const cap: MockConfig["captureRemoveDoc"] = {}
      const result = yield* deleteTestRun({
        project: testProjectIdentifier("QA Project"),
        run: testRunIdentifier("Nightly Run")
      }).pipe(Effect.provide(buildLayer({ runs: [makeRun()], captureRemoveDoc: cap })))
      expect(result.deleted).toBe(true)
      expect(cap.called).toBe(true)
    }))
})

describe("listTestResults", () => {
  it.effect("returns results in run", () =>
    Effect.gen(function*() {
      const results = [makeResult("r-1", "tc-1"), makeResult("r-2", "tc-2")]
      const result = yield* listTestResults({
        project: testProjectIdentifier("QA Project"),
        run: testRunIdentifier("Nightly Run")
      }).pipe(Effect.provide(buildLayer({ runs: [makeRun()], results })))
      expect(result.results).toHaveLength(2)
    }))
})

describe("getTestResult", () => {
  it.effect("returns result with optional fields", () =>
    Effect.gen(function*() {
      const r = makeResult("r-1", "tc-1", {
        status: TestRunStatus.Passed,
        assignee: "emp-1" as unknown as Ref<Employee>,
        description: "markup-ref" as unknown as MarkupBlobRef
      })
      const detail = yield* getTestResult({
        project: testProjectIdentifier("QA Project"),
        result: testResultIdentifier("r-1")
      }).pipe(Effect.provide(buildLayer({ results: [r] })))
      expect(detail.name).toBe("Result-r-1")
      expect(detail.status).toBe("passed")
      expect(detail.assignee).toBe("emp-1")
      expect(detail.description).toBe("fetched content")
    }))

  it.effect("omits absent optional fields", () =>
    Effect.gen(function*() {
      const base = makeResult("r-1", "tc-1")
      delete (base as unknown as Record<string, unknown>).status
      delete (base as unknown as Record<string, unknown>).assignee
      const detail = yield* getTestResult({
        project: testProjectIdentifier("QA Project"),
        result: testResultIdentifier("r-1")
      }).pipe(Effect.provide(buildLayer({ results: [base] })))
      expect(detail.name).toBe("Result-r-1")
      expect(detail).not.toHaveProperty("status")
      expect(detail).not.toHaveProperty("assignee")
      expect(detail).not.toHaveProperty("description")
    }))
})

describe("createTestResult", () => {
  it.effect("creates result", () =>
    Effect.gen(function*() {
      const cap: Array<Record<string, unknown>> = []
      const tc = makeTestCase("tc-1", "Login Test")
      const result = yield* createTestResult({
        project: testProjectIdentifier("QA Project"),
        run: testRunIdentifier("Nightly Run"),
        testCase: testCaseIdentifier("Login Test")
      }).pipe(Effect.provide(buildLayer({ runs: [makeRun()], testCases: [tc], captureAddCollection: cap })))
      expect(result.created).toBe(true)
      expect(result.name).toBe("Login Test")
      expect(cap[0].testCase).toBe("tc-1")
    }))
})

describe("updateTestResult", () => {
  it.effect("fails when no update fields are provided", () =>
    Effect.gen(function*() {
      const err = yield* Effect.flip(
        updateTestResult({
          project: testProjectIdentifier("QA Project"),
          result: testResultIdentifier("r-1")
        }).pipe(Effect.provide(buildLayer({})))
      )
      expect(err._tag).toBe("NoUpdateFieldsError")
    }))

  it.effect("updates status", () =>
    Effect.gen(function*() {
      const cap: MockConfig["captureUpdateDoc"] = {}
      const r = makeResult("r-1", "tc-1")
      const result = yield* updateTestResult({
        project: testProjectIdentifier("QA Project"),
        result: testResultIdentifier("r-1"),
        status: "passed"
      }).pipe(Effect.provide(buildLayer({ results: [r], captureUpdateDoc: cap })))
      expect(result.updated).toBe(true)
      expect(cap.operations?.status).toBe(TestRunStatus.Passed)
    }))

  it.effect("unassigns when assignee is null", () =>
    Effect.gen(function*() {
      const cap: MockConfig["captureUpdateDoc"] = {}
      const r = makeResult("r-1", "tc-1")
      const result = yield* updateTestResult({
        project: testProjectIdentifier("QA Project"),
        result: testResultIdentifier("r-1"),
        assignee: null
      }).pipe(Effect.provide(buildLayer({ results: [r], captureUpdateDoc: cap })))
      expect(result.updated).toBe(true)
      expect(cap.operations?.$unset).toEqual({ assignee: "" })
    }))
})

describe("deleteTestResult", () => {
  it.effect("deletes result", () =>
    Effect.gen(function*() {
      const cap: MockConfig["captureRemoveDoc"] = {}
      const r = makeResult("r-1", "tc-1")
      const result = yield* deleteTestResult({
        project: testProjectIdentifier("QA Project"),
        result: testResultIdentifier("r-1")
      }).pipe(Effect.provide(buildLayer({ results: [r], captureRemoveDoc: cap })))
      expect(result.deleted).toBe(true)
      expect(cap.called).toBe(true)
    }))
})

describe("runTestPlan", () => {
  it.effect("creates run and results from plan items", () =>
    Effect.gen(function*() {
      const plan = makePlan("p-1", "My Plan")
      const tc1 = makeTestCase("tc-1", "Login")
      const tc2 = makeTestCase("tc-2", "Logout")
      const items = [makePlanItem("pi-1", "tc-1", "p-1"), makePlanItem("pi-2", "tc-2", "p-1")]
      const cap: Array<Record<string, unknown>> = []
      const createCap: MockConfig["captureCreateDoc"] = {}
      const result = yield* runTestPlan({
        project: testProjectIdentifier("QA Project"),
        plan: testPlanIdentifier("My Plan")
      }).pipe(Effect.provide(buildLayer({
        plans: [plan],
        planItems: items,
        testCases: [tc1, tc2],
        captureCreateDoc: createCap,
        captureAddCollection: cap
      })))
      expect(result.name).toBe("My Plan - Run")
      expect(result.resultsCreated).toBe(2)
      expect(createCap.attributes?.name).toBe("My Plan - Run")
      expect(cap).toHaveLength(2)
      expect(cap[0].name).toBe("Login")
      expect(cap[1].name).toBe("Logout")
      expect(cap[0].status).toBe(TestRunStatus.Untested)
    }))

  it.effect("uses custom run name", () =>
    Effect.gen(function*() {
      const plan = makePlan("p-1", "My Plan")
      const createCap: MockConfig["captureCreateDoc"] = {}
      const result = yield* runTestPlan({
        project: testProjectIdentifier("QA Project"),
        plan: testPlanIdentifier("My Plan"),
        runName: "Custom Name"
      }).pipe(Effect.provide(buildLayer({ plans: [plan], captureCreateDoc: createCap })))
      expect(result.name).toBe("Custom Name")
      expect(createCap.attributes?.name).toBe("Custom Name")
    }))
})

describe("updateTestRun — description and dueDate branches", () => {
  it.effect("uploads a description and sets a dueDate", () =>
    Effect.gen(function*() {
      const cap: MockConfig["captureUpdateDoc"] = {}
      yield* updateTestRun({
        project: testProjectIdentifier("QA Project"),
        run: testRunIdentifier("Nightly Run"),
        description: "Run notes",
        dueDate: Timestamp.make(1000)
      }).pipe(Effect.provide(buildLayer({ runs: [makeRun()], captureUpdateDoc: cap })))
      expect(cap.operations?.description).toBe("markup-ref")
      expect(cap.operations?.dueDate).toBe(1000)
    }))

  it.effect("clears description and dueDate when set to null", () =>
    Effect.gen(function*() {
      const cap: MockConfig["captureUpdateDoc"] = {}
      yield* updateTestRun({
        project: testProjectIdentifier("QA Project"),
        run: testRunIdentifier("Nightly Run"),
        description: null,
        dueDate: null
      }).pipe(Effect.provide(buildLayer({ runs: [makeRun()], captureUpdateDoc: cap })))
      expect(cap.operations?.description).toBeNull()
      expect(cap.operations?.$unset).toEqual({ dueDate: "" })
    }))
})

describe("createTestResult — status and assignee branches", () => {
  it.effect("maps an explicit status and resolves an assignee", () =>
    Effect.gen(function*() {
      const cap: Array<Record<string, unknown>> = []
      const tc = makeTestCase("tc-1", "Login")
      yield* createTestResult({
        project: testProjectIdentifier("QA Project"),
        run: testRunIdentifier("Nightly Run"),
        testCase: testCaseIdentifier("Login"),
        status: "passed",
        assignee: "Alice"
      }).pipe(Effect.provide(buildLayer({
        runs: [makeRun()],
        testCases: [tc],
        persons: [makePerson("person-1", "Alice")],
        captureAddCollection: cap
      })))
      expect(cap[0]?.status).toBe(TestRunStatus.Passed)
      expect(cap[0]?.assignee).toBe("person-1")
    }))
})

describe("updateTestResult — status, assignee, description branches", () => {
  const baseResult = () => makeResult("r-1", "tc-1")

  it.effect("updates status, resolves an assignee, and uploads a description", () =>
    Effect.gen(function*() {
      const cap: MockConfig["captureUpdateDoc"] = {}
      yield* updateTestResult({
        project: testProjectIdentifier("QA Project"),
        result: testResultIdentifier("Result-r-1"),
        status: "failed",
        assignee: "Alice",
        description: "Logs attached"
      }).pipe(Effect.provide(buildLayer({
        results: [baseResult()],
        persons: [makePerson("person-1", "Alice")],
        captureUpdateDoc: cap
      })))
      expect(cap.operations?.status).toBe(TestRunStatus.Failed)
      expect(cap.operations?.assignee).toBe("person-1")
      expect(cap.operations?.description).toBe("markup-ref")
    }))

  it.effect("clears assignee and description when set to null", () =>
    Effect.gen(function*() {
      const cap: MockConfig["captureUpdateDoc"] = {}
      yield* updateTestResult({
        project: testProjectIdentifier("QA Project"),
        result: testResultIdentifier("Result-r-1"),
        assignee: null,
        description: null
      }).pipe(Effect.provide(buildLayer({ results: [baseResult()], captureUpdateDoc: cap })))
      expect(cap.operations?.$unset).toEqual({ assignee: "" })
      expect(cap.operations?.description).toBeNull()
    }))
})

describe("test run summary optional fields", () => {
  it.effect("includes a run dueDate in list and detail summaries", () =>
    Effect.gen(function*() {
      const run = makeRun({ dueDate: Timestamp.make(5000) })
      const listed = yield* listTestRuns({ project: testProjectIdentifier("QA Project") }).pipe(
        Effect.provide(buildLayer({ runs: [run] }))
      )
      expect(listed.runs[0]?.dueDate).toBe(5000)

      const detail = yield* getTestRun({
        project: testProjectIdentifier("QA Project"),
        run: testRunIdentifier("Nightly Run")
      }).pipe(Effect.provide(buildLayer({ runs: [run] })))
      expect(detail.dueDate).toBe(5000)
    }))

  it.effect("includes a fetched run description in the detail", () =>
    Effect.gen(function*() {
      const run = makeRun({
        description: "markup-ref" as unknown as MarkupBlobRef
      })
      const detail = yield* getTestRun({
        project: testProjectIdentifier("QA Project"),
        run: testRunIdentifier("Nightly Run")
      }).pipe(Effect.provide(buildLayer({ runs: [run] })))
      expect(detail.description).toBe("fetched content")
    }))

  it.effect("summarizes a result that has an assignee but no status", () =>
    Effect.gen(function*() {
      const r = makeResult("r-a", "tc-1", {
        assignee: "emp-1" as unknown as Ref<Employee>
      })
      delete (r as unknown as Record<string, unknown>).status
      const listed = yield* listTestResults({
        project: testProjectIdentifier("QA Project"),
        run: testRunIdentifier("Nightly Run")
      }).pipe(Effect.provide(buildLayer({ runs: [makeRun()], results: [r] })))
      expect(listed.results[0]?.assignee).toBe("emp-1")
      expect(listed.results[0]).not.toHaveProperty("status")
    }))

  it.effect("includes a testSuite in the result detail", () =>
    Effect.gen(function*() {
      const r = makeResult("r-1", "tc-1", {
        testSuite: "suite-1" as unknown as Ref<TestSuite>
      })
      const detail = yield* getTestResult({
        project: testProjectIdentifier("QA Project"),
        result: testResultIdentifier("r-1")
      }).pipe(Effect.provide(buildLayer({ results: [r] })))
      expect(detail.testSuite).toBe("suite-1")
    }))
})

describe("createTestRun optional fields", () => {
  it.effect("uploads a description and sets a dueDate on creation", () =>
    Effect.gen(function*() {
      const cap: MockConfig["captureCreateDoc"] = {}
      yield* createTestRun({
        project: testProjectIdentifier("QA Project"),
        name: "Release Run",
        description: "Release checklist",
        dueDate: Timestamp.make(9000)
      }).pipe(Effect.provide(buildLayer({ captureCreateDoc: cap })))
      expect(cap.attributes?.description).toBe("markup-ref")
      expect(cap.attributes?.dueDate).toBe(9000)
    }))

  it.effect("treats a blank description as no description", () =>
    Effect.gen(function*() {
      const cap: MockConfig["captureCreateDoc"] = {}
      yield* createTestRun({
        project: testProjectIdentifier("QA Project"),
        name: "Blank Desc Run",
        description: "   "
      }).pipe(Effect.provide(buildLayer({ captureCreateDoc: cap })))
      expect(cap.attributes?.description).toBeNull()
    }))
})

describe("runTestPlan branch coverage", () => {
  it.effect("fails when a plan item references a missing test case", () =>
    Effect.gen(function*() {
      const plan = makePlan("p-1", "My Plan")
      const items = [makePlanItem("pi-1", "tc-missing", "p-1")]
      const err = yield* Effect.flip(
        runTestPlan({
          project: testProjectIdentifier("QA Project"),
          plan: testPlanIdentifier("My Plan")
        }).pipe(Effect.provide(buildLayer({ plans: [plan], planItems: items, testCases: [] })))
      )
      expect(err._tag).toBe("TestCaseNotFoundError")
    }))

  it.effect("sets a dueDate and carries item testSuite and assignee onto results", () =>
    Effect.gen(function*() {
      const plan = makePlan("p-1", "My Plan")
      const tc = makeTestCase("tc-1", "Login")
      const item = {
        ...makePlanItem("pi-1", "tc-1", "p-1"),
        testSuite: "suite-1",
        assignee: "emp-1"
      } as unknown as TestPlanItem
      const cap: Array<Record<string, unknown>> = []
      const createCap: MockConfig["captureCreateDoc"] = {}
      yield* runTestPlan({
        project: testProjectIdentifier("QA Project"),
        plan: testPlanIdentifier("My Plan"),
        dueDate: Timestamp.make(4242)
      }).pipe(Effect.provide(buildLayer({
        plans: [plan],
        planItems: [item],
        testCases: [tc],
        captureCreateDoc: createCap,
        captureAddCollection: cap
      })))
      expect(createCap.attributes?.dueDate).toBe(4242)
      expect(cap[0]?.testSuite).toBe("suite-1")
      expect(cap[0]?.assignee).toBe("emp-1")
    }))
})
