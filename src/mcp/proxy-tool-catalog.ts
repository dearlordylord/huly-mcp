import { Either, Schema } from "effect"

import { Count } from "../domain/schemas/index.js"
import { createSuccessResponse, type McpToolResponse } from "./error-mapping.js"
import type { ToolRegistry } from "./tools/index.js"
import { makeToolCategory, makeToolDescription, ToolDescription } from "./tools/registry.js"
import type { ToolCategory, ToolDefinition } from "./tools/registry.js"

const SEARCH_DEFAULT_LIMIT = 10
export const SEARCH_MAX_LIMIT = 50

export const ToolSearchQuery = Schema.NonEmptyTrimmedString.pipe(Schema.brand("ToolSearchQuery"))
export type ToolSearchQuery = Schema.Schema.Type<typeof ToolSearchQuery>

export const ToolParameterName = Schema.NonEmptyTrimmedString.pipe(Schema.brand("ToolParameterName"))
export type ToolParameterName = Schema.Schema.Type<typeof ToolParameterName>

export const SearchToolLimit = Schema.Number.pipe(
  Schema.int(),
  Schema.positive(),
  Schema.lessThanOrEqualTo(SEARCH_MAX_LIMIT),
  Schema.brand("SearchToolLimit")
)
export type SearchToolLimit = Schema.Schema.Type<typeof SearchToolLimit>

export const makeToolSearchQuery = (value: string): ToolSearchQuery => ToolSearchQuery.make(value)
export const makeSearchToolLimit = (value: number): SearchToolLimit => SearchToolLimit.make(value)
export const SEARCH_DEFAULT_LIMIT_VALUE = makeSearchToolLimit(SEARCH_DEFAULT_LIMIT)

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const stringArray = (value: unknown): ReadonlyArray<string> =>
  Array.isArray(value) && value.every((item) => typeof item === "string") ? value : []

const parseToolParameterName = (value: string): ToolParameterName | undefined => {
  const decoded = Schema.decodeUnknownEither(ToolParameterName)(value)
  return Either.isRight(decoded) ? decoded.right : undefined
}

const schemaProperties = (schema: object): ReadonlyArray<ToolParameterName> => {
  const properties = isRecord(schema) ? schema.properties : undefined
  return isRecord(properties)
    ? Object.keys(properties).map(parseToolParameterName).filter((name) => name !== undefined)
    : []
}

const schemaRequired = (schema: unknown): ReadonlyArray<string> => isRecord(schema) ? stringArray(schema.required) : []

export const toolParamSummary = (
  tool: ToolDefinition
): {
  readonly requiredParams: ReadonlyArray<ToolParameterName>
  readonly optionalParams: ReadonlyArray<ToolParameterName>
} => {
  const required = new Set(schemaRequired(tool.inputSchema))
  const properties = schemaProperties(tool.inputSchema)
  return {
    requiredParams: properties.filter((name) => required.has(name)),
    optionalParams: properties.filter((name) => !required.has(name))
  }
}

const categoryDescriptionEntry = (category: string, description: string): readonly [ToolCategory, ToolDescription] => [
  makeToolCategory(category),
  makeToolDescription(description)
]

// Raw static category description declarations. The map constructor parses these
// literals into branded category/description values before proxy results use them.
const CATEGORY_DESCRIPTIONS: ReadonlyMap<ToolCategory, ToolDescription> = new Map([
  categoryDescriptionEntry(
    "projects",
    "Project discovery, project metadata, project target preferences, and project-level settings."
  ),
  categoryDescriptionEntry(
    "issues",
    "Issue tracking: create, read, update, move, delete, relate, label, and organize Huly issues."
  ),
  categoryDescriptionEntry("labels", "Issue and workspace labels for classification and filtering."),
  categoryDescriptionEntry("tags", "Generic tags that can be created, updated, attached, detached, and listed."),
  categoryDescriptionEntry("tag-categories", "Tag category administration and tag grouping metadata."),
  categoryDescriptionEntry(
    "templates",
    "Issue and message templates, including template fields, categories, children, and rendering."
  ),
  categoryDescriptionEntry("comments", "Comments and discussion content attached to Huly objects."),
  categoryDescriptionEntry(
    "collaborators",
    "Collaborator discovery and participation metadata for documents and other shared objects."
  ),
  categoryDescriptionEntry("milestones", "Issue milestone lifecycle and milestone assignment."),
  categoryDescriptionEntry(
    "documents",
    "Teamspaces and documents: create, read, edit, snapshot, inline comment, and delete document content."
  ),
  categoryDescriptionEntry(
    "drive",
    "Drive spaces, folders, files, versions, comments, and drive membership administration."
  ),
  categoryDescriptionEntry(
    "associations",
    "Generic associations and relations between Huly documents, issues, cards, and raw objects."
  ),
  categoryDescriptionEntry(
    "inventory",
    "Inventory products, categories, variants, product media, comments, and attachments."
  ),
  categoryDescriptionEntry(
    "spaces",
    "Generic Huly spaces, space types, space permissions, members, owners, roles, and preferences."
  ),
  categoryDescriptionEntry(
    "sdk-discovery",
    "SDK and model discovery helpers for Huly platform classes, attributes, mixins, and enums."
  ),
  categoryDescriptionEntry("storage", "Storage diagnostics and storage-backed object helpers."),
  categoryDescriptionEntry(
    "attachments",
    "Issue, document, and generic attachment upload, download, pinning, updating, and deletion."
  ),
  categoryDescriptionEntry(
    "contacts",
    "People, employees, organizations, contact channels, channel providers, and contact ownership."
  ),
  categoryDescriptionEntry(
    "channels",
    "Messaging: channels, direct messages, group messages, thread replies, reactions, and saved messages."
  ),
  categoryDescriptionEntry(
    "boards",
    "Board administration, board labels, board cards, board views, menus, and archive workflows."
  ),
  categoryDescriptionEntry("views", "Saved and filtered views across boards and other view-capable Huly modules."),
  categoryDescriptionEntry("cards", "Generic cards, card spaces, card relations, master tags, and card metadata."),
  categoryDescriptionEntry("leads", "CRM funnels and leads discovery."),
  categoryDescriptionEntry(
    "recruiting",
    "Recruiting vacancies, applicants, reviews, opinions, candidate skills, and recruiting media."
  ),
  categoryDescriptionEntry("custom-fields", "Custom field definitions and custom field values on Huly documents."),
  categoryDescriptionEntry(
    "calendar",
    "Calendar events, recurring events, schedules, meeting rooms, and availability."
  ),
  categoryDescriptionEntry(
    "time tracking",
    "Time tracking, work logs, time reports, detailed time summaries, and estimates."
  ),
  categoryDescriptionEntry("planner", "Planner todos, schedules, work slots, priorities, and completion workflows."),
  categoryDescriptionEntry(
    "preferences",
    "User and project preferences, notification preferences, and preference diagnostics."
  ),
  categoryDescriptionEntry(
    "approvals",
    "Approval request lifecycle, approval comments, approve/reject/cancel actions, and approval status."
  ),
  categoryDescriptionEntry("search", "Workspace-wide full-text and structured search across Huly content."),
  categoryDescriptionEntry("activity", "Activity timelines and activity messages for Huly objects."),
  categoryDescriptionEntry(
    "notifications",
    "Inbox notifications, notification counts, read state, and notification actions."
  ),
  categoryDescriptionEntry("user-statuses", "User status and online/presence status discovery."),
  categoryDescriptionEntry("virtual-office", "Virtual office rooms, members, presence, and office room state."),
  categoryDescriptionEntry(
    "processes",
    "Huly process definitions, executions, process cards, and process state transitions."
  ),
  categoryDescriptionEntry(
    "workspace",
    "Workspace metadata, members, settings, access links, invites, and administrative context."
  ),
  categoryDescriptionEntry(
    "task-management",
    "Task management project types, task types, issue statuses, workflow references, and process setup."
  ),
  categoryDescriptionEntry(
    "test-management",
    "Test management projects, suites, cases, plans, runs, results, and plan execution."
  )
])

const categoryDescription = (category: ToolCategory): ToolDescription =>
  CATEGORY_DESCRIPTIONS.get(category) ?? ToolDescription.make(`Huly ${category} tools.`)

export const listCategories = (registry: ToolRegistry): McpToolResponse => {
  const counts = new Map<ToolCategory, number>()
  for (const tool of registry.definitions) {
    counts.set(tool.category, (counts.get(tool.category) ?? 0) + 1)
  }
  return createSuccessResponse({
    categories: [...counts.entries()].map(([name, toolCount]) => ({
      name,
      description: categoryDescription(name),
      toolCount: Count.make(toolCount)
    }))
  })
}

const queryTokens = (query: string): ReadonlyArray<string> =>
  query.toLowerCase().split(/[^a-z0-9]+/u).filter((token) => token !== "")

const tokenHitCount = (tokens: ReadonlyArray<string>, text: string): number => {
  const lower = text.toLowerCase()
  return tokens.filter((token) => lower.includes(token)).length
}

const toolScore = (tool: ToolDefinition, tokens: ReadonlyArray<string>, normalizedQuery: string): number => {
  const params = toolParamSummary(tool)
  const paramText = [...params.requiredParams, ...params.optionalParams].join(" ")
  const categoryText = `${tool.category} ${categoryDescription(tool.category)}`
  const exactScore = tool.name.toLowerCase() === normalizedQuery ? 10_000 : 0
  return exactScore
    + tokenHitCount(tokens, tool.name) * 1_000
    + tokenHitCount(tokens, categoryText) * 100
    + tokenHitCount(tokens, tool.description) * 10
    + tokenHitCount(tokens, paramText)
}

export const searchToolDefinitions = (
  registry: ToolRegistry,
  query: ToolSearchQuery,
  limit: SearchToolLimit = SEARCH_DEFAULT_LIMIT_VALUE
): ReadonlyArray<ToolDefinition> => {
  const normalizedQuery = query.trim().toLowerCase()
  const tokens = queryTokens(normalizedQuery)
  if (tokens.length === 0) return []

  return registry.definitions
    .map((tool, index) => ({ index, score: toolScore(tool, tokens, normalizedQuery), tool }))
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((match) => match.tool)
}
