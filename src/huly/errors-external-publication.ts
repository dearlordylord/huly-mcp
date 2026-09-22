import { Schema } from "effect"

import {
  ExternalTrackerProviderSchema,
  ExternalTrackerTargetId,
  ExternalTrackerTargetLocator,
  ExternalTrackerTargetName,
  GithubCompatibilityCapabilitySchema
} from "../domain/schemas/external-tracker-publication.js"
import { IssueIdentifier, ProjectIdentifier } from "../domain/schemas/shared.js"
import { DocId } from "../domain/schemas/shared-refs.js"

const ExternalTrackerTargetCandidateSchema = Schema.Struct({
  targetId: ExternalTrackerTargetId,
  name: ExternalTrackerTargetName
})

/** Required unpublished GitHub model records are not present in this Huly workspace. */
export class ExternalTrackerModelUnavailableError extends Schema.TaggedError<ExternalTrackerModelUnavailableError>()(
  "ExternalTrackerModelUnavailableError",
  { provider: ExternalTrackerProviderSchema, capabilities: Schema.Array(GithubCompatibilityCapabilitySchema) }
) {
  override get message(): string {
    return `External tracker provider '${this.provider}' is unavailable because Huly does not expose the required model capabilities: ${this.capabilities.join(", ")}. Enable the Huly GitHub integration or use a compatible Huly deployment.`
  }
}

/** No enabled repository is mapped to this project/provider. */
export class ExternalTrackerNoEnabledTargetError extends Schema.TaggedError<ExternalTrackerNoEnabledTargetError>()(
  "ExternalTrackerNoEnabledTargetError",
  { project: ProjectIdentifier, provider: ExternalTrackerProviderSchema }
) {
  override get message(): string {
    return `No enabled ${this.provider} target is mapped to project '${this.project}'. Discover targets first and enable/map exactly one repository before publishing.`
  }
}

/** A supplied target ID/name does not resolve within the requested project. */
export class ExternalTrackerTargetNotFoundError extends Schema.TaggedError<ExternalTrackerTargetNotFoundError>()(
  "ExternalTrackerTargetNotFoundError",
  { project: ProjectIdentifier, provider: ExternalTrackerProviderSchema, target: ExternalTrackerTargetLocator }
) {
  override get message(): string {
    return `External tracker target '${this.target}' was not found for ${this.provider} in project '${this.project}'. Use list_external_tracker_targets and pass a stable targetId or exact target name.`
  }
}

/** More than one mapped target matches the supplied name or automatic selection. */
export class ExternalTrackerTargetAmbiguousError extends Schema.TaggedError<ExternalTrackerTargetAmbiguousError>()(
  "ExternalTrackerTargetAmbiguousError",
  {
    project: ProjectIdentifier,
    provider: ExternalTrackerProviderSchema,
    target: Schema.optionalKey(ExternalTrackerTargetLocator),
    candidates: Schema.Array(ExternalTrackerTargetCandidateSchema)
  }
) {
  override get message(): string {
    const candidates = this.candidates.map(({ name, targetId }) => `${name} (${targetId})`).join(", ")
    const requested = this.target === undefined ? "automatic target selection" : `target '${this.target}'`
    return `Multiple enabled ${this.provider} targets match ${requested} in project '${this.project}'. Pass one stable targetId. Candidates: ${candidates}`
  }
}

/** A named/stable target exists but Huly marks it disabled or deleted. */
export class ExternalTrackerTargetDisabledError extends Schema.TaggedError<ExternalTrackerTargetDisabledError>()(
  "ExternalTrackerTargetDisabledError",
  {
    project: ProjectIdentifier,
    provider: ExternalTrackerProviderSchema,
    targetId: ExternalTrackerTargetId,
    name: ExternalTrackerTargetName
  }
) {
  override get message(): string {
    return `External tracker target '${this.name}' (${this.targetId}) is disabled or deleted for project '${this.project}'. Enable it in Huly before publishing.`
  }
}

/** A stable target belongs to a different Huly project. */
export class ExternalTrackerTargetCrossProjectError extends Schema.TaggedError<ExternalTrackerTargetCrossProjectError>()(
  "ExternalTrackerTargetCrossProjectError",
  {
    project: ProjectIdentifier,
    provider: ExternalTrackerProviderSchema,
    target: ExternalTrackerTargetLocator,
    actualProject: Schema.optionalKey(DocId)
  }
) {
  override get message(): string {
    const actualProject = this.actualProject ?? "another Huly project"
    return `External tracker target '${this.target}' belongs to Huly project '${actualProject}', not '${this.project}'. Select a target mapped to the requested project.`
  }
}

/** An issue already has a publication request for another target. */
export class ExternalTrackerPublicationConflictError extends Schema.TaggedError<ExternalTrackerPublicationConflictError>()(
  "ExternalTrackerPublicationConflictError",
  {
    project: ProjectIdentifier,
    identifier: IssueIdentifier,
    requestedTargetId: ExternalTrackerTargetId,
    existingTargetId: ExternalTrackerTargetId
  }
) {
  override get message(): string {
    return `Issue '${this.identifier}' in project '${this.project}' already targets external repository '${this.existingTargetId}'. Publication cannot be retargeted to '${this.requestedTargetId}'.`
  }
}

export const ExternalTrackerDomainError = Schema.Union([
  ExternalTrackerModelUnavailableError,
  ExternalTrackerNoEnabledTargetError,
  ExternalTrackerTargetNotFoundError,
  ExternalTrackerTargetAmbiguousError,
  ExternalTrackerTargetDisabledError,
  ExternalTrackerTargetCrossProjectError,
  ExternalTrackerPublicationConflictError
])
export type ExternalTrackerDomainError = Schema.Schema.Type<typeof ExternalTrackerDomainError>
