import { Schema } from "effect"

import { DepartmentIdentifier, PersonLocator } from "../domain/schemas/hr-departments.js"
import { CommentId, Count, PersonId } from "../domain/schemas/shared.js"
import { HrCalendarDate, HrRequestId, HrRequestTypeIdentifier } from "../domain/schemas/hr-requests.js"
import { PublicHolidayId } from "../domain/schemas/hr-holidays.js"

export class DepartmentNotFoundError extends Schema.TaggedError<DepartmentNotFoundError>()("DepartmentNotFoundError", {
  identifier: DepartmentIdentifier
}) {
  override get message(): string {
    return `Department '${this.identifier}' not found; use an exact full path or department ID`
  }
}

export class DepartmentIdentifierAmbiguousError extends Schema.TaggedError<DepartmentIdentifierAmbiguousError>()(
  "DepartmentIdentifierAmbiguousError",
  { identifier: DepartmentIdentifier, matches: Count }
) {
  override get message(): string {
    return `Department '${this.identifier}' matched ${this.matches} departments; use the full path or department ID`
  }
}

export class DepartmentHierarchyError extends Schema.TaggedError<DepartmentHierarchyError>()(
  "DepartmentHierarchyError",
  { message: Schema.String }
) {}

export class DepartmentConflictError extends Schema.TaggedError<DepartmentConflictError>()("DepartmentConflictError", {
  message: Schema.String
}) {}

export class DepartmentImpactMismatchError extends Schema.TaggedError<DepartmentImpactMismatchError>()(
  "DepartmentImpactMismatchError",
  {
    expectedSubdepartments: Count,
    actualSubdepartments: Count,
    expectedAssignedStaff: Count,
    actualAssignedStaff: Count
  }
) {
  override get message(): string {
    return `Department impact changed: expected ${this.expectedSubdepartments} subdepartments and ${this.expectedAssignedStaff} assigned staff, found ${this.actualSubdepartments} and ${this.actualAssignedStaff}; preview again`
  }
}

export class EmployeeNotFoundError extends Schema.TaggedError<EmployeeNotFoundError>()("EmployeeNotFoundError", {
  identifier: PersonLocator
}) {
  override get message(): string {
    return `Employee '${this.identifier}' not found`
  }
}

export class HrStaffNotFoundError extends Schema.TaggedError<HrStaffNotFoundError>()("HrStaffNotFoundError", {
  employee: PersonId
}) {
  override get message(): string {
    return `Employee '${this.employee}' has no HR Staff record; assign the employee to an HR department before creating a request`
  }
}

export class HrRequestNotFoundError extends Schema.TaggedError<HrRequestNotFoundError>()("HrRequestNotFoundError", {
  request: HrRequestId
}) {
  override get message(): string {
    return `HR request '${this.request}' not found`
  }
}

export class HrRequestTypeNotFoundError extends Schema.TaggedError<HrRequestTypeNotFoundError>()(
  "HrRequestTypeNotFoundError",
  { requestType: HrRequestTypeIdentifier }
) {
  override get message(): string {
    return `HR request type '${this.requestType}' not found; use an exact ID or label from list_hr_request_types`
  }
}

export class HrRequestTypeIdentifierAmbiguousError extends Schema.TaggedError<HrRequestTypeIdentifierAmbiguousError>()(
  "HrRequestTypeIdentifierAmbiguousError",
  { requestType: HrRequestTypeIdentifier, matches: Count }
) {
  override get message(): string {
    return `HR request type '${this.requestType}' matched ${this.matches} types; use the exact request-type ID`
  }
}

export class HrRequestDateRangeError extends Schema.TaggedError<HrRequestDateRangeError>()("HrRequestDateRangeError", {
  startDate: HrCalendarDate,
  endDate: HrCalendarDate
}) {
  override get message(): string {
    return `HR request startDate '${this.startDate}' must not be after endDate '${this.endDate}'`
  }
}

export class HrRequestCommentNotFoundError extends Schema.TaggedError<HrRequestCommentNotFoundError>()(
  "HrRequestCommentNotFoundError",
  { request: HrRequestId, commentId: CommentId }
) {
  override get message(): string {
    return `Comment '${this.commentId}' not found on HR request '${this.request}'`
  }
}

export class HrRequestMutationUnsupportedError extends Schema.TaggedError<HrRequestMutationUnsupportedError>()(
  "HrRequestMutationUnsupportedError",
  { operation: Schema.Literals(["update", "deletion", "attachment deletion"]) }
) {
  override get message(): string {
    return `HR request ${this.operation} is unavailable because the connected Huly client does not expose the required attached-collection operation`
  }
}

export class PublicHolidayNotFoundError extends Schema.TaggedError<PublicHolidayNotFoundError>()(
  "PublicHolidayNotFoundError",
  { holiday: PublicHolidayId }
) {
  override get message(): string {
    return `Public holiday '${this.holiday}' not found`
  }
}

export class PublicHolidayConflictError extends Schema.TaggedError<PublicHolidayConflictError>()(
  "PublicHolidayConflictError",
  { date: HrCalendarDate, department: DepartmentIdentifier }
) {
  override get message(): string {
    return `A public holiday already exists on '${this.date}' for department '${this.department}'`
  }
}
