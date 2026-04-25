/* eslint-disable no-restricted-syntax -- reverse enum maps: Object.entries loses numeric enum type, cast back is unavoidable */
import type { MarkupRef } from "@hcengineering/api-client"
import type { Person } from "@hcengineering/contact"
import type { Class, Doc, Ref } from "@hcengineering/core"
import { Effect } from "effect"

import { HulyClient, type HulyClientError, type HulyClientOperations } from "../client.js"
import {
  PersonNotFoundError,
  TestCaseNotFoundError,
  TestPlanNotFoundError,
  TestProjectNotFoundError,
  TestResultNotFoundError,
  TestRunNotFoundError,
  TestSuiteNotFoundError
} from "../errors.js"
import { testManagement } from "../test-management-classes.js"
import type {
  TestCase,
  TestCasePriority,
  TestCaseStatus,
  TestCaseType,
  TestPlan,
  TestProject,
  TestResult,
  TestRun,
  TestRunStatus,
  TestSuite
} from "../test-management-types.js"
import {
  TestCasePriority as CasePriority,
  TestCaseStatus as CaseStatus,
  TestCaseType as CaseType,
  TestRunStatus as RunStatus
} from "../test-management-types.js"
import { findPersonByEmailOrName } from "./contacts-shared.js"
import { findByNameOrIdOrFail } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"

import type {
  TestCasePriorityStr,
  TestCaseStatusStr,
  TestCaseTypeStr,
  TestRunStatusStr
} from "../../domain/schemas/test-management-core.js"

// --- Bidirectional enum maps ---

const caseTypeToString: Record<TestCaseType, TestCaseTypeStr> = {
  [CaseType.Functional]: "functional",
  [CaseType.Performance]: "performance",
  [CaseType.Regression]: "regression",
  [CaseType.Security]: "security",
  [CaseType.Smoke]: "smoke",
  [CaseType.Usability]: "usability"
}

const stringToCaseType: Record<string, TestCaseType> = Object.fromEntries(
  Object.entries(caseTypeToString).map(([k, v]) => [v, Number(k) as TestCaseType])
)

export const testCaseTypeToString = (t: TestCaseType): TestCaseTypeStr => caseTypeToString[t]
export const stringToTestCaseType = (s: string): TestCaseType | undefined => stringToCaseType[s.toLowerCase()]

const casePriorityToString: Record<TestCasePriority, TestCasePriorityStr> = {
  [CasePriority.Low]: "low",
  [CasePriority.Medium]: "medium",
  [CasePriority.High]: "high",
  [CasePriority.Urgent]: "urgent"
}

const stringToCasePriority: Record<string, TestCasePriority> = Object.fromEntries(
  Object.entries(casePriorityToString).map(([k, v]) => [v, Number(k) as TestCasePriority])
)

export const testCasePriorityToString = (p: TestCasePriority): TestCasePriorityStr => casePriorityToString[p]
export const stringToTestCasePriority = (s: string): TestCasePriority | undefined =>
  stringToCasePriority[s.toLowerCase()]

const caseStatusToString: Record<TestCaseStatus, TestCaseStatusStr> = {
  [CaseStatus.Draft]: "draft",
  [CaseStatus.ReadyForReview]: "ready-for-review",
  [CaseStatus.FixReviewComments]: "fix-review-comments",
  [CaseStatus.Approved]: "approved",
  [CaseStatus.Rejected]: "rejected"
}

const stringToCaseStatus: Record<string, TestCaseStatus> = Object.fromEntries(
  Object.entries(caseStatusToString).map(([k, v]) => [v, Number(k) as TestCaseStatus])
)

export const testCaseStatusToString = (s: TestCaseStatus): TestCaseStatusStr => caseStatusToString[s]
export const stringToTestCaseStatus = (s: string): TestCaseStatus | undefined => stringToCaseStatus[s.toLowerCase()]

const runStatusToString: Record<TestRunStatus, TestRunStatusStr> = {
  [RunStatus.Untested]: "untested",
  [RunStatus.Blocked]: "blocked",
  [RunStatus.Passed]: "passed",
  [RunStatus.Failed]: "failed"
}

const stringToRunStatus: Record<string, TestRunStatus> = Object.fromEntries(
  Object.entries(runStatusToString).map(([k, v]) => [v, Number(k) as TestRunStatus])
)

export const testRunStatusToString = (s: TestRunStatus): TestRunStatusStr => runStatusToString[s]
export const stringToTestRunStatus = (s: string): TestRunStatus | undefined => stringToRunStatus[s.toLowerCase()]

// --- Markup helpers ---

export const fetchDescription = (
  client: HulyClientOperations,
  _class: Ref<Class<Doc>>,
  docId: Ref<Doc>,
  description: MarkupRef | null
): Effect.Effect<string | undefined, HulyClientError> =>
  description !== null
    ? client.fetchMarkup(_class, docId, "description", description, "markdown")
    : Effect.succeed(undefined)

// --- Finder helpers ---

export const findTestProject = (
  client: HulyClientOperations,
  idOrName: string
): Effect.Effect<TestProject, TestProjectNotFoundError | HulyClientError> =>
  findByNameOrIdOrFail(
    client,
    testManagement.class.TestProject,
    { _id: toRef<TestProject>(idOrName) },
    { name: idOrName },
    () => new TestProjectNotFoundError({ identifier: idOrName })
  )

export const findTestSuite = (
  client: HulyClientOperations,
  project: TestProject,
  idOrName: string
): Effect.Effect<TestSuite, TestSuiteNotFoundError | HulyClientError> =>
  findByNameOrIdOrFail(
    client,
    testManagement.class.TestSuite,
    { _id: toRef<TestSuite>(idOrName), space: project._id },
    { name: idOrName, space: project._id },
    () => new TestSuiteNotFoundError({ identifier: idOrName })
  )

export const findTestCase = (
  client: HulyClientOperations,
  project: TestProject,
  idOrName: string
): Effect.Effect<TestCase, TestCaseNotFoundError | HulyClientError> =>
  findByNameOrIdOrFail(
    client,
    testManagement.class.TestCase,
    { _id: toRef<TestCase>(idOrName), space: project._id },
    { name: idOrName, space: project._id },
    () => new TestCaseNotFoundError({ identifier: idOrName })
  )

export const findTestPlan = (
  client: HulyClientOperations,
  project: TestProject,
  idOrName: string
): Effect.Effect<TestPlan, TestPlanNotFoundError | HulyClientError> =>
  findByNameOrIdOrFail(
    client,
    testManagement.class.TestPlan,
    { _id: toRef<TestPlan>(idOrName), space: project._id },
    { name: idOrName, space: project._id },
    () => new TestPlanNotFoundError({ identifier: idOrName })
  )

export const findTestRun = (
  client: HulyClientOperations,
  project: TestProject,
  idOrName: string
): Effect.Effect<TestRun, TestRunNotFoundError | HulyClientError> =>
  findByNameOrIdOrFail(
    client,
    testManagement.class.TestRun,
    { _id: toRef<TestRun>(idOrName), space: project._id },
    { name: idOrName, space: project._id },
    () => new TestRunNotFoundError({ identifier: idOrName })
  )

export const findTestResult = (
  client: HulyClientOperations,
  project: TestProject,
  idOrName: string
): Effect.Effect<TestResult, TestResultNotFoundError | HulyClientError> =>
  findByNameOrIdOrFail(
    client,
    testManagement.class.TestResult,
    { _id: toRef<TestResult>(idOrName), space: project._id },
    { name: idOrName, space: project._id },
    () => new TestResultNotFoundError({ identifier: idOrName })
  )

export const resolveAssignee = (
  emailOrName: string
): Effect.Effect<Person, PersonNotFoundError | HulyClientError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const person = yield* findPersonByEmailOrName(client, emailOrName)
    if (person === undefined) {
      return yield* new PersonNotFoundError({ identifier: emailOrName })
    }
    return person
  })
