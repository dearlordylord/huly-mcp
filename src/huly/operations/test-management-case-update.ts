import type { Employee } from "@hcengineering/contact"
import type { DocumentUpdate } from "@hcengineering/core"
import { Effect } from "effect"

import { TestCaseId } from "../../domain/schemas/shared.js"
import type { UpdateTestCaseParams, UpdateTestCaseResult } from "../../domain/schemas/test-management-core.js"
import { UPDATE_TEST_CASE_FIELDS } from "../../domain/schemas/test-management-core.js"
import { HulyClient, type HulyClientError } from "../client.js"
import type {
  NoUpdateFieldsError,
  PersonNotFoundError,
  TestCaseNotFoundError,
  TestProjectNotFoundError
} from "../errors.js"
import { testManagement } from "../test-management-classes.js"
import type { TestCase } from "../test-management-types.js"
import { toRef } from "./sdk-boundary.js"
import {
  findTestCase,
  findTestProject,
  resolveAssignee,
  resolveCasePriority,
  resolveCaseStatus,
  resolveCaseType
} from "./test-management-shared.js"
import { mergeUpdateEntries, requireUpdateFields } from "./update-guards.js"

type UpdateTestCaseError =
  | HulyClientError
  | NoUpdateFieldsError
  | TestProjectNotFoundError
  | TestCaseNotFoundError
  | PersonNotFoundError

export const updateTestCase = (
  params: UpdateTestCaseParams
): Effect.Effect<UpdateTestCaseResult, UpdateTestCaseError, HulyClient> =>
  Effect.gen(function*() {
    yield* requireUpdateFields("update_test_case", params, UPDATE_TEST_CASE_FIELDS)

    const client = yield* HulyClient
    const project = yield* findTestProject(client, params.project)
    const tc = yield* findTestCase(client, project, params.testCase)

    type UpdateTestCaseField = typeof UPDATE_TEST_CASE_FIELDS[number]
    const updateEntries = {
      name: Effect.succeed(params.name === undefined ? {} : { name: params.name }),
      description: Effect.gen(function*() {
        if (params.description === undefined) return {}
        if (params.description === null) return { description: null }
        return {
          description: yield* client.uploadMarkup(
            testManagement.class.TestCase,
            tc._id,
            "description",
            params.description,
            "markdown"
          )
        }
      }),
      type: Effect.succeed(params.type === undefined ? {} : { type: resolveCaseType(params.type) }),
      priority: Effect.succeed(params.priority === undefined ? {} : { priority: resolveCasePriority(params.priority) }),
      status: Effect.succeed(params.status === undefined ? {} : { status: resolveCaseStatus(params.status) }),
      assignee: Effect.gen(function*() {
        if (params.assignee === undefined) return {}
        if (params.assignee === null) {
          const unassignOps: DocumentUpdate<TestCase> = { assignee: null }
          return unassignOps
        }
        const person = yield* resolveAssignee(params.assignee)
        const assignOps: DocumentUpdate<TestCase> = { assignee: toRef<Employee>(person._id) }
        return assignOps
      })
    } satisfies Record<
      UpdateTestCaseField,
      Effect.Effect<DocumentUpdate<TestCase>, HulyClientError | PersonNotFoundError, HulyClient>
    >
    const ops = mergeUpdateEntries(yield* Effect.all(Object.values(updateEntries)))

    yield* client.updateDoc(testManagement.class.TestCase, project._id, tc._id, ops)

    return { id: TestCaseId.make(tc._id), updated: true }
  })
