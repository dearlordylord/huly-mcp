/* eslint-disable no-restricted-syntax -- test mocks require double assertion since local interfaces extend SDK base types not structurally compatible with object literals */
import { describe, it } from "@effect/vitest"
import { type Doc, type PersonId, type Ref, toFindResult } from "@hcengineering/core"
import { Effect } from "effect"
import { expect } from "vitest"

import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import type { TestPlanItemNotFoundError, TestPlanNotFoundError } from "../../../src/huly/errors.js"
import {
  addTestPlanItem,
  createTestPlan,
  deleteTestPlan,
  getTestPlan,
  listTestPlans,
  removeTestPlanItem,
  updateTestPlan
} from "../../../src/huly/operations/test-management-plans.js"
import { testManagement } from "../../../src/huly/test-management-classes.js"
import type { TestCase, TestPlan, TestPlanItem, TestProject } from "../../../src/huly/test-management-types.js"
import { testCaseIdentifier, testPlanIdentifier, testPlanItemId, testProjectIdentifier } from "../../helpers/brands.js"

const PROJECT_ID = "proj-1" as Ref<TestProject>
const PLAN_ID = "plan-1" as Ref<TestPlan>

const makeProject = (id = PROJECT_ID): TestProject =>
  ({
    _id: id,
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

const makePlan = (overrides?: Partial<TestPlan>): TestPlan =>
  ({
    _id: PLAN_ID,
    _class: testManagement.class.TestPlan,
    space: PROJECT_ID,
    name: "Sprint Plan",
    description: null,
    modifiedBy: "u" as PersonId,
    modifiedOn: 0,
    createdBy: "u" as PersonId,
    createdOn: 0,
    ...overrides
  }) as unknown as TestPlan

const makeItem = (id: string, tcId: string, planId = PLAN_ID): TestPlanItem =>
  ({
    _id: id as Ref<TestPlanItem>,
    _class: testManagement.class.TestPlanItem,
    space: PROJECT_ID,
    attachedTo: planId,
    testCase: tcId as Ref<TestCase>,
    modifiedBy: "u" as PersonId,
    modifiedOn: 0,
    createdBy: "u" as PersonId,
    createdOn: 0,
    attachedToClass: testManagement.class.TestPlan,
    collection: "items"
  }) as unknown as TestPlanItem

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

interface MockConfig {
  project?: TestProject
  plans?: Array<TestPlan>
  items?: Array<TestPlanItem>
  testCases?: Array<TestCase>
  captureCreateDoc?: { attributes?: Record<string, unknown>; id?: string }
  captureAddCollection?: { attributes?: Record<string, unknown>; id?: string }
  captureUpdateDoc?: { operations?: Record<string, unknown> }
  captureRemoveDoc?: { called?: boolean; id?: string }
}

const buildLayer = (c: MockConfig) => {
  const project = c.project ?? makeProject()
  const plans = c.plans ?? []
  const items = c.items ?? []
  const testCases = c.testCases ?? []

  const findAllImpl: HulyClientOperations["findAll"] = ((_class: unknown, query: unknown) => {
    const q = query as Record<string, unknown>
    if (_class === testManagement.class.TestProject) return Effect.succeed(toFindResult([project]))
    if (_class === testManagement.class.TestPlan) {
      const f = plans.filter(p => !q.space || p.space === q.space)
      return Effect.succeed(toFindResult(f))
    }
    if (_class === testManagement.class.TestPlanItem) {
      const f = items.filter(i => !q.attachedTo || i.attachedTo === q.attachedTo)
      return Effect.succeed(toFindResult(f))
    }
    return Effect.succeed(toFindResult([]))
  }) as HulyClientOperations["findAll"]

  const findOneImpl: HulyClientOperations["findOne"] = ((_class: unknown, query: unknown) => {
    const q = query as Record<string, unknown>
    if (_class === testManagement.class.TestProject) {
      return Effect.succeed(q._id === project._id || q.name === project.name ? project : undefined)
    }
    if (_class === testManagement.class.TestPlan) {
      return Effect.succeed(
        plans.find(p =>
          (q._id && p._id === q._id) || (q.name && p.name === q.name && (!q.space || p.space === q.space))
        )
      )
    }
    if (_class === testManagement.class.TestPlanItem) {
      return Effect.succeed(items.find(i => q._id && i._id === q._id))
    }
    if (_class === testManagement.class.TestCase) {
      return Effect.succeed(testCases.find(tc => (q._id && tc._id === q._id) || (q.name && tc.name === q.name)))
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

  const addCollectionImpl: HulyClientOperations["addCollection"] = ((
    _c: unknown,
    _s: unknown,
    _at: unknown,
    _ac: unknown,
    _col: unknown,
    attrs: unknown
  ) => {
    const newId = "new-item-id" as Ref<Doc>
    if (c.captureAddCollection) {
      c.captureAddCollection.attributes = attrs as Record<string, unknown>
      c.captureAddCollection.id = newId
    }
    return Effect.succeed(newId)
  }) as HulyClientOperations["addCollection"]

  const updateDocImpl: HulyClientOperations["updateDoc"] = (
    (_c: unknown, _s: unknown, _id: unknown, ops: unknown) => {
      if (c.captureUpdateDoc) c.captureUpdateDoc.operations = ops as Record<string, unknown>
      return Effect.succeed({} as never)
    }
  ) as HulyClientOperations["updateDoc"]

  const removeDocImpl: HulyClientOperations["removeDoc"] = (
    (_c: unknown, _s: unknown, id: unknown) => {
      if (c.captureRemoveDoc) {
        c.captureRemoveDoc.called = true
        c.captureRemoveDoc.id = id as string
      }
      return Effect.succeed({} as never)
    }
  ) as HulyClientOperations["removeDoc"]

  const uploadMarkupImpl: HulyClientOperations["uploadMarkup"] = (
    () => Effect.succeed("markup-ref" as never)
  ) as HulyClientOperations["uploadMarkup"]

  return HulyClient.testLayer({
    findAll: findAllImpl,
    findOne: findOneImpl,
    createDoc: createDocImpl,
    addCollection: addCollectionImpl,
    updateDoc: updateDocImpl,
    removeDoc: removeDocImpl,
    uploadMarkup: uploadMarkupImpl
  })
}

describe("listTestPlans", () => {
  it.effect("returns plans in project", () =>
    Effect.gen(function*() {
      const plans = [makePlan(), makePlan({ _id: "plan-2" as Ref<TestPlan>, name: "Plan 2" })]
      const result = yield* listTestPlans({
        project: testProjectIdentifier("QA Project")
      }).pipe(Effect.provide(buildLayer({ plans })))
      expect(result.plans).toHaveLength(2)
      expect(result.plans[0].name).toBe("Sprint Plan")
    }))
})

describe("getTestPlan", () => {
  it.effect("returns plan with items", () =>
    Effect.gen(function*() {
      const items = [makeItem("i-1", "tc-1"), makeItem("i-2", "tc-2")]
      const result = yield* getTestPlan({
        project: testProjectIdentifier("QA Project"),
        plan: testPlanIdentifier("Sprint Plan")
      }).pipe(Effect.provide(buildLayer({ plans: [makePlan()], items })))
      expect(result.name).toBe("Sprint Plan")
      expect(result.items).toHaveLength(2)
    }))
})

describe("createTestPlan", () => {
  it.effect("creates new plan", () =>
    Effect.gen(function*() {
      const cap: MockConfig["captureCreateDoc"] = {}
      const result = yield* createTestPlan({
        project: testProjectIdentifier("QA Project"),
        name: "New Plan"
      }).pipe(Effect.provide(buildLayer({ captureCreateDoc: cap })))
      expect(result.created).toBe(true)
      expect(result.name).toBe("New Plan")
      expect(cap.attributes?.name).toBe("New Plan")
    }))

  it.effect("returns existing plan (idempotent)", () =>
    Effect.gen(function*() {
      const cap: MockConfig["captureCreateDoc"] = {}
      const result = yield* createTestPlan({
        project: testProjectIdentifier("QA Project"),
        name: "Sprint Plan"
      }).pipe(Effect.provide(buildLayer({ plans: [makePlan()], captureCreateDoc: cap })))
      expect(result.created).toBe(false)
      expect(result.id).toBe(PLAN_ID)
      expect(cap.attributes).toBeUndefined()
    }))
})

describe("updateTestPlan", () => {
  it.effect("updates name", () =>
    Effect.gen(function*() {
      const cap: MockConfig["captureUpdateDoc"] = {}
      const result = yield* updateTestPlan({
        project: testProjectIdentifier("QA Project"),
        plan: testPlanIdentifier("Sprint Plan"),
        name: "Updated"
      }).pipe(Effect.provide(buildLayer({ plans: [makePlan()], captureUpdateDoc: cap })))
      expect(result.updated).toBe(true)
      expect(cap.operations?.name).toBe("Updated")
    }))

  it.effect("returns not found for missing plan", () =>
    Effect.gen(function*() {
      const err = yield* Effect.flip(
        updateTestPlan({
          project: testProjectIdentifier("QA Project"),
          plan: testPlanIdentifier("nope"),
          name: "X"
        }).pipe(Effect.provide(buildLayer({})))
      )
      expect(err._tag).toBe("TestPlanNotFoundError")
      expect((err as TestPlanNotFoundError).identifier).toBe("nope")
    }))
})

describe("deleteTestPlan", () => {
  it.effect("deletes plan", () =>
    Effect.gen(function*() {
      const cap: MockConfig["captureRemoveDoc"] = {}
      const result = yield* deleteTestPlan({
        project: testProjectIdentifier("QA Project"),
        plan: testPlanIdentifier("Sprint Plan")
      }).pipe(Effect.provide(buildLayer({ plans: [makePlan()], captureRemoveDoc: cap })))
      expect(result.deleted).toBe(true)
      expect(cap.called).toBe(true)
    }))

  it.effect("returns not found for missing plan", () =>
    Effect.gen(function*() {
      const err = yield* Effect.flip(
        deleteTestPlan({
          project: testProjectIdentifier("QA Project"),
          plan: testPlanIdentifier("nope")
        }).pipe(Effect.provide(buildLayer({})))
      )
      expect(err._tag).toBe("TestPlanNotFoundError")
    }))
})

describe("addTestPlanItem", () => {
  it.effect("adds test case to plan", () =>
    Effect.gen(function*() {
      const cap: MockConfig["captureAddCollection"] = {}
      const tc = makeTestCase("tc-1", "Login Test")
      const result = yield* addTestPlanItem({
        project: testProjectIdentifier("QA Project"),
        plan: testPlanIdentifier("Sprint Plan"),
        testCase: testCaseIdentifier("Login Test")
      }).pipe(Effect.provide(buildLayer({ plans: [makePlan()], testCases: [tc], captureAddCollection: cap })))
      expect(result.added).toBe(true)
      expect(cap.attributes?.testCase).toBe("tc-1")
    }))
})

describe("removeTestPlanItem", () => {
  it.effect("removes item from plan", () =>
    Effect.gen(function*() {
      const item = makeItem("i-1", "tc-1")
      const cap: MockConfig["captureRemoveDoc"] = {}
      const result = yield* removeTestPlanItem({
        project: testProjectIdentifier("QA Project"),
        plan: testPlanIdentifier("Sprint Plan"),
        item: testPlanItemId("i-1")
      }).pipe(Effect.provide(buildLayer({ plans: [makePlan()], items: [item], captureRemoveDoc: cap })))
      expect(result.removed).toBe(true)
      expect(cap.called).toBe(true)
    }))

  it.effect("returns not found for item in wrong plan", () =>
    Effect.gen(function*() {
      const item = makeItem("i-1", "tc-1", "other-plan" as Ref<TestPlan>)
      const err = yield* Effect.flip(
        removeTestPlanItem({
          project: testProjectIdentifier("QA Project"),
          plan: testPlanIdentifier("Sprint Plan"),
          item: testPlanItemId("i-1")
        }).pipe(Effect.provide(buildLayer({ plans: [makePlan()], items: [item] })))
      )
      expect(err._tag).toBe("TestPlanItemNotFoundError")
      expect((err as TestPlanItemNotFoundError).plan).toBe(PLAN_ID)
    }))
})
