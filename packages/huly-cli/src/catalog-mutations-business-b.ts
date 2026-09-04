import type { McpToolName } from "../../../src/mcp/tools/index.js"
import type { CliCommandSpec } from "./catalog-types.js"

export const businessMutationCliCommandCatalogB = {
  create_public_holiday: {
    path: ["hr", "holidays", "create"],
    positional: ["title", "date", "department"],
    description: "Create Public Holiday"
  },
  create_hr_request: {
    path: ["hr", "requests", "create"],
    positional: ["employee", "requestType", "startDate", "endDate"],
    description: "Create HR Request",
    behavior: { fileInput: { fields: ["description"] } }
  },
  add_hr_request_comment: {
    path: ["hr", "requests", "comments", "add"],
    positional: ["request", "body"],
    description: "Add HR Request Comment",
    behavior: { fileInput: { fields: ["body"] } }
  },
  add_hr_request_attachment: {
    path: ["hr", "requests", "attachments", "add"],
    positional: ["request", "filename", "contentType"],
    description: "Add HR Request Attachment",
    behavior: { base64FileInput: { fields: ["data"] } }
  },
  assign_staff_department: {
    path: ["hr", "staff", "assign-department"],
    positional: ["employee", "department"],
    description: "Set Staff Department",
    behavior: { confirmation: { type: "requires-yes", message: "hr staff assign-department requires --yes." } }
  },
  create_department: { path: ["hr", "departments", "create"], positional: ["name"], description: "Create Department" },
  delete_department: {
    path: ["hr", "departments", "delete"],
    positional: ["department"],
    description: "Delete Department",
    behavior: { confirmation: { type: "requires-yes", message: "hr departments delete requires --yes." } }
  },
  delete_hr_request: {
    path: ["hr", "requests", "delete"],
    positional: ["request"],
    description: "Delete HR Request",
    behavior: { confirmation: { type: "requires-yes", message: "hr requests delete requires --yes." } }
  },
  delete_public_holiday: {
    path: ["hr", "holidays", "delete"],
    positional: ["holiday"],
    description: "Delete Public Holiday",
    behavior: { confirmation: { type: "requires-yes", message: "hr holidays delete requires --yes." } }
  },
  delete_hr_request_comment: {
    path: ["hr", "requests", "comments", "delete"],
    positional: ["request", "commentId"],
    description: "Delete HR Request Comment",
    behavior: { confirmation: { type: "requires-yes", message: "hr requests comments delete requires --yes." } }
  },
  delete_hr_request_attachment: {
    path: ["hr", "requests", "attachments", "delete"],
    positional: ["request", "attachmentId"],
    description: "Delete HR Request Attachment",
    behavior: { confirmation: { type: "requires-yes", message: "hr requests attachments delete requires --yes." } }
  },
  delete_test_plan: {
    path: ["tests", "plan", "delete"],
    positional: ["project", "plan"],
    description: "Delete Test Plan",
    behavior: { confirmation: { type: "requires-yes", message: "tests plan delete requires --yes." } }
  },
  delete_test_result: {
    path: ["tests", "result", "delete"],
    positional: ["project", "result"],
    description: "Delete Test Result",
    behavior: { confirmation: { type: "requires-yes", message: "tests result delete requires --yes." } }
  },
  delete_test_run: {
    path: ["tests", "run", "delete"],
    positional: ["project", "run"],
    description: "Delete Test Run",
    behavior: { confirmation: { type: "requires-yes", message: "tests run delete requires --yes." } }
  },
  delete_test_suite: {
    path: ["tests", "suite", "delete"],
    positional: ["project", "suite"],
    description: "Delete Test Suite",
    behavior: { confirmation: { type: "requires-yes", message: "tests suite delete requires --yes." } }
  },
  delete_todo: {
    path: ["planner", "todos", "delete"],
    positional: ["locator"],
    description: "Delete Todo",
    behavior: { confirmation: { type: "requires-yes", message: "planner todos delete requires --yes." } }
  },
  move_drive_item: {
    path: ["drive", "items", "move"],
    positional: ["drive", "targetFolderPath"],
    description: "Move Drive Item"
  },
  update_department: {
    path: ["hr", "departments", "update"],
    positional: ["department"],
    description: "Update Department"
  },
  update_public_holiday: {
    path: ["hr", "holidays", "update"],
    positional: ["holiday"],
    description: "Update Public Holiday"
  },
  update_hr_request: {
    path: ["hr", "requests", "update"],
    positional: ["request"],
    description: "Update HR Request",
    behavior: { fileInput: { fields: ["description"] } }
  },
  update_hr_request_comment: {
    path: ["hr", "requests", "comments", "update"],
    positional: ["request", "commentId", "body"],
    description: "Update HR Request Comment",
    behavior: { fileInput: { fields: ["body"] } }
  },
  update_hr_request_attachment: {
    path: ["hr", "requests", "attachments", "update"],
    positional: ["request", "attachmentId"],
    description: "Update HR Request Attachment"
  },
  remove_recruiting_candidate_skill: {
    path: ["recruiting", "candidate", "skill", "remove"],
    positional: ["candidate", "skill"],
    description: "Remove Recruiting Candidate Skill",
    behavior: { confirmation: { type: "requires-yes", message: "recruiting candidate skill remove requires --yes." } }
  },
  remove_todo_label: {
    path: ["planner", "todos", "labels", "remove"],
    positional: ["locator", "label"],
    description: "Remove Todo Label",
    behavior: { confirmation: { type: "requires-yes", message: "planner todos labels remove requires --yes." } }
  },
  remove_recruiting_related_issue: {
    path: ["recruiting", "related", "issue", "remove"],
    positional: ["target", "issue"],
    description: "Remove Recruiting Related Issue",
    behavior: { confirmation: { type: "requires-yes", message: "recruiting related issue remove requires --yes." } }
  },
  remove_test_plan_item: {
    path: ["tests", "plan", "item", "remove"],
    positional: ["project", "plan", "item"],
    description: "Remove Test Plan Item",
    behavior: { confirmation: { type: "requires-yes", message: "tests plan item remove requires --yes." } }
  },
  rename_drive_item: {
    path: ["drive", "items", "rename"],
    positional: ["drive", "title"],
    description: "Rename Drive Item"
  },
  reopen_todo: { path: ["planner", "todos", "reopen"], positional: ["locator"], description: "Reopen Todo" },
  restore_drive_file_version: {
    path: ["drive", "files", "versions", "restore"],
    positional: ["drive", "file", "version"],
    description: "Restore Drive File Version"
  },
  run_test_plan: { path: ["tests", "plan", "run"], positional: ["project", "plan"], description: "Run Test Plan" },
  schedule_todo: {
    path: ["planner", "todos", "schedule"],
    positional: ["locator", "date", "dueDate"],
    description: "Schedule Todo"
  },
  set_recruiting_candidate_profile: {
    path: ["recruiting", "candidate", "profile", "set"],
    positional: ["candidate"],
    description: "Set Recruiting Candidate Profile"
  },
  unarchive_recruiting_vacancy: {
    path: ["recruiting", "vacancy", "unarchive"],
    positional: ["vacancy"],
    description: "Unarchive Recruiting Vacancy"
  },
  unschedule_todo: { path: ["planner", "todos", "unschedule"], positional: [], description: "Unschedule Todo" },
  update_card: {
    path: ["cards", "update"],
    positional: ["cardSpace", "card"],
    description: "Update Card",
    behavior: { fileInput: { fields: ["content"] } }
  },
  update_card_comment: {
    path: ["cards", "comments", "update"],
    positional: ["cardSpace", "card", "commentId", "body"],
    description: "Update Card Comment",
    behavior: { fileInput: { fields: ["body"] } }
  },
  update_drive: {
    path: ["drive", "update"],
    positional: ["drive"],
    description: "Update Drive",
    behavior: { fileInput: { fields: ["description"] } }
  },
  update_drive_file_comment: {
    path: ["drive", "files", "comments", "update"],
    positional: ["drive", "commentId", "body"],
    description: "Update Drive File Comment",
    behavior: { fileInput: { fields: ["body"] } }
  },
  update_inventory_category: {
    path: ["inventory", "category", "update"],
    positional: ["category"],
    description: "Update Inventory Category"
  },
  update_inventory_product: {
    path: ["inventory", "product", "update"],
    positional: ["product"],
    description: "Update Inventory Product"
  },
  update_inventory_product_attachment: {
    path: ["inventory", "product", "attachment", "update"],
    positional: ["product", "attachmentId"],
    description: "Update Inventory Product Attachment",
    behavior: { fileInput: { fields: ["description"] } }
  },
  update_funnel: {
    path: ["leads", "funnels", "update"],
    positional: ["funnel"],
    description: "Update an exact funnel with validated workflow and workspace accounts",
    behavior: { fileInput: { fields: ["fullDescription"] } }
  },
  update_lead: {
    path: ["leads", "update"],
    positional: ["funnel", "identifier"],
    description: "Update Lead",
    behavior: { fileInput: { fields: ["description", "customerDescription"] } }
  },
  move_lead: {
    path: ["leads", "move"],
    positional: ["funnel", "identifier", "destinationFunnel"],
    description: "Move Lead"
  },
  delete_lead: {
    path: ["leads", "delete"],
    positional: ["funnel", "identifier"],
    description: "Delete Lead",
    behavior: { confirmation: { type: "requires-yes", message: "leads delete requires --yes." } }
  },
  update_inventory_product_comment: {
    path: ["inventory", "product", "comment", "update"],
    positional: ["product", "commentId", "body"],
    description: "Update Inventory Product Comment",
    behavior: { fileInput: { fields: ["body"] } }
  },
  update_inventory_product_photo: {
    path: ["inventory", "product", "photo", "update"],
    positional: ["product", "photoId"],
    description: "Update Inventory Product Photo",
    behavior: { fileInput: { fields: ["description"] } }
  },
  update_inventory_variant: {
    path: ["inventory", "variant", "update"],
    positional: ["variant"],
    description: "Update Inventory Variant"
  },
  update_recruiting_applicant: {
    path: ["recruiting", "applicant", "update"],
    positional: ["applicant"],
    description: "Update Recruiting Applicant"
  },
  update_recruiting_attachment: {
    path: ["recruiting", "attachment", "update"],
    positional: ["target", "attachmentId"],
    description: "Update Recruiting Attachment",
    behavior: { fileInput: { fields: ["description"] } }
  },
  update_recruiting_comment: {
    path: ["recruiting", "comment", "update"],
    positional: ["target", "commentId", "body"],
    description: "Update Recruiting Comment",
    behavior: { fileInput: { fields: ["body"] } }
  },
  update_recruiting_opinion: {
    path: ["recruiting", "opinion", "update"],
    positional: ["opinion"],
    description: "Update Recruiting Opinion",
    behavior: { fileInput: { fields: ["description"] } }
  },
  update_recruiting_review: {
    path: ["recruiting", "review", "update"],
    positional: ["review"],
    description: "Update Recruiting Review",
    behavior: { fileInput: { fields: ["description"] } }
  },
  update_recruiting_vacancy: {
    path: ["recruiting", "vacancy", "update"],
    positional: ["vacancy"],
    description: "Update Recruiting Vacancy",
    behavior: { fileInput: { fields: ["shortDescription", "fullDescription"] } }
  },
  update_test_case: {
    path: ["tests", "case", "update"],
    positional: ["project", "testCase"],
    description: "Update Test Case",
    behavior: { fileInput: { fields: ["description"] } }
  },
  update_test_plan: {
    path: ["tests", "plan", "update"],
    positional: ["project", "plan"],
    description: "Update Test Plan",
    behavior: { fileInput: { fields: ["description"] } }
  },
  update_test_result: {
    path: ["tests", "result", "update"],
    positional: ["project", "result"],
    description: "Update Test Result",
    behavior: { fileInput: { fields: ["description"] } }
  },
  update_test_run: {
    path: ["tests", "run", "update"],
    positional: ["project", "run"],
    description: "Update Test Run",
    behavior: { fileInput: { fields: ["description"] } }
  },
  update_test_suite: {
    path: ["tests", "suite", "update"],
    positional: ["project", "suite"],
    description: "Update Test Suite",
    behavior: { fileInput: { fields: ["description"] } }
  },
  update_todo: {
    path: ["planner", "todos", "update"],
    positional: ["locator"],
    description: "Update Todo",
    behavior: { fileInput: { fields: ["description"] } }
  }
} as const satisfies Partial<Record<McpToolName, CliCommandSpec>>
