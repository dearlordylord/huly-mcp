import { Schema } from "effect"

export class DepartmentNotFoundError extends Schema.TaggedError<DepartmentNotFoundError>()("DepartmentNotFoundError", {
  identifier: Schema.String
}) {
  override get message(): string {
    return `Department '${this.identifier}' not found; use an exact full path or department ID`
  }
}

export class DepartmentIdentifierAmbiguousError extends Schema.TaggedError<DepartmentIdentifierAmbiguousError>()(
  "DepartmentIdentifierAmbiguousError",
  { identifier: Schema.String, matches: Schema.Number }
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
    expectedSubdepartments: Schema.Number,
    actualSubdepartments: Schema.Number,
    expectedAssignedStaff: Schema.Number,
    actualAssignedStaff: Schema.Number
  }
) {
  override get message(): string {
    return `Department impact changed: expected ${this.expectedSubdepartments} subdepartments and ${this.expectedAssignedStaff} assigned staff, found ${this.actualSubdepartments} and ${this.actualAssignedStaff}; preview again`
  }
}

export class EmployeeNotFoundError extends Schema.TaggedError<EmployeeNotFoundError>()("EmployeeNotFoundError", {
  identifier: Schema.String
}) {
  override get message(): string {
    return `Employee '${this.identifier}' not found`
  }
}
