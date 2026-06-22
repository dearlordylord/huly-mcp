import { Schema } from "effect"

export class ApprovalRequestNotFoundError extends Schema.TaggedError<ApprovalRequestNotFoundError>()(
  "ApprovalRequestNotFoundError",
  {
    request: Schema.String
  }
) {
  override get message(): string {
    return `Approval request '${this.request}' not found`
  }
}
