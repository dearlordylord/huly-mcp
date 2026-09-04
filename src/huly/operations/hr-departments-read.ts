import { SortingOrder } from "@hcengineering/core"
import type { Staff as HulyStaff } from "@hcengineering/hr"
import { Effect } from "effect"

import {
  Count,
  DepartmentId,
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

const staffSummary = (catalog: DepartmentCatalog, staff: HulyStaff): StaffSummary => {
  const department =
    staff.department === undefined || staff.department === null || staff.department === hr.ids.Head
      ? undefined
      : catalog.byId.get(staff.department)
  const departmentFields =
    department === undefined
      ? {}
      : { departmentId: DepartmentId.make(department._id), ...staffDepartmentPath(catalog, department._id) }
  return {
    id: PersonId.make(staff._id),
    name: PersonName.make(staff.name),
    active: staff.active,
    ...departmentFields,
    ...staffPosition(staff)
  }
}

const staffDepartmentPath = (catalog: DepartmentCatalog, departmentId: HulyStaff["department"]) => {
  const departmentPath = departmentId === null ? undefined : catalog.pathById.get(departmentId)
  return departmentPath === undefined ? {} : { departmentPath }
}

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
    const summaries = staff.map((item) => staffSummary(catalog, item))
    return { staff: summaries.slice(0, clampLimit(params.limit)), total: Count.make(summaries.length) }
  })
