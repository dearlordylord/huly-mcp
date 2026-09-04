/**
 * Lead domain errors: funnels, leads.
 *
 * @module
 */
import { Schema } from "effect"

import { FunnelIdentifier, FunnelReference, LeadIdentifier } from "../domain/schemas/leads.js"

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
  { identifier: FunnelReference, matches: Schema.Number }
) {
  override get message(): string {
    return `Funnel '${this.identifier}' matched ${this.matches} funnels; pass the stable funnel _id`
  }
}

export class FunnelProjectTypeNotFoundError extends Schema.TaggedError<FunnelProjectTypeNotFoundError>()(
  "FunnelProjectTypeNotFoundError",
  { identifier: Schema.String }
) {
  override get message(): string {
    return `Funnel project type '${this.identifier}' not found or is not compatible with the native Funnel model`
  }
}

export class FunnelProjectTypeIdentifierAmbiguousError extends Schema.TaggedError<FunnelProjectTypeIdentifierAmbiguousError>()(
  "FunnelProjectTypeIdentifierAmbiguousError",
  { identifier: Schema.String, matches: Schema.Number }
) {
  override get message(): string {
    return `Funnel project type '${this.identifier}' matched ${this.matches} project types; pass the project type _id`
  }
}

export class FunnelWorkflowInvalidError extends Schema.TaggedError<FunnelWorkflowInvalidError>()(
  "FunnelWorkflowInvalidError",
  { projectType: Schema.String, reason: Schema.String }
) {
  override get message(): string {
    return `Funnel project type '${this.projectType}' has an invalid workflow: ${this.reason}`
  }
}

export class FunnelDeleteConflictError extends Schema.TaggedError<FunnelDeleteConflictError>()(
  "FunnelDeleteConflictError",
  { identifier: FunnelReference, reason: Schema.String }
) {
  override get message(): string {
    return `Funnel '${this.identifier}' cannot be deleted: ${this.reason}`
  }
}

export const FunnelDomainError = Schema.Union([
  FunnelNotFoundError,
  FunnelIdentifierAmbiguousError,
  FunnelProjectTypeNotFoundError,
  FunnelProjectTypeIdentifierAmbiguousError,
  FunnelWorkflowInvalidError,
  FunnelDeleteConflictError
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
