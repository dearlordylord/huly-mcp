import { Schema } from "effect"

import * as HrErrors from "./errors-hr.js"

/** HR-specific failures grouped as one domain-union branch to keep the aggregate error catalog bounded. */
export const HrDomainError = Schema.Union([
  HrErrors.DepartmentNotFoundError,
  HrErrors.DepartmentIdentifierAmbiguousError,
  HrErrors.DepartmentHierarchyError,
  HrErrors.DepartmentConflictError,
  HrErrors.DepartmentImpactMismatchError,
  HrErrors.EmployeeNotFoundError,
  HrErrors.HrStaffNotFoundError,
  HrErrors.HrRequestNotFoundError,
  HrErrors.HrRequestTypeNotFoundError,
  HrErrors.HrRequestTypeIdentifierAmbiguousError,
  HrErrors.HrRequestDateRangeError,
  HrErrors.HrRequestCommentNotFoundError,
  HrErrors.HrRequestMutationUnsupportedError,
  HrErrors.PublicHolidayNotFoundError,
  HrErrors.PublicHolidayConflictError
])
