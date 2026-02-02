/**
 * Error hierarchy for Huly MCP server.
 *
 * Tagged errors for pattern matching in Effect code.
 * Maps to MCP error codes:
 * - -32602 (Invalid params): IssueNotFoundError, ProjectNotFoundError, InvalidStatusError
 * - -32603 (Internal error): HulyConnectionError, HulyAuthError, HulyError
 *
 * @module
 */
import { Schema } from "effect"

/**
 * MCP standard error codes.
 */
export const McpErrorCode = {
  InvalidParams: -32602,
  InternalError: -32603
} as const

export type McpErrorCode = (typeof McpErrorCode)[keyof typeof McpErrorCode]

/**
 * Base Huly error - generic operational error.
 * Maps to MCP -32603 (Internal error).
 */
export class HulyError extends Schema.TaggedError<HulyError>()("HulyError", {
  message: Schema.String,
  cause: Schema.optional(Schema.Defect)
}) {
  readonly mcpErrorCode: McpErrorCode = McpErrorCode.InternalError
}

/**
 * Connection error - network/transport failures.
 * Maps to MCP -32603 (Internal error).
 */
export class HulyConnectionError extends Schema.TaggedError<HulyConnectionError>()(
  "HulyConnectionError",
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Defect)
  }
) {
  readonly mcpErrorCode: McpErrorCode = McpErrorCode.InternalError
}

/**
 * Authentication error - invalid credentials or expired session.
 * Maps to MCP -32603 (Internal error).
 */
export class HulyAuthError extends Schema.TaggedError<HulyAuthError>()(
  "HulyAuthError",
  {
    message: Schema.String
  }
) {
  readonly mcpErrorCode: McpErrorCode = McpErrorCode.InternalError
}

/**
 * Issue not found in the specified project.
 * Maps to MCP -32602 (Invalid params).
 */
export class IssueNotFoundError extends Schema.TaggedError<IssueNotFoundError>()(
  "IssueNotFoundError",
  {
    identifier: Schema.String,
    project: Schema.String
  }
) {
  readonly mcpErrorCode: McpErrorCode = McpErrorCode.InvalidParams

  override get message(): string {
    return `Issue '${this.identifier}' not found in project '${this.project}'`
  }
}

/**
 * Project not found in the workspace.
 * Maps to MCP -32602 (Invalid params).
 */
export class ProjectNotFoundError extends Schema.TaggedError<ProjectNotFoundError>()(
  "ProjectNotFoundError",
  {
    identifier: Schema.String
  }
) {
  readonly mcpErrorCode: McpErrorCode = McpErrorCode.InvalidParams

  override get message(): string {
    return `Project '${this.identifier}' not found`
  }
}

/**
 * Invalid status for the given project.
 * Maps to MCP -32602 (Invalid params).
 */
export class InvalidStatusError extends Schema.TaggedError<InvalidStatusError>()(
  "InvalidStatusError",
  {
    status: Schema.String,
    project: Schema.String
  }
) {
  readonly mcpErrorCode: McpErrorCode = McpErrorCode.InvalidParams

  override get message(): string {
    return `Invalid status '${this.status}' for project '${this.project}'`
  }
}

/**
 * Person (assignee) not found.
 * Maps to MCP -32602 (Invalid params).
 */
export class PersonNotFoundError extends Schema.TaggedError<PersonNotFoundError>()(
  "PersonNotFoundError",
  {
    identifier: Schema.String
  }
) {
  readonly mcpErrorCode: McpErrorCode = McpErrorCode.InvalidParams

  override get message(): string {
    return `Person '${this.identifier}' not found`
  }
}

/**
 * Union of all Huly domain errors.
 */
export type HulyDomainError =
  | HulyError
  | HulyConnectionError
  | HulyAuthError
  | IssueNotFoundError
  | ProjectNotFoundError
  | InvalidStatusError
  | PersonNotFoundError

/**
 * Schema for all Huly domain errors (for serialization).
 */
export const HulyDomainError: Schema.Union<
  [
    typeof HulyError,
    typeof HulyConnectionError,
    typeof HulyAuthError,
    typeof IssueNotFoundError,
    typeof ProjectNotFoundError,
    typeof InvalidStatusError,
    typeof PersonNotFoundError
  ]
> = Schema.Union(
  HulyError,
  HulyConnectionError,
  HulyAuthError,
  IssueNotFoundError,
  ProjectNotFoundError,
  InvalidStatusError,
  PersonNotFoundError
)

/**
 * Get MCP error code from a Huly domain error.
 */
export const getMcpErrorCode = (error: HulyDomainError): McpErrorCode => {
  return error.mcpErrorCode
}
