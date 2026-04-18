/**
 * Lead domain errors: funnels, leads.
 *
 * @module
 */
import { Schema } from "effect"

/**
 * Funnel not found in the workspace.
 */
export class FunnelNotFoundError extends Schema.TaggedError<FunnelNotFoundError>()(
  "FunnelNotFoundError",
  {
    identifier: Schema.String
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
    identifier: Schema.String,
    funnel: Schema.String
  }
) {
  override get message(): string {
    return `Lead '${this.identifier}' not found in funnel '${this.funnel}'`
  }
}
