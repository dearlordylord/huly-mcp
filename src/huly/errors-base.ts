/**
 * Base error types for Huly MCP server.
 *
 * @module
 */
import { Schema } from "effect"

/**
 * Base Huly error - generic operational error.
 */
export class HulyError extends Schema.TaggedError<HulyError>()("HulyError", {
  message: Schema.String,
  cause: Schema.optional(Schema.Defect)
}) {}

/**
 * Update request did not include any fields to change.
 */
export class NoUpdateFieldsError extends Schema.TaggedError<NoUpdateFieldsError>()(
  "NoUpdateFieldsError",
  {
    operation: Schema.String,
    fields: Schema.Array(Schema.String)
  }
) {
  override get message(): string {
    return `${this.operation} requires at least one update field: ${this.fields.join(", ")}`
  }
}

/**
 * Connection error - network/transport failures.
 */
export class HulyConnectionError extends Schema.TaggedError<HulyConnectionError>()(
  "HulyConnectionError",
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Defect)
  }
) {}

/** A sanitized connection failure that permits safe, actionable MCP guidance. */
export class HulyUnavailableError extends Schema.TaggedError<HulyUnavailableError>()(
  "HulyUnavailableError",
  {
    endpointOrigin: Schema.String,
    endpointKind: Schema.Literal("default_cloud", "custom"),
    failureKind: Schema.Literal("refused", "timeout", "dns", "tls", "http_unavailable", "unknown"),
    detailCode: Schema.optionalWith(Schema.String, { exact: true })
  }
) {}

/**
 * Authentication error - invalid credentials or expired session.
 */
export class HulyAuthError extends Schema.TaggedError<HulyAuthError>()(
  "HulyAuthError",
  {
    message: Schema.String
  }
) {}
