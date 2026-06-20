import {
  createTestCaseParamsJsonSchema,
  CreateTestCaseResultSchema,
  createTestSuiteParamsJsonSchema,
  CreateTestSuiteResultSchema,
  deleteTestCaseParamsJsonSchema,
  DeleteTestCaseResultSchema,
  deleteTestSuiteParamsJsonSchema,
  DeleteTestSuiteResultSchema,
  getTestCaseParamsJsonSchema,
  GetTestCaseResultSchema,
  getTestSuiteParamsJsonSchema,
  GetTestSuiteResultSchema,
  listTestCasesParamsJsonSchema,
  ListTestCasesResultSchema,
  listTestProjectsParamsJsonSchema,
  ListTestProjectsResultSchema,
  listTestSuitesParamsJsonSchema,
  ListTestSuitesResultSchema,
  parseCreateTestCaseParams,
  parseCreateTestSuiteParams,
  parseDeleteTestCaseParams,
  parseDeleteTestSuiteParams,
  parseGetTestCaseParams,
  parseGetTestSuiteParams,
  parseListTestCasesParams,
  parseListTestProjectsParams,
  parseListTestSuitesParams,
  parseUpdateTestCaseParams,
  parseUpdateTestSuiteParams,
  updateTestCaseParamsJsonSchema,
  UpdateTestCaseResultSchema,
  updateTestSuiteParamsJsonSchema,
  UpdateTestSuiteResultSchema
} from "../../domain/schemas/test-management-core.js"
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
} from "../../huly/operations/test-management-core.js"
import { defineTool, type RegisteredTool } from "./registry.js"

const CATEGORY = "test-management" as const

export const testManagementCoreTools: ReadonlyArray<RegisteredTool> = [
  defineTool(
    {
      name: "list_test_projects",
      description:
        "List test management projects. Returns test projects sorted by name. These are separate from tracker projects.",
      category: CATEGORY,
      inputSchema: listTestProjectsParamsJsonSchema,
      resultSchema: ListTestProjectsResultSchema
    },
    parseListTestProjectsParams,
    listTestProjects
  ),
  defineTool(
    {
      name: "list_test_suites",
      description:
        "List test suites in a test project. Accepts project ID or name. Optional parent filter for nested suites.",
      category: CATEGORY,
      inputSchema: listTestSuitesParamsJsonSchema,
      resultSchema: ListTestSuitesResultSchema
    },
    parseListTestSuitesParams,
    listTestSuites
  ),
  defineTool(
    {
      name: "get_test_suite",
      description:
        "Get a single test suite by ID or name within a test project. Returns suite details and test case count.",
      category: CATEGORY,
      inputSchema: getTestSuiteParamsJsonSchema,
      resultSchema: GetTestSuiteResultSchema
    },
    parseGetTestSuiteParams,
    getTestSuite
  ),
  defineTool(
    {
      name: "create_test_suite",
      description:
        "Create a test suite in a test project. Idempotent: returns existing suite if one with the same name exists (created=false). Optional parent for nesting.",
      category: CATEGORY,
      inputSchema: createTestSuiteParamsJsonSchema,
      resultSchema: CreateTestSuiteResultSchema
    },
    parseCreateTestSuiteParams,
    createTestSuite
  ),
  defineTool(
    {
      name: "update_test_suite",
      description: "Update a test suite. Accepts suite ID or name. Only provided fields are modified.",
      category: CATEGORY,
      inputSchema: updateTestSuiteParamsJsonSchema,
      resultSchema: UpdateTestSuiteResultSchema
    },
    parseUpdateTestSuiteParams,
    updateTestSuite
  ),
  defineTool(
    {
      name: "delete_test_suite",
      description: "Permanently delete a test suite. Accepts suite ID or name. This action cannot be undone.",
      category: CATEGORY,
      inputSchema: deleteTestSuiteParamsJsonSchema,
      resultSchema: DeleteTestSuiteResultSchema
    },
    parseDeleteTestSuiteParams,
    deleteTestSuite
  ),
  defineTool(
    {
      name: "list_test_cases",
      description: "List test cases in a test project. Optional filters: suite (ID or name), assignee (name or email).",
      category: CATEGORY,
      inputSchema: listTestCasesParamsJsonSchema,
      resultSchema: ListTestCasesResultSchema
    },
    parseListTestCasesParams,
    listTestCases
  ),
  defineTool(
    {
      name: "get_test_case",
      description: "Get a single test case by ID or name within a test project.",
      category: CATEGORY,
      inputSchema: getTestCaseParamsJsonSchema,
      resultSchema: GetTestCaseResultSchema
    },
    parseGetTestCaseParams,
    getTestCase
  ),
  defineTool(
    {
      name: "create_test_case",
      description:
        "Create a test case attached to a suite. Requires project and suite. Defaults: type=functional, priority=medium, status=draft.",
      category: CATEGORY,
      inputSchema: createTestCaseParamsJsonSchema,
      resultSchema: CreateTestCaseResultSchema
    },
    parseCreateTestCaseParams,
    createTestCase
  ),
  defineTool(
    {
      name: "update_test_case",
      description:
        "Update a test case. Accepts test case ID or name. Only provided fields are modified. Set assignee to null to unassign.",
      category: CATEGORY,
      inputSchema: updateTestCaseParamsJsonSchema,
      resultSchema: UpdateTestCaseResultSchema
    },
    parseUpdateTestCaseParams,
    updateTestCase
  ),
  defineTool(
    {
      name: "delete_test_case",
      description: "Permanently delete a test case. Accepts test case ID or name. This action cannot be undone.",
      category: CATEGORY,
      inputSchema: deleteTestCaseParamsJsonSchema,
      resultSchema: DeleteTestCaseResultSchema
    },
    parseDeleteTestCaseParams,
    deleteTestCase
  )
]
