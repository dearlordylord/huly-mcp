import {
  getSpacePreferenceParamsJsonSchema,
  GetSpacePreferenceResultSchema,
  listSpacePreferencesParamsJsonSchema,
  ListSpacePreferencesResultSchema,
  parseGetSpacePreferenceParams,
  parseListSpacePreferencesParams
} from "../../domain/schemas/preferences.js"
import { getSpacePreference, listSpacePreferences } from "../../huly/operations/preferences.js"
import { defineTool, type RegisteredTool } from "./registry.js"

const CATEGORY = "preferences" as const

export const preferenceTools = [
  defineTool(
    {
      name: "list_space_preferences",
      description:
        "List low-level Huly SpacePreference records. These generic preference rows are attached to spaces and the published SDK exposes only the attached space link, so this tool is read-only discovery. Omit space to list recent rows across spaces, or pass a space _id/exact name with optional class/type narrowing to inspect one space.",
      category: CATEGORY,
      inputSchema: listSpacePreferencesParamsJsonSchema,
      resultSchema: ListSpacePreferencesResultSchema
    },
    parseListSpacePreferencesParams,
    listSpacePreferences
  ),
  defineTool(
    {
      name: "get_space_preference",
      description:
        "Read the low-level Huly SpacePreference record attached to one space. Accepts a space _id or exact name with optional class/type narrowing. Returns present=false when the space exists but no generic SpacePreference row exists; use module-specific preference tools for writable preference payloads.",
      category: CATEGORY,
      inputSchema: getSpacePreferenceParamsJsonSchema,
      resultSchema: GetSpacePreferenceResultSchema
    },
    parseGetSpacePreferenceParams,
    getSpacePreference
  )
] as const satisfies ReadonlyArray<RegisteredTool>
