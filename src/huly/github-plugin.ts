/**
 * Deliberately small compatibility descriptor for Huly's unpublished GitHub
 * model package.
 *
 * `@hcengineering/github` is intentionally not published by upstream Huly.
 * Keep this module limited to the stable references and the fields required by
 * external issue publication.  The operation layer decodes all values received
 * from Huly with Effect Schema before using them.
 *
 * Upstream reference: Huly's `services/github/github/src/index.ts` model
 * (local snapshot: `.reference/huly-platform-process-markup-await/services/github/github/src/index.ts`).
 *
 * @module
 */
import type { AttachedDoc, Class, Doc, Mixin, Ref, Space } from "@hcengineering/core"
import type { Issue as HulyIssue, Project as HulyProject } from "@hcengineering/tracker"
import { Schema } from "effect"

import {
  ExternalIssueNumber,
  ExternalTrackerTargetId,
  ExternalTrackerTargetName
} from "../domain/schemas/external-tracker-publication.js"
import { Timestamp, UrlString } from "../domain/schemas/shared.js"
import { DocId } from "../domain/schemas/shared-refs.js"

const GithubPublicationUrl = Schema.Union([Schema.Literal(""), UrlString])
type GithubPublicationUrl = Schema.Schema.Type<typeof GithubPublicationUrl>

const GithubPublicationIssueNumber = Schema.Union([Schema.Literal(0), ExternalIssueNumber])
type GithubPublicationIssueNumber = Schema.Schema.Type<typeof GithubPublicationIssueNumber>

const PendingGithubPublicationFields = { url: Schema.Literal(""), githubNumber: Schema.Literal(0) } as const
const PublishedGithubPublicationFields = { url: UrlString, githubNumber: ExternalIssueNumber } as const

/** SDK query shape only; runtime repository payloads are owned and decoded by the schema below. */
export interface GithubIntegrationRepository extends AttachedDoc {
  readonly name: ExternalTrackerTargetName
  readonly enabled: boolean
  readonly githubProject?: Ref<GithubProject> | null
  readonly deleted?: boolean
}

/** SDK query shape only; runtime project-mixin payloads are owned and decoded by the schema below. */
export interface GithubProject extends HulyProject {
  readonly repositories: ReadonlyArray<Ref<GithubIntegrationRepository>>
}

/** SDK mutation shape only; outbound values are constructed from schema-derived domain values. */
export interface GithubIssue extends HulyIssue {
  readonly repository: Ref<GithubIntegrationRepository>
  readonly url: GithubPublicationUrl
  readonly githubNumber: GithubPublicationIssueNumber
}

/** SDK query shape only; worker-owned payloads are decoded by DocSyncInfoRecordSchema before use. */
export interface DocSyncInfo extends Doc {
  readonly url: GithubPublicationUrl
  readonly objectClass: Ref<Class<Doc>>
  readonly repository: Ref<GithubIntegrationRepository> | null
  readonly githubNumber: GithubPublicationIssueNumber
  readonly error?: unknown
}

/**
 * Minimal schemas for records returned by Huly's unpublished GitHub model.
 * Unknown provider fields are intentionally not projected into MCP output.
 */
export const GithubIntegrationRepositoryRecordSchema = Schema.Struct({
  _id: ExternalTrackerTargetId,
  name: ExternalTrackerTargetName,
  enabled: Schema.Boolean,
  githubProject: Schema.optionalKey(Schema.NullOr(DocId)),
  deleted: Schema.optionalKey(Schema.Boolean)
})
export type GithubIntegrationRepositoryRecord = Schema.Schema.Type<typeof GithubIntegrationRepositoryRecordSchema>

export const GithubProjectMixinRecordSchema = Schema.Struct({ repositories: Schema.Array(ExternalTrackerTargetId) })
export type GithubProjectMixinRecord = Schema.Schema.Type<typeof GithubProjectMixinRecordSchema>

const GithubIssueMixinIdentityFields = {
  repository: ExternalTrackerTargetId,
  modifiedOn: Schema.optionalKey(Timestamp)
} as const
export const GithubIssueMixinRecordSchema = Schema.Union([
  Schema.Struct({ ...GithubIssueMixinIdentityFields, ...PendingGithubPublicationFields }),
  Schema.Struct({ ...GithubIssueMixinIdentityFields, ...PublishedGithubPublicationFields })
])
export type GithubIssueMixinRecord = Schema.Schema.Type<typeof GithubIssueMixinRecordSchema>

const DocSyncInfoIdentityFields = {
  repository: Schema.NullOr(ExternalTrackerTargetId),
  modifiedOn: Schema.optionalKey(Timestamp),
  error: Schema.optionalKey(Schema.Unknown)
} as const
export const DocSyncInfoRecordSchema = Schema.Union([
  Schema.Struct({ ...DocSyncInfoIdentityFields, ...PendingGithubPublicationFields }),
  Schema.Struct({ ...DocSyncInfoIdentityFields, ...PublishedGithubPublicationFields })
])
export type DocSyncInfoRecord = Schema.Schema.Type<typeof DocSyncInfoRecordSchema>

/**
 * The unpublished package cannot supply these SDK constants. Huly Ref brands
 * are erased at runtime; both sides are namespaced strings, so these casts are
 * isolated to this compatibility boundary.
 */
/* eslint-disable no-restricted-syntax -- unpublished Huly plugin refs are opaque phantom strings */
const githubClassRef = <T extends Doc>(identifier: string): Ref<Class<T>> => identifier as Ref<Class<T>>
const githubMixinRef = <T extends Doc>(identifier: string): Ref<Mixin<T>> => identifier as Ref<Mixin<T>>
const githubSpaceRef = <T extends Space>(identifier: string): Ref<T> => identifier as Ref<T>
/* eslint-enable no-restricted-syntax */

export const github = {
  class: {
    DocSyncInfo: githubClassRef<DocSyncInfo>("github:class:DocSyncInfo"),
    GithubIntegrationRepository: githubClassRef<GithubIntegrationRepository>("github:class:GithubIntegrationRepository")
  },
  mixin: {
    GithubIssue: githubMixinRef<GithubIssue>("github:mixin:GithubIssue"),
    GithubProject: githubMixinRef<GithubProject>("github:mixin:GithubProject")
  },
  space: { Model: githubSpaceRef<Space>("core:space:Model") }
} as const

export {
  githubCompatibilityCapabilities,
  GithubCompatibilityCapabilitySchema,
  type GithubCompatibilityCapability
} from "../domain/schemas/external-tracker-publication.js"
