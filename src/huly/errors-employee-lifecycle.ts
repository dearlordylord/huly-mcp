import { Schema } from "effect"

export class EmployeeLifecycleStateError extends Schema.TaggedError<EmployeeLifecycleStateError>()(
  "EmployeeLifecycleStateError",
  { identifier: Schema.String, reason: Schema.String }
) {
  override get message(): string {
    return `Employee lifecycle action is not valid for '${this.identifier}': ${this.reason}`
  }
}

export class EmployeeLifecycleImpactMismatchError extends Schema.TaggedError<EmployeeLifecycleImpactMismatchError>()(
  "EmployeeLifecycleImpactMismatchError",
  { identifier: Schema.String, reason: Schema.String }
) {
  override get message(): string {
    return `Employee lifecycle state changed for '${this.identifier}' after preview: ${this.reason}. Preview again before executing.`
  }
}

export class EmployeeInvitationPartialFailureError extends Schema.TaggedError<EmployeeInvitationPartialFailureError>()(
  "EmployeeInvitationPartialFailureError",
  {
    personId: Schema.String,
    email: Schema.String,
    completedChanges: Schema.Array(Schema.String),
    reason: Schema.String
  }
) {
  override get message(): string {
    return `Employee '${this.personId}' was prepared for '${this.email}', but sending the invitation failed after: ${this.completedChanges.join(", ")}. Retry create-or-promote with the same exact name and email; preparation is convergent. ${this.reason}`
  }
}
