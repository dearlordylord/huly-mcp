import type { Employee as HulyEmployee, Person as HulyPerson, SocialIdentity } from "@hcengineering/contact"
import { AvatarType } from "@hcengineering/contact"
import { buildSocialIdString, generateId, SocialIdType, type Space } from "@hcengineering/core"
import { Effect } from "effect"

import {
  type DeactivateEmployeeParams,
  type DeactivateEmployeeResult,
  EMPLOYEE_LIFECYCLE_DEFAULT_LIMIT,
  type EmployeeLifecycleLocator,
  type EmployeeLifecycleState,
  type EmployeeInvitationRole,
  type InviteEmployeeParams,
  type InviteEmployeeResult,
  type ListInactiveEmployeesParams,
  type ListInactiveEmployeesResult
} from "../../domain/schemas/employee-lifecycle.js"
import { Count, HulyTransactionScope, NonNegativeInteger, PersonId, type Email } from "../../domain/schemas/shared.js"
import { HulyClient, type HulyClientError } from "../client.js"
import {
  EmployeeLifecycleImpactMismatchError,
  EmployeeInvitationPartialFailureError,
  EmployeeLifecycleStateError,
  type HulyDataInvalidError,
  type PersonIdentifierAmbiguousError,
  PersonNotAnEmployeeError,
  PersonNotFoundError
} from "../errors.js"
import { contact } from "../huly-plugins.js"
import { WorkspaceClient, type WorkspaceClientOperations } from "../workspace-client.js"
import { batchGetEmailsForPersons, findPersonByExactEmail, findPersonByExactName } from "./contacts-shared.js"
import {
  decodeEmployeeLifecycleDocument,
  decodeEmployeeLifecycleDocuments,
  decodeEmployeeLifecycleMembers,
  decodeEmployeeLifecyclePerson,
  decodeEmployeeLifecycleState,
  decodeOptionalEmployeeEmail,
  type EmployeeLifecycleDocument,
  type EmployeeLifecycleMember
} from "./employee-lifecycle-boundaries.js"
import { hulyQuery } from "./query-helpers.js"
import { toAccountUuid, toRef } from "./sdk-boundary.js"
import { toHulyAccountRole } from "./workspace.js"

type EmployeeLifecycleError =
  | EmployeeLifecycleImpactMismatchError
  | EmployeeInvitationPartialFailureError
  | EmployeeLifecycleStateError
  | HulyClientError
  | HulyDataInvalidError
  | PersonIdentifierAmbiguousError
  | PersonNotAnEmployeeError
  | PersonNotFoundError

const locatorText = (locator: EmployeeLifecycleLocator): string => ("email" in locator ? locator.email : locator.name)

const resolvePerson = Effect.fn("EmployeeLifecycle.resolvePerson")(function* (
  client: HulyClient["Service"],
  locator: EmployeeLifecycleLocator
) {
  const raw =
    "email" in locator
      ? yield* findPersonByExactEmail(client, locator.email)
      : yield* findPersonByExactName(client, locator.name)
  if (raw === undefined) return undefined
  return yield* decodeEmployeeLifecyclePerson(raw, "resolveEmployeeLifecycleTarget")
})

const findEmployeeForPerson = Effect.fn("EmployeeLifecycle.findEmployeeForPerson")(function* (
  client: HulyClient["Service"],
  personId: PersonId
) {
  const raw = yield* client.findOne<HulyEmployee>(
    contact.mixin.Employee,
    hulyQuery<HulyEmployee>({ _id: toRef<HulyEmployee>(personId) })
  )
  return raw === undefined ? undefined : yield* decodeEmployeeLifecycleDocument(raw, "resolveEmployeeLifecycleTarget")
})

const resolveEmployee = Effect.fn("EmployeeLifecycle.resolveEmployee")(function* (
  client: HulyClient["Service"],
  locator: EmployeeLifecycleLocator
): Effect.fn.Return<EmployeeLifecycleDocument, EmployeeLifecycleError> {
  const identifier = locatorText(locator)
  const person = yield* resolvePerson(client, locator)
  if (person === undefined) return yield* new PersonNotFoundError({ identifier })
  const employee = yield* findEmployeeForPerson(client, person._id)
  if (employee === undefined) return yield* new PersonNotAnEmployeeError({ identifier })
  return employee
})

const employeeState = Effect.fn("EmployeeLifecycle.projectState")(function* (
  employee: EmployeeLifecycleDocument,
  email: Email | undefined,
  members: ReadonlyArray<EmployeeLifecycleMember>,
  operation: string
) {
  const member =
    employee.personUuid === undefined
      ? undefined
      : members.find((candidate) => candidate.person === employee.personUuid)
  return yield* decodeEmployeeLifecycleState(
    {
      personId: employee._id,
      name: employee.name,
      ...(email === undefined ? {} : { email }),
      account:
        employee.personUuid === undefined
          ? { state: "unlinked" }
          : { state: "linked", personUuid: employee.personUuid },
      workspaceMembership: member === undefined ? { state: "absent" } : { state: "member", role: member.role },
      employee: {
        state: employee.active ? "active" : "inactive",
        ...(employee.role === undefined ? {} : { role: employee.role })
      }
    },
    operation
  )
})

const loadState = Effect.fn("EmployeeLifecycle.loadState")(function* (
  client: HulyClient["Service"],
  workspace: WorkspaceClientOperations,
  employee: EmployeeLifecycleDocument,
  knownEmail: Email | undefined,
  operation: string
) {
  const [emailMap, rawMembers] = yield* Effect.all([
    knownEmail === undefined
      ? batchGetEmailsForPersons(client, [toRef<HulyPerson>(employee._id)])
      : Effect.succeed(new Map([[toRef<HulyPerson>(employee._id), knownEmail]])),
    workspace.getWorkspaceMembers()
  ])
  const members = yield* decodeEmployeeLifecycleMembers(rawMembers, operation)
  const email = yield* decodeOptionalEmployeeEmail(emailMap.get(toRef<HulyPerson>(employee._id)), operation)
  return yield* employeeState(employee, email, members, operation)
})

const DEFAULT_INVITE_ROLE: EmployeeInvitationRole = "USER"

const prepareEmployee = Effect.fn("EmployeeLifecycle.prepareEmployee")(function* (
  client: HulyClient["Service"],
  name: Extract<InviteEmployeeParams, { readonly mode: "create-or-promote" }>["name"],
  email: Email,
  role: EmployeeInvitationRole
) {
  const [byEmail, byName] = yield* Effect.all([resolvePerson(client, { email }), resolvePerson(client, { name })])
  if (byEmail !== undefined && byName !== undefined && byEmail._id !== byName._id) {
    return yield* new EmployeeLifecycleStateError({
      identifier: email,
      reason: `the exact email and exact name resolve to different People ('${byEmail._id}' and '${byName._id}')`
    })
  }

  const existing = byEmail ?? byName
  const personId = existing?._id ?? PersonId.make(generateId<HulyPerson>())
  const existingEmployee = existing === undefined ? undefined : yield* findEmployeeForPerson(client, personId)
  const personCreated = existing === undefined
  const nameUpdated = existing !== undefined && existing.name !== name
  const emailIdentityCreated = byEmail === undefined
  const targetRole = role
  const employeeCreated = existingEmployee === undefined
  const employeeReactivated = existingEmployee !== undefined && !existingEmployee.active
  const employeeRoleUpdated = existingEmployee !== undefined && existingEmployee.role !== targetRole
  const identityData = {
    type: SocialIdType.EMAIL,
    value: email,
    key: buildSocialIdString({ type: SocialIdType.EMAIL, value: email }),
    isDeleted: false
  }
  if (personCreated) {
    const createBundle = client.createDocWithCollectionAndMixin
    if (createBundle === undefined) {
      return yield* new EmployeeLifecycleStateError({
        identifier: email,
        reason: "the connected Huly adapter does not support atomic Person, SocialIdentity, and Employee creation"
      })
    }
    yield* createBundle<HulyPerson, SocialIdentity, HulyEmployee>(
      contact.class.Person,
      contact.space.Contacts,
      { name, city: "", avatarType: AvatarType.COLOR },
      toRef<HulyPerson>(personId),
      contact.class.SocialIdentity,
      "socialIds",
      identityData,
      toRef<SocialIdentity>(generateId<SocialIdentity>()),
      contact.mixin.Employee,
      { active: true, role: targetRole },
      HulyTransactionScope.make(`huly-mcp:employee-lifecycle:${personId}`)
    )
  } else if (nameUpdated) {
    yield* client.updateDoc(contact.class.Person, contact.space.Contacts, toRef<HulyPerson>(personId), { name })
  }
  if (!personCreated && emailIdentityCreated) {
    yield* client.addCollection<HulyPerson, SocialIdentity>(
      contact.class.SocialIdentity,
      contact.space.Contacts,
      toRef<HulyPerson>(personId),
      contact.class.Person,
      "socialIds",
      identityData
    )
  }
  if (!personCreated && employeeCreated) {
    yield* client.createMixin<HulyPerson, HulyEmployee>(
      toRef<HulyPerson>(personId),
      contact.class.Person,
      contact.space.Contacts,
      contact.mixin.Employee,
      { active: true, role: targetRole }
    )
  } else if (employeeReactivated || employeeRoleUpdated) {
    yield* client.updateMixin<HulyPerson, HulyEmployee>(
      toRef<HulyPerson>(personId),
      contact.class.Person,
      contact.space.Contacts,
      contact.mixin.Employee,
      { active: true, role: targetRole }
    )
  }
  return {
    personId,
    changes: {
      personCreated,
      nameUpdated,
      emailIdentityCreated,
      employeeCreated,
      employeeReactivated,
      employeeRoleUpdated
    }
  }
})

export const inviteEmployee = Effect.fn("EmployeeLifecycle.invite")(function* (
  params: InviteEmployeeParams
): Effect.fn.Return<InviteEmployeeResult, EmployeeLifecycleError, HulyClient | WorkspaceClient> {
  const client = yield* HulyClient
  const workspace = yield* WorkspaceClient
  const role = params.role ?? DEFAULT_INVITE_ROLE
  if (params.mode === "create-or-promote") {
    const prepared = yield* prepareEmployee(client, params.name, params.email, role)
    const completedChanges = Object.entries(prepared.changes)
      .filter(([, changed]) => changed)
      .map(([change]) => change)
    yield* workspace
      .sendInvite(params.email, toHulyAccountRole(role))
      .pipe(
        Effect.mapError(
          (error) =>
            new EmployeeInvitationPartialFailureError({
              personId: prepared.personId,
              email: params.email,
              completedChanges,
              reason: error.message
            })
        )
      )
    return {
      outcome: "employee-prepared-and-invited",
      email: params.email,
      role,
      personId: prepared.personId,
      changes: prepared.changes
    }
  }
  const person = yield* resolvePerson(client, params.employee)
  if (person === undefined) {
    return yield* new PersonNotFoundError({ identifier: locatorText(params.employee) })
  }

  const identifier = locatorText(params.employee)
  const employee = yield* findEmployeeForPerson(client, person._id)
  if (employee === undefined) return yield* new PersonNotAnEmployeeError({ identifier })
  if (employee.active) {
    return yield* new EmployeeLifecycleStateError({
      identifier,
      reason: "the employee is active; invitation resend is only valid for an inactive employee"
    })
  }
  const state = yield* loadState(
    client,
    workspace,
    employee,
    "email" in params.employee ? params.employee.email : undefined,
    "inviteEmployee"
  )
  if (state.email === undefined) {
    return yield* new EmployeeLifecycleStateError({
      identifier,
      reason: "the inactive employee has no exact email social identity or email channel"
    })
  }
  yield* workspace.resendInvite(state.email, toHulyAccountRole(role))
  return { outcome: "invitation-resent", email: state.email, role, employee: state }
})

export const listInactiveEmployees = Effect.fn("EmployeeLifecycle.listInactive")(function* (
  params: ListInactiveEmployeesParams
): Effect.fn.Return<ListInactiveEmployeesResult, EmployeeLifecycleError, HulyClient | WorkspaceClient> {
  const client = yield* HulyClient
  const workspace = yield* WorkspaceClient
  const rawEmployees = yield* client.findAll<HulyEmployee>(
    contact.mixin.Employee,
    hulyQuery<HulyEmployee>({ active: false })
  )
  const employees = yield* decodeEmployeeLifecycleDocuments(rawEmployees, "listInactiveEmployees")
  const [emailMap, rawMembers] = yield* Effect.all([
    batchGetEmailsForPersons(
      client,
      employees.map((employee) => toRef<HulyPerson>(employee._id))
    ),
    workspace.getWorkspaceMembers()
  ])
  const members = yield* decodeEmployeeLifecycleMembers(rawMembers, "listInactiveEmployees")
  const states = yield* Effect.forEach(employees, (employee) =>
    employeeState(employee, emailMap.get(toRef<HulyPerson>(employee._id)), members, "listInactiveEmployees")
  )
  const ordered = [...states].sort((left, right) =>
    left.name === right.name ? left.personId.localeCompare(right.personId) : left.name.localeCompare(right.name)
  )
  const offset = params.offset ?? NonNegativeInteger.make(0)
  const limit = params.limit ?? EMPLOYEE_LIFECYCLE_DEFAULT_LIMIT
  const page = ordered.slice(offset, offset + limit)
  const next = offset + page.length
  const truncated = next < ordered.length
  return {
    employees: page,
    total: Count.make(ordered.length),
    offset,
    truncated,
    ...(truncated ? { nextOffset: NonNegativeInteger.make(next) } : {})
  }
})

const expectedPersonUuid = (impact: EmployeeLifecycleState) =>
  impact.account.state === "linked" ? impact.account.personUuid : null
const expectedWorkspaceRole = (impact: EmployeeLifecycleState) =>
  impact.workspaceMembership.state === "member" ? impact.workspaceMembership.role : null

const assertExpectedImpact = (
  params: Extract<DeactivateEmployeeParams, { readonly execute: true }>,
  impact: EmployeeLifecycleState,
  identifier: string
): Effect.Effect<void, EmployeeLifecycleImpactMismatchError> => {
  const mismatches = [
    params.expectedPersonId === impact.personId ? undefined : "person ID differs",
    params.expectedPersonUuid === expectedPersonUuid(impact) ? undefined : "account link differs",
    params.expectedEmployeeActive === (impact.employee.state === "active") ? undefined : "Employee.active differs",
    params.expectedWorkspaceRole === expectedWorkspaceRole(impact) ? undefined : "workspace membership or role differs"
  ].filter((message) => message !== undefined)
  return mismatches.length === 0
    ? Effect.void
    : Effect.fail(new EmployeeLifecycleImpactMismatchError({ identifier, reason: mismatches.join(", ") }))
}

export const deactivateEmployee = Effect.fn("EmployeeLifecycle.deactivate")(function* (
  params: DeactivateEmployeeParams
): Effect.fn.Return<DeactivateEmployeeResult, EmployeeLifecycleError, HulyClient | WorkspaceClient> {
  const client = yield* HulyClient
  const workspace = yield* WorkspaceClient
  const identifier = locatorText(params.employee)
  const employee = yield* resolveEmployee(client, params.employee)
  if (employee.personUuid !== undefined && toAccountUuid(employee.personUuid) === client.getAccountUuid()) {
    return yield* new EmployeeLifecycleStateError({
      identifier,
      reason: "the authenticated employee cannot deactivate or kick itself"
    })
  }
  const impact = yield* loadState(
    client,
    workspace,
    employee,
    "email" in params.employee ? params.employee.email : undefined,
    "deactivateEmployee"
  )
  if (params.execute !== true) return { executed: false, action: params.action, impact }
  yield* assertExpectedImpact(params, impact, identifier)

  const employeeDeactivated = employee.active
  if (employeeDeactivated) {
    yield* client.updateMixin<HulyPerson, HulyEmployee>(
      toRef<HulyPerson>(employee._id),
      contact.class.Person,
      toRef<Space>(employee.space),
      contact.mixin.Employee,
      { active: false }
    )
  }
  const workspaceMemberRemoved = params.action === "kick" && impact.workspaceMembership.state === "member"
  if (workspaceMemberRemoved && employee.personUuid !== undefined) {
    yield* workspace.leaveWorkspace(toAccountUuid(employee.personUuid))
  }
  return {
    executed: true,
    action: params.action,
    impactBefore: impact,
    changes: { employeeDeactivated, workspaceMemberRemoved }
  }
})
