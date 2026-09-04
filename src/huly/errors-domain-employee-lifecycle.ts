import { Schema } from "effect"

import {
  EmployeeDeactivationPartialFailureError,
  EmployeeInvitationPartialFailureError,
  EmployeeLifecycleImpactMismatchError,
  EmployeeLifecycleStateError,
  EmployeePreparationConflictError
} from "./errors-employee-lifecycle.js"

export const EmployeeLifecycleDomainError = Schema.Union([
  EmployeeLifecycleStateError,
  EmployeeLifecycleImpactMismatchError,
  EmployeeInvitationPartialFailureError,
  EmployeePreparationConflictError,
  EmployeeDeactivationPartialFailureError
])
