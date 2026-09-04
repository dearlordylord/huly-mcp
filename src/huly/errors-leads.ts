/**
 * Lead domain errors: funnels, leads.
 *
 * @module
 */
import { Schema } from "effect"

import { FunnelIdentifier, FunnelReference, LeadIdentifier } from "../domain/schemas/leads.js"
import { ProjectTypeRefSchema } from "../domain/schemas/task-management.js"
import { AccountUuid, Count, NonEmptyString } from "../domain/schemas/shared.js"

/**
 * Funnel not found in the workspace.
 */
export class FunnelNotFoundError extends Schema.TaggedError<FunnelNotFoundError>()("FunnelNotFoundError", {
  identifier: FunnelReference
}) {
  override get message(): string {
    return `Funnel '${this.identifier}' not found`
  }
}

export class FunnelIdentifierAmbiguousError extends Schema.TaggedError<FunnelIdentifierAmbiguousError>()(
  "FunnelIdentifierAmbiguousError",
  { identifier: FunnelReference, matches: Count }
) {
  override get message(): string {
    return `Funnel '${this.identifier}' matched ${this.matches} funnels; pass the stable funnel _id`
  }
}

export class FunnelProjectTypeNotFoundError extends Schema.TaggedError<FunnelProjectTypeNotFoundError>()(
  "FunnelProjectTypeNotFoundError",
  { identifier: ProjectTypeRefSchema }
) {
  override get message(): string {
    return `Funnel project type '${this.identifier}' not found or is not compatible with the native Funnel model`
  }
}

export class FunnelProjectTypeIdentifierAmbiguousError extends Schema.TaggedError<FunnelProjectTypeIdentifierAmbiguousError>()(
  "FunnelProjectTypeIdentifierAmbiguousError",
  { identifier: ProjectTypeRefSchema, matches: Count }
) {
  override get message(): string {
    return `Funnel project type '${this.identifier}' matched ${this.matches} project types; pass the project type _id`
  }
}

export class FunnelWorkflowInvalidError extends Schema.TaggedError<FunnelWorkflowInvalidError>()(
  "FunnelWorkflowInvalidError",
  { projectType: ProjectTypeRefSchema, reason: NonEmptyString }
) {
  override get message(): string {
    return `Funnel project type '${this.projectType}' has an invalid workflow: ${this.reason}`
  }
}

export class FunnelDeleteConflictError extends Schema.TaggedError<FunnelDeleteConflictError>()(
  "FunnelDeleteConflictError",
  { identifier: FunnelReference, reason: NonEmptyString }
) {
  override get message(): string {
    return `Funnel '${this.identifier}' cannot be deleted: ${this.reason}`
  }
}

export class FunnelAccountNotFoundError extends Schema.TaggedError<FunnelAccountNotFoundError>()(
  "FunnelAccountNotFoundError",
  { account: AccountUuid }
) {
  override get message(): string {
    return `Workspace account '${this.account}' does not exist; funnel members and owners must be current workspace accounts`
  }
}

export const FunnelDomainError = Schema.Union([
  FunnelNotFoundError,
  FunnelIdentifierAmbiguousError,
  FunnelProjectTypeNotFoundError,
  FunnelProjectTypeIdentifierAmbiguousError,
  FunnelWorkflowInvalidError,
  FunnelDeleteConflictError,
  FunnelAccountNotFoundError
])

/**
 * Lead not found in the specified funnel.
 */
export class LeadNotFoundError extends Schema.TaggedError<LeadNotFoundError>()("LeadNotFoundError", {
  identifier: LeadIdentifier,
  funnel: FunnelIdentifier
}) {
  override get message(): string {
    return `Lead '${this.identifier}' not found in funnel '${this.funnel}'`
  }
}

export class LeadUpdateConflictError extends Schema.TaggedError<LeadUpdateConflictError>()("LeadUpdateConflictError", {
  identifier: LeadIdentifier,
  funnel: FunnelIdentifier,
  reason: NonEmptyString
}) {
  override get message(): string {
    return `Lead '${this.identifier}' in funnel '${this.funnel}' cannot be updated: ${this.reason}`
  }
}

export class LeadMoveConflictError extends Schema.TaggedError<LeadMoveConflictError>()("LeadMoveConflictError", {
  identifier: LeadIdentifier,
  sourceFunnel: FunnelIdentifier,
  destinationFunnel: FunnelIdentifier,
  reason: NonEmptyString
}) {
  override get message(): string {
    return `Lead '${this.identifier}' cannot move from funnel '${this.sourceFunnel}' to funnel '${this.destinationFunnel}': ${this.reason}`
  }
}

export class LeadDeleteConflictError extends Schema.TaggedError<LeadDeleteConflictError>()("LeadDeleteConflictError", {
  identifier: LeadIdentifier,
  funnel: FunnelIdentifier,
  reason: NonEmptyString
}) {
  override get message(): string {
    return `Lead '${this.identifier}' in funnel '${this.funnel}' cannot be deleted: ${this.reason}`
  }
}

export const LeadMutationDomainError = Schema.Union([
  LeadUpdateConflictError,
  LeadMoveConflictError,
  LeadDeleteConflictError
])
