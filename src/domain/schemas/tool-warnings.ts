import { Schema } from "effect"
import { nonEmptyTrimmedString } from "./shared-base.js"

export const ExternalChannelRuntimeUnsupportedWarningCode = "external_channel_runtime_unsupported" as const
export const SupportRuntimeUnsupportedWarningCode = "support_runtime_unsupported" as const
export const SupportStatusMetadataDegradedWarningCode = "support_status_metadata_degraded" as const
export const WorkbenchNavigationMetadataDegradedWarningCode = "workbench_navigation_metadata_degraded" as const
export const LeadCustomerMetadataDegradedWarningCode = "lead_customer_metadata_degraded" as const

export const ToolWarningCodeSchema = Schema.Literals([
  "status_metadata_unresolved",
  "space_role_assignments_degraded",
  "message_template_metadata_degraded",
  "viewlet_descriptor_metadata_degraded",
  "space_preference_metadata_degraded",
  "approval_request_person_metadata_degraded",
  "approval_request_count_metadata_degraded",
  "hosted_huly_shutdown",
  "issue_label_metadata_degraded",
  "issue_milestone_metadata_degraded",
  "notification_metadata_degraded",
  "card_version_metadata_degraded",
  "issue_creator_metadata_degraded",
  "recruiting_review_metadata_degraded",
  "issue_relation_metadata_degraded",
  "class_collaborator_metadata_degraded",
  ExternalChannelRuntimeUnsupportedWarningCode,
  SupportRuntimeUnsupportedWarningCode,
  SupportStatusMetadataDegradedWarningCode,
  WorkbenchNavigationMetadataDegradedWarningCode,
  LeadCustomerMetadataDegradedWarningCode
]).pipe(
  Schema.annotate({
    identifier: "ToolWarningCode",
    title: "ToolWarningCode",
    description: "Machine-readable code for an agent-visible MCP tool warning."
  })
)
export type ToolWarningCode = Schema.Schema.Type<typeof ToolWarningCodeSchema>
export const StatusMetadataUnresolvedWarningCode = ToolWarningCodeSchema.literals[0]
export const SpaceRoleAssignmentsDegradedWarningCode = ToolWarningCodeSchema.literals[1]
export const MessageTemplateMetadataDegradedWarningCode = ToolWarningCodeSchema.literals[2]
export const ViewletDescriptorMetadataDegradedWarningCode = ToolWarningCodeSchema.literals[3]
export const SpacePreferenceMetadataDegradedWarningCode = ToolWarningCodeSchema.literals[4]
export const ApprovalRequestPersonMetadataDegradedWarningCode = ToolWarningCodeSchema.literals[5]
export const ApprovalRequestCountMetadataDegradedWarningCode = ToolWarningCodeSchema.literals[6]
export const HostedHulyShutdownWarningCode = ToolWarningCodeSchema.literals[7]
export const IssueLabelMetadataDegradedWarningCode = ToolWarningCodeSchema.literals[8]
export const IssueMilestoneMetadataDegradedWarningCode = ToolWarningCodeSchema.literals[9]
export const NotificationMetadataDegradedWarningCode = ToolWarningCodeSchema.literals[10]
export const CardVersionMetadataDegradedWarningCode = ToolWarningCodeSchema.literals[11]
export const IssueCreatorMetadataDegradedWarningCode = ToolWarningCodeSchema.literals[12]
export const RecruitingReviewMetadataDegradedWarningCode = ToolWarningCodeSchema.literals[13]
export const IssueRelationMetadataDegradedWarningCode = ToolWarningCodeSchema.literals[14]
export const ClassCollaboratorMetadataDegradedWarningCode = ToolWarningCodeSchema.literals[15]

export const ToolWarningSchema = Schema.Struct({
  code: ToolWarningCodeSchema,
  message: nonEmptyTrimmedString({
    description:
      "LLM-facing explanation of degraded result fidelity or an important operational condition requiring user action."
  })
}).pipe(
  Schema.annotate({
    identifier: "ToolWarning",
    title: "ToolWarning",
    description:
      "Warning surfaced to an agent alongside a tool result without changing whether that tool call succeeded."
  })
)
export type ToolWarning = Schema.Schema.Type<typeof ToolWarningSchema>
