import type { McpToolName } from "../../../src/mcp/tools/index.js"
import type { CliCommandSpec } from "./catalog-types.js"
import { CLI_UPLOAD_SOURCE_SEMANTICS } from "./parity-contract.js"

const uploadBehavior = { base64FileInput: { fields: ["data"] } } as const

export const parityBusinessCliCommandCatalog = {
  create_event: {
    path: ["calendar", "events", "create"],
    positional: ["title", "date"],
    description: "Create a calendar event; pass --meeting-room as JSON for native room composition",
    behavior: { fileInput: { fields: ["description"] } }
  },
  create_recurring_event: {
    path: ["calendar", "events", "recurring", "create"],
    positional: ["title", "startDate"],
    description: "Create a recurring event; pass --rules as JSON",
    behavior: { fileInput: { fields: ["description"] } }
  },
  create_schedule: {
    path: ["calendar", "schedules", "create"],
    positional: ["title"],
    description: "Create a calendar schedule; pass --availability and optional --meeting-room as JSON"
  },
  update_event: {
    path: ["calendar", "events", "update"],
    positional: ["eventId"],
    description: "Update a calendar event; pass --meeting-room as JSON to change an existing Meeting room",
    behavior: { fileInput: { fields: ["description"] } }
  },
  update_schedule: {
    path: ["calendar", "schedules", "update"],
    positional: ["scheduleId"],
    description: "Update a calendar schedule; pass --availability or --meeting-room as JSON"
  },
  add_drive_members: {
    path: ["drive", "members", "add"],
    positional: ["drive", "members"],
    description: "Add drive members; members is a JSON array"
  },
  remove_drive_members: {
    path: ["drive", "members", "remove"],
    positional: ["drive", "members"],
    description: "Remove drive members; members is a JSON array"
  },
  set_drive_owners: {
    path: ["drive", "owners", "set"],
    positional: ["drive", "owners"],
    description: "Replace drive owners; owners is a JSON array"
  },
  upload_drive_file: {
    path: ["drive", "files", "upload"],
    positional: ["drive", "path", "contentType"],
    description: `Upload a drive file. ${CLI_UPLOAD_SOURCE_SEMANTICS}`,
    behavior: uploadBehavior
  },
  upload_drive_file_version: {
    path: ["drive", "files", "versions", "upload"],
    positional: ["drive", "file", "contentType"],
    description: `Upload a new drive-file version. ${CLI_UPLOAD_SOURCE_SEMANTICS}`,
    behavior: uploadBehavior
  },
  add_inventory_product_attachment: {
    path: ["inventory", "products", "attachments", "add"],
    positional: ["product", "filename", "contentType"],
    description: `Add a product attachment. ${CLI_UPLOAD_SOURCE_SEMANTICS}`,
    behavior: uploadBehavior
  },
  add_inventory_product_photo: {
    path: ["inventory", "products", "photos", "add"],
    positional: ["product", "filename", "contentType"],
    description: `Add a product photo. ${CLI_UPLOAD_SOURCE_SEMANTICS}`,
    behavior: uploadBehavior
  },
  add_recruiting_attachment: {
    path: ["recruiting", "attachments", "add"],
    positional: ["target", "filename", "contentType"],
    description: `Add a recruiting attachment. ${CLI_UPLOAD_SOURCE_SEMANTICS}`,
    behavior: uploadBehavior
  },
  log_time: {
    path: ["time", "log"],
    positional: ["project", "identifier", "value"],
    description: "Log time in hours against an issue"
  },
  start_timer: {
    path: ["time", "timers", "start"],
    positional: ["project", "identifier"],
    description: "Start an issue timer"
  },
  stop_timer: {
    path: ["time", "timers", "stop"],
    positional: ["project", "identifier"],
    description: "Stop an issue timer"
  }
} as const satisfies Partial<Record<McpToolName, CliCommandSpec>>
