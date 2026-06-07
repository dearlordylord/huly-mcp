import type { Employee } from "@hcengineering/contact"
import type { DocumentUpdate, MarkupBlobRef, Ref } from "@hcengineering/core"
import { generateId, SortingOrder } from "@hcengineering/core"
import { Effect } from "effect"

import { TestPlanId, TestPlanItemId } from "../../domain/schemas/shared.js"
import type {
  AddTestPlanItemParams,
  AddTestPlanItemResult,
  CreateTestPlanParams,
  CreateTestPlanResult,
  DeleteTestPlanParams,
  DeleteTestPlanResult,
  GetTestPlanParams,
  GetTestPlanResult,
  ListTestPlansParams,
  ListTestPlansResult,
  RemoveTestPlanItemParams,
  RemoveTestPlanItemResult,
  TestPlanItemSummary,
  TestPlanSummary,
  UpdateTestPlanParams,
  UpdateTestPlanResult
} from "../../domain/schemas/test-management-plans.js"
import { UPDATE_TEST_PLAN_FIELDS } from "../../domain/schemas/test-management-plans.js"
import { HulyClient, type HulyClientError } from "../client.js"
import type {
  NoUpdateFieldsError,
  PersonNotFoundError,
  TestCaseNotFoundError,
  TestPlanNotFoundError,
  TestProjectNotFoundError
} from "../errors.js"
import { TestPlanItemNotFoundError } from "../errors.js"
import { testManagement } from "../test-management-classes.js"
import type { TestPlan, TestPlanItem } from "../test-management-types.js"
import { listTotal } from "./counts.js"
import { clampLimit } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"
import {
  fetchDescription,
  findTestCase,
  findTestPlan,
  findTestProject,
  resolveAssignee
} from "./test-management-shared.js"
import { type DirectUpdateEntry, mergeUpdateEntries, requireUpdateFields } from "./update-guards.js"

type PlanOpError = HulyClientError | TestProjectNotFoundError
type PlanMutateError = PlanOpError | TestPlanNotFoundError
type UpdatePlanError = PlanMutateError | NoUpdateFieldsError
type AddItemError = PlanMutateError | TestCaseNotFoundError | PersonNotFoundError

const toPlanSummary = (p: TestPlan): TestPlanSummary => ({
  id: TestPlanId.make(p._id),
  name: p.name
})

const toItemSummary = (item: TestPlanItem): TestPlanItemSummary => ({
  id: TestPlanItemId.make(item._id),
  testCase: item.testCase,
  ...(item.testSuite !== undefined ? { testSuite: item.testSuite } : {}),
  ...(item.assignee !== undefined ? { assignee: item.assignee } : {})
})

export const listTestPlans = (
  params: ListTestPlansParams
): Effect.Effect<ListTestPlansResult, PlanOpError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const project = yield* findTestProject(client, params.project)
    const limit = clampLimit(params.limit)
    const plans = yield* client.findAll<TestPlan>(
      testManagement.class.TestPlan,
      { space: project._id },
      { limit, sort: { modifiedOn: SortingOrder.Descending } }
    )
    return { plans: plans.map(toPlanSummary), total: listTotal(plans.total) }
  })

export const getTestPlan = (
  params: GetTestPlanParams
): Effect.Effect<GetTestPlanResult, PlanMutateError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const project = yield* findTestProject(client, params.project)
    const plan = yield* findTestPlan(client, project, params.plan)
    const items = yield* client.findAll<TestPlanItem>(
      testManagement.class.TestPlanItem,
      { attachedTo: plan._id }
    )
    const descriptionStr = yield* fetchDescription(
      client,
      testManagement.class.TestPlan,
      plan._id,
      plan.description
    )
    return {
      id: TestPlanId.make(plan._id),
      name: plan.name,
      ...(descriptionStr !== undefined ? { description: descriptionStr } : {}),
      items: items.map(toItemSummary)
    }
  })

export const createTestPlan = (
  params: CreateTestPlanParams
): Effect.Effect<CreateTestPlanResult, PlanOpError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const project = yield* findTestProject(client, params.project)
    const existing = yield* client.findOne<TestPlan>(
      testManagement.class.TestPlan,
      { name: params.name, space: project._id }
    )
    if (existing !== undefined) {
      return { id: TestPlanId.make(existing._id), name: existing.name, created: false }
    }
    const planId: Ref<TestPlan> = generateId()
    const descRef: MarkupBlobRef | null = params.description !== undefined && params.description.trim() !== ""
      ? yield* client.uploadMarkup(
        testManagement.class.TestPlan,
        planId,
        "description",
        params.description,
        "markdown"
      )
      : null
    yield* client.createDoc(testManagement.class.TestPlan, project._id, {
      name: params.name,
      description: descRef
    }, planId)
    return { id: TestPlanId.make(planId), name: params.name, created: true }
  })

export const updateTestPlan = (
  params: UpdateTestPlanParams
): Effect.Effect<UpdateTestPlanResult, UpdatePlanError, HulyClient> =>
  Effect.gen(function*() {
    yield* requireUpdateFields("update_test_plan", params, UPDATE_TEST_PLAN_FIELDS)

    const client = yield* HulyClient
    const project = yield* findTestProject(client, params.project)
    const plan = yield* findTestPlan(client, project, params.plan)
    type UpdateTestPlanField = typeof UPDATE_TEST_PLAN_FIELDS[number]
    type UpdateTestPlanEntries = {
      readonly [Field in UpdateTestPlanField]: Effect.Effect<
        DirectUpdateEntry<UpdateTestPlanField, DocumentUpdate<TestPlan>, Field>,
        HulyClientError
      >
    }
    const updateEntries = {
      name: Effect.succeed(params.name === undefined ? {} : { name: params.name }),
      description: Effect.gen(function*() {
        if (params.description === undefined) return {}
        if (params.description === null) return { description: null }
        return {
          description: yield* client.uploadMarkup(
            testManagement.class.TestPlan,
            plan._id,
            "description",
            params.description,
            "markdown"
          )
        }
      })
    } satisfies UpdateTestPlanEntries
    const ops: DocumentUpdate<TestPlan> = mergeUpdateEntries(yield* Effect.all(Object.values(updateEntries)))
    yield* client.updateDoc(testManagement.class.TestPlan, project._id, plan._id, ops)
    return { id: TestPlanId.make(plan._id), updated: true }
  })

export const deleteTestPlan = (
  params: DeleteTestPlanParams
): Effect.Effect<DeleteTestPlanResult, PlanMutateError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const project = yield* findTestProject(client, params.project)
    const plan = yield* findTestPlan(client, project, params.plan)
    yield* client.removeDoc(testManagement.class.TestPlan, project._id, plan._id)
    return { id: TestPlanId.make(plan._id), deleted: true }
  })

export const addTestPlanItem = (
  params: AddTestPlanItemParams
): Effect.Effect<AddTestPlanItemResult, AddItemError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const project = yield* findTestProject(client, params.project)
    const plan = yield* findTestPlan(client, project, params.plan)
    const tc = yield* findTestCase(client, project, params.testCase)
    const itemAttrs: Record<string, unknown> = {
      testCase: tc._id,
      ...(tc.attachedTo ? { testSuite: tc.attachedTo } : {})
    }
    if (params.assignee !== undefined) {
      itemAttrs.assignee = toRef<Employee>((yield* resolveAssignee(params.assignee))._id)
    }
    // AttachedData<TestPlanItem> with exactOptionalPropertyTypes — cast at boundary
    const itemId = yield* client.addCollection(
      testManagement.class.TestPlanItem,
      project._id,
      plan._id,
      testManagement.class.TestPlan,
      "items",
      // eslint-disable-next-line no-restricted-syntax -- AttachedData<TestPlanItem> SDK boundary cast
      itemAttrs as Parameters<typeof client.addCollection<TestPlan, TestPlanItem>>[5]
    )
    return { id: TestPlanItemId.make(itemId), added: true }
  })

export const removeTestPlanItem = (
  params: RemoveTestPlanItemParams
): Effect.Effect<RemoveTestPlanItemResult, PlanMutateError | TestPlanItemNotFoundError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const project = yield* findTestProject(client, params.project)
    const plan = yield* findTestPlan(client, project, params.plan)
    const item = yield* client.findOne<TestPlanItem>(
      testManagement.class.TestPlanItem,
      { _id: toRef<TestPlanItem>(params.item) }
    )
    if (item === undefined || item.attachedTo !== plan._id) {
      return yield* new TestPlanItemNotFoundError({ identifier: params.item, plan: plan._id })
    }
    yield* client.removeDoc(testManagement.class.TestPlanItem, project._id, item._id)
    return { id: TestPlanItemId.make(item._id), removed: true }
  })
