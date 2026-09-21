import { DateTime, Effect, Option, Schema } from "effect"

import {
  ExternalTrackerPublicationStatusSchema,
  ExternalTrackerProviderSchema,
  ExternalTrackerTargetId,
  ExternalTrackerTargetKindSchema,
  ExternalTrackerTargetSchema,
  Iso8601Timestamp,
  type ExternalTrackerPublicationStatus,
  type ExternalTrackerProvider,
  type ExternalTrackerTarget
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
  NonEmptyString,
  PositiveInteger,
  type ProjectIdentifier,
  UrlString,
  type IssueIdentifier
} from "../../domain/schemas/shared.js"

/**
 * A pending request is projected as failed after this bounded wait when Huly
 * has not persisted either completion or a worker failure. The next request
 * to the same target may safely requeue the native mixin transaction.
 */
const PENDING_WAIT_MINUTES = 15
const SECONDS_PER_MINUTE = 60
const MILLISECONDS_PER_SECOND = 1000
export const EXTERNAL_PUBLICATION_MAX_PENDING_MS = PENDING_WAIT_MINUTES * SECONDS_PER_MINUTE * MILLISECONDS_PER_SECOND

export const EXTERNAL_PUBLICATION_FAILURE_SUMMARY =
  "Huly's external tracker worker reported a publication failure; inspect Huly integration configuration and logs."

export interface ExternalTrackerTargetCandidate {
  readonly target: ExternalTrackerTarget
  readonly mapped: boolean
  readonly actualProject?: string
}

export interface PublicationProjectionInput {
  readonly project: ProjectIdentifier
  readonly identifier: IssueIdentifier
  readonly issueModifiedOn: number
  readonly now: number
  readonly mixin?: GithubIssueMixinRecord
  readonly syncInfo?: DocSyncInfoRecord
  readonly target?: ExternalTrackerTarget
}

const externalProvider: ExternalTrackerProvider = ExternalTrackerProviderSchema.make("github")
const repositoryKind = ExternalTrackerTargetKindSchema.make("repository")

const repositoryUnavailableReason = (repository: GithubIntegrationRepositoryRecord): string | undefined => {
  if (repository.deleted === true) return "This Huly GitHub repository mapping is deleted."
  if (!repository.enabled) return "This Huly GitHub repository mapping is disabled."
  return undefined
}

/** Convert a parsed compatibility record into the public target projection. */
export const externalTrackerTargetFromRepository = (
  repository: GithubIntegrationRepositoryRecord
): ExternalTrackerTarget => {
  const unavailableReason = repositoryUnavailableReason(repository)
  return ExternalTrackerTargetSchema.make({
    provider: externalProvider,
    kind: repositoryKind,
    targetId: ExternalTrackerTargetId.make(repository._id),
    name: NonEmptyString.make(repository.name),
    enabled: repository.enabled && repository.deleted !== true,
    ...(unavailableReason === undefined ? {} : { unavailableReason: NonEmptyString.make(unavailableReason) })
  })
}

const candidateSummary = (candidate: ExternalTrackerTargetCandidate) => ({
  targetId: candidate.target.targetId,
  name: candidate.target.name
})

const candidatesForName = (
  candidates: ReadonlyArray<ExternalTrackerTargetCandidate>,
  name: string
): ReadonlyArray<ExternalTrackerTargetCandidate> =>
  candidates.filter((candidate) => candidate.target.name === name && candidate.mapped)

const matchingTargetById = (
  candidates: ReadonlyArray<ExternalTrackerTargetCandidate>,
  target: string
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
        target: NonEmptyString.make(String(match.target.targetId)),
        actualProject: NonEmptyString.make(match.actualProject ?? "another Huly project")
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
  target: string,
  candidates: ReadonlyArray<ExternalTrackerTargetCandidate>
): TargetResolutionEffect => {
  const matches = candidatesForName(candidates, target)
  if (matches.length > 1) {
    return Effect.fail(
      new ExternalTrackerTargetAmbiguousError({
        project,
        provider,
        target: NonEmptyString.make(target),
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
  const crossProject = candidates.find((candidate) => candidate.target.name === target && !candidate.mapped)
  return crossProject === undefined
    ? Effect.fail(new ExternalTrackerTargetNotFoundError({ project, provider, target: NonEmptyString.make(target) }))
    : Effect.fail(
        new ExternalTrackerTargetCrossProjectError({
          project,
          provider,
          target: NonEmptyString.make(target),
          actualProject: NonEmptyString.make(crossProject.actualProject ?? "another Huly project")
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
  target: string | undefined,
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

const isoTimestamp = (milliseconds: number): Iso8601Timestamp => {
  const normalized = Number.isFinite(milliseconds) && milliseconds >= 0 ? milliseconds : 0
  const rendered = Option.match(DateTime.make(normalized), {
    onNone: () => DateTime.formatIso(DateTime.makeUnsafe(0)),
    onSome: DateTime.formatIso
  })
  return Iso8601Timestamp.make(rendered)
}

const elapsedMilliseconds = (now: number, changedAt: number): number => Math.max(0, now - changedAt)

const changedAtFor = (input: PublicationProjectionInput): number =>
  input.syncInfo?.modifiedOn ?? input.mixin?.modifiedOn ?? input.issueModifiedOn

const makePublishedPublication = (
  input: PublicationProjectionInput,
  target: ExternalTrackerTarget,
  url: string,
  number: number
): ExternalTrackerPublicationStatus => ({
  project: input.project,
  identifier: input.identifier,
  state: "published",
  provider: externalProvider,
  target,
  stateChangedAt: isoTimestamp(changedAtFor(input)),
  url: UrlString.make(url),
  externalIssueNumber: PositiveInteger.make(number)
})

const completedValues = (record: { readonly url: string; readonly githubNumber: number } | undefined) => {
  if (record === undefined) return undefined
  const url = record.url.trim()
  return url === "" || record.githubNumber <= 0 ? undefined : { url, number: record.githubNumber }
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
export const redactPublicationFailure = (_value: unknown): NonEmptyString =>
  NonEmptyString.make(EXTERNAL_PUBLICATION_FAILURE_SUMMARY)

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
      failureSummary: NonEmptyString.make(
        "Huly did not complete external publication within the bounded wait; retry the same target to requeue it."
      )
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
      targetId: ExternalTrackerTargetId.make(input.mixin.repository),
      name: NonEmptyString.make(input.mixin.repository),
      enabled: false,
      unavailableReason: NonEmptyString.make("The mapped Huly GitHub repository record is unavailable.")
    })
  return projectPublicationState(input, target)
}

/** Build an immediate pending response after Huly accepted a native mixin write. */
export const pendingPublicationState = (input: {
  readonly project: ProjectIdentifier
  readonly identifier: IssueIdentifier
  readonly target: ExternalTrackerTarget
  readonly now: number
  readonly retrying?: boolean
  readonly previousFailure?: NonEmptyString
}): ExternalTrackerPublicationStatus => ({
  project: input.project,
  identifier: input.identifier,
  state: "pending",
  provider: externalProvider,
  target: input.target,
  stateChangedAt: isoTimestamp(input.now),
  elapsedMs: 0,
  ...(input.retrying === undefined ? {} : { retrying: input.retrying }),
  ...(input.previousFailure === undefined ? {} : { previousFailure: input.previousFailure })
})

/** Parse helper for output assertions in adapter tests without exposing raw SDK records. */
export const parseExternalPublicationStatus = Schema.decodeUnknownEffect(ExternalTrackerPublicationStatusSchema)
