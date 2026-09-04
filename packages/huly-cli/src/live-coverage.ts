import type { McpToolName } from "../../../src/mcp/tools/index.js"
import type { CliBehaviorClass, CliDedicatedLiveRiskClass } from "./parity-contract.js"

interface CliLiveCoverageCase {
  readonly behaviors: ReadonlyArray<CliBehaviorClass>
  readonly id: string
  readonly risks: ReadonlyArray<CliDedicatedLiveRiskClass>
  readonly tools: ReadonlyArray<McpToolName>
}

export type CliIntegrationCoverageDecision =
  | {
      readonly caseIds: ReadonlyArray<string>
      readonly risks: ReadonlyArray<CliDedicatedLiveRiskClass>
      readonly type: "dedicated-live"
    }
  | {
      readonly rationale: "shared-operation-and-adapter-class"
      readonly risks: ReadonlyArray<CliDedicatedLiveRiskClass>
      readonly type: "representative"
    }

export const CLI_COVERAGE_REVIEWED_REGISTRY_OPERATIONS = 578
export const CLI_COVERAGE_REVIEWED_ROOT_COMMANDS = 55
export const CLI_COVERAGE_REVIEWED_LOCAL_COMMANDS = 7

export const CLI_REVIEWED_COVERAGE_CATEGORIES = [
  "activity",
  "approvals",
  "associations",
  "attachments",
  "boards",
  "calendar",
  "cards",
  "channels",
  "collaborators",
  "comments",
  "contacts",
  "custom-fields",
  "documents",
  "drive",
  "hr",
  "inventory",
  "issues",
  "labels",
  "leads",
  "mail",
  "milestones",
  "model-administration",
  "notifications",
  "planner",
  "preferences",
  "processes",
  "projects",
  "recruiting",
  "sdk-discovery",
  "search",
  "security-administration",
  "sequence-administration",
  "spaces",
  "storage",
  "support",
  "tag-categories",
  "tags",
  "task-management",
  "templates",
  "test-management",
  "time tracking",
  "user-statuses",
  "views",
  "virtual-office",
  "workbench",
  "workflow-statuses",
  "workspace"
] as const

const assertReviewedCategory = (category: string): void => {
  if (!CLI_REVIEWED_COVERAGE_CATEGORIES.some((candidate) => candidate === category)) {
    throw new Error(`CLI integration risk classification is missing category '${category}'.`)
  }
}

export const CLI_LIVE_COVERAGE_CASES: ReadonlyArray<CliLiveCoverageCase> = [
  {
    id: "scalar-structured-read",
    tools: ["list_projects"],
    behaviors: ["scalar-input", "structured-output"],
    risks: []
  },
  {
    id: "structured-calendar-lifecycle",
    tools: ["create_event", "delete_event"],
    behaviors: ["structured-json-input"],
    risks: ["lifecycle"]
  },
  {
    id: "nullable-drawing-lifecycle",
    tools: ["create_drawing", "update_drawing", "delete_drawing"],
    behaviors: ["nullable-clear-input"],
    risks: ["lifecycle"]
  },
  {
    id: "hr-department-lifecycle",
    tools: ["get_department", "create_department", "update_department", "assign_staff_department", "delete_department"],
    behaviors: ["structured-json-input"],
    risks: ["lifecycle"]
  },
  {
    id: "hr-request-lifecycle",
    tools: [
      "list_hr_request_types",
      "list_hr_requests",
      "get_hr_request",
      "create_hr_request",
      "update_hr_request",
      "delete_hr_request"
    ],
    behaviors: ["structured-json-input", "text-file-input", "consequential-confirmation"],
    risks: ["lifecycle", "safety"]
  },
  {
    id: "hr-holiday-report-lifecycle",
    tools: [
      "list_public_holidays",
      "get_public_holiday",
      "create_public_holiday",
      "update_public_holiday",
      "delete_public_holiday",
      "get_hr_schedule",
      "get_hr_table",
      "get_hr_summary_report"
    ],
    behaviors: ["structured-json-input", "consequential-confirmation"],
    risks: ["lifecycle", "safety"]
  },
  {
    id: "funnel-administration-lifecycle",
    tools: ["get_funnel", "create_funnel", "update_funnel", "archive_funnel", "delete_funnel"],
    behaviors: ["structured-json-input", "nullable-clear-input", "text-file-input", "consequential-confirmation"],
    risks: ["lifecycle", "safety"]
  },
  {
    id: "person-administration-lifecycle",
    tools: [
      "create_person",
      "get_person_administration",
      "merge_people",
      "list_social_identity_providers",
      "repair_person_social_identities",
      "add_person_comment",
      "list_person_comments",
      "update_person_comment",
      "delete_person_comment",
      "add_person_attachment",
      "list_person_attachments",
      "get_person_attachment",
      "update_person_attachment",
      "delete_person_attachment",
      "delete_person"
    ],
    behaviors: ["structured-json-input", "upload-input"],
    risks: ["lifecycle", "safety", "transport"]
  },
  { id: "text-file-input", tools: ["add_comment"], behaviors: ["text-file-input"], risks: [] },
  { id: "raw-upload", tools: ["add_attachment"], behaviors: ["upload-input"], risks: ["transport"] },
  { id: "binary-download", tools: ["download_attachment"], behaviors: ["binary-output"], risks: ["transport"] },
  { id: "image-output", tools: ["read_attachment_content"], behaviors: ["image-output"], risks: ["transport"] },
  { id: "agent-warning", tools: ["list_workbench_applications"], behaviors: ["agent-warning"], risks: ["privacy"] },
  { id: "typed-error", tools: ["get_issue"], behaviors: ["typed-error"], risks: [] },
  {
    id: "consequential-refusals",
    tools: [
      "create_workspace",
      "invite_employee",
      "update_member_role",
      "approve_approval_request",
      "add_space_members",
      "start_process",
      "mark_all_notifications_read"
    ],
    behaviors: ["consequential-confirmation"],
    risks: ["safety"]
  },
  {
    id: "workspace-client-read",
    tools: ["get_workspace_info"],
    behaviors: ["workspace-administration"],
    risks: ["workspace-client"]
  },
  { id: "caller-private-status", tools: ["get_support_status"], behaviors: [], risks: ["privacy"] },
  { id: "external-channel-privacy", tools: ["list_external_channel_messages"], behaviors: [], risks: ["privacy"] },
  { id: "mail-thread-privacy", tools: ["list_mail_threads"], behaviors: [], risks: ["privacy"] }
]

interface CliUniqueRiskDecision {
  readonly caseId: string
  readonly risks: ReadonlyArray<CliDedicatedLiveRiskClass>
  readonly tools: ReadonlyArray<McpToolName>
}

export const CLI_UNIQUE_RISK_DECISIONS: ReadonlyArray<CliUniqueRiskDecision> = [
  { caseId: "structured-calendar-lifecycle", tools: ["create_event", "delete_event"], risks: ["lifecycle"] },
  {
    caseId: "nullable-drawing-lifecycle",
    tools: ["create_drawing", "update_drawing", "delete_drawing"],
    risks: ["lifecycle"]
  },
  {
    caseId: "hr-department-lifecycle",
    tools: ["create_department", "update_department", "assign_staff_department", "delete_department"],
    risks: ["lifecycle"]
  },
  {
    caseId: "hr-request-lifecycle",
    tools: ["create_hr_request", "update_hr_request", "delete_hr_request"],
    risks: ["lifecycle"]
  },
  { caseId: "hr-request-lifecycle", tools: ["delete_hr_request"], risks: ["safety"] },
  {
    caseId: "hr-holiday-report-lifecycle",
    tools: ["create_public_holiday", "update_public_holiday", "delete_public_holiday"],
    risks: ["lifecycle"]
  },
  { caseId: "hr-holiday-report-lifecycle", tools: ["delete_public_holiday"], risks: ["safety"] },
  {
    caseId: "funnel-administration-lifecycle",
    tools: ["create_funnel", "update_funnel", "archive_funnel", "delete_funnel"],
    risks: ["lifecycle"]
  },
  {
    caseId: "person-administration-lifecycle",
    tools: [
      "create_person",
      "add_person_comment",
      "update_person_comment",
      "delete_person_comment",
      "add_person_attachment",
      "update_person_attachment",
      "delete_person_attachment",
      "delete_person"
    ],
    risks: ["lifecycle"]
  },
  {
    caseId: "person-administration-lifecycle",
    tools: ["add_person_attachment", "get_person_attachment"],
    risks: ["transport"]
  },
  { caseId: "person-administration-lifecycle", tools: ["merge_people"], risks: ["safety"] },
  { caseId: "funnel-administration-lifecycle", tools: ["archive_funnel", "delete_funnel"], risks: ["safety"] },
  { caseId: "raw-upload", tools: ["add_attachment"], risks: ["transport"] },
  { caseId: "binary-download", tools: ["download_attachment"], risks: ["transport"] },
  { caseId: "image-output", tools: ["read_attachment_content"], risks: ["transport"] },
  { caseId: "agent-warning", tools: ["list_workbench_applications"], risks: ["privacy"] },
  {
    caseId: "consequential-refusals",
    tools: [
      "create_workspace",
      "invite_employee",
      "update_member_role",
      "approve_approval_request",
      "add_space_members",
      "start_process",
      "mark_all_notifications_read"
    ],
    risks: ["safety"]
  },
  { caseId: "workspace-client-read", tools: ["get_workspace_info"], risks: ["workspace-client"] },
  { caseId: "caller-private-status", tools: ["get_support_status"], risks: ["privacy"] },
  { caseId: "external-channel-privacy", tools: ["list_external_channel_messages"], risks: ["privacy"] },
  { caseId: "mail-thread-privacy", tools: ["list_mail_threads"], risks: ["privacy"] }
]

const uniqueRisksFor = (toolName: McpToolName): ReadonlyArray<CliDedicatedLiveRiskClass> => [
  ...new Set(
    CLI_UNIQUE_RISK_DECISIONS.filter((decision) => decision.tools.includes(toolName)).flatMap(
      (decision) => decision.risks
    )
  )
]

export const cliIntegrationCoverageDecision = (
  toolName: McpToolName,
  category: string
): CliIntegrationCoverageDecision => {
  assertReviewedCategory(category)
  const cases = CLI_LIVE_COVERAGE_CASES.filter((coverageCase) => coverageCase.tools.includes(toolName))
  const risks = uniqueRisksFor(toolName)
  return cases.length === 0
    ? { type: "representative", rationale: "shared-operation-and-adapter-class", risks }
    : { type: "dedicated-live", caseIds: cases.map((coverageCase) => coverageCase.id), risks }
}
