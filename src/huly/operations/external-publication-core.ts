import { DateTime, Effect, Option, Schema } from "effect"

import {
  ExternalPublicationElapsedMilliseconds,
  ExternalTrackerFailureSummary,
  ExternalTrackerPublicationStatusSchema,
  ExternalTrackerProviderSchema,
  ExternalTrackerTargetKindSchema,
  ExternalTrackerTargetLocator,
  ExternalTrackerTargetName,
  ExternalTrackerTargetSchema,
  ExternalTrackerUnavailableReason,
  type ExternalIssueNumber as ExternalIssueNumberType,
  type ExternalPublicationElapsedMilliseconds as ExternalPublicationElapsedMillisecondsType,
  type ExternalTrackerFailureSummary as ExternalTrackerFailureSummaryType,
  Iso8601Timestamp,
  type ExternalTrackerPublicationStatus,
  type ExternalTrackerProvider,
  type ExternalTrackerTarget,
  type ExternalTrackerTargetLocator as ExternalTrackerTargetLocatorType,
  type ExternalTrackerUnavailableReason as ExternalTrackerUnavailableReasonType
} from "../../domain/schemas/external-tracker-publication.js"
import {
  ExternalTrackerNoEnabledTargetError,
  ExternalTrackerTargetAmbiguousError,
  ExternalTrackerTargetCrossProjectError,
  ExternalTrackerTargetDisabledError,
  ExternalTrackerTargetNotFoundError
} from "../errors-external-publication.js"
import {
  type DocSyncInfoRecord,
  type GithubIntegrationRepositoryRecord,
  type GithubIssueMixinRecord
} from "../github-plugin.js"
import {
  type ProjectIdentifier,
  type Timestamp as TimestampType,
  UrlString,
  type UrlString as UrlStringType,
  type IssueIdentifier
} from "../../domain/schemas/shared.js"
import type { DocId } from "../../domain/schemas/shared-refs.js"

/**
 * A pending request is projected as failed after this bounded wait when Huly
 * has not persisted either completion or a worker failure. The next request
 * to the same target may safely requeue the native mixin transaction.
 */
const PENDING_WAIT_MINUTES = 15
const SECONDS_PER_MINUTE = 60
const MILLISECONDS_PER_SECOND = 1000
export const EXTERNAL_PUBLICATION_MAX_PENDING_MS = ExternalPublicationElapsedMilliseconds.make(
  PENDING_WAIT_MINUTES * SECONDS_PER_MINUTE * MILLISECONDS_PER_SECOND
)

export const EXTERNAL_PUBLICATION_FAILURE_SUMMARY: ExternalTrackerFailureSummaryType =
  ExternalTrackerFailureSummary.make(
    "Huly's external tracker worker reported a publication failure; inspect Huly integration configuration and logs."
  )
const EXTERNAL_PUBLICATION_TIMEOUT_FAILURE_SUMMARY = ExternalTrackerFailureSummary.make(
  "Huly did not complete external publication within the bounded wait; retry the same target to requeue it."
)

export interface ExternalTrackerTargetCandidate {
  readonly target: ExternalTrackerTarget
  readonly mapped: boolean
  readonly actualProject?: DocId
}

export interface PublicationProjectionInput {
  readonly project: ProjectIdentifier
  readonly identifier: IssueIdentifier
  readonly issueModifiedOn: TimestampType
  readonly now: TimestampType
  readonly mixin?: GithubIssueMixinRecord
  readonly syncInfo?: DocSyncInfoRecord
  readonly target?: ExternalTrackerTarget
}

const externalProvider: ExternalTrackerProvider = ExternalTrackerProviderSchema.make("github")
const repositoryKind = ExternalTrackerTargetKindSchema.make("repository")

const repositoryUnavailableReason = (
  repository: GithubIntegrationRepositoryRecord
): ExternalTrackerUnavailableReasonType | undefined => {
  if (repository.deleted === true)
    return ExternalTrackerUnavailableReason.make("This Huly GitHub repository mapping is deleted.")
  if (!repository.enabled)
    return ExternalTrackerUnavailableReason.make("This Huly GitHub repository mapping is disabled.")
  return undefined
}

/** Convert a parsed compatibility record into the public target projection. */
export const externalTrackerTargetFromRepository = (
  repository: GithubIntegrationRepositoryRecord
): ExternalTrackerTarget => {
  const unavailableReason = repositoryUnavailableReason(repository)
  const identity = {
    provider: externalProvider,
    kind: repositoryKind,
    targetId: repository._id,
    name: repository.name
  }
  return unavailableReason === undefined
    ? ExternalTrackerTargetSchema.make({ ...identity, enabled: true })
    : ExternalTrackerTargetSchema.make({ ...identity, enabled: false, unavailableReason })
}

const candidateSummary = (candidate: ExternalTrackerTargetCandidate) => ({
  targetId: candidate.target.targetId,
  name: candidate.target.name
})

const candidatesForName = (
  candidates: ReadonlyArray<ExternalTrackerTargetCandidate>,
  name: ExternalTrackerTargetLocatorType
): ReadonlyArray<ExternalTrackerTargetCandidate> =>
  candidates.filter((candidate) => String(candidate.target.name) === name && candidate.mapped)

const matchingTargetById = (
  candidates: ReadonlyArray<ExternalTrackerTargetCandidate>,
  target: ExternalTrackerTargetLocatorType
): ExternalTrackerTargetCandidate | undefined =>
  candidates.find((candidate) => String(candidate.target.targetId) === target)

type ResolveExternalTrackerTargetError =
  | ExternalTrackerNoEnabledTargetError
  | ExternalTrackerTargetAmbiguousError
  | ExternalTrackerTargetCrossProjectError
  | ExternalTrackerTargetDisabledError
  | ExternalTrackerTargetNotFoundError

type TargetResolutionEffect = Effect.Effect<ExternalTrackerTarget, ResolveExternalTrackerTargetError>

const resolveAutomaticTarget = (
  project: ProjectIdentifier,
  provider: ExternalTrackerProvider,
  candidates: ReadonlyArray<ExternalTrackerTargetCandidate>
): TargetResolutionEffect => {
  const enabled = candidates.filter((candidate) => candidate.mapped && candidate.target.enabled)
  if (enabled.length === 0) return Effect.fail(new ExternalTrackerNoEnabledTargetError({ project, provider }))
  if (enabled.length > 1) {
    return Effect.fail(
      new ExternalTrackerTargetAmbiguousError({ project, provider, candidates: enabled.map(candidateSummary) })
    )
  }
  const [selected] = enabled
  /* v8 ignore start -- guarded by enabled.length === 1 */
  return selected === undefined
    ? Effect.fail(new ExternalTrackerNoEnabledTargetError({ project, provider }))
    : Effect.succeed(selected.target)
  /* v8 ignore stop */
}

const resolveTargetById = (
  project: ProjectIdentifier,
  provider: ExternalTrackerProvider,
  match: ExternalTrackerTargetCandidate
): TargetResolutionEffect => {
  if (!match.mapped) {
    return Effect.fail(
      new ExternalTrackerTargetCrossProjectError({
        project,
        provider,
        target: ExternalTrackerTargetLocator.make(match.target.targetId),
        ...(match.actualProject === undefined ? {} : { actualProject: match.actualProject })
      })
    )
  }
  if (!match.target.enabled) {
    return Effect.fail(
      new ExternalTrackerTargetDisabledError({
        project,
        provider,
        targetId: match.target.targetId,
        name: match.target.name
      })
    )
  }
  return Effect.succeed(match.target)
}

const resolveTargetByName = (
  project: ProjectIdentifier,
  provider: ExternalTrackerProvider,
  target: ExternalTrackerTargetLocatorType,
  candidates: ReadonlyArray<ExternalTrackerTargetCandidate>
): TargetResolutionEffect => {
  const matches = candidatesForName(candidates, target)
  if (matches.length > 1) {
    return Effect.fail(
      new ExternalTrackerTargetAmbiguousError({
        project,
        provider,
        target,
        candidates: matches.map(candidateSummary)
      })
    )
  }
  const [match] = matches
  if (match !== undefined)
    return match.target.enabled
      ? Effect.succeed(match.target)
      : Effect.fail(
          new ExternalTrackerTargetDisabledError({
            project,
            provider,
            targetId: match.target.targetId,
            name: match.target.name
          })
        )
  const crossProject = candidates.find((candidate) => String(candidate.target.name) === target && !candidate.mapped)
  return Effect.fail(
    crossProject === undefined
      ? new ExternalTrackerTargetNotFoundError({ project, provider, target })
      : new ExternalTrackerTargetCrossProjectError({
          project,
          provider,
          target,
          ...(crossProject.actualProject === undefined ? {} : { actualProject: crossProject.actualProject })
        })
  )
}

/**
 * Resolve a stable Huly target ID or exact name. This is intentionally pure:
 * adapters provide all repository records, including records from other
 * projects, so cross-project selection cannot be mistaken for a missing target.
 */
export const resolveExternalTrackerTarget = (
  project: ProjectIdentifier,
  provider: ExternalTrackerProvider,
  target: ExternalTrackerTargetLocatorType | undefined,
  candidates: ReadonlyArray<ExternalTrackerTargetCandidate>
): TargetResolutionEffect =>
  target === undefined
    ? resolveAutomaticTarget(project, provider, candidates)
    : (() => {
        const idMatch = matchingTargetById(candidates, target)
        return idMatch === undefined
          ? resolveTargetByName(project, provider, target, candidates)
          : resolveTargetById(project, provider, idMatch)
      })()

const isoTimestamp = (milliseconds: TimestampType): Iso8601Timestamp => {
  const rendered = Option.match(DateTime.make(milliseconds), {
    onNone: () => DateTime.formatIso(DateTime.makeUnsafe(0)),
    onSome: DateTime.formatIso
  })
  return Iso8601Timestamp.make(rendered)
}

const elapsedMilliseconds = (
  now: TimestampType,
  changedAt: TimestampType
): ExternalPublicationElapsedMillisecondsType =>
  ExternalPublicationElapsedMilliseconds.make(Math.max(0, now - changedAt))

const changedAtFor = (input: PublicationProjectionInput): TimestampType =>
  input.syncInfo?.modifiedOn ?? input.mixin?.modifiedOn ?? input.issueModifiedOn

const makePublishedPublication = (
  input: PublicationProjectionInput,
  target: ExternalTrackerTarget,
  url: UrlStringType,
  issueNumber: ExternalIssueNumberType
): ExternalTrackerPublicationStatus => ({
  project: input.project,
  identifier: input.identifier,
  state: "published",
  provider: externalProvider,
  target,
  stateChangedAt: isoTimestamp(changedAtFor(input)),
  url,
  externalIssueNumber: issueNumber
})

const completedValues = (
  record: GithubIssueMixinRecord | DocSyncInfoRecord | undefined
): { readonly url: UrlStringType; readonly number: ExternalIssueNumberType } | undefined => {
  if (record === undefined) return undefined
  const url = record.url.trim()
  return url === "" || record.githubNumber === 0
    ? undefined
    : { url: UrlString.make(url), number: record.githubNumber }
}

const completedPublication = (
  input: PublicationProjectionInput,
  target: ExternalTrackerTarget
): ExternalTrackerPublicationStatus | undefined => {
  const values = completedValues(input.mixin) ?? completedValues(input.syncInfo)
  return values === undefined ? undefined : makePublishedPublication(input, target, values.url, values.number)
}

const hasPersistedFailure = (value: unknown): boolean => {
  if (value === undefined || value === null) return false
  return typeof value !== "string" || value.trim() !== ""
}

/** Do not expose raw worker/provider payloads; return only a bounded fixed summary. */
export const redactPublicationFailure = (_value: unknown): ExternalTrackerFailureSummaryType =>
  EXTERNAL_PUBLICATION_FAILURE_SUMMARY

const projectPublicationState = (
  input: PublicationProjectionInput,
  target: ExternalTrackerTarget
): ExternalTrackerPublicationStatus => {
  const completed = completedPublication(input, target)
  if (completed !== undefined) return completed

  const changedAt = changedAtFor(input)
  const elapsedMs = elapsedMilliseconds(input.now, changedAt)
  if (hasPersistedFailure(input.syncInfo?.error)) {
    return {
      project: input.project,
      identifier: input.identifier,
      state: "failed",
      provider: externalProvider,
      target,
      stateChangedAt: isoTimestamp(changedAt),
      failureSummary: redactPublicationFailure(input.syncInfo?.error)
    }
  }
  if (elapsedMs >= EXTERNAL_PUBLICATION_MAX_PENDING_MS) {
    return {
      project: input.project,
      identifier: input.identifier,
      state: "failed",
      provider: externalProvider,
      target,
      stateChangedAt: isoTimestamp(changedAt),
      failureSummary: EXTERNAL_PUBLICATION_TIMEOUT_FAILURE_SUMMARY
    }
  }
  return {
    project: input.project,
    identifier: input.identifier,
    state: "pending",
    provider: externalProvider,
    target,
    stateChangedAt: isoTimestamp(changedAt),
    elapsedMs
  }
}

/** Project persisted Huly data into the public state contract. */
export const projectExternalPublicationState = (
  input: PublicationProjectionInput
): ExternalTrackerPublicationStatus => {
  if (input.mixin === undefined) {
    return { project: input.project, identifier: input.identifier, state: "not_requested" }
  }
  const target =
    input.target ??
    ExternalTrackerTargetSchema.make({
      provider: externalProvider,
      kind: repositoryKind,
      targetId: input.mixin.repository,
      name: ExternalTrackerTargetName.make(input.mixin.repository),
      enabled: false,
      unavailableReason: ExternalTrackerUnavailableReason.make(
        "The mapped Huly GitHub repository record is unavailable."
      )
    })
  return projectPublicationState(input, target)
}

/** Build an immediate pending response after Huly accepted a native mixin write. */
type PendingPublicationStateInput = {
  readonly project: ProjectIdentifier
  readonly identifier: IssueIdentifier
  readonly target: ExternalTrackerTarget
  readonly now: TimestampType
} & (
  | { readonly retrying?: never; readonly previousFailure?: never }
  | { readonly retrying: true; readonly previousFailure: ExternalTrackerFailureSummaryType }
)

export const pendingPublicationState = (input: PendingPublicationStateInput): ExternalTrackerPublicationStatus => {
  const stateChangedAt = isoTimestamp(input.now)
  const elapsedMs = ExternalPublicationElapsedMilliseconds.make(0)
  return input.retrying === true
    ? {
        project: input.project,
        identifier: input.identifier,
        state: "pending",
        provider: externalProvider,
        target: input.target,
        stateChangedAt,
        elapsedMs,
        retrying: true,
        previousFailure: input.previousFailure
      }
    : {
        project: input.project,
        identifier: input.identifier,
        state: "pending",
        provider: externalProvider,
        target: input.target,
        stateChangedAt,
        elapsedMs
      }
}

/** Parse helper for output assertions in adapter tests without exposing raw SDK records. */
export const parseExternalPublicationStatus = Schema.decodeUnknownEffect(ExternalTrackerPublicationStatusSchema)
