/**
 * Error mapping from Effect errors to MCP protocol error responses.
 *
 * Maps domain errors to appropriate MCP error codes:
 * - -32602 (Invalid params): ParseError, IssueNotFoundError, ProjectNotFoundError, etc.
 * - -32603 (Internal error): HulyConnectionError, HulyAuthError, unknown errors
 *
 * Security: Sanitizes error messages to prevent leaking sensitive information.
 *
 * @module
 */
import { Cause, type Schema } from "effect"

import type { ToolWarning } from "../domain/schemas/tool-warnings.js"
import {
  HulyAuthError,
  HulyConnectionError,
  type HulyDomainError,
  HulyError,
  HulyStorageConfigError,
  HulyUnavailableError
} from "../huly/errors.js"
import {
  HOSTED_HULY_MIGRATION_LINKS,
  HOSTED_HULY_SUNSET,
  isDefaultHulyCloudOrigin
} from "../huly/unavailable-diagnostics.js"
import { classifyCause, findRecoverableCauseFailure } from "../runtime/cause-exit.js"
import { formatParseError } from "./schema-error-format.js"
import { createErrorResponse, McpErrorCode, type McpErrorResponseWithMeta } from "./tool-responses.js"

export { formatParseError } from "./schema-error-format.js"

export {
  appendToolWarnings,
  createImageSuccessResponse,
  createInvalidParamsError,
  createServerShuttingDownError,
  createSuccessResponse,
  createUnknownToolError,
  McpErrorCode,
  type McpImageContent,
  type McpToolResponse,
  toMcpResponse
} from "./tool-responses.js"

// --- Domain Error Mapping ---

const INVALID_PARAMS_TAGS: ReadonlySet<HulyDomainError["_tag"]> = new Set<HulyDomainError["_tag"]>([
  "IssueNotFoundError",
  "IssueReferenceError",
  "ApprovalRequestNotFoundError",
  "ApprovalRequestTargetNotFoundError",
  "ApprovalRequestInvalidApprovalThresholdError",
  "ApprovalRequestMutationUnsupportedError",
  "ApprovalRequestNotActiveError",
  "ApprovalRequestApproverNotRequestedError",
  "ApprovalRequestCancelUnauthorizedError",
  "ProjectNotFoundError",
  "InvalidStatusError",
  "TagNotFoundError",
  "TagCategoryNotFoundError",
  "TagIdentifierAmbiguousError",
  "BoardNotFoundError",
  "BoardIdentifierAmbiguousError",
  "BoardCardNotFoundError",
  "BoardCardIdentifierAmbiguousError",
  "BoardProjectTypeNotFoundError",
  "BoardProjectTypeIdentifierAmbiguousError",
  "BoardTaskTypeNotFoundError",
  "BoardTaskTypeIdentifierAmbiguousError",
  "BoardStatusNotFoundError",
  "BoardStatusIdentifierAmbiguousError",
  "BoardArchivedCardDeleteError",
  "BoardLabelNotFoundError",
  "BoardLabelIdentifierAmbiguousError",
  "BoardSavedViewNotFoundError",
  "BoardSavedViewIdentifierAmbiguousError",
  "BoardMenuPageNotFoundError",
  "BoardMenuPageIdentifierAmbiguousError",
  "BoardViewletNotFoundError",
  "BoardViewletIdentifierAmbiguousError",
  "FilteredViewNotFoundError",
  "FilteredViewIdentifierAmbiguousError",
  "ViewletNotFoundError",
  "ViewletIdentifierAmbiguousError",
  "WorkbenchApplicationAliasAmbiguousError",
  "PersonIdentifierAmbiguousError",
  "PersonNotFoundError",
  "PersonMergeSelfError",
  "PersonMergePreflightMismatchError",
  "PersonMergeAccountBlockedError",
  "PersonMergeSnapshotStaleError",
  "DepartmentNotFoundError",
  "DepartmentIdentifierAmbiguousError",
  "DepartmentHierarchyError",
  "DepartmentConflictError",
  "DepartmentImpactMismatchError",
  "EmployeeNotFoundError",
  "OrganizationNotFoundError",
  "OrganizationIdentifierAmbiguousError",
  "InvalidContactProviderError",
  "ContactChannelNotFoundError",
  "ContactChannelIdentifierAmbiguousError",
  "ContactChannelConflictError",
  "InvalidContactChannelLocatorError",
  "InvalidContactChannelValueError",
  "InvalidFileDataError",
  "FileNotFoundError",
  "TeamspaceNotFoundError",
  "DocumentNotFoundError",
  "DocumentTextNotFoundError",
  "DocumentTextMultipleMatchesError",
  "DocumentEmptyContentError",
  "DocumentContentCorruptedError",
  "DocumentEditModeError",
  "DocumentReferenceError",
  "CommentNotFoundError",
  "CardCommentNotFoundError",
  "MilestoneIdentifierAmbiguousError",
  "MilestoneNotFoundError",
  "ChannelNotFoundError",
  "TelegramChannelIdentifierAmbiguousError",
  "ChannelArchivedError",
  "ChannelLastMemberRemovalError",
  "ChannelLastOwnerRemovalError",
  "DirectMessageIdentifierAmbiguousError",
  "DirectMessageNotFoundError",
  "DirectMessageParticipantCountError",
  "CannotDirectMessageSelfError",
  "PersonNotAnEmployeeError",
  "MessageNotFoundError",
  "ThreadReplyNotFoundError",
  "ChatMessageAttachmentNotFoundError",
  "CalendarNotAccessibleError",
  "EventNotFoundError",
  "RecurringEventNotFoundError",
  "ScheduleNotFoundError",
  "FloorNotFoundError",
  "RoomNotFoundError",
  "MeetingMinutesNotFoundError",
  "ActivityMessageNotFoundError",
  "ReactionNotFoundError",
  "SavedMessageNotFoundError",
  "AttachmentNotFoundError",
  "AttachmentContentTooLargeError",
  "AttachmentContentTypeUnsupportedError",
  "AttachmentContentUnavailableError",
  "TestProjectNotFoundError",
  "TestSuiteNotFoundError",
  "TestCaseNotFoundError",
  "TestPlanNotFoundError",
  "TestRunNotFoundError",
  "TestResultNotFoundError",
  "TestPlanItemNotFoundError",
  "ComponentNotFoundError",
  "CustomFieldNotFoundError",
  "CustomFieldObjectNotFoundError",
  "InvalidCustomFieldDateValueError",
  "IssueTemplateNotFoundError",
  "TemplateChildNotFoundError",
  "NotificationNotFoundError",
  "NotificationContextNotFoundError",
  "NotificationPersonSpaceNotFoundError",
  "NotificationProviderNotFoundError",
  "NotificationTypeNotFoundError",
  "InvalidPersonUuidError",
  "FunnelNotFoundError",
  "FunnelIdentifierAmbiguousError",
  "FunnelProjectTypeNotFoundError",
  "FunnelProjectTypeIdentifierAmbiguousError",
  "FunnelDeleteConflictError",
  "FunnelAccountNotFoundError",
  "LeadNotFoundError",
  "FileTooLargeError",
  "InvalidContentTypeError",
  "ProcessNotFoundError",
  "ProcessIdentifierAmbiguousError",
  "ProcessMasterTagAmbiguousError",
  "ProcessMasterTagNotFoundError",
  "ProcessCardIdentifierAmbiguousError",
  "ProcessCardNotFoundError",
  "RecruitingApplicantIdentifierAmbiguousError",
  "RecruitingApplicantMatchNotFoundError",
  "RecruitingApplicantNotFoundError",
  "RecruitingAttachmentNotFoundError",
  "RecruitingCandidateNotFoundError",
  "RecruitingCommentNotFoundError",
  "RecruitingDuplicateApplicantError",
  "RecruitingIssueLocatorInvalidError",
  "RecruitingModelMissingError",
  "RecruitingMutationUnsupportedError",
  "RecruitingOpinionIdentifierAmbiguousError",
  "RecruitingOpinionNotFoundError",
  "RecruitingReviewIdentifierAmbiguousError",
  "RecruitingReviewNotFoundError",
  "RecruitingVacancyIdentifierAmbiguousError",
  "RecruitingVacancyNotFoundError",
  "RecruitingVacancyTypeNotFoundError",
  "InventoryCategoryNotFoundError",
  "InventoryProductNotFoundError",
  "InventoryProductCommentNotFoundError",
  "InventoryVariantNotFoundError",
  "InventoryCategoryIdentifierAmbiguousError",
  "InventoryProductIdentifierAmbiguousError",
  "InventoryVariantIdentifierAmbiguousError",
  "InventoryConflictError",
  "InventoryNotEmptyError",
  "InventoryMutationUnsupportedError",
  "AssociationNotFoundError",
  "AssociationIdentifierAmbiguousError",
  "AssociationSystemClassUnsupportedError",
  "AssociationConflictError",
  "AssociationInUseError",
  "RelationNotFoundError",
  "RelationIdentifierAmbiguousError",
  "RelationMutationUnsupportedError",
  "RelationCardinalityViolationError",
  "RelationDirectionAmbiguousError",
  "RelationEndpointClassMismatchError",
  "GenericObjectIdentifierAmbiguousError",
  "GenericObjectLocatorInvalidError",
  "GenericObjectNotFoundError",
  "SpaceNotFoundError",
  "SpaceIdentifierAmbiguousError",
  "SpaceNotTypedError",
  "SpaceRoleNotFoundError",
  "SpaceRoleIdentifierAmbiguousError",
  "SpaceCreationConflictError",
  "SpaceTypeCreationUnsupportedError",
  "SpaceTypeNotFoundError",
  "SpaceTypeIdentifierAmbiguousError",
  "DriveNotFoundError",
  "DriveIdentifierAmbiguousError",
  "DrivePathNotFoundError",
  "DrivePathAmbiguousError",
  "DriveParentNotFolderError",
  "DriveFileNotFoundError",
  "DriveFileCommentNotFoundError",
  "DriveFileVersionNotFoundError",
  "DrivePathConflictError",
  "DriveInvalidMoveError",
  "DriveInvalidItemOperationError",
  "DriveFolderNotEmptyError",
  "DriveNotEmptyError",
  "MessageTemplateCategoryNotFoundError",
  "MessageTemplateCategoryIdentifierAmbiguousError",
  "MessageTemplateNotFoundError",
  "MessageTemplateIdentifierAmbiguousError",
  "TemplateFieldCategoryNotFoundError",
  "TemplateFieldCategoryIdentifierAmbiguousError",
  "NoUpdateFieldsError",
  "SequenceDefinitionConflictError",
  "SequenceConcurrentWriteError",
  "SequenceNotFoundError",
  "SequenceIdentifierAmbiguousError",
  "SequenceKindUnsupportedError",
  "SequenceCurrentValueMismatchError",
  "SequenceInUseError"
])

const INTERNAL_ERROR_PREFIX: Partial<Record<HulyDomainError["_tag"], string>> = {
  FileUploadError: "File upload error",
  HulyStorageConfigError: "Storage configuration error",
  HulyAuthError: "Authentication error"
}

const CONNECTION_ERROR_GUIDANCE = "Verify HULY_URL, workspace, and network connectivity before retrying."

/**
 * Markup operations (issue descriptions, comments) run against the collaborator service rather
 * than the transactor. Preserve only their schema-owned operation and HTTP status diagnostics;
 * arbitrary SDK exception text can contain credentials, URLs, headers, or response bodies.
 */
const hulyConnectionMessage = (error: HulyConnectionError): string => {
  const diagnostic = error.diagnostic
  return diagnostic === undefined
    ? `Connection error while communicating with Huly. ${CONNECTION_ERROR_GUIDANCE}`
    : `Connection error while communicating with Huly: ${diagnostic.operation} failed${diagnostic.httpStatus === undefined ? "" : ` with HTTP ${diagnostic.httpStatus}`}. ${CONNECTION_ERROR_GUIDANCE}`
}

const hulyUnavailableMessage = (error: HulyUnavailableError): string => {
  const failureGuidance =
    error.failureKind === "timeout"
      ? " The request timed out; verify HULY_CONNECTION_TIMEOUT before retrying."
      : error.failureKind === "dns" || error.failureKind === "tls"
        ? " Verify the hostname, certificate, DNS, and proxy configuration before retrying."
        : ""
  if (isDefaultHulyCloudOrigin(error.endpointOrigin)) {
    return `Cannot reach hosted Huly (${error.endpointOrigin}) from this MCP server. Huly's README announces that hosted Huly is being discontinued, with shutdown expected ${HOSTED_HULY_SUNSET.expectedShutdown}; this outage may be related but is not confirmed. Export and back up your data, then migrate to a hosted alternative or self-hosted Huly. ${HOSTED_HULY_MIGRATION_LINKS} Check network/DNS/proxy access if you need one last connection; set HULY_URL to a reachable self-hosted instance after migration. Do not retry a write until connectivity is restored.${failureGuidance}`
  }
  return `Cannot reach the configured Huly endpoint (${error.endpointOrigin}). Check with this deployment's operator, then verify HULY_URL, network/DNS/proxy access, and HULY_CONNECTION_TIMEOUT before retrying. Do not retry a write until connectivity is restored.${failureGuidance}`
}

export const mapDomainErrorToMcp = (
  error: HulyDomainError,
  warnings: ReadonlyArray<ToolWarning> = []
): McpErrorResponseWithMeta => {
  if (error instanceof HulyUnavailableError) {
    return createErrorResponse(hulyUnavailableMessage(error), McpErrorCode.InternalError, error._tag, warnings)
  }
  if (error instanceof HulyConnectionError) {
    return createErrorResponse(hulyConnectionMessage(error), McpErrorCode.InternalError, error._tag, warnings)
  }
  if (INVALID_PARAMS_TAGS.has(error._tag)) {
    return createErrorResponse(error.message, McpErrorCode.InvalidParams, error._tag, warnings)
  }
  const prefix = INTERNAL_ERROR_PREFIX[error._tag]
  const message = prefix !== undefined ? `${prefix}: ${error.message}` : error.message
  return createErrorResponse(message, McpErrorCode.InternalError, error._tag, warnings)
}

export const domainErrorMessage = (error: HulyDomainError): string => mapDomainErrorToMcp(error).content[0].text

type ClientResolutionError = HulyUnavailableError | HulyConnectionError | HulyAuthError | HulyStorageConfigError

const isClientResolutionError = (value: unknown): value is ClientResolutionError =>
  value instanceof HulyUnavailableError ||
  value instanceof HulyConnectionError ||
  value instanceof HulyAuthError ||
  value instanceof HulyStorageConfigError

const clientResolutionFailure = (error: unknown): ClientResolutionError | undefined => {
  if (isClientResolutionError(error)) return error
  if (!Cause.isCause(error)) return undefined
  return findRecoverableCauseFailure(error, isClientResolutionError)
}

/**
 * Client resolution happens while credentials and endpoint URLs are still in play, so a connection
 * failure raised there is reported without its message; operation-time connection failures keep
 * theirs through mapDomainErrorToMcp.
 */
const redactResolutionDetail = (failure: ClientResolutionError): ClientResolutionError =>
  failure instanceof HulyConnectionError ? new HulyConnectionError({ message: "" }) : failure

/** Safely preserve known, schema-owned resolver errors and hide all other rejection details. */
export const mapClientResolutionErrorToMcp = (error: unknown): McpErrorResponseWithMeta => {
  const failure = clientResolutionFailure(error)
  return failure === undefined
    ? mapDomainErrorToMcp(new HulyError({ message: "Failed to initialize Huly clients" }))
    : mapDomainErrorToMcp(redactResolutionDetail(failure))
}

export const mapClientResolutionCauseToMcp = (cause: Cause.Cause<unknown>): McpErrorResponseWithMeta =>
  mapClientResolutionErrorToMcp(cause)

export const clientResolutionErrorMessage = (error: unknown): string =>
  mapClientResolutionErrorToMcp(error).content[0].text

export const clientResolutionCauseMessage = (cause: Cause.Cause<unknown>): string =>
  mapClientResolutionCauseToMcp(cause).content[0].text

// --- Parse Error Mapping ---

export const mapParseErrorToMcp = (error: Schema.SchemaError, toolName?: string): McpErrorResponseWithMeta => {
  const prefix = toolName ? `Invalid parameters for ${toolName}: ` : "Invalid parameters: "
  const message = formatParseError(error)

  return createErrorResponse(`${prefix}${message}`, McpErrorCode.InvalidParams)
}

export const mapParseCauseToMcp = (
  cause: Cause.Cause<Schema.SchemaError>,
  toolName?: string
): McpErrorResponseWithMeta => {
  const classification = classifyCause(cause)
  return classification._tag === "Failure"
    ? mapParseErrorToMcp(classification.firstFailure, toolName)
    : createErrorResponse("An unexpected error occurred", McpErrorCode.InternalError)
}

export const mapDomainCauseToMcp = (
  cause: Cause.Cause<HulyDomainError>,
  warnings: ReadonlyArray<ToolWarning> = []
): McpErrorResponseWithMeta => {
  const classification = classifyCause(cause)
  if (classification._tag === "Failure") return mapDomainErrorToMcp(classification.firstFailure, warnings)
  return createErrorResponse(
    "An unexpected error occurred",
    McpErrorCode.InternalError,
    classification._tag === "Fatal" && classification.reason !== "Interrupt" ? "UnexpectedError" : undefined,
    warnings
  )
}
