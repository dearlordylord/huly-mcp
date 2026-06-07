import type { DocumentUpdate } from "@hcengineering/core"
import { Effect } from "effect"

import { TestSuiteId } from "../../domain/schemas/shared.js"
import type { UpdateTestSuiteParams, UpdateTestSuiteResult } from "../../domain/schemas/test-management-core.js"
import { UPDATE_TEST_SUITE_FIELDS } from "../../domain/schemas/test-management-core.js"
import { HulyClient, type HulyClientError } from "../client.js"
import type { NoUpdateFieldsError, TestProjectNotFoundError, TestSuiteNotFoundError } from "../errors.js"
import { testManagement } from "../test-management-classes.js"
import type { TestSuite } from "../test-management-types.js"
import { findTestProject, findTestSuite } from "./test-management-shared.js"
import {
  type CoveredUpdateEntry,
  coveredUpdateEntry,
  type DirectOrUnsetUpdateEntry,
  type DirectUpdateEntry,
  mergeCoveredUpdateEntries,
  requireUpdateFields
} from "./update-guards.js"

type UpdateTestSuiteError = HulyClientError | NoUpdateFieldsError | TestProjectNotFoundError | TestSuiteNotFoundError

export const updateTestSuite = (
  params: UpdateTestSuiteParams
): Effect.Effect<UpdateTestSuiteResult, UpdateTestSuiteError, HulyClient> =>
  Effect.gen(function*() {
    yield* requireUpdateFields("update_test_suite", params, UPDATE_TEST_SUITE_FIELDS)

    const client = yield* HulyClient
    const project = yield* findTestProject(client, params.project)
    const suite = yield* findTestSuite(client, project, params.suite)

    type UpdateTestSuiteField = typeof UPDATE_TEST_SUITE_FIELDS[number]
    type UpdateTestSuiteEntries = {
      readonly name: CoveredUpdateEntry<
        "name",
        DirectUpdateEntry<UpdateTestSuiteField, DocumentUpdate<TestSuite>, "name">
      >
      readonly description: CoveredUpdateEntry<
        "description",
        DirectOrUnsetUpdateEntry<UpdateTestSuiteField, DocumentUpdate<TestSuite>, "description">
      >
    }
    const updateEntries = {
      name: coveredUpdateEntry("name", params.name === undefined ? {} : { name: params.name }),
      description: coveredUpdateEntry(
        "description",
        params.description === undefined
          ? {}
          : params.description === null
          ? { $unset: { description: "" } }
          : { description: params.description }
      )
    } satisfies UpdateTestSuiteEntries
    const updateOps: DocumentUpdate<TestSuite> = mergeCoveredUpdateEntries(Object.values(updateEntries))

    yield* client.updateDoc(
      testManagement.class.TestSuite,
      project._id,
      suite._id,
      updateOps
    )

    return { id: TestSuiteId.make(suite._id), updated: true }
  })
