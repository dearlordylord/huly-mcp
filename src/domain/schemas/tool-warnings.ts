import { Schema } from "effect"

export const ToolWarningCodeSchema = Schema.Literal(
  "status_metadata_unresolved",
  "space_role_assignments_degraded",
  "message_template_metadata_degraded",
  "viewlet_descriptor_metadata_degraded",
  "space_preference_metadata_degraded",
  "approval_request_person_metadata_degraded",
  "approval_request_count_metadata_degraded"
).annotations({
  identifier: "ToolWarningCode",
  title: "ToolWarningCode",
  description: "Machine-readable code for an agent-visible MCP tool warning."
})
export type ToolWarningCode = Schema.Schema.Type<typeof ToolWarningCodeSchema>
export const StatusMetadataUnresolvedWarningCode = ToolWarningCodeSchema.literals[0]
export const SpaceRoleAssignmentsDegradedWarningCode = ToolWarningCodeSchema.literals[1]
export const MessageTemplateMetadataDegradedWarningCode = ToolWarningCodeSchema.literals[2]
export const ViewletDescriptorMetadataDegradedWarningCode = ToolWarningCodeSchema.literals[3]
export const SpacePreferenceMetadataDegradedWarningCode = ToolWarningCodeSchema.literals[4]
export const ApprovalRequestPersonMetadataDegradedWarningCode = ToolWarningCodeSchema.literals[5]
export const ApprovalRequestCountMetadataDegradedWarningCode = ToolWarningCodeSchema.literals[6]

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
