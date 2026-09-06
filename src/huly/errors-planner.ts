/**
 * Planner / ToDo domain errors.
 *
 * @module
 */
import { Schema } from "effect"

import { Count, DocumentIdentifier, TeamspaceIdentifier } from "../domain/schemas/shared.js"

export class TodoNotFoundError extends Schema.TaggedError<TodoNotFoundError>()("TodoNotFoundError", {
  locator: Schema.String
}) {
  override get message(): string {
    return `Planner ToDo not found for locator: ${this.locator}`
  }
}

export class TodoIdentifierAmbiguousError extends Schema.TaggedError<TodoIdentifierAmbiguousError>()(
  "TodoIdentifierAmbiguousError",
  { locator: Schema.String, matches: Schema.Number }
) {
  override get message(): string {
    return `Planner ToDo locator is ambiguous: ${this.locator} matched ${this.matches} ToDos`
  }
}

export class TodoWorkSlotNotFoundError extends Schema.TaggedError<TodoWorkSlotNotFoundError>()(
  "TodoWorkSlotNotFoundError",
  { workSlotId: Schema.String }
) {
  override get message(): string {
    return `Planner ToDo work slot '${this.workSlotId}' not found`
  }
}

const TodoDocumentTargetAmbiguitySchema = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("teamspace"),
    identifier: TeamspaceIdentifier,
    teamspace: Schema.optionalKey(Schema.Never)
  }),
  Schema.Struct({ type: Schema.Literal("document"), identifier: DocumentIdentifier, teamspace: TeamspaceIdentifier })
]).pipe(Schema.toTaggedUnion("type"))

/** A document ToDo target matched more than one active teamspace or document. */
export class TodoDocumentTargetAmbiguousError extends Schema.TaggedError<TodoDocumentTargetAmbiguousError>()(
  "TodoDocumentTargetAmbiguousError",
  { target: TodoDocumentTargetAmbiguitySchema, matches: Count }
) {
  override get message(): string {
    const scope = this.target.type === "document" ? ` in teamspace '${this.target.teamspace}'` : ""
    return `Document ToDo ${this.target.type} '${this.target.identifier}' is ambiguous${scope}; ${this.matches} matches found. Use an exact ID.`
  }
}

/**
 * The authenticated account cannot safely create a ToDo on the document.
 */
export class TodoDocumentTargetNotWritableError extends Schema.TaggedError<TodoDocumentTargetNotWritableError>()(
  "TodoDocumentTargetNotWritableError",
  { teamspace: TeamspaceIdentifier, document: DocumentIdentifier, reason: Schema.Literals(["not-member", "locked"]) }
) {
  override get message(): string {
    return this.reason === "locked"
      ? `Document ToDo target '${this.document}' in teamspace '${this.teamspace}' is currently locked.`
      : `Document ToDo target '${this.document}' in teamspace '${this.teamspace}' is not writable by the authenticated account.`
  }
}

export class PlannerSchedulingPrerequisiteError extends Schema.TaggedError<PlannerSchedulingPrerequisiteError>()(
  "PlannerSchedulingPrerequisiteError",
  { prerequisite: Schema.Literals(["primary social identity", "employee identity", "personal calendar"]) }
) {
  override get message(): string {
    return `Cannot create a Planner-visible work slot: the authenticated user has no usable ${this.prerequisite}. Configure the user's Huly profile and personal calendar, then retry.`
  }
}

export const PlannerDomainError = Schema.Union([
  TodoNotFoundError,
  TodoIdentifierAmbiguousError,
  TodoWorkSlotNotFoundError,
  TodoDocumentTargetAmbiguousError,
  TodoDocumentTargetNotWritableError,
  PlannerSchedulingPrerequisiteError
])
export type PlannerDomainError = Schema.Schema.Type<typeof PlannerDomainError>
