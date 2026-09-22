import type { Doc, MixinData, Space } from "@hcengineering/core"
import type { Issue as HulyIssue } from "@hcengineering/tracker"
import { Clock, Effect, Schema } from "effect"

import {
  type GetIssuePublicationStatusParams,
  type ListExternalTrackerTargetsParams,
  type ListExternalTrackerTargetsResult,
  type PublishIssueToExternalTrackerParams,
  type ExternalTrackerPublicationStatus,
  type ExternalTrackerTarget,
  ExternalTrackerTargetId,
  ExternalTrackerProviderSchema,
  ExternalTrackerTargetKindSchema
} from "../../domain/schemas/external-tracker-publication.js"
import { IssueIdentifier, NonEmptyString, NonNegativeInteger, ProjectIdentifier } from "../../domain/schemas/shared.js"
import { HulyClient, type HulyClientError } from "../client.js"
import {
  ExternalTrackerModelUnavailableError,
  ExternalTrackerPublicationConflictError
} from "../errors-external-publication.js"
import type {
  ExternalTrackerNoEnabledTargetError,
  ExternalTrackerTargetAmbiguousError,
  ExternalTrackerTargetCrossProjectError,
  ExternalTrackerTargetDisabledError,
  ExternalTrackerTargetNotFoundError
} from "../errors-external-publication.js"
import type { HulyDataInvalidError } from "../errors-base.js"
import {
  DocSyncInfoRecordSchema,
  github,
  githubCompatibilityCapabilities,
  GithubIntegrationRepositoryRecordSchema,
  GithubProjectMixinRecordSchema,
  GithubIssueMixinRecordSchema,
  type DocSyncInfoRecord,
  type GithubIssue,
  type GithubIntegrationRepositoryRecord,
  type GithubIntegrationRepository,
  type GithubIssueMixinRecord
} from "../github-plugin.js"
import { core, tracker } from "../huly-plugins.js"
import { findIssueInProject, findProject } from "./issues-shared.js"
import { hulyQuery } from "./query-helpers.js"
import {
  externalTrackerTargetFromRepository,
  pendingPublicationState,
  projectExternalPublicationState,
  resolveExternalTrackerTarget,
  type ExternalTrackerTargetCandidate
} from "./external-publication-core.js"
import { parseBoundary, parseOptionalBoundary, parseOptionalMixinBoundary } from "./external-publication-boundaries.js"
import { toClassRef, toRef } from "./sdk-boundary.js"
import type { MetadataClassDoc } from "./sdk-discovery-mappers.js"
import type { IssueNotFoundError, ProjectNotFoundError } from "../errors-tracker.js"

const IssuePublicationDocumentSchema = Schema.Struct({
  _id: NonEmptyString,
  identifier: IssueIdentifier,
  modifiedOn: NonNegativeInteger,
  space: NonEmptyString
})
type IssuePublicationDocument = Schema.Schema.Type<typeof IssuePublicationDocumentSchema>

const ProjectPublicationDocumentSchema = Schema.Struct({ _id: NonEmptyString, identifier: ProjectIdentifier })
type ProjectPublicationDocument = Schema.Schema.Type<typeof ProjectPublicationDocumentSchema>

const ModelCapabilityRecordSchema = Schema.Struct({ _id: NonEmptyString })

const modelClassRef = toClassRef<MetadataClassDoc>(core.class.Class)
const modelMixinRef = toClassRef<MetadataClassDoc>(core.class.Mixin)
const githubClassCapabilities = githubCompatibilityCapabilities.filter((capability) => capability.includes(":class:"))
const githubMixinCapabilities = githubCompatibilityCapabilities.filter((capability) => capability.includes(":mixin:"))

const ensureGithubModelCapabilities = Effect.fn("ExternalPublication.ensureGithubModelCapabilities")(function* (
  client: HulyClient["Service"]
): Effect.fn.Return<void, HulyClientError | HulyDataInvalidError | ExternalTrackerModelUnavailableError> {
  const [rawClasses, rawMixins] = yield* Effect.all([
    client.findAllInModel<MetadataClassDoc>(
      modelClassRef,
      hulyQuery<MetadataClassDoc>({
        _id: { $in: githubClassCapabilities.map((capability) => toRef<MetadataClassDoc>(capability)) }
      })
    ),
    client.findAllInModel<MetadataClassDoc>(
      modelMixinRef,
      hulyQuery<MetadataClassDoc>({
        _id: { $in: githubMixinCapabilities.map((capability) => toRef<MetadataClassDoc>(capability)) }
      })
    )
  ])
  const classes = yield* parseBoundary(
    Schema.Array(ModelCapabilityRecordSchema),
    [...rawClasses, ...rawMixins],
    "externalPublication",
    "Huly model capability"
  )
  const present = new Set(classes.map((entry) => String(entry._id)))
  const missing = githubCompatibilityCapabilities.filter((capability) => !present.has(capability))
  if (missing.length > 0) {
    return yield* new ExternalTrackerModelUnavailableError({
      provider: "github",
      capabilities: missing.map((capability) => NonEmptyString.make(capability))
    })
  }
  return undefined
})

const parseProject = (project: unknown): Effect.Effect<ProjectPublicationDocument, HulyDataInvalidError> =>
  parseBoundary(ProjectPublicationDocumentSchema, project, "externalPublication", "project")

const parseIssue = (issue: unknown): Effect.Effect<IssuePublicationDocument, HulyDataInvalidError> =>
  parseBoundary(IssuePublicationDocumentSchema, issue, "externalPublication", "issue")

const loadProjectMixinRepositoryIds = (
  client: HulyClient["Service"],
  project: ProjectPublicationDocument
): Effect.Effect<ReadonlySet<string>, HulyClientError | HulyDataInvalidError> =>
  Effect.gen(function* () {
    const raw = yield* client.findOne<Doc>(
      toClassRef<Doc>(String(github.mixin.GithubProject)),
      hulyQuery<Doc>({ _id: toRef<Doc>(project._id) })
    )
    const parsed = yield* parseOptionalMixinBoundary(
      GithubProjectMixinRecordSchema,
      raw,
      String(github.mixin.GithubProject),
      "externalPublication",
      "GitHub project mixin"
    )
    return new Set(parsed?.repositories ?? [])
  })

const loadRepositories = (
  client: HulyClient["Service"]
): Effect.Effect<ReadonlyArray<GithubIntegrationRepositoryRecord>, HulyClientError | HulyDataInvalidError> =>
  Effect.gen(function* () {
    const raw = yield* client.findAll<Doc>(
      toClassRef<Doc>(String(github.class.GithubIntegrationRepository)),
      hulyQuery<Doc>({})
    )
    return yield* parseBoundary(
      Schema.Array(GithubIntegrationRepositoryRecordSchema),
      raw,
      "externalPublication",
      "GitHub integration repositories"
    )
  })

const loadTargetCandidates = (
  client: HulyClient["Service"],
  project: ProjectPublicationDocument
): Effect.Effect<ReadonlyArray<ExternalTrackerTargetCandidate>, HulyClientError | HulyDataInvalidError> =>
  Effect.gen(function* () {
    const [repositories, projectRepositoryIds] = yield* Effect.all([
      loadRepositories(client),
      loadProjectMixinRepositoryIds(client, project)
    ])
    const projectId = String(project._id)
    return repositories.map((repository): ExternalTrackerTargetCandidate => {
      const target = externalTrackerTargetFromRepository(repository)
      const directlyMapped = repository.githubProject === projectId
      const mixinMapped = projectRepositoryIds.has(repository._id)
      return {
        target,
        mapped: directlyMapped || mixinMapped,
        ...(repository.githubProject === undefined || repository.githubProject === null
          ? {}
          : { actualProject: repository.githubProject })
      }
    })
  })

const loadRawIssueAndProject = (
  client: HulyClient["Service"],
  projectIdentifier: string,
  issueIdentifier: string
): Effect.Effect<
  { readonly project: ProjectPublicationDocument; readonly issue: IssuePublicationDocument },
  HulyClientError | HulyDataInvalidError | ProjectNotFoundError | IssueNotFoundError,
  HulyClient
> =>
  Effect.gen(function* () {
    const foundProject = yield* findProject(projectIdentifier)
    const project = yield* parseProject(foundProject.project)
    const rawIssue = yield* findIssueInProject(client, foundProject.project, issueIdentifier)
    const issue = yield* parseIssue(rawIssue)
    return { project, issue }
  })

const loadIssueMixin = (
  client: HulyClient["Service"],
  issue: IssuePublicationDocument
): Effect.Effect<GithubIssueMixinRecord | undefined, HulyClientError | HulyDataInvalidError> =>
  Effect.gen(function* () {
    const raw = yield* client.findOne<Doc>(
      toClassRef<Doc>(String(github.mixin.GithubIssue)),
      hulyQuery<Doc>({ _id: toRef<Doc>(issue._id) })
    )
    return yield* parseOptionalMixinBoundary(
      GithubIssueMixinRecordSchema,
      raw,
      String(github.mixin.GithubIssue),
      "externalPublication",
      "GitHub issue mixin"
    )
  })

const loadSyncInfo = (
  client: HulyClient["Service"],
  issue: IssuePublicationDocument
): Effect.Effect<DocSyncInfoRecord | undefined, HulyClientError | HulyDataInvalidError> =>
  Effect.gen(function* () {
    const raw = yield* client.findOne<Doc>(
      toClassRef<Doc>(String(github.class.DocSyncInfo)),
      hulyQuery<Doc>({ _id: toRef<Doc>(issue._id) })
    )
    return yield* parseOptionalBoundary(DocSyncInfoRecordSchema, raw, "externalPublication", "GitHub sync info")
  })

const targetCandidateById = (
  candidates: ReadonlyArray<ExternalTrackerTargetCandidate>,
  id: string
): ExternalTrackerTargetCandidate | undefined =>
  candidates.find((candidate) => String(candidate.target.targetId) === id)

const targetForExistingMixin = (
  candidates: ReadonlyArray<ExternalTrackerTargetCandidate>,
  mixin: GithubIssueMixinRecord
): ExternalTrackerTarget => {
  const candidate = targetCandidateById(candidates, mixin.repository)
  return (
    candidate?.target ?? {
      provider: ExternalTrackerProviderSchema.make("github"),
      kind: ExternalTrackerTargetKindSchema.make("repository"),
      targetId: ExternalTrackerTargetId.make(mixin.repository),
      name: NonEmptyString.make(mixin.repository),
      enabled: false,
      unavailableReason: NonEmptyString.make("The mapped Huly GitHub repository record is unavailable.")
    }
  )
}

const statusForIssue = (
  client: HulyClient["Service"],
  project: ProjectPublicationDocument,
  issue: IssuePublicationDocument,
  candidates: ReadonlyArray<ExternalTrackerTargetCandidate>,
  now: number
): Effect.Effect<ExternalTrackerPublicationStatus, HulyClientError | HulyDataInvalidError> =>
  Effect.gen(function* () {
    const mixin = yield* loadIssueMixin(client, issue)
    if (mixin === undefined) {
      return projectExternalPublicationState({
        project: project.identifier,
        identifier: issue.identifier,
        issueModifiedOn: issue.modifiedOn,
        now
      })
    }
    const syncInfo = yield* loadSyncInfo(client, issue)
    const target = targetForExistingMixin(candidates, mixin)
    return syncInfo === undefined
      ? projectExternalPublicationState({
          project: project.identifier,
          identifier: issue.identifier,
          issueModifiedOn: issue.modifiedOn,
          now,
          mixin,
          target
        })
      : projectExternalPublicationState({
          project: project.identifier,
          identifier: issue.identifier,
          issueModifiedOn: issue.modifiedOn,
          now,
          mixin,
          syncInfo,
          target
        })
  })

export const listExternalTrackerTargets = (
  params: ListExternalTrackerTargetsParams
): Effect.Effect<
  ListExternalTrackerTargetsResult,
  HulyClientError | HulyDataInvalidError | ExternalTrackerModelUnavailableError | ProjectNotFoundError,
  HulyClient
> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    yield* ensureGithubModelCapabilities(client)
    const foundProject = yield* findProject(params.project)
    const project = yield* parseProject(foundProject.project)
    const candidates = yield* loadTargetCandidates(client, project)
    const targets = candidates
      .filter(
        (candidate) =>
          candidate.mapped && (params.provider === undefined || candidate.target.provider === params.provider)
      )
      .map((candidate) => candidate.target)
      .sort((left, right) => `${left.name}\u0000${left.targetId}`.localeCompare(`${right.name}\u0000${right.targetId}`))
    return { project: project.identifier, targets }
  })

export const getIssuePublicationStatus = (
  params: GetIssuePublicationStatusParams
): Effect.Effect<
  ExternalTrackerPublicationStatus,
  | HulyClientError
  | HulyDataInvalidError
  | ExternalTrackerModelUnavailableError
  | ProjectNotFoundError
  | IssueNotFoundError,
  HulyClient
> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    yield* ensureGithubModelCapabilities(client)
    const { issue, project } = yield* loadRawIssueAndProject(client, params.project, params.identifier)
    const candidates = yield* loadTargetCandidates(client, project)
    const now = yield* Clock.currentTimeMillis
    return yield* statusForIssue(client, project, issue, candidates, now)
  })

const nativeMixinAttributes = (target: ExternalTrackerTarget): MixinData<HulyIssue, GithubIssue> => ({
  repository: toRef<GithubIntegrationRepository>(String(target.targetId)),
  url: "",
  githubNumber: 0
})

const publishExistingMixin = (
  client: HulyClient["Service"],
  project: ProjectPublicationDocument,
  issue: IssuePublicationDocument,
  mixin: GithubIssueMixinRecord,
  target: ExternalTrackerTarget,
  now: number
): Effect.Effect<ExternalTrackerPublicationStatus, HulyClientError | HulyDataInvalidError> =>
  Effect.gen(function* () {
    const syncInfo = yield* loadSyncInfo(client, issue)
    const currentState = projectExternalPublicationState({
      project: project.identifier,
      identifier: issue.identifier,
      issueModifiedOn: issue.modifiedOn,
      now,
      mixin,
      ...(syncInfo === undefined ? {} : { syncInfo }),
      target
    })
    if (currentState.state === "published" || currentState.state === "pending") return currentState
    /* v8 ignore start -- projectExternalPublicationState cannot return not_requested when a mixin exists. */
    if (currentState.state !== "failed") return currentState
    /* v8 ignore stop */

    yield* client.updateMixin(
      toRef<HulyIssue>(issue._id),
      tracker.class.Issue,
      toRef<Space>(issue.space),
      github.mixin.GithubIssue,
      nativeMixinAttributes(target)
    )
    return pendingPublicationState({
      project: project.identifier,
      identifier: issue.identifier,
      target,
      now,
      retrying: true,
      previousFailure: currentState.failureSummary
    })
  })

export const publishIssueToExternalTracker = (
  params: PublishIssueToExternalTrackerParams
): Effect.Effect<
  ExternalTrackerPublicationStatus,
  | HulyClientError
  | HulyDataInvalidError
  | ExternalTrackerModelUnavailableError
  | ExternalTrackerPublicationConflictError
  | ProjectNotFoundError
  | IssueNotFoundError
  | ExternalTrackerNoEnabledTargetError
  | ExternalTrackerTargetAmbiguousError
  | ExternalTrackerTargetCrossProjectError
  | ExternalTrackerTargetDisabledError
  | ExternalTrackerTargetNotFoundError,
  HulyClient
> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    yield* ensureGithubModelCapabilities(client)
    const { issue, project } = yield* loadRawIssueAndProject(client, params.project, params.identifier)
    const [candidates, mixin, now] = yield* Effect.all([
      loadTargetCandidates(client, project),
      loadIssueMixin(client, issue),
      Clock.currentTimeMillis
    ])
    const target = yield* resolveExternalTrackerTarget(project.identifier, params.provider, params.target, candidates)

    if (mixin !== undefined && mixin.repository !== String(target.targetId)) {
      return yield* new ExternalTrackerPublicationConflictError({
        project: project.identifier,
        identifier: issue.identifier,
        requestedTargetId: NonEmptyString.make(String(target.targetId)),
        existingTargetId: NonEmptyString.make(mixin.repository)
      })
    }

    if (mixin === undefined) {
      yield* client.createMixin(
        toRef<HulyIssue>(issue._id),
        tracker.class.Issue,
        toRef<Space>(issue.space),
        github.mixin.GithubIssue,
        nativeMixinAttributes(target)
      )
    }

    if (mixin !== undefined) return yield* publishExistingMixin(client, project, issue, mixin, target, now)

    return pendingPublicationState({ project: project.identifier, identifier: issue.identifier, target, now })
  })

export type ExternalPublicationBoundaryRepository = GithubIntegrationRepositoryRecord
export type ExternalPublicationBoundaryMixin = GithubIssueMixinRecord
export type ExternalPublicationBoundarySyncInfo = DocSyncInfoRecord
