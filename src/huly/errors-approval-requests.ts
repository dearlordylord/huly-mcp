import { Schema } from "effect"

import { Count } from "../domain/schemas/shared.js"

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

export class ApprovalRequestTargetNotFoundError extends Schema.TaggedError<ApprovalRequestTargetNotFoundError>()(
  "ApprovalRequestTargetNotFoundError",
  {
    attachedTo: Schema.String,
    attachedToClass: Schema.String
  }
) {
  override get message(): string {
    return `Approval request target '${this.attachedTo}' of class '${this.attachedToClass}' not found`
  }
}

export class ApprovalRequestInvalidApprovalThresholdError
  extends Schema.TaggedError<ApprovalRequestInvalidApprovalThresholdError>()(
    "ApprovalRequestInvalidApprovalThresholdError",
    {
      requiredApprovesCount: Count,
      requestedCount: Count
    }
  )
{
  override get message(): string {
    return `Approval request requires ${this.requiredApprovesCount} approvals but has ${this.requestedCount} requested people`
  }
}

export class ApprovalRequestMutationUnsupportedError
  extends Schema.TaggedError<ApprovalRequestMutationUnsupportedError>()(
    "ApprovalRequestMutationUnsupportedError",
    {
      operation: Schema.String,
      capability: Schema.String
    }
  )
{
  override get message(): string {
    return `Approval request operation '${this.operation}' requires Huly client capability '${this.capability}'`
  }
}

export class ApprovalRequestNotActiveError extends Schema.TaggedError<ApprovalRequestNotActiveError>()(
  "ApprovalRequestNotActiveError",
  {
    request: Schema.String,
    status: Schema.String
  }
) {
  override get message(): string {
    return `Approval request '${this.request}' is ${this.status}, not Active`
  }
}

export class ApprovalRequestApproverNotRequestedError
  extends Schema.TaggedError<ApprovalRequestApproverNotRequestedError>()(
    "ApprovalRequestApproverNotRequestedError",
    {
      request: Schema.String,
      person: Schema.String
    }
  )
{
  override get message(): string {
    return `Person '${this.person}' is not requested on approval request '${this.request}'`
  }
}

export class ApprovalRequestCancelUnauthorizedError
  extends Schema.TaggedError<ApprovalRequestCancelUnauthorizedError>()(
    "ApprovalRequestCancelUnauthorizedError",
    {
      request: Schema.String,
      actor: Schema.String,
      creator: Schema.optional(Schema.String)
    }
  )
{
  override get message(): string {
    const creator = this.creator === undefined ? "an unknown creator" : `'${this.creator}'`
    return `Approval request '${this.request}' was created by ${creator}; actor '${this.actor}' cannot cancel it`
  }
}
