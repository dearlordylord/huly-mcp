import type { Employee, Person } from "@hcengineering/contact"
import type { Ref } from "@hcengineering/core"
import { SortingOrder } from "@hcengineering/core"
import type { Department as HulyDepartment, Staff as HulyStaff } from "@hcengineering/hr"
import { Effect, Schema } from "effect"

import {
  Count,
  DepartmentId,
  type DepartmentIdentifier,
  DepartmentName,
  DepartmentPath,
  type DepartmentPerson,
  type DepartmentReference,
  type DepartmentSummary,
  type PersonLocator,
  PersonId,
  Timestamp
} from "../../domain/schemas.js"
import { Email, PersonName } from "../../domain/schemas/shared.js"
import { isSingle } from "../../utils/assertions.js"
import { type HulyClient, type HulyClientError } from "../client.js"
import {
  DepartmentConflictError,
  DepartmentHierarchyError,
  DepartmentIdentifierAmbiguousError,
  DepartmentNotFoundError,
  EmployeeNotFoundError,
  type NoUpdateFieldsError,
  type PersonIdentifierAmbiguousError
} from "../errors.js"
import { contact, hr } from "../huly-plugins.js"
import { findPersonByIdOrExactEmailOrName } from "./contacts-shared.js"
import { hulyQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"

export type HrDepartmentError =
  | HulyClientError
  | DepartmentNotFoundError
  | DepartmentIdentifierAmbiguousError
  | DepartmentHierarchyError
  | DepartmentConflictError
  | EmployeeNotFoundError
  | NoUpdateFieldsError
  | PersonIdentifierAmbiguousError

export interface DepartmentCatalog {
  readonly departments: ReadonlyArray<HulyDepartment>
  readonly byId: ReadonlyMap<Ref<HulyDepartment>, HulyDepartment>
  readonly pathById: ReadonlyMap<Ref<HulyDepartment>, DepartmentPath>
}

const isHead = (department: HulyDepartment): boolean => department._id === hr.ids.Head

const exactPersonLocator = (identifier: PersonLocator) =>
  Schema.is(Email)(identifier) ? identifier : PersonName.make(identifier)

const pathFor = (
  department: HulyDepartment,
  byId: ReadonlyMap<Ref<HulyDepartment>, HulyDepartment>,
  visiting: ReadonlySet<Ref<HulyDepartment>>
): Effect.Effect<DepartmentPath, DepartmentHierarchyError> => {
  if (visiting.has(department._id)) {
    return Effect.fail(new DepartmentHierarchyError({ message: `Department '${department.name}' has a parent cycle` }))
  }
  if (department.parent === undefined || department.parent === hr.ids.Head) {
    return Effect.succeed(DepartmentPath.make(department.name))
  }
  const parent = byId.get(department.parent)
  if (parent === undefined) {
    return Effect.fail(
      new DepartmentHierarchyError({
        message: `Department '${department.name}' references missing parent '${department.parent}'`
      })
    )
  }
  if (isHead(parent)) return Effect.succeed(DepartmentPath.make(department.name))
  const next = new Set(visiting)
  next.add(department._id)
  return Effect.map(pathFor(parent, byId, next), (parentPath) =>
    DepartmentPath.make(`${parentPath}/${department.name}`)
  )
}

export const loadDepartmentCatalog = (
  client: HulyClient["Service"]
): Effect.Effect<DepartmentCatalog, HulyClientError | DepartmentHierarchyError> =>
  Effect.gen(function* () {
    const all = yield* client.findAll<HulyDepartment>(hr.class.Department, hulyQuery<HulyDepartment>({}), {
      sort: { name: SortingOrder.Ascending }
    })
    const byId = new Map(all.map((department) => [department._id, department]))
    const visible = all.filter((department) => !isHead(department))
    const paths = yield* Effect.forEach(visible, (department) =>
      Effect.map(pathFor(department, byId, new Set<Ref<HulyDepartment>>()), (path) => [department._id, path] as const)
    )
    return { departments: visible, byId, pathById: new Map(paths) }
  })

export const resolveDepartmentFromCatalog = (
  catalog: DepartmentCatalog,
  identifier: DepartmentIdentifier
): Effect.Effect<HulyDepartment, DepartmentNotFoundError | DepartmentIdentifierAmbiguousError> => {
  const byId = catalog.byId.get(toRef<HulyDepartment>(identifier))
  const normalized = identifier.trim().replaceAll(/\s*\/\s*/g, "/")
  const pathMatches = catalog.departments.filter((department) => catalog.pathById.get(department._id) === normalized)
  const matches = [
    ...new Map(
      [...(byId === undefined || isHead(byId) ? [] : [byId]), ...pathMatches].map((department) => [
        department._id,
        department
      ])
    ).values()
  ]
  if (isSingle(matches)) return Effect.succeed(matches[0])
  if (matches.length > 1) {
    return Effect.fail(new DepartmentIdentifierAmbiguousError({ identifier, matches: Count.make(matches.length) }))
  }
  return Effect.fail(new DepartmentNotFoundError({ identifier }))
}

export const resolveDepartment = (
  client: HulyClient["Service"],
  identifier: DepartmentIdentifier
): Effect.Effect<{ readonly catalog: DepartmentCatalog; readonly department: HulyDepartment }, HrDepartmentError> =>
  Effect.gen(function* () {
    const catalog = yield* loadDepartmentCatalog(client)
    const department = yield* resolveDepartmentFromCatalog(catalog, identifier)
    return { catalog, department }
  })

export const descendantsOf = (
  catalog: DepartmentCatalog,
  department: HulyDepartment
): ReadonlyArray<HulyDepartment> => {
  const descendants = new Set<Ref<HulyDepartment>>()
  const visit = (parent: Ref<HulyDepartment>): void => {
    for (const candidate of catalog.departments.filter((item) => item.parent === parent)) {
      if (!descendants.has(candidate._id)) {
        descendants.add(candidate._id)
        visit(candidate._id)
      }
    }
  }
  visit(department._id)
  return catalog.departments.filter((item) => descendants.has(item._id))
}

export const validateDepartmentMove = (
  catalog: DepartmentCatalog,
  department: HulyDepartment,
  newParent: Ref<HulyDepartment>
): Effect.Effect<void, DepartmentHierarchyError> => {
  if (newParent === department._id || descendantsOf(catalog, department).some((item) => item._id === newParent)) {
    return Effect.fail(
      new DepartmentHierarchyError({
        message: `Department '${department.name}' cannot be moved under itself or a descendant`
      })
    )
  }
  return (department.parent ?? hr.ids.Head) !== newParent && department.members.length > 0
    ? Effect.fail(
        new DepartmentHierarchyError({
          message: `Department '${department.name}' cannot move while its subtree has server-derived members; clear Staff.department assignments first`
        })
      )
    : Effect.void
}

export const resolveEmployee = (
  client: HulyClient["Service"],
  identifier: PersonLocator
): Effect.Effect<Employee, HulyClientError | PersonIdentifierAmbiguousError | EmployeeNotFoundError> =>
  Effect.gen(function* () {
    const person = yield* findPersonByIdOrExactEmailOrName(client, exactPersonLocator(identifier))
    if (person === undefined) return yield* new EmployeeNotFoundError({ identifier })
    const employee = yield* client.findOne<Employee>(
      contact.mixin.Employee,
      hulyQuery<Employee>({ _id: toRef<Employee>(person._id) })
    )
    return employee ?? (yield* new EmployeeNotFoundError({ identifier }))
  })

export const resolvePeople = (
  client: HulyClient["Service"],
  identifiers: ReadonlyArray<PersonLocator>
): Effect.Effect<ReadonlyArray<Person>, HulyClientError | PersonIdentifierAmbiguousError | EmployeeNotFoundError> =>
  Effect.forEach(identifiers, (identifier) =>
    Effect.gen(function* () {
      const person = yield* findPersonByIdOrExactEmailOrName(client, exactPersonLocator(identifier))
      return person ?? (yield* new EmployeeNotFoundError({ identifier }))
    })
  )

export const resolveEmployees = (
  client: HulyClient["Service"],
  identifiers: ReadonlyArray<PersonLocator>
): Effect.Effect<ReadonlyArray<Employee>, HulyClientError | PersonIdentifierAmbiguousError | EmployeeNotFoundError> =>
  Effect.forEach(identifiers, (identifier) => resolveEmployee(client, identifier))

const personMap = (
  client: HulyClient["Service"],
  department: HulyDepartment
): Effect.Effect<ReadonlyMap<Ref<Person>, Person>, HulyClientError> => {
  const refs = [
    ...(department.teamLead === null ? [] : [toRef<Person>(department.teamLead)]),
    ...department.managers.map(toRef<Person>),
    ...(department.subscribers ?? []).map(toRef<Person>)
  ]
  return refs.length === 0
    ? Effect.succeed(new Map<Ref<Person>, Person>())
    : Effect.map(
        client.findAll<Person>(contact.class.Person, hulyQuery<Person>({ _id: { $in: [...new Set(refs)] } })),
        (people) => new Map(people.map((person) => [person._id, person]))
      )
}

const personSummary = (
  department: HulyDepartment,
  relationship: "team lead" | "manager" | "subscriber",
  ref: Ref<Person>,
  people: ReadonlyMap<Ref<Person>, Person>
): Effect.Effect<DepartmentPerson, DepartmentHierarchyError> => {
  const person = people.get(ref)
  return person === undefined
    ? Effect.fail(
        new DepartmentHierarchyError({
          message: `Department '${department.name}' references unresolved ${relationship} '${ref}'`
        })
      )
    : Effect.succeed({ id: PersonId.make(ref), name: PersonName.make(person.name) })
}

const parentReference = (
  catalog: DepartmentCatalog,
  department: HulyDepartment
): Effect.Effect<DepartmentReference | undefined, DepartmentHierarchyError> => {
  if (department.parent === undefined || department.parent === hr.ids.Head) return Effect.succeed(undefined)
  const parent = catalog.byId.get(department.parent)
  const path = catalog.pathById.get(department.parent)
  return parent === undefined || path === undefined
    ? Effect.fail(
        new DepartmentHierarchyError({
          message: `Department '${department.name}' has unresolved parent projection '${department.parent}'`
        })
      )
    : Effect.succeed({ id: DepartmentId.make(parent._id), path })
}

const optionalAvatar = (department: HulyDepartment) =>
  department.avatar === undefined || department.avatar === null ? {} : { avatar: department.avatar }

const optionalCreatedOn = (department: HulyDepartment) =>
  department.createdOn === undefined ? {} : { createdOn: Timestamp.make(department.createdOn) }

const countOrZero = (value: number | undefined): Count => Count.make(value === undefined ? 0 : value)

export const toDepartmentSummary = (
  client: HulyClient["Service"],
  catalog: DepartmentCatalog,
  department: HulyDepartment
): Effect.Effect<DepartmentSummary, HulyClientError | DepartmentHierarchyError> =>
  Effect.gen(function* () {
    const [people, directStaff] = yield* Effect.all([
      personMap(client, department),
      client.findAll<HulyStaff>(hr.mixin.Staff, hulyQuery<HulyStaff>({ department: department._id }))
    ])
    const path = catalog.pathById.get(department._id)
    if (path === undefined) {
      return yield* new DepartmentHierarchyError({
        message: `Department '${department.name}' has no resolved hierarchy path`
      })
    }
    const parent = yield* parentReference(catalog, department)
    const teamLead =
      department.teamLead === null
        ? undefined
        : yield* personSummary(department, "team lead", toRef<Person>(department.teamLead), people)
    const managers = yield* Effect.forEach(department.managers, (ref) =>
      personSummary(department, "manager", toRef<Person>(ref), people)
    )
    const subscribers = yield* Effect.forEach(department.subscribers ?? [], (ref) =>
      personSummary(department, "subscriber", toRef<Person>(ref), people)
    )
    return {
      id: DepartmentId.make(department._id),
      name: DepartmentName.make(department.name),
      path,
      ...(parent === undefined ? {} : { parent }),
      description: department.description,
      ...optionalAvatar(department),
      ...(teamLead === undefined ? {} : { teamLead }),
      managers,
      subscribers,
      directStaff: Count.make(directStaff.length),
      derivedMembers: Count.make(department.members.length),
      subdepartments: Count.make(descendantsOf(catalog, department).length),
      attachments: countOrZero(department.attachments),
      comments: countOrZero(department.comments),
      channels: countOrZero(department.channels),
      ...optionalCreatedOn(department),
      modifiedOn: Timestamp.make(department.modifiedOn)
    }
  })

export const ensureNameAvailable = (
  catalog: DepartmentCatalog,
  parent: Ref<HulyDepartment>,
  name: DepartmentName,
  except?: Ref<HulyDepartment>
): Effect.Effect<void, DepartmentConflictError> =>
  catalog.departments.some(
    (department) => department.parent === parent && department.name === name && department._id !== except
  )
    ? Effect.fail(new DepartmentConflictError({ message: `Department '${name}' already exists under that parent` }))
    : Effect.void
