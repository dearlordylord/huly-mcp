import type { McpToolName } from "../../../src/mcp/tools/index.js"
import type { CliCommandSpec } from "./catalog-types.js"

export const businessReadOnlyCliCommandCatalogA = {
  get_card: {
    path: ["cards", "get"],
    positional: ["cardSpace", "card"],
    description: "Get Card"
  },
  get_detailed_time_report: {
    path: ["time", "reports", "detailed", "get"],
    positional: ["project"],
    description: "Get Detailed Time Report"
  },
  get_drive: {
    path: ["drive", "get"],
    positional: ["drive"],
    description: "Get Drive"
  },
  get_drive_item: {
    path: ["drive", "items", "get"],
    positional: ["drive"],
    description: "Get Drive Item"
  },
  get_event: {
    path: ["calendar", "events", "get"],
    positional: ["eventId"],
    description: "Get Event"
  },
  get_inventory_category: {
    path: ["inventory", "category", "get"],
    positional: ["category"],
    description: "Get Inventory Category"
  },
  get_inventory_product: {
    path: ["inventory", "product", "get"],
    positional: ["product"],
    description: "Get Inventory Product"
  },
  get_inventory_product_attachment: {
    path: ["inventory", "product", "attachment", "get"],
    positional: ["product", "attachmentId"],
    description: "Get Inventory Product Attachment"
  },
  get_inventory_product_photo: {
    path: ["inventory", "product", "photo", "get"],
    positional: ["product", "photoId"],
    description: "Get Inventory Product Photo"
  },
  get_inventory_variant: {
    path: ["inventory", "variant", "get"],
    positional: ["variant"],
    description: "Get Inventory Variant"
  },
  get_lead: {
    path: ["leads", "get"],
    positional: ["funnel", "identifier"],
    description: "Get Lead"
  },
  get_meeting_minutes: {
    path: ["office", "meeting-minutes", "get"],
    positional: ["meetingMinutesId"],
    description: "Get Meeting Minutes"
  },
  get_office: {
    path: ["office", "offices", "get"],
    positional: ["roomId"],
    description: "Get Office"
  },
  get_office_floor: {
    path: ["office", "floors", "get"],
    positional: ["floorId"],
    description: "Get Office Floor"
  },
  get_office_room: {
    path: ["office", "rooms", "get"],
    positional: ["roomId"],
    description: "Get Office Room"
  },
  get_recruiting_applicant: {
    path: ["recruiting", "applicant", "get"],
    positional: ["applicant"],
    description: "Get Recruiting Applicant"
  },
  get_recruiting_applicant_match: {
    path: ["recruiting", "applicant", "match", "get"],
    positional: ["match"],
    description: "Get Recruiting Applicant Match"
  },
  get_recruiting_attachment: {
    path: ["recruiting", "attachment", "get"],
    positional: ["target", "attachmentId"],
    description: "Get Recruiting Attachment"
  },
  get_recruiting_candidate: {
    path: ["recruiting", "candidate", "get"],
    positional: ["candidate"],
    description: "Get Recruiting Candidate"
  },
  get_recruiting_opinion: {
    path: ["recruiting", "opinion", "get"],
    positional: ["opinion"],
    description: "Get Recruiting Opinion"
  },
  get_recruiting_review: {
    path: ["recruiting", "review", "get"],
    positional: ["review"],
    description: "Get Recruiting Review"
  },
  get_recruiting_vacancy: {
    path: ["recruiting", "vacancy", "get"],
    positional: ["vacancy"],
    description: "Get Recruiting Vacancy"
  },
  get_schedule: {
    path: ["calendar", "schedules", "get"],
    positional: ["scheduleId"],
    description: "Get Schedule"
  },
  get_test_case: {
    path: ["tests", "case", "get"],
    positional: ["project", "testCase"],
    description: "Get Test Case"
  },
  get_test_plan: {
    path: ["tests", "plan", "get"],
    positional: ["project", "plan"],
    description: "Get Test Plan"
  },
  get_test_result: {
    path: ["tests", "result", "get"],
    positional: ["project", "result"],
    description: "Get Test Result"
  },
  get_test_run: {
    path: ["tests", "run", "get"],
    positional: ["project", "run"],
    description: "Get Test Run"
  },
  get_test_suite: {
    path: ["tests", "suite", "get"],
    positional: ["project", "suite"],
    description: "Get Test Suite"
  },
  get_time_report: {
    path: ["time", "reports", "get"],
    positional: ["project", "identifier"],
    description: "Get Time Report"
  },
  get_todo: {
    path: ["planner", "todos", "get"],
    positional: ["locator"],
    description: "Get Todo"
  },
  list_active_room_info: {
    path: ["office", "rooms", "active-info", "list"],
    positional: [],
    description: "List Active Room Info"
  },
  list_active_room_participants: {
    path: ["office", "rooms", "participants", "list"],
    positional: [],
    description: "List Active Room Participants"
  },
  list_calendars: {
    path: ["calendar", "calendars", "list"],
    positional: [],
    description: "List Calendars"
  },
  list_card_comments: {
    path: ["cards", "comments", "list"],
    positional: ["cardSpace", "card"],
    description: "List Card Comments"
  },
  list_card_spaces: {
    path: ["cards", "spaces", "list"],
    positional: [],
    description: "List Card Spaces"
  },
  list_cards: {
    path: ["cards", "list"],
    positional: ["cardSpace"],
    description: "List Cards"
  },
  list_device_preferences: {
    path: ["office", "devices", "preferences", "list"],
    positional: [],
    description: "List Device Preferences"
  },
  list_drive_file_activity: {
    path: ["drive", "files", "activity", "list"],
    positional: ["drive"],
    description: "List Drive File Activity"
  },
  list_drive_file_comments: {
    path: ["drive", "files", "comments", "list"],
    positional: ["drive"],
    description: "List Drive File Comments"
  },
  list_drive_file_versions: {
    path: ["drive", "files", "versions", "list"],
    positional: ["drive", "file"],
    description: "List Drive File Versions"
  },
  list_drive_items: {
    path: ["drive", "items", "list"],
    positional: ["drive"],
    description: "List Drive Items"
  },
  list_drives: {
    path: ["drive", "list"],
    positional: [],
    description: "List Drives"
  },
  list_event_instances: {
    path: ["calendar", "events", "instances", "list"],
    positional: ["recurringEventId"],
    description: "List Event Instances"
  }
} as const satisfies Partial<Record<McpToolName, CliCommandSpec>>
