import {
  getMessageTemplateParamsJsonSchema,
  GetMessageTemplateResultSchema,
  listMessageTemplateCategoriesParamsJsonSchema,
  ListMessageTemplateCategoriesResultSchema,
  listMessageTemplateFieldsParamsJsonSchema,
  ListMessageTemplateFieldsResultSchema,
  listMessageTemplatesParamsJsonSchema,
  ListMessageTemplatesResultSchema,
  parseGetMessageTemplateParams,
  parseListMessageTemplateCategoriesParams,
  parseListMessageTemplateFieldsParams,
  parseListMessageTemplatesParams,
  parseRenderMessageTemplateParams,
  renderMessageTemplateParamsJsonSchema,
  RenderMessageTemplateResultSchema
} from "../../domain/schemas/message-templates.js"
import {
  getMessageTemplate,
  listMessageTemplateCategories,
  listMessageTemplateFields,
  listMessageTemplates,
  renderMessageTemplate
} from "../../huly/operations/message-templates.js"
import { defineTool, type RegisteredTool } from "./registry.js"

const CATEGORY = "templates" as const

export const messageTemplateTools = [
  defineTool(
    {
      name: "list_message_template_categories",
      description:
        "List global Huly message template categories. Categories group reusable message templates across the workspace. Returns category IDs, names, descriptions, archived/private flags, and timestamps.",
      category: CATEGORY,
      inputSchema: listMessageTemplateCategoriesParamsJsonSchema,
      resultSchema: ListMessageTemplateCategoriesResultSchema
    },
    parseListMessageTemplateCategoriesParams,
    listMessageTemplateCategories
  ),
  defineTool(
    {
      name: "list_message_templates",
      description:
        "List global Huly message templates. Optionally filter by category ID or exact category name, and search template titles by substring. Returns each template ID, title, category summary, timestamps, and placeholderFieldIds parsed from dollar-brace tokens. Match placeholderFieldIds to list_message_template_fields.id for labels and resource IDs.",
      category: CATEGORY,
      inputSchema: listMessageTemplatesParamsJsonSchema,
      resultSchema: ListMessageTemplatesResultSchema
    },
    parseListMessageTemplatesParams,
    listMessageTemplates
  ),
  defineTool(
    {
      name: "get_message_template",
      description:
        "Retrieve one global Huly message template by template ID or exact title. If a title is ambiguous, pass category as category ID or exact category name. Returns the full message converted to Markdown plus placeholderFieldIds parsed from dollar-brace tokens. Match placeholderFieldIds to list_message_template_fields.id for labels and resource IDs.",
      category: CATEGORY,
      inputSchema: getMessageTemplateParamsJsonSchema,
      resultSchema: GetMessageTemplateResultSchema
    },
    parseGetMessageTemplateParams,
    getMessageTemplate
  ),
  defineTool(
    {
      name: "render_message_template",
      description:
        "Render one global Huly message template by template ID or exact title. Substitutes only caller-provided values for matching dollar-brace placeholder field IDs from placeholderFieldIds; does not execute Huly TemplateField provider resources. Unresolved placeholders remain in renderedMessage and are reported in unresolvedFieldIds.",
      category: CATEGORY,
      inputSchema: renderMessageTemplateParamsJsonSchema,
      resultSchema: RenderMessageTemplateResultSchema,
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: true
      }
    },
    parseRenderMessageTemplateParams,
    renderMessageTemplate
  ),
  defineTool(
    {
      name: "list_message_template_fields",
      description:
        "List Huly message template fields/placeholders without executing provider resources or rendering templates. Optionally filter by field category ID or exact raw label string, and search raw field labels by substring. Returns field IDs, labels, category summaries, and provider resource IDs.",
      category: CATEGORY,
      inputSchema: listMessageTemplateFieldsParamsJsonSchema,
      resultSchema: ListMessageTemplateFieldsResultSchema
    },
    parseListMessageTemplateFieldsParams,
    listMessageTemplateFields
  )
] as const satisfies ReadonlyArray<RegisteredTool>
