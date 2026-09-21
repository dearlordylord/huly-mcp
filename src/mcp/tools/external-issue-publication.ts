import {
  getIssuePublicationStatusParamsJsonSchema,
  GetIssuePublicationStatusResultSchema,
  listExternalTrackerTargetsParamsJsonSchema,
  ListExternalTrackerTargetsResultSchema,
  parseGetIssuePublicationStatusParams,
  parseListExternalTrackerTargetsParams,
  parsePublishIssueToExternalTrackerParams,
  publishIssueToExternalTrackerParamsJsonSchema,
  PublishIssueToExternalTrackerResultSchema
} from "../../domain/schemas.js"
import {
  getIssuePublicationStatus,
  listExternalTrackerTargets,
  publishIssueToExternalTracker
} from "../../huly/operations/external-issue-publication.js"
import { defineTool, type RegisteredTool } from "./registry.js"

const CATEGORY = "issues" as const

export const externalIssuePublicationTools = [
  defineTool(
    {
      name: "list_external_tracker_targets",
      description:
        "List external issue-tracker targets mapped to a Huly project. Omit provider to list every provider supported by this server, or pass provider:'github' to list mapped GitHub repositories. Returns each target's provider, kind, stable Huly ID, exact name, enabled state, and an actionable unavailable reason when known. This discovers Huly configuration only; it does not call the external provider or prove that the synchronization worker is running.",
      category: CATEGORY,
      inputSchema: listExternalTrackerTargetsParamsJsonSchema,
      resultSchema: ListExternalTrackerTargetsResultSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    parseListExternalTrackerTargetsParams,
    listExternalTrackerTargets
  ),
  defineTool(
    {
      name: "publish_issue_to_external_tracker",
      description:
        "Request publication of an existing Huly issue as a new issue in Huly's configured external tracker. Identify the issue with project and its human identifier (for example, HULY-123); provider currently accepts only 'github'. Select target by stable Huly target ID or exact name, or omit target only when exactly one enabled target is mapped to the project. Publication is asynchronous: pending means Huly accepted the request, not that an external issue exists. Repeating the same target is safe while pending or published; a failed same-target request retries, while a different target is rejected. Use get_issue_publication_status to observe completion.",
      category: CATEGORY,
      inputSchema: publishIssueToExternalTrackerParamsJsonSchema,
      resultSchema: PublishIssueToExternalTrackerResultSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    parsePublishIssueToExternalTrackerParams,
    publishIssueToExternalTracker
  ),
  defineTool(
    {
      name: "get_issue_publication_status",
      description:
        "Read the Huly-persisted external publication state for an issue identified by project and human issue identifier. Returns not_requested, pending, published, or failed; pending includes the ISO state-change timestamp and elapsed time, while published includes an external URL and positive issue number. A timeout is projected as failed only after the bounded wait, and later persisted publication takes precedence. This reads Huly state and never calls the external provider directly.",
      category: CATEGORY,
      inputSchema: getIssuePublicationStatusParamsJsonSchema,
      resultSchema: GetIssuePublicationStatusResultSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    parseGetIssuePublicationStatusParams,
    getIssuePublicationStatus
  )
] as const satisfies ReadonlyArray<RegisteredTool>
