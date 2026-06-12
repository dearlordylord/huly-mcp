import { Schema } from "effect"

export const ToolWarningCodeSchema = Schema.Literal("status_metadata_unresolved").annotations({
  identifier: "ToolWarningCode",
  title: "ToolWarningCode",
  description: "Machine-readable code for an agent-visible MCP tool warning."
})
export type ToolWarningCode = Schema.Schema.Type<typeof ToolWarningCodeSchema>

export const ToolWarningSchema = Schema.Struct({
  code: ToolWarningCodeSchema,
  message: Schema.Trim.pipe(Schema.nonEmptyString()).annotations({
    description:
      "LLM-facing explanation of what part of the returned tool payload is degraded and how the agent should interpret it."
  })
}).annotations({
  identifier: "ToolWarning",
  title: "ToolWarning",
  description: "Warning surfaced to an agent when a tool result is intentionally degraded instead of failing."
})
export type ToolWarning = Schema.Schema.Type<typeof ToolWarningSchema>
