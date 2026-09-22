export interface ToolAnnotations {
  readonly title?: string
  readonly readOnlyHint?: boolean
  readonly destructiveHint?: boolean
  readonly idempotentHint?: boolean
  readonly openWorldHint?: boolean
}

export type ResolvedToolAnnotations = Required<ToolAnnotations>

interface AnnotatedTool {
  readonly name: string
  readonly annotations?: ToolAnnotations
}

const deriveTitle = (name: string): string =>
  name
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")

const READ_PREFIXES = ["list_", "get_", "describe_", "search_", "fulltext_", "download_", "preview_", "read_"]
const CREATE_PREFIXES = ["create_", "add_", "upload_", "send_", "log_"]
const UPDATE_PREFIXES = [
  "update_",
  "edit_",
  "set_",
  "approve_",
  "reject_",
  "cancel_",
  "pin_",
  "unpin_",
  "mark_",
  "archive_",
  "start_",
  "stop_",
  "save_",
  "unsave_",
  "remove_",
  "move_"
]
const DELETE_PREFIXES = ["delete_"]

const matchesPrefix = (name: string, prefixes: ReadonlyArray<string>): boolean =>
  prefixes.some((prefix) => name.startsWith(prefix))

const deriveAnnotations = (name: string): ResolvedToolAnnotations => {
  const title = deriveTitle(name)

  if (matchesPrefix(name, READ_PREFIXES)) {
    return { title, readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  }
  if (matchesPrefix(name, CREATE_PREFIXES)) {
    return { title, readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
  }
  if (matchesPrefix(name, UPDATE_PREFIXES)) {
    return { title, readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  }
  if (matchesPrefix(name, DELETE_PREFIXES)) {
    return { title, readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false }
  }
  return { title, readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false }
}

export const resolveAnnotations = (tool: AnnotatedTool): ResolvedToolAnnotations => ({
  ...deriveAnnotations(tool.name),
  ...tool.annotations
})
