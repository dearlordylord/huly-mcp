import { Schema } from "effect"

import {
  EmployeeLifecycleIdentifierSchema,
  EmployeeKickPartialChangeSchema,
  EmployeeInvitationOperationSchema,
  EmployeePreparationOperationSchema,
  EmployeeWorkspaceRemovalOperationSchema,
  EmployeePreparationChangeSchema
} from "../domain/schemas/employee-lifecycle.js"
import { Email, PersonId, PersonUuid } from "../domain/schemas/shared.js"

export class EmployeeLifecycleStateError extends Schema.TaggedError<EmployeeLifecycleStateError>()(
  "EmployeeLifecycleStateError",
  { identifier: EmployeeLifecycleIdentifierSchema, reason: Schema.String }
) {
  override get message(): string {
    return `Employee lifecycle action is not valid for '${this.identifier}': ${this.reason}`
  }
}

export class EmployeeLifecycleImpactMismatchError extends Schema.TaggedError<EmployeeLifecycleImpactMismatchError>()(
  "EmployeeLifecycleImpactMismatchError",
  { identifier: EmployeeLifecycleIdentifierSchema, reason: Schema.String }
) {
  override get message(): string {
    return `Employee lifecycle state changed for '${this.identifier}' after preview: ${this.reason}. Preview again before executing.`
  }
}

export class EmployeeInvitationPartialFailureError extends Schema.TaggedError<EmployeeInvitationPartialFailureError>()(
  "EmployeeInvitationPartialFailureError",
  {
    personId: PersonId,
    email: Email,
    operation: EmployeeInvitationOperationSchema,
    completedChanges: Schema.Array(EmployeePreparationChangeSchema),
    reason: Schema.String
  }
) {
  override get message(): string {
    return `Employee '${this.personId}' was prepared for '${this.email}', but ${this.operation} failed after: ${this.completedChanges.join(", ") || "no material changes"}. Retry with the same exact target in a fresh session; checked preparation is convergent. ${this.reason}`
  }
}

export class EmployeePreparationConflictError extends Schema.TaggedError<EmployeePreparationConflictError>()(
  "EmployeePreparationConflictError",
  { personId: PersonId, email: Email, operation: EmployeePreparationOperationSchema, reason: Schema.String }
) {
  override get message(): string {
    return `Employee preparation for '${this.email}' did not commit because authoritative state changed. No invitation was sent. Open a fresh session and retry the same exact name and email. ${this.reason}`
  }
}

export class EmployeeDeactivationPartialFailureError extends Schema.TaggedError<EmployeeDeactivationPartialFailureError>()(
  "EmployeeDeactivationPartialFailureError",
  {
    personId: PersonId,
    personUuid: PersonUuid,
    action: Schema.Literal("kick"),
    failedOperation: EmployeeWorkspaceRemovalOperationSchema,
    completedChanges: Schema.Array(EmployeeKickPartialChangeSchema),
    reason: Schema.String
  }
) {
  override get message(): string {
    return `Workspace removal failed for Employee '${this.personId}' after completed changes: ${this.completedChanges.join(", ") || "none"}. The account remains a workspace member. Preview and execute kick again; the retry will preserve the inactive Employee and retry only workspace removal. ${this.reason}`
  }
}
