import type { Employee, Person } from "@hcengineering/contact"
import type { Data, DocumentUpdate, Ref } from "@hcengineering/core"
import { generateId } from "@hcengineering/core"
import type { Department as HulyDepartment, Staff as HulyStaff } from "@hcengineering/hr"
import { Effect } from "effect"

import {
  type AssignStaffDepartmentParams,
  type AssignStaffDepartmentResult,
  Count,
  type CreateDepartmentParams,
  type DeleteDepartmentParams,
  type DeleteDepartmentResult,
  DepartmentId,
  type DepartmentImpact,
  type DepartmentMutationResult,
  DepartmentName,
  DepartmentPath,
  PersonId,
  UPDATE_DEPARTMENT_FIELDS,
  type UpdateDepartmentParams
} from "../../domain/schemas.js"
import { HulyClient } from "../client.js"
import { DepartmentHierarchyError, DepartmentImpactMismatchError } from "../errors.js"
import { core, hr } from "../huly-plugins.js"
import {
  descendantsOf,
  ensureNameAvailable,
  type HrDepartmentError,
  loadDepartmentCatalog,
  resolveDepartment,
  resolveEmployee,
  resolveEmployees,
  resolvePeople,
  validateDepartmentMove
} from "./hr-departments-shared.js"
import { hulyQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"
import { mergeUpdateEntries, requireUpdateFields } from "./update-guards.js"

const employeeRefs = (employees: ReadonlyArray<Employee>): Array<Ref<Employee>> => employees.map((item) => item._id)
const personRefs = (people: ReadonlyArray<Person>): Array<Ref<Person>> => people.map((item) => item._id)

const resolveRelationships = (
  client: HulyClient["Service"],
  params: Pick<CreateDepartmentParams, "teamLead" | "managers" | "subscribers">
) =>
  Effect.gen(function* () {
    const teamLead =
      params.teamLead === undefined || params.teamLead === null
        ? params.teamLead
        : yield* resolveEmployee(client, params.teamLead)
    const managers =
      params.managers === undefined ? undefined : employeeRefs(yield* resolveEmployees(client, params.managers))
    const subscribers =
      params.subscribers === undefined ? undefined : personRefs(yield* resolvePeople(client, params.subscribers))
    return { teamLead, managers, subscribers }
  })

const departmentParent = (
  client: HulyClient["Service"],
  identifier: CreateDepartmentParams["parent"] | UpdateDepartmentParams["newParent"]
): Effect.Effect<Ref<HulyDepartment>, HrDepartmentError> =>
  identifier === undefined || identifier === null
    ? Effect.succeed(hr.ids.Head)
    : Effect.map(resolveDepartment(client, identifier), (resolved) => resolved.department._id)

export const createDepartment = (
  params: CreateDepartmentParams
): Effect.Effect<DepartmentMutationResult, HrDepartmentError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const catalog = yield* loadDepartmentCatalog(client)
    const parent = yield* departmentParent(client, params.parent)
    yield* ensureNameAvailable(catalog, parent, params.name)
    const relationships = yield* resolveRelationships(client, params)
    const id = generateId<HulyDepartment>()
    const data: Data<HulyDepartment> = {
      name: params.name,
      description: params.description ?? "",
      parent,
      teamLead:
        relationships.teamLead === undefined
          ? null
          : relationships.teamLead === null
            ? null
            : relationships.teamLead._id,
      managers: relationships.managers ?? [],
      subscribers: relationships.subscribers ?? [],
      members: []
    }
    yield* client.createDoc(hr.class.Department, core.space.Workspace, data, id)
    const parentPath = catalog.pathById.get(parent)
    return {
      id: DepartmentId.make(id),
      path: DepartmentPath.make(parentPath === undefined ? params.name : `${parentPath}/${params.name}`)
    }
  })

type AwaitedCatalog = Effect.Success<ReturnType<typeof loadDepartmentCatalog>>

type ResolvedRelationships = Effect.Success<ReturnType<typeof resolveRelationships>>

const resolveUpdateParent = (
  client: HulyClient["Service"],
  department: HulyDepartment,
  newParent: UpdateDepartmentParams["newParent"]
) =>
  newParent === undefined
    ? Effect.succeed(department.parent === undefined ? hr.ids.Head : department.parent)
    : departmentParent(client, newParent)

const departmentUpdates = (
  params: UpdateDepartmentParams,
  parent: Ref<HulyDepartment>,
  relationships: ResolvedRelationships
): ReadonlyArray<DocumentUpdate<HulyDepartment>> => [
  ...departmentScalarUpdates(params, parent),
  ...departmentRelationshipUpdates(params, relationships)
]

const departmentScalarUpdates = (
  params: UpdateDepartmentParams,
  parent: Ref<HulyDepartment>
): ReadonlyArray<DocumentUpdate<HulyDepartment>> => [
  params.name === undefined ? {} : { name: params.name },
  params.description === undefined ? {} : { description: params.description },
  params.newParent === undefined ? {} : { parent }
]

const departmentRelationshipUpdates = (
  params: UpdateDepartmentParams,
  relationships: ResolvedRelationships
): ReadonlyArray<DocumentUpdate<HulyDepartment>> => [
  params.teamLead === undefined
    ? {}
    : { teamLead: relationships.teamLead === null ? null : (relationships.teamLead?._id ?? null) },
  relationships.managers === undefined ? {} : { managers: relationships.managers },
  relationships.subscribers === undefined ? {} : { subscribers: relationships.subscribers }
]

export const updateDepartment = (
  params: UpdateDepartmentParams
): Effect.Effect<DepartmentMutationResult, HrDepartmentError, HulyClient> =>
  Effect.gen(function* () {
    yield* requireUpdateFields("update_department", params, UPDATE_DEPARTMENT_FIELDS)
    const client = yield* HulyClient
    const { catalog, department } = yield* resolveDepartment(client, params.department)
    const parent = yield* resolveUpdateParent(client, department, params.newParent)
    yield* validateDepartmentMove(catalog, department, parent)
    yield* ensureNameAvailable(catalog, parent, params.name ?? DepartmentName.make(department.name), department._id)
    const relationships = yield* resolveRelationships(client, params)
    const updates = departmentUpdates(params, parent, relationships)
    yield* client.updateDoc(hr.class.Department, department.space, department._id, mergeUpdateEntries(updates))
    const parentPath = catalog.pathById.get(parent)
    const name = params.name ?? department.name
    return {
      id: DepartmentId.make(department._id),
      path: DepartmentPath.make(parentPath === undefined ? name : `${parentPath}/${name}`)
    }
  })

const departmentImpact = (
  client: HulyClient["Service"],
  catalog: AwaitedCatalog,
  department: HulyDepartment
): Effect.Effect<DepartmentImpact, HrDepartmentError> =>
  Effect.gen(function* () {
    const departments = [department, ...descendantsOf(catalog, department)]
    const staff = yield* client.findAll<HulyStaff>(
      hr.mixin.Staff,
      hulyQuery<HulyStaff>({ department: { $in: departments.map((item) => item._id) } })
    )
    return { subdepartments: Count.make(departments.length - 1), assignedStaff: Count.make(staff.length) }
  })

export const deleteDepartment = (
  params: DeleteDepartmentParams
): Effect.Effect<DeleteDepartmentResult, HrDepartmentError | DepartmentImpactMismatchError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const { catalog, department } = yield* resolveDepartment(client, params.department)
    const impact = yield* departmentImpact(client, catalog, department)
    const path = catalog.pathById.get(department._id) ?? DepartmentPath.make(department.name)
    if (params.execute !== true) return { id: DepartmentId.make(department._id), path, impact, deleted: false }
    if (
      params.expectedSubdepartments !== impact.subdepartments ||
      params.expectedAssignedStaff !== impact.assignedStaff
    ) {
      return yield* new DepartmentImpactMismatchError({
        expectedSubdepartments: params.expectedSubdepartments,
        actualSubdepartments: impact.subdepartments,
        expectedAssignedStaff: params.expectedAssignedStaff,
        actualAssignedStaff: impact.assignedStaff
      })
    }
    yield* client.removeDoc(hr.class.Department, department.space, department._id)
    return { id: DepartmentId.make(department._id), path, impact, deleted: true }
  })

export const assignStaffDepartment = (
  params: AssignStaffDepartmentParams
): Effect.Effect<AssignStaffDepartmentResult, HrDepartmentError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const employee = yield* resolveEmployee(client, params.employee)
    const current = yield* client.findOne<HulyStaff>(
      hr.mixin.Staff,
      hulyQuery<HulyStaff>({ _id: toRef<HulyStaff>(employee._id) })
    )
    const target = yield* resolveAssignmentTarget(client, params.department)
    const targetId = target?.department._id ?? hr.ids.Head
    if ((current?.department ?? hr.ids.Head) === targetId) {
      return yield* assignmentResult(employee, target, false)
    }
    yield* writeStaffAssignment(client, employee, current, targetId)
    return yield* assignmentResult(employee, target, true)
  })

type ResolvedDepartment = Effect.Success<ReturnType<typeof resolveDepartment>>

const resolveAssignmentTarget = (
  client: HulyClient["Service"],
  identifier: AssignStaffDepartmentParams["department"]
): Effect.Effect<ResolvedDepartment | undefined, HrDepartmentError> =>
  identifier === null ? Effect.succeed(undefined) : resolveDepartment(client, identifier)

const assignmentResult = (
  employee: Employee,
  target: ResolvedDepartment | undefined,
  updated: boolean
): Effect.Effect<AssignStaffDepartmentResult, DepartmentHierarchyError> => {
  const path = target === undefined ? undefined : target.catalog.pathById.get(target.department._id)
  if (target !== undefined && path === undefined) {
    return Effect.fail(
      new DepartmentHierarchyError({ message: `Department '${target.department.name}' has no resolved hierarchy path` })
    )
  }
  return Effect.succeed({
    employeeId: PersonId.make(employee._id),
    ...(target === undefined || path === undefined
      ? {}
      : { department: { id: DepartmentId.make(target.department._id), path } }),
    updated,
    propagation: "server-derived"
  })
}

const writeStaffAssignment = (
  client: HulyClient["Service"],
  employee: Employee,
  current: HulyStaff | undefined,
  department: Ref<HulyDepartment>
) =>
  current === undefined
    ? client.createMixin<Employee, HulyStaff>(employee._id, employee._class, employee.space, hr.mixin.Staff, {
        department
      })
    : client.updateMixin<Employee, HulyStaff>(employee._id, employee._class, employee.space, hr.mixin.Staff, {
        department
      })
