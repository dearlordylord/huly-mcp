import {
  listProjectTargetPreferencesParamsJsonSchema,
  ListProjectTargetPreferencesResultSchema,
  parseListProjectTargetPreferencesParams,
  parseUpsertProjectTargetPreferenceParams,
  upsertProjectTargetPreferenceParamsJsonSchema,
  UpsertProjectTargetPreferenceResultSchema
} from "../../domain/schemas/project-target-preferences.js"
import {
  listProjectTargetPreferences,
  upsertProjectTargetPreference
} from "../../huly/operations/project-target-preferences.js"
import { defineTool, type RegisteredTool } from "./registry.js"

const CATEGORY = "projects" as const

export const projectTargetPreferenceTools: ReadonlyArray<RegisteredTool> = [
  defineTool(
    {
      name: "list_project_target_preferences",
      description:
        "List low-level per-project tracker target preference records. These Huly ProjectTargetPreference records are attached to projects and used by tracker UI/workflows to remember target-related preference props. Omit project to list recent preferences across projects, or pass a project identifier to inspect one project's preference. Props are SDK-open key/value payloads.",
      category: CATEGORY,
      inputSchema: listProjectTargetPreferencesParamsJsonSchema,
      resultSchema: ListProjectTargetPreferencesResultSchema
    },
    parseListProjectTargetPreferencesParams,
    listProjectTargetPreferences
  ),
  defineTool(
    {
      name: "upsert_project_target_preference",
      description:
        "Create or update the low-level ProjectTargetPreference record for a project. This refreshes usedOn and merges SDK-open target preference props by key. Use for tracker SDK parity or advanced administration; ordinary project and issue workflows usually do not need this tool.",
      category: CATEGORY,
      inputSchema: upsertProjectTargetPreferenceParamsJsonSchema,
      resultSchema: UpsertProjectTargetPreferenceResultSchema
    },
    parseUpsertProjectTargetPreferenceParams,
    upsertProjectTargetPreference
  )
]
