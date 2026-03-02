import {
  addTestPlanItemParamsJsonSchema,
  createTestPlanParamsJsonSchema,
  createTestResultParamsJsonSchema,
  createTestRunParamsJsonSchema,
  deleteTestPlanParamsJsonSchema,
  deleteTestResultParamsJsonSchema,
  deleteTestRunParamsJsonSchema,
  getTestPlanParamsJsonSchema,
  getTestResultParamsJsonSchema,
  getTestRunParamsJsonSchema,
  listTestPlansParamsJsonSchema,
  listTestResultsParamsJsonSchema,
  listTestRunsParamsJsonSchema,
  parseAddTestPlanItemParams,
  parseCreateTestPlanParams,
  parseCreateTestResultParams,
  parseCreateTestRunParams,
  parseDeleteTestPlanParams,
  parseDeleteTestResultParams,
  parseDeleteTestRunParams,
  parseGetTestPlanParams,
  parseGetTestResultParams,
  parseGetTestRunParams,
  parseListTestPlansParams,
  parseListTestResultsParams,
  parseListTestRunsParams,
  parseRemoveTestPlanItemParams,
  parseRunTestPlanParams,
  parseUpdateTestPlanParams,
  parseUpdateTestResultParams,
  parseUpdateTestRunParams,
  removeTestPlanItemParamsJsonSchema,
  runTestPlanParamsJsonSchema,
  updateTestPlanParamsJsonSchema,
  updateTestResultParamsJsonSchema,
  updateTestRunParamsJsonSchema
} from "../../domain/schemas/test-management-plans.js"
import {
  addTestPlanItem,
  createTestPlan,
  deleteTestPlan,
  getTestPlan,
  listTestPlans,
  removeTestPlanItem,
  updateTestPlan
} from "../../huly/operations/test-management-plans.js"
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
} from "../../huly/operations/test-management-runs.js"
import { createToolHandler, type RegisteredTool } from "./registry.js"

const CATEGORY = "test-management" as const

export const testManagementPlansTools: ReadonlyArray<RegisteredTool> = [
  // --- Test Plans ---
  {
    name: "list_test_plans",
    description:
      "List test plans in a test management project. Returns plan names and IDs. Requires project ID or name.",
    category: CATEGORY,
    inputSchema: listTestPlansParamsJsonSchema,
    handler: createToolHandler("list_test_plans", parseListTestPlansParams, listTestPlans)
  },
  {
    name: "get_test_plan",
    description: "Get test plan details including its items (test cases). Accepts plan ID or name within a project.",
    category: CATEGORY,
    inputSchema: getTestPlanParamsJsonSchema,
    handler: createToolHandler("get_test_plan", parseGetTestPlanParams, getTestPlan)
  },
  {
    name: "create_test_plan",
    description:
      "Create a test plan in a project. Idempotent: returns existing plan if one with the same name exists (created=false).",
    category: CATEGORY,
    inputSchema: createTestPlanParamsJsonSchema,
    handler: createToolHandler("create_test_plan", parseCreateTestPlanParams, createTestPlan)
  },
  {
    name: "update_test_plan",
    description:
      "Update a test plan's name or description. Only provided fields are modified. Pass description=null to clear.",
    category: CATEGORY,
    inputSchema: updateTestPlanParamsJsonSchema,
    handler: createToolHandler("update_test_plan", parseUpdateTestPlanParams, updateTestPlan)
  },
  {
    name: "delete_test_plan",
    description: "Permanently delete a test plan. This does not delete associated test runs. Cannot be undone.",
    category: CATEGORY,
    inputSchema: deleteTestPlanParamsJsonSchema,
    handler: createToolHandler("delete_test_plan", parseDeleteTestPlanParams, deleteTestPlan)
  },

  // --- Test Plan Items ---
  {
    name: "add_test_plan_item",
    description:
      "Add a test case to a test plan. Resolves test case by ID or name. Optionally assign a person by email or name.",
    category: CATEGORY,
    inputSchema: addTestPlanItemParamsJsonSchema,
    handler: createToolHandler("add_test_plan_item", parseAddTestPlanItemParams, addTestPlanItem)
  },
  {
    name: "remove_test_plan_item",
    description: "Remove a test case from a test plan by item ID. Get item IDs from get_test_plan.",
    category: CATEGORY,
    inputSchema: removeTestPlanItemParamsJsonSchema,
    handler: createToolHandler("remove_test_plan_item", parseRemoveTestPlanItemParams, removeTestPlanItem)
  },

  // --- Test Runs ---
  {
    name: "list_test_runs",
    description: "List test runs in a test management project. Returns run names, IDs, and due dates.",
    category: CATEGORY,
    inputSchema: listTestRunsParamsJsonSchema,
    handler: createToolHandler("list_test_runs", parseListTestRunsParams, listTestRuns)
  },
  {
    name: "get_test_run",
    description: "Get test run details including all results. Accepts run ID or name within a project.",
    category: CATEGORY,
    inputSchema: getTestRunParamsJsonSchema,
    handler: createToolHandler("get_test_run", parseGetTestRunParams, getTestRun)
  },
  {
    name: "create_test_run",
    description: "Create a test run in a project. For bulk creation from a plan, use run_test_plan instead.",
    category: CATEGORY,
    inputSchema: createTestRunParamsJsonSchema,
    handler: createToolHandler("create_test_run", parseCreateTestRunParams, createTestRun)
  },
  {
    name: "update_test_run",
    description:
      "Update a test run's name, description, or due date. Only provided fields are modified. Pass null to clear optional fields.",
    category: CATEGORY,
    inputSchema: updateTestRunParamsJsonSchema,
    handler: createToolHandler("update_test_run", parseUpdateTestRunParams, updateTestRun)
  },
  {
    name: "delete_test_run",
    description: "Permanently delete a test run. This does not delete associated test results. Cannot be undone.",
    category: CATEGORY,
    inputSchema: deleteTestRunParamsJsonSchema,
    handler: createToolHandler("delete_test_run", parseDeleteTestRunParams, deleteTestRun)
  },

  // --- Test Results ---
  {
    name: "list_test_results",
    description: "List test results in a test run. Returns result names, statuses, and assignees.",
    category: CATEGORY,
    inputSchema: listTestResultsParamsJsonSchema,
    handler: createToolHandler("list_test_results", parseListTestResultsParams, listTestResults)
  },
  {
    name: "get_test_result",
    description: "Get test result details. Accepts result ID or name.",
    category: CATEGORY,
    inputSchema: getTestResultParamsJsonSchema,
    handler: createToolHandler("get_test_result", parseGetTestResultParams, getTestResult)
  },
  {
    name: "create_test_result",
    description: "Create a test result in a run. Resolves test case by ID or name. Status defaults to 'untested'.",
    category: CATEGORY,
    inputSchema: createTestResultParamsJsonSchema,
    handler: createToolHandler("create_test_result", parseCreateTestResultParams, createTestResult)
  },
  {
    name: "update_test_result",
    description:
      "Update a test result's status, assignee, or description. Status values: untested, blocked, passed, failed.",
    category: CATEGORY,
    inputSchema: updateTestResultParamsJsonSchema,
    handler: createToolHandler("update_test_result", parseUpdateTestResultParams, updateTestResult)
  },
  {
    name: "delete_test_result",
    description: "Permanently delete a test result. Cannot be undone.",
    category: CATEGORY,
    inputSchema: deleteTestResultParamsJsonSchema,
    handler: createToolHandler("delete_test_result", parseDeleteTestResultParams, deleteTestResult)
  },

  // --- Run Test Plan ---
  {
    name: "run_test_plan",
    description:
      "Execute a test plan: creates a test run and one test result per plan item. Returns the run ID and count of results created. Optionally name the run and set a due date.",
    category: CATEGORY,
    inputSchema: runTestPlanParamsJsonSchema,
    annotations: {
      title: "Run Test Plan",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false
    },
    handler: createToolHandler("run_test_plan", parseRunTestPlanParams, runTestPlan)
  }
]
