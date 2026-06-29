import type { McpToolName } from "../../../src/mcp/tools/index.js"

export const ignoredBusinessMcpTools = [
  // calendar: Creation/update paths need date, timezone, availability, or recurrence ergonomics.
  "create_event",
  "create_recurring_event",
  "create_schedule",
  "update_event",
  "update_schedule",
  // drive: Upload and membership/ownership paths need dedicated file and permission UX.
  "add_drive_members",
  "remove_drive_members",
  "set_drive_owners",
  "upload_drive_file",
  "upload_drive_file_version",
  // inventory/recruiting media: Attachment/photo uploads need dedicated file/path transport UX.
  "add_inventory_product_attachment",
  "add_inventory_product_photo",
  "add_recruiting_attachment",
  // time tracking: Logging and timers need duration and active-timer lifecycle ergonomics.
  "log_time",
  "start_timer",
  "stop_timer"
] as const satisfies ReadonlyArray<McpToolName>
