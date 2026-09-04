import { SortingOrder } from "@hcengineering/core"
import type { Staff as HulyStaff } from "@hcengineering/hr"
import { Effect } from "effect"

import {
  Count,
  DepartmentId,
  type DepartmentReference,
  type GetDepartmentParams,
  type ListDepartmentsParams,
  type ListDepartmentsResult,
  type ListStaffParams,
  type ListStaffResult,
  PersonId,
  type StaffSummary
} from "../../domain/schemas.js"
import { PersonName } from "../../domain/schemas/shared.js"
import { HulyClient } from "../client.js"
import { DepartmentHierarchyError } from "../errors.js"
import { hr } from "../huly-plugins.js"
import { clampLimit, hulyQuery } from "./query-helpers.js"
import {
  descendantsOf,
  type DepartmentCatalog,
  type HrDepartmentError,
  loadDepartmentCatalog,
  resolveDepartment,
  toDepartmentSummary
} from "./hr-departments-shared.js"

export const listDepartments = (
  params: ListDepartmentsParams
): Effect.Effect<ListDepartmentsResult, HrDepartmentError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const catalog = yield* loadDepartmentCatalog(client)
    const parent =
      params.parent === undefined
        ? undefined
        : yield* resolveDepartment(client, params.parent).pipe(Effect.map((r) => r.department))
    const candidates =
      parent === undefined
        ? catalog.departments
        : params.recursive === true
          ? descendantsOf(catalog, parent)
          : catalog.departments.filter((department) => department.parent === parent._id)
    const limited = candidates.slice(0, clampLimit(params.limit))
    const departments = yield* Effect.forEach(limited, (department) => toDepartmentSummary(client, catalog, department))
    return { departments, total: Count.make(candidates.length) }
  })

export const getDepartment = (params: GetDepartmentParams) =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const { catalog, department } = yield* resolveDepartment(client, params.department)
    return yield* toDepartmentSummary(client, catalog, department)
  })

const staffDepartment = (
  catalog: DepartmentCatalog,
  staff: HulyStaff
): Effect.Effect<DepartmentReference | undefined, DepartmentHierarchyError> => {
  const departmentId = staff.department
  if (departmentId === undefined || departmentId === null || departmentId === hr.ids.Head) {
    return Effect.succeed(undefined)
  }
  const department = catalog.byId.get(departmentId)
  if (department === undefined) {
    return Effect.fail(
      new DepartmentHierarchyError({ message: `Staff '${staff.name}' references missing department '${departmentId}'` })
    )
  }
  const path = catalog.pathById.get(departmentId)
  return path === undefined
    ? Effect.fail(
        new DepartmentHierarchyError({
          message: `Staff '${staff.name}' has unresolved department path '${departmentId}'`
        })
      )
    : Effect.succeed({ id: DepartmentId.make(departmentId), path })
}

const staffSummary = (
  catalog: DepartmentCatalog,
  staff: HulyStaff
): Effect.Effect<StaffSummary, DepartmentHierarchyError> =>
  Effect.gen(function* () {
    const department = yield* staffDepartment(catalog, staff)
    return {
      id: PersonId.make(staff._id),
      name: PersonName.make(staff.name),
      active: staff.active,
      ...(department === undefined ? {} : { department }),
      ...staffPosition(staff)
    }
  })

const staffPosition = (staff: HulyStaff) =>
  staff.position === undefined || staff.position === null ? {} : { position: staff.position }

export const listStaff = (params: ListStaffParams): Effect.Effect<ListStaffResult, HrDepartmentError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const catalog = yield* loadDepartmentCatalog(client)
    const department =
      params.department === undefined
        ? undefined
        : yield* resolveDepartment(client, params.department).pipe(Effect.map((r) => r.department))
    const departmentIds =
      department === undefined
        ? undefined
        : [
            department._id,
            ...(params.includeDescendants === true ? descendantsOf(catalog, department).map((item) => item._id) : [])
          ]
    const staff = yield* client.findAll<HulyStaff>(
      hr.mixin.Staff,
      hulyQuery<HulyStaff>({
        ...(departmentIds === undefined ? {} : { department: { $in: departmentIds } }),
        ...(params.active === undefined ? {} : { active: params.active })
      }),
      { sort: { name: SortingOrder.Ascending } }
    )
    const summaries = yield* Effect.forEach(staff, (item) => staffSummary(catalog, item))
    return { staff: summaries.slice(0, clampLimit(params.limit)), total: Count.make(summaries.length) }
  })
