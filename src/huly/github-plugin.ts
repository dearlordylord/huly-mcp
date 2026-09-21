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

import { NonEmptyString, NonNegativeInteger } from "../domain/schemas/shared.js"

/** The minimal repository shape needed for target discovery and selection. */
export interface GithubIntegrationRepository extends AttachedDoc {
  readonly name: string
  readonly enabled: boolean
  readonly githubProject?: Ref<GithubProject> | null
  readonly deleted?: boolean
}

/** The project mixin is used as a compatibility fallback for older Huly data. */
export interface GithubProject extends HulyProject {
  readonly repositories: ReadonlyArray<Ref<GithubIntegrationRepository>>
}

/** Native Huly issue mixin used to request GitHub publication. */
export interface GithubIssue extends HulyIssue {
  readonly repository: Ref<GithubIntegrationRepository>
  readonly url: string
  readonly githubNumber: number
}

/** Worker-owned synchronization read model. Never create or update this type. */
export interface DocSyncInfo extends Doc {
  readonly url: string
  readonly objectClass: Ref<Class<Doc>>
  readonly repository: Ref<GithubIntegrationRepository> | null
  readonly githubNumber: number
  readonly error?: unknown
}

/**
 * Minimal schemas for records returned by Huly's unpublished GitHub model.
 * Unknown provider fields are intentionally not projected into MCP output.
 */
export const GithubIntegrationRepositoryRecordSchema = Schema.Struct({
  _id: NonEmptyString,
  name: NonEmptyString,
  enabled: Schema.Boolean,
  githubProject: Schema.optionalKey(Schema.NullOr(NonEmptyString)),
  deleted: Schema.optionalKey(Schema.Boolean)
})
export type GithubIntegrationRepositoryRecord = Schema.Schema.Type<typeof GithubIntegrationRepositoryRecordSchema>

export const GithubProjectMixinRecordSchema = Schema.Struct({ repositories: Schema.Array(NonEmptyString) })
export type GithubProjectMixinRecord = Schema.Schema.Type<typeof GithubProjectMixinRecordSchema>

export const GithubIssueMixinRecordSchema = Schema.Struct({
  repository: NonEmptyString,
  url: Schema.String,
  githubNumber: NonNegativeInteger,
  modifiedOn: Schema.optionalKey(NonNegativeInteger)
})
export type GithubIssueMixinRecord = Schema.Schema.Type<typeof GithubIssueMixinRecordSchema>

export const DocSyncInfoRecordSchema = Schema.Struct({
  url: Schema.String,
  repository: Schema.NullOr(NonEmptyString),
  githubNumber: NonNegativeInteger,
  modifiedOn: Schema.optionalKey(NonNegativeInteger),
  error: Schema.optionalKey(Schema.Unknown)
})
export type DocSyncInfoRecord = Schema.Schema.Type<typeof DocSyncInfoRecordSchema>

/**
 * Phantom refs are the same namespaced strings used by the unpublished Huly
 * plugin. These casts are isolated to this SDK compatibility boundary.
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

export const githubCompatibilityCapabilities = [
  "github:class:GithubIntegrationRepository",
  "github:class:DocSyncInfo",
  "github:mixin:GithubIssue",
  "github:mixin:GithubProject"
] as const

export type GithubCompatibilityCapability = (typeof githubCompatibilityCapabilities)[number]
