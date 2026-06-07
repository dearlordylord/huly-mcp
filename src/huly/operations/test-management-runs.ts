import type { Employee } from "@hcengineering/contact"
import type { DocumentUpdate, MarkupBlobRef, Ref } from "@hcengineering/core"
import { generateId, SortingOrder } from "@hcengineering/core"
import { Effect } from "effect"

import { Count, TestResultId, TestRunId } from "../../domain/schemas/shared.js"
import type {
  CreateTestResultParams,
  CreateTestResultResult,
  CreateTestRunParams,
  CreateTestRunResult,
  DeleteTestResultParams,
  DeleteTestResultResult,
  DeleteTestRunParams,
  DeleteTestRunResult,
  GetTestResultDetail,
  GetTestResultParams,
  GetTestRunParams,
  GetTestRunResult,
  ListTestResultsParams,
  ListTestResultsResult,
  ListTestRunsParams,
  ListTestRunsResult,
  RunTestPlanParams,
  RunTestPlanResult,
  TestResultSummary,
  TestRunSummary,
  UpdateTestResultParams,
  UpdateTestResultResult,
  UpdateTestRunParams,
  UpdateTestRunResult
} from "../../domain/schemas/test-management-plans.js"
import { UPDATE_TEST_RESULT_FIELDS, UPDATE_TEST_RUN_FIELDS } from "../../domain/schemas/test-management-plans.js"
import { HulyClient, type HulyClientError } from "../client.js"
import type {
  NoUpdateFieldsError,
  PersonNotFoundError,
  TestPlanNotFoundError,
  TestProjectNotFoundError,
  TestResultNotFoundError,
  TestRunNotFoundError
} from "../errors.js"
import { TestCaseNotFoundError } from "../errors.js"
import { testManagement } from "../test-management-classes.js"
import type { TestCase, TestPlanItem, TestResult, TestRun } from "../test-management-types.js"
import { TestRunStatus } from "../test-management-types.js"
import { listTotal } from "./counts.js"
import { clampLimit } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"
import {
  fetchDescription,
  findTestCase,
  findTestPlan,
  findTestProject,
  findTestResult,
  findTestRun,
  resolveAssignee,
  stringToTestRunStatus,
  testRunStatusToString
} from "./test-management-shared.js"
import {
  type CoveredUpdateEntry,
  coveredUpdateEntry,
  type DirectOrUnsetUpdateEntry,
  type DirectUpdateEntry,
  mergeCoveredUpdateEntries,
  requireUpdateFields
} from "./update-guards.js"

type TestRunOpError = HulyClientError | TestProjectNotFoundError
type TestRunMutateError = TestRunOpError | TestRunNotFoundError
type TestResultMutateError = HulyClientError | TestProjectNotFoundError | TestResultNotFoundError
type UpdateTestRunError = TestRunMutateError | NoUpdateFieldsError
type UpdateTestResultError = TestResultMutateError | NoUpdateFieldsError | PersonNotFoundError
type CreateResultError = TestRunOpError | TestRunNotFoundError | TestCaseNotFoundError | PersonNotFoundError
type RunPlanError = HulyClientError | TestProjectNotFoundError | TestPlanNotFoundError | TestCaseNotFoundError

const BATCH_CONCURRENCY = 10

// `params.status` is schema-validated (TestRunStatusSchema) to a known status string, all of which
// map, so the Untested fallback only guards stringToTestRunStatus's `| undefined` return type.
const resolveStatusOrUntested = (status: string): TestRunStatus => {
  const resolved = stringToTestRunStatus(status)
  /* v8 ignore start -- unreachable: status is schema-validated to a known TestRunStatus string */
  if (resolved === undefined) return TestRunStatus.Untested
  /* v8 ignore stop */
  return resolved
}

const toRunSummary = (r: TestRun): TestRunSummary => ({
  id: TestRunId.make(r._id),
  name: r.name,
  ...(r.dueDate !== undefined ? { dueDate: r.dueDate } : {})
})

const toResultSummary = (r: TestResult): TestResultSummary => ({
  id: TestResultId.make(r._id),
  name: r.name,
  testCase: r.testCase,
  ...(r.status !== undefined ? { status: testRunStatusToString(r.status) } : {}),
  ...(r.assignee !== undefined ? { assignee: r.assignee } : {})
})

export const listTestRuns = (
  params: ListTestRunsParams
): Effect.Effect<ListTestRunsResult, TestRunOpError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const project = yield* findTestProject(client, params.project)
    const limit = clampLimit(params.limit)
    const runs = yield* client.findAll<TestRun>(
      testManagement.class.TestRun,
      { space: project._id },
      { limit, sort: { modifiedOn: SortingOrder.Descending } }
    )
    return { runs: runs.map(toRunSummary), total: listTotal(runs.total) }
  })

export const getTestRun = (
  params: GetTestRunParams
): Effect.Effect<GetTestRunResult, TestRunMutateError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const project = yield* findTestProject(client, params.project)
    const run = yield* findTestRun(client, project, params.run)
    const results = yield* client.findAll<TestResult>(
      testManagement.class.TestResult,
      { attachedTo: run._id }
    )
    const descriptionStr = yield* fetchDescription(
      client,
      testManagement.class.TestRun,
      run._id,
      run.description
    )
    return {
      id: TestRunId.make(run._id),
      name: run.name,
      ...(descriptionStr !== undefined ? { description: descriptionStr } : {}),
      ...(run.dueDate !== undefined ? { dueDate: run.dueDate } : {}),
      results: results.map(toResultSummary)
    }
  })

export const createTestRun = (
  params: CreateTestRunParams
): Effect.Effect<CreateTestRunResult, TestRunOpError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const project = yield* findTestProject(client, params.project)
    const runId: Ref<TestRun> = generateId()
    const descRef: MarkupBlobRef | null = params.description !== undefined && params.description.trim() !== ""
      ? yield* client.uploadMarkup(
        testManagement.class.TestRun,
        runId,
        "description",
        params.description,
        "markdown"
      )
      : null
    yield* client.createDoc(testManagement.class.TestRun, project._id, {
      name: params.name,
      description: descRef,
      ...(params.dueDate !== undefined ? { dueDate: params.dueDate } : {})
    }, runId)
    return { id: TestRunId.make(runId), name: params.name, created: true }
  })

export const updateTestRun = (
  params: UpdateTestRunParams
): Effect.Effect<UpdateTestRunResult, UpdateTestRunError, HulyClient> =>
  Effect.gen(function*() {
    yield* requireUpdateFields("update_test_run", params, UPDATE_TEST_RUN_FIELDS)

    const client = yield* HulyClient
    const project = yield* findTestProject(client, params.project)
    const run = yield* findTestRun(client, project, params.run)
    type UpdateTestRunField = typeof UPDATE_TEST_RUN_FIELDS[number]
    type UpdateTestRunEntries = {
      readonly name: Effect.Effect<
        CoveredUpdateEntry<
          "name",
          DirectUpdateEntry<UpdateTestRunField, DocumentUpdate<TestRun>, "name">
        >,
        HulyClientError
      >
      readonly description: Effect.Effect<
        CoveredUpdateEntry<
          "description",
          DirectUpdateEntry<UpdateTestRunField, DocumentUpdate<TestRun>, "description">
        >,
        HulyClientError
      >
      readonly dueDate: Effect.Effect<
        CoveredUpdateEntry<
          "dueDate",
          DirectOrUnsetUpdateEntry<UpdateTestRunField, DocumentUpdate<TestRun>, "dueDate">
        >,
        HulyClientError
      >
    }
    const updateEntries = {
      name: Effect.succeed(coveredUpdateEntry("name", params.name === undefined ? {} : { name: params.name })),
      description: Effect.gen(function*() {
        if (params.description === undefined) return coveredUpdateEntry("description", {})
        if (params.description === null) return coveredUpdateEntry("description", { description: null })
        return coveredUpdateEntry("description", {
          description: yield* client.uploadMarkup(
            testManagement.class.TestRun,
            run._id,
            "description",
            params.description,
            "markdown"
          )
        })
      }),
      dueDate: Effect.succeed(coveredUpdateEntry(
        "dueDate",
        params.dueDate === undefined
          ? {}
          : params.dueDate === null
          ? { $unset: { dueDate: "" } }
          : { dueDate: params.dueDate }
      ))
    } satisfies UpdateTestRunEntries
    const ops: DocumentUpdate<TestRun> = mergeCoveredUpdateEntries(yield* Effect.all(Object.values(updateEntries)))
    yield* client.updateDoc(testManagement.class.TestRun, project._id, run._id, ops)
    return { id: TestRunId.make(run._id), updated: true }
  })

export const deleteTestRun = (
  params: DeleteTestRunParams
): Effect.Effect<DeleteTestRunResult, TestRunMutateError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const project = yield* findTestProject(client, params.project)
    const run = yield* findTestRun(client, project, params.run)
    yield* client.removeDoc(testManagement.class.TestRun, project._id, run._id)
    return { id: TestRunId.make(run._id), deleted: true }
  })

export const listTestResults = (
  params: ListTestResultsParams
): Effect.Effect<ListTestResultsResult, TestRunMutateError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const project = yield* findTestProject(client, params.project)
    const run = yield* findTestRun(client, project, params.run)
    const limit = clampLimit(params.limit)
    const results = yield* client.findAll<TestResult>(
      testManagement.class.TestResult,
      { attachedTo: run._id },
      { limit, sort: { modifiedOn: SortingOrder.Descending } }
    )
    return { results: results.map(toResultSummary), total: listTotal(results.total) }
  })

export const getTestResult = (
  params: GetTestResultParams
): Effect.Effect<GetTestResultDetail, TestResultMutateError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const project = yield* findTestProject(client, params.project)
    const result = yield* findTestResult(client, project, params.result)
    const descriptionStr = yield* fetchDescription(
      client,
      testManagement.class.TestResult,
      result._id,
      result.description
    )
    return {
      id: TestResultId.make(result._id),
      name: result.name,
      testCase: result.testCase,
      ...(result.testSuite !== undefined ? { testSuite: result.testSuite } : {}),
      ...(result.status !== undefined ? { status: testRunStatusToString(result.status) } : {}),
      ...(result.assignee !== undefined ? { assignee: result.assignee } : {}),
      ...(descriptionStr !== undefined ? { description: descriptionStr } : {})
    }
  })

export const createTestResult = (
  params: CreateTestResultParams
): Effect.Effect<CreateTestResultResult, CreateResultError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const project = yield* findTestProject(client, params.project)
    const run = yield* findTestRun(client, project, params.run)
    const tc = yield* findTestCase(client, project, params.testCase)
    const name = params.name ?? tc.name
    const resultAttrs: Record<string, unknown> = {
      name,
      testCase: tc._id,
      status: params.status !== undefined
        ? resolveStatusOrUntested(params.status)
        : TestRunStatus.Untested,
      description: null
    }
    if (params.assignee !== undefined) {
      resultAttrs.assignee = toRef<Employee>((yield* resolveAssignee(params.assignee))._id)
    }
    // AttachedData<TestResult> with exactOptionalPropertyTypes — cast at boundary
    const resultId = yield* client.addCollection(
      testManagement.class.TestResult,
      project._id,
      run._id,
      testManagement.class.TestRun,
      "results",
      // eslint-disable-next-line no-restricted-syntax -- AttachedData<TestResult> SDK boundary cast
      resultAttrs as Parameters<typeof client.addCollection<TestRun, TestResult>>[5]
    )
    return { id: TestResultId.make(resultId), name, created: true }
  })

export const updateTestResult = (
  params: UpdateTestResultParams
): Effect.Effect<UpdateTestResultResult, UpdateTestResultError, HulyClient> =>
  Effect.gen(function*() {
    yield* requireUpdateFields("update_test_result", params, UPDATE_TEST_RESULT_FIELDS)

    const client = yield* HulyClient
    const project = yield* findTestProject(client, params.project)
    const result = yield* findTestResult(client, project, params.result)
    type UpdateTestResultField = typeof UPDATE_TEST_RESULT_FIELDS[number]
    type UpdateTestResultEntries = {
      readonly status: Effect.Effect<
        CoveredUpdateEntry<
          "status",
          DirectUpdateEntry<UpdateTestResultField, DocumentUpdate<TestResult>, "status">
        >,
        HulyClientError
      >
      readonly assignee: Effect.Effect<
        CoveredUpdateEntry<
          "assignee",
          DirectOrUnsetUpdateEntry<UpdateTestResultField, DocumentUpdate<TestResult>, "assignee">
        >,
        HulyClientError | PersonNotFoundError,
        HulyClient
      >
      readonly description: Effect.Effect<
        CoveredUpdateEntry<
          "description",
          DirectUpdateEntry<UpdateTestResultField, DocumentUpdate<TestResult>, "description">
        >,
        HulyClientError
      >
    }
    const updateEntries = {
      status: Effect.succeed(
        coveredUpdateEntry(
          "status",
          params.status === undefined ? {} : { status: resolveStatusOrUntested(params.status) }
        )
      ),
      assignee: Effect.gen(function*() {
        if (params.assignee === undefined) return coveredUpdateEntry("assignee", {})
        if (params.assignee === null) {
          return coveredUpdateEntry("assignee", { $unset: { assignee: "" } })
        }
        return coveredUpdateEntry("assignee", {
          assignee: toRef<Employee>((yield* resolveAssignee(params.assignee))._id)
        })
      }),
      description: Effect.gen(function*() {
        if (params.description === undefined) return coveredUpdateEntry("description", {})
        if (params.description === null) return coveredUpdateEntry("description", { description: null })
        return coveredUpdateEntry("description", {
          description: yield* client.uploadMarkup(
            testManagement.class.TestResult,
            result._id,
            "description",
            params.description,
            "markdown"
          )
        })
      })
    } satisfies UpdateTestResultEntries
    const ops: DocumentUpdate<TestResult> = mergeCoveredUpdateEntries(yield* Effect.all(Object.values(updateEntries)))
    yield* client.updateDoc(testManagement.class.TestResult, result.space, result._id, ops)
    return { id: TestResultId.make(result._id), updated: true }
  })

export const deleteTestResult = (
  params: DeleteTestResultParams
): Effect.Effect<DeleteTestResultResult, TestResultMutateError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const project = yield* findTestProject(client, params.project)
    const result = yield* findTestResult(client, project, params.result)
    yield* client.removeDoc(testManagement.class.TestResult, result.space, result._id)
    return { id: TestResultId.make(result._id), deleted: true }
  })

export const runTestPlan = (
  params: RunTestPlanParams
): Effect.Effect<RunTestPlanResult, RunPlanError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const project = yield* findTestProject(client, params.project)
    const plan = yield* findTestPlan(client, project, params.plan)
    const items = yield* client.findAll<TestPlanItem>(
      testManagement.class.TestPlanItem,
      { attachedTo: plan._id }
    )
    // Pre-validate all test cases before creating server-side state
    // to avoid orphaned runs on partial failure.
    const validated = yield* Effect.forEach(items, (item) =>
      Effect.gen(function*() {
        const tc = yield* client.findOne<TestCase>(
          testManagement.class.TestCase,
          { _id: item.testCase }
        )
        if (tc === undefined) {
          return yield* new TestCaseNotFoundError({ identifier: item.testCase })
        }
        return { item, tc }
      }), { concurrency: BATCH_CONCURRENCY })
    const runId: Ref<TestRun> = generateId()
    const runName = params.runName ?? `${plan.name} - Run`
    yield* client.createDoc(testManagement.class.TestRun, project._id, {
      name: runName,
      description: null,
      ...(params.dueDate !== undefined ? { dueDate: params.dueDate } : {})
    }, runId)
    const results = yield* Effect.forEach(validated, ({ item, tc }) =>
      Effect.gen(function*() {
        const attrs: Record<string, unknown> = {
          name: tc.name,
          testCase: item.testCase,
          status: TestRunStatus.Untested,
          description: null
        }
        if (item.testSuite !== undefined) attrs.testSuite = item.testSuite
        if (item.assignee !== undefined) attrs.assignee = item.assignee
        return yield* client.addCollection(
          testManagement.class.TestResult,
          project._id,
          runId,
          testManagement.class.TestRun,
          "results",
          // eslint-disable-next-line no-restricted-syntax -- AttachedData<TestResult> SDK boundary cast
          attrs as Parameters<typeof client.addCollection<TestRun, TestResult>>[5]
        )
      }), { concurrency: BATCH_CONCURRENCY })
    return { runId: TestRunId.make(runId), name: runName, resultsCreated: Count.make(results.length) }
  })
