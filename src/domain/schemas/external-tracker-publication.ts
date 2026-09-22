import { Schema } from "effect"

import { toDraft07JsonSchema, withJsonSchemaPropertyDescriptions } from "./json-schema.js"
import {
  IssueIdentifier,
  NonEmptyString,
  NonNegativeInteger,
  PositiveInteger,
  ProjectIdentifier,
  UrlString
} from "./shared.js"
import { DocId } from "./shared-refs.js"

/** Providers supported by this MCP revision. */
export const ExternalTrackerProviderSchema = Schema.Literals(["github"]).annotate({
  identifier: "ExternalTrackerProvider",
  title: "External tracker provider",
  description: "External integration provider. GitHub is the only provider currently supported."
})
export type ExternalTrackerProvider = Schema.Schema.Type<typeof ExternalTrackerProviderSchema>

export const ExternalTrackerTargetKindSchema = Schema.Literals(["repository"]).annotate({
  identifier: "ExternalTrackerTargetKind",
  title: "External tracker target kind",
  description: "Target kind exposed by the provider. GitHub targets are repositories."
})
export type ExternalTrackerTargetKind = Schema.Schema.Type<typeof ExternalTrackerTargetKindSchema>

export const githubCompatibilityCapabilities = [
  "github:class:GithubIntegrationRepository",
  "github:class:DocSyncInfo",
  "github:mixin:GithubIssue",
  "github:mixin:GithubProject"
] as const
export const GithubCompatibilityCapabilitySchema = Schema.Literals(githubCompatibilityCapabilities)
export type GithubCompatibilityCapability = Schema.Schema.Type<typeof GithubCompatibilityCapabilitySchema>

export const ExternalTrackerTargetId = DocId.pipe(Schema.brand("ExternalTrackerTargetId"))
export type ExternalTrackerTargetId = Schema.Schema.Type<typeof ExternalTrackerTargetId>

export const ExternalTrackerTargetName = NonEmptyString.pipe(Schema.brand("ExternalTrackerTargetName"))
export type ExternalTrackerTargetName = Schema.Schema.Type<typeof ExternalTrackerTargetName>

export const ExternalTrackerTargetLocator = NonEmptyString.pipe(Schema.brand("ExternalTrackerTargetLocator"))
export type ExternalTrackerTargetLocator = Schema.Schema.Type<typeof ExternalTrackerTargetLocator>

export const ExternalIssueNumber = PositiveInteger.pipe(Schema.brand("ExternalIssueNumber"))
export type ExternalIssueNumber = Schema.Schema.Type<typeof ExternalIssueNumber>

export const ExternalPublicationElapsedMilliseconds = NonNegativeInteger.pipe(
  Schema.brand("ExternalPublicationElapsedMilliseconds")
)
export type ExternalPublicationElapsedMilliseconds = Schema.Schema.Type<
  typeof ExternalPublicationElapsedMilliseconds
>

const Iso8601TimestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u
const MAX_FAILURE_SUMMARY_LENGTH = 512

/** ISO 8601 UTC timestamp rendered by publication/status responses. */
export const Iso8601Timestamp = Schema.String.pipe(
  Schema.check(Schema.isPattern(Iso8601TimestampPattern)),
  Schema.brand("Iso8601Timestamp")
).annotate({
  identifier: "Iso8601Timestamp",
  title: "ISO 8601 timestamp",
  description: "UTC timestamp in the canonical YYYY-MM-DDTHH:mm:ss.sssZ form."
})
export type Iso8601Timestamp = Schema.Schema.Type<typeof Iso8601Timestamp>

export const ExternalTrackerFailureSummary = NonEmptyString.pipe(
  Schema.check(Schema.isMaxLength(MAX_FAILURE_SUMMARY_LENGTH)),
  Schema.brand("ExternalTrackerFailureSummary")
).annotate({
  identifier: "ExternalTrackerFailureSummary",
  title: "External tracker failure summary",
  description: "Bounded, redacted summary of a persisted Huly worker failure."
})
export type ExternalTrackerFailureSummary = Schema.Schema.Type<typeof ExternalTrackerFailureSummary>

export const ExternalTrackerUnavailableReason = NonEmptyString.pipe(
  Schema.check(Schema.isMaxLength(MAX_FAILURE_SUMMARY_LENGTH)),
  Schema.brand("ExternalTrackerUnavailableReason")
)
export type ExternalTrackerUnavailableReason = Schema.Schema.Type<typeof ExternalTrackerUnavailableReason>

const ExternalTrackerTargetIdentityFields = {
  provider: ExternalTrackerProviderSchema,
  kind: ExternalTrackerTargetKindSchema,
  targetId: ExternalTrackerTargetId,
  name: ExternalTrackerTargetName
} as const

export const ExternalTrackerTargetSchema = Schema.Union([
  Schema.Struct({ ...ExternalTrackerTargetIdentityFields, enabled: Schema.Literal(true) }),
  Schema.Struct({
    ...ExternalTrackerTargetIdentityFields,
    enabled: Schema.Literal(false),
    unavailableReason: Schema.optionalKey(ExternalTrackerUnavailableReason)
  })
]).annotate({
  identifier: "ExternalTrackerTarget",
  title: "External tracker target",
  description:
    "A provider target mapped to the requested Huly project. targetId is the stable Huly ID; name is the exact target name."
})
export type ExternalTrackerTarget = Schema.Schema.Type<typeof ExternalTrackerTargetSchema>

export const ListExternalTrackerTargetsParamsSchema = Schema.Struct({
  project: ProjectIdentifier.annotateKey({
    description: "Huly project identifier whose provider targets should be listed."
  }),
  provider: Schema.optionalKey(
    ExternalTrackerProviderSchema.annotateKey({
      description: "Optional provider filter. Omit to list targets for every provider supported by this MCP version."
    })
  )
}).annotate({
  identifier: "ListExternalTrackerTargetsParams",
  title: "List external tracker targets parameters",
  description: "Discover provider targets mapped to one Huly project before requesting publication."
})
export type ListExternalTrackerTargetsParams = Schema.Schema.Type<typeof ListExternalTrackerTargetsParamsSchema>

export const ListExternalTrackerTargetsResultSchema = Schema.Struct({
  project: ProjectIdentifier,
  targets: Schema.Array(ExternalTrackerTargetSchema)
}).annotate({
  identifier: "ListExternalTrackerTargetsResult",
  title: "External tracker targets",
  description: "Targets mapped to one Huly project, including disabled targets and known unavailable reasons."
})
export type ListExternalTrackerTargetsResult = Schema.Schema.Type<typeof ListExternalTrackerTargetsResultSchema>

export const PublishIssueToExternalTrackerParamsSchema = Schema.Struct({
  project: ProjectIdentifier.annotateKey({ description: "Huly project identifier containing the issue to publish." }),
  identifier: IssueIdentifier.annotateKey({
    description: "Human Huly issue identifier, such as ENG-42 or the issue number 42."
  }),
  provider: ExternalTrackerProviderSchema.annotateKey({
    description: "External provider. GitHub is currently the only supported value."
  }),
  target: Schema.optionalKey(
    ExternalTrackerTargetLocator.annotateKey({
      description:
        "Optional stable Huly target ID or exact target name. Omit only when exactly one enabled target exists for the provider and project."
    })
  )
}).annotate({
  identifier: "PublishIssueToExternalTrackerParams",
  title: "Publish issue to external tracker parameters",
  description:
    "Request Huly's configured provider integration to publish an existing Huly issue. This accepts the request asynchronously; it does not call GitHub directly."
})
export type PublishIssueToExternalTrackerParams = Schema.Schema.Type<typeof PublishIssueToExternalTrackerParamsSchema>

export const GetIssuePublicationStatusParamsSchema = Schema.Struct({
  project: ProjectIdentifier.annotateKey({ description: "Huly project identifier containing the issue." }),
  identifier: IssueIdentifier.annotateKey({
    description: "Human Huly issue identifier, such as ENG-42 or the issue number 42."
  })
}).annotate({
  identifier: "GetIssuePublicationStatusParams",
  title: "Get issue publication status parameters",
  description: "Project the persisted Huly publication state for one issue without contacting the provider directly."
})
export type GetIssuePublicationStatusParams = Schema.Schema.Type<typeof GetIssuePublicationStatusParamsSchema>

const PublicationIdentityFields = { project: ProjectIdentifier, identifier: IssueIdentifier } as const

const PublicationTargetFields = {
  provider: ExternalTrackerProviderSchema,
  target: ExternalTrackerTargetSchema,
  stateChangedAt: Iso8601Timestamp
} as const

const PendingPublicationBaseFields = {
  ...PublicationIdentityFields,
  state: Schema.Literal("pending"),
  ...PublicationTargetFields,
  elapsedMs: ExternalPublicationElapsedMilliseconds
} as const

const PublishedPublicationFields = {
  ...PublicationIdentityFields,
  state: Schema.Literal("published"),
  ...PublicationTargetFields,
  url: UrlString,
  externalIssueNumber: ExternalIssueNumber
} as const

const FailedPublicationFields = {
  ...PublicationIdentityFields,
  state: Schema.Literal("failed"),
  ...PublicationTargetFields,
  failureSummary: ExternalTrackerFailureSummary
} as const

export const ExternalTrackerPublicationStatusSchema = Schema.Union([
  Schema.Struct({ ...PublicationIdentityFields, state: Schema.Literal("not_requested") }),
  Schema.Struct({
    ...PendingPublicationBaseFields,
    retrying: Schema.Literal(true),
    previousFailure: ExternalTrackerFailureSummary
  }),
  Schema.Struct(PendingPublicationBaseFields),
  Schema.Struct(PublishedPublicationFields),
  Schema.Struct(FailedPublicationFields)
]).annotate({
  identifier: "ExternalTrackerPublicationStatus",
  title: "External tracker publication status",
  description:
    "Huly-owned publication state. pending means the native request was accepted but does not prove external creation."
})
export type ExternalTrackerPublicationStatus = Schema.Schema.Type<typeof ExternalTrackerPublicationStatusSchema>

/** Alias emphasizing that publication and status tools return the same shape. */
export const ExternalTrackerPublicationResultSchema = ExternalTrackerPublicationStatusSchema
export type ExternalTrackerPublicationResult = ExternalTrackerPublicationStatus

export const PublishIssueToExternalTrackerResultSchema = ExternalTrackerPublicationStatusSchema
export type PublishIssueToExternalTrackerResult = ExternalTrackerPublicationStatus
export const GetIssuePublicationStatusResultSchema = ExternalTrackerPublicationStatusSchema
export type GetIssuePublicationStatusResult = ExternalTrackerPublicationStatus

/** Compatibility aliases used by operation/tool modules. */
export const ExternalIssuePublicationStatusSchema = ExternalTrackerPublicationStatusSchema
export type ExternalIssuePublicationStatus = ExternalTrackerPublicationStatus

export const listExternalTrackerTargetsParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  toDraft07JsonSchema(ListExternalTrackerTargetsParamsSchema),
  {
    project: "Huly project identifier whose external targets should be listed.",
    provider: "Optional provider filter; omit to discover every provider supported by this MCP version."
  }
)

export const publishIssueToExternalTrackerParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  toDraft07JsonSchema(PublishIssueToExternalTrackerParamsSchema),
  {
    project: "Huly project identifier containing the issue.",
    identifier: "Human Huly issue identifier, such as ENG-42 or 42.",
    provider: "External provider discriminator. Use github.",
    target: "Optional stable Huly target ID or exact target name."
  }
)

export const getIssuePublicationStatusParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  toDraft07JsonSchema(GetIssuePublicationStatusParamsSchema),
  {
    project: "Huly project identifier containing the issue.",
    identifier: "Human Huly issue identifier, such as ENG-42 or 42."
  }
)

export const parseListExternalTrackerTargetsParams = Schema.decodeUnknownEffect(ListExternalTrackerTargetsParamsSchema)
export const parsePublishIssueToExternalTrackerParams = Schema.decodeUnknownEffect(
  PublishIssueToExternalTrackerParamsSchema
)
export const parseGetIssuePublicationStatusParams = Schema.decodeUnknownEffect(GetIssuePublicationStatusParamsSchema)
