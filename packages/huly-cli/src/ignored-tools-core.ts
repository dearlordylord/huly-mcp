import type { McpToolName } from "../../../src/mcp/tools/index.js"

export const ignoredCoreMcpTools = [
  // attachments/storage: Generic upload paths need dedicated file/path transport UX beyond catalog metadata.
  "add_attachment",
  "upload_file",
  // drawings: Writing drawing content needs a structured drawing payload UX rather than generic text options.
  "create_drawing",
  "update_drawing",
  // project preferences: Preference payloads need project-specific settings semantics before CLI exposure.
  "upsert_project_target_preference"
] as const satisfies ReadonlyArray<McpToolName>
