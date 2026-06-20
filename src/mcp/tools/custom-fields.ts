import {
  getCustomFieldValuesParamsJsonSchema,
  GetCustomFieldValuesResultSchema,
  listCustomFieldsParamsJsonSchema,
  ListCustomFieldsResultSchema,
  parseGetCustomFieldValuesParams,
  parseListCustomFieldsParams,
  parseSetCustomFieldParams,
  setCustomFieldParamsJsonSchema,
  SetCustomFieldResultWireSchema
} from "../../domain/schemas/custom-fields.js"
import { getCustomFieldValues, listCustomFields, setCustomField } from "../../huly/operations/custom-fields.js"
import { defineTool, type RegisteredTool } from "./registry.js"
const CATEGORY = "custom-fields" as const
export const customFieldTools: ReadonlyArray<RegisteredTool> = [
  defineTool(
    {
      name: "list_custom_fields",
      description:
        "List custom field definitions in the workspace. Returns fields with their labels, types, and owner class info. Custom fields are created in the Huly UI on Card types, Issue types, or other classes. Use targetClass to filter fields for a specific class.",
      category: CATEGORY,
      inputSchema: listCustomFieldsParamsJsonSchema,
      resultSchema: ListCustomFieldsResultSchema
    },
    parseListCustomFieldsParams,
    listCustomFields
  ),
  defineTool(
    {
      name: "get_custom_field_values",
      description:
        "Read custom field values from a document. Pass the document's ID and class (from list_cards, list_issues, etc.). Returns all custom field values found on the document with their labels and types.",
      category: CATEGORY,
      inputSchema: getCustomFieldValuesParamsJsonSchema,
      resultSchema: GetCustomFieldValuesResultSchema
    },
    parseGetCustomFieldValuesParams,
    getCustomFieldValues
  ),
  defineTool(
    {
      name: "set_custom_field",
      description:
        "Set a custom field value on a document. Requires the document ID, class, field ID (from list_custom_fields), and value. Values are auto-parsed: numbers from numeric strings, booleans from 'true'/'false', strings as-is.",
      category: CATEGORY,
      inputSchema: setCustomFieldParamsJsonSchema,
      resultSchema: SetCustomFieldResultWireSchema
    },
    parseSetCustomFieldParams,
    setCustomField
  )
]
