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

const stringToCaseTypeExact = {
  functional: CaseType.Functional,
  performance: CaseType.Performance,
  regression: CaseType.Regression,
  security: CaseType.Security,
  smoke: CaseType.Smoke,
  usability: CaseType.Usability
} satisfies Record<TestCaseTypeStr, TestCaseType>

const stringToCaseType: Readonly<Record<string, TestCaseType>> = stringToCaseTypeExact

const lookupEnumValue = <T>(map: Readonly<Record<string, T>>, value: string): T | undefined => {
  const key = value.toLowerCase()
  return Object.hasOwn(map, key) ? map[key] : undefined
}

export const testCaseTypeToString = (t: TestCaseType): TestCaseTypeStr => caseTypeToString[t]
export const stringToTestCaseType = (s: string): TestCaseType | undefined => lookupEnumValue(stringToCaseType, s)

export const resolveCaseType = (value: string): TestCaseType => {
  const resolved = stringToTestCaseType(value)
  /* v8 ignore start -- unreachable: value is schema-validated to a known TestCaseType string */
  if (resolved === undefined) return CaseType.Functional
  /* v8 ignore stop */
  return resolved
}

const casePriorityToString: Record<TestCasePriority, TestCasePriorityStr> = {
  [CasePriority.Low]: "low",
  [CasePriority.Medium]: "medium",
  [CasePriority.High]: "high",
  [CasePriority.Urgent]: "urgent"
}

const stringToCasePriorityExact = {
  low: CasePriority.Low,
  medium: CasePriority.Medium,
  high: CasePriority.High,
  urgent: CasePriority.Urgent
} satisfies Record<TestCasePriorityStr, TestCasePriority>

const stringToCasePriority: Readonly<Record<string, TestCasePriority>> = stringToCasePriorityExact

export const testCasePriorityToString = (p: TestCasePriority): TestCasePriorityStr => casePriorityToString[p]
export const stringToTestCasePriority = (s: string): TestCasePriority | undefined =>
  lookupEnumValue(stringToCasePriority, s)

export const resolveCasePriority = (value: string): TestCasePriority => {
  const resolved = stringToTestCasePriority(value)
  /* v8 ignore start -- unreachable: value is schema-validated to a known TestCasePriority string */
  if (resolved === undefined) return CasePriority.Medium
  /* v8 ignore stop */
  return resolved
}

const caseStatusToString: Record<TestCaseStatus, TestCaseStatusStr> = {
  [CaseStatus.Draft]: "draft",
  [CaseStatus.ReadyForReview]: "ready-for-review",
  [CaseStatus.FixReviewComments]: "fix-review-comments",
  [CaseStatus.Approved]: "approved",
  [CaseStatus.Rejected]: "rejected"
}

const stringToCaseStatusExact = {
  draft: CaseStatus.Draft,
  "ready-for-review": CaseStatus.ReadyForReview,
  "fix-review-comments": CaseStatus.FixReviewComments,
  approved: CaseStatus.Approved,
  rejected: CaseStatus.Rejected
} satisfies Record<TestCaseStatusStr, TestCaseStatus>

const stringToCaseStatus: Readonly<Record<string, TestCaseStatus>> = stringToCaseStatusExact

export const testCaseStatusToString = (s: TestCaseStatus): TestCaseStatusStr => caseStatusToString[s]
export const stringToTestCaseStatus = (s: string): TestCaseStatus | undefined => lookupEnumValue(stringToCaseStatus, s)

export const resolveCaseStatus = (value: string): TestCaseStatus => {
  const resolved = stringToTestCaseStatus(value)
  /* v8 ignore start -- unreachable: value is schema-validated to a known TestCaseStatus string */
  if (resolved === undefined) return CaseStatus.Draft
  /* v8 ignore stop */
  return resolved
}

const runStatusToString: Record<TestRunStatus, TestRunStatusStr> = {
  [RunStatus.Untested]: "untested",
  [RunStatus.Blocked]: "blocked",
  [RunStatus.Passed]: "passed",
  [RunStatus.Failed]: "failed"
}

const stringToRunStatusExact = {
  untested: RunStatus.Untested,
  blocked: RunStatus.Blocked,
  passed: RunStatus.Passed,
  failed: RunStatus.Failed
} satisfies Record<TestRunStatusStr, TestRunStatus>

const stringToRunStatus: Readonly<Record<string, TestRunStatus>> = stringToRunStatusExact

export const testRunStatusToString = (s: TestRunStatus): TestRunStatusStr => runStatusToString[s]
export const stringToTestRunStatus = (s: string): TestRunStatus | undefined => lookupEnumValue(stringToRunStatus, s)

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
