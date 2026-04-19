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
export class FunnelNotFoundError extends Schema.TaggedError<FunnelNotFoundError>()(
  "FunnelNotFoundError",
  {
    identifier: FunnelReference
  }
) {
  override get message(): string {
    return `Funnel '${this.identifier}' not found`
  }
}

/**
 * Lead not found in the specified funnel.
 */
export class LeadNotFoundError extends Schema.TaggedError<LeadNotFoundError>()(
  "LeadNotFoundError",
  {
    identifier: LeadIdentifier,
    funnel: FunnelIdentifier
  }
) {
  override get message(): string {
    return `Lead '${this.identifier}' not found in funnel '${this.funnel}'`
  }
}
