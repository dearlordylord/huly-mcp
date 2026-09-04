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
