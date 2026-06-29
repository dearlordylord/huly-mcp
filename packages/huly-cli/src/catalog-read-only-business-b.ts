import type { McpToolName } from "../../../src/mcp/tools/index.js"
import type { CliCommandSpec } from "./catalog-types.js"

export const businessReadOnlyCliCommandCatalogB = {
  list_events: {
    path: ["calendar", "events", "list"],
    positional: [],
    description: "List Events"
  },
  list_funnels: {
    path: ["leads", "funnels", "list"],
    positional: [],
    description: "List Funnels"
  },
  list_inventory_categories: {
    path: ["inventory", "categories", "list"],
    positional: [],
    description: "List Inventory Categories"
  },
  list_inventory_product_activity: {
    path: ["inventory", "product", "activity", "list"],
    positional: ["product"],
    description: "List Inventory Product Activity"
  },
  list_inventory_product_attachments: {
    path: ["inventory", "product", "attachments", "list"],
    positional: ["product"],
    description: "List Inventory Product Attachments"
  },
  list_inventory_product_comments: {
    path: ["inventory", "product", "comments", "list"],
    positional: ["product"],
    description: "List Inventory Product Comments"
  },
  list_inventory_product_photos: {
    path: ["inventory", "product", "photos", "list"],
    positional: ["product"],
    description: "List Inventory Product Photos"
  },
  list_inventory_products: {
    path: ["inventory", "products", "list"],
    positional: [],
    description: "List Inventory Products"
  },
  list_inventory_variants: {
    path: ["inventory", "variants", "list"],
    positional: [],
    description: "List Inventory Variants"
  },
  list_leads: {
    path: ["leads", "list"],
    positional: ["funnel"],
    description: "List Leads"
  },
  list_master_tags: {
    path: ["cards", "master-tags", "list"],
    positional: ["cardSpace"],
    description: "List Master Tags"
  },
  list_meeting_minutes: {
    path: ["office", "meeting-minutes", "list"],
    positional: [],
    description: "List Meeting Minutes"
  },
  list_office_defaults: {
    path: ["office", "defaults", "list"],
    positional: [],
    description: "List Office Defaults"
  },
  list_office_floors: {
    path: ["office", "floors", "list"],
    positional: [],
    description: "List Office Floors"
  },
  list_office_rooms: {
    path: ["office", "rooms", "list"],
    positional: [],
    description: "List Office Rooms"
  },
  list_offices: {
    path: ["office", "offices", "list"],
    positional: [],
    description: "List Offices"
  },
  list_recruiting_activity: {
    path: ["recruiting", "activity", "list"],
    positional: ["target"],
    description: "List Recruiting Activity"
  },
  list_recruiting_applicant_matches: {
    path: ["recruiting", "applicant", "matches", "list"],
    positional: [],
    description: "List Recruiting Applicant Matches"
  },
  list_recruiting_applicants: {
    path: ["recruiting", "applicants", "list"],
    positional: [],
    description: "List Recruiting Applicants"
  },
  list_recruiting_attachments: {
    path: ["recruiting", "attachments", "list"],
    positional: ["target"],
    description: "List Recruiting Attachments"
  },
  list_recruiting_candidate_skills: {
    path: ["recruiting", "candidate", "skills", "list"],
    positional: ["candidate"],
    description: "List Recruiting Candidate Skills"
  },
  list_recruiting_candidates: {
    path: ["recruiting", "candidates", "list"],
    positional: [],
    description: "List Recruiting Candidates"
  },
  list_recruiting_comments: {
    path: ["recruiting", "comments", "list"],
    positional: ["target"],
    description: "List Recruiting Comments"
  },
  list_recruiting_opinions: {
    path: ["recruiting", "opinions", "list"],
    positional: ["review"],
    description: "List Recruiting Opinions"
  },
  list_recruiting_related_issues: {
    path: ["recruiting", "related", "issues", "list"],
    positional: ["target"],
    description: "List Recruiting Related Issues"
  },
  list_recruiting_reviews: {
    path: ["recruiting", "reviews", "list"],
    positional: [],
    description: "List Recruiting Reviews"
  },
  list_recruiting_skills: {
    path: ["recruiting", "skills", "list"],
    positional: [],
    description: "List Recruiting Skills"
  },
  list_recruiting_vacancies: {
    path: ["recruiting", "vacancies", "list"],
    positional: [],
    description: "List Recruiting Vacancies"
  },
  list_recruiting_vacancy_statuses: {
    path: ["recruiting", "vacancy", "statuses", "list"],
    positional: ["vacancy"],
    description: "List Recruiting Vacancy Statuses"
  },
  list_recruiting_vacancy_types: {
    path: ["recruiting", "vacancy", "types", "list"],
    positional: [],
    description: "List Recruiting Vacancy Types"
  },
  list_recurring_events: {
    path: ["calendar", "events", "recurring", "list"],
    positional: [],
    description: "List Recurring Events"
  },
  list_schedules: {
    path: ["calendar", "schedules", "list"],
    positional: [],
    description: "List Schedules"
  },
  list_test_cases: {
    path: ["tests", "cases", "list"],
    positional: ["project"],
    description: "List Test Cases"
  },
  list_test_plans: {
    path: ["tests", "plans", "list"],
    positional: ["project"],
    description: "List Test Plans"
  },
  list_test_projects: {
    path: ["tests", "projects", "list"],
    positional: [],
    description: "List Test Projects"
  },
  list_test_results: {
    path: ["tests", "results", "list"],
    positional: ["project", "run"],
    description: "List Test Results"
  },
  list_test_runs: {
    path: ["tests", "runs", "list"],
    positional: ["project"],
    description: "List Test Runs"
  },
  list_test_suites: {
    path: ["tests", "suites", "list"],
    positional: ["project"],
    description: "List Test Suites"
  },
  list_time_spend_reports: {
    path: ["time", "reports", "list"],
    positional: [],
    description: "List Time Spend Reports"
  },
  list_todos: {
    path: ["planner", "todos", "list"],
    positional: [],
    description: "List Todos"
  },
  list_work_slots: {
    path: ["time", "work-slots", "list"],
    positional: [],
    description: "List Work Slots"
  }
} as const satisfies Partial<Record<McpToolName, CliCommandSpec>>
