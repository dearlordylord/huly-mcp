import type { Employee as HulyEmployee, Person as HulyPerson } from "@hcengineering/contact"
import { Effect } from "effect"

import type {
  EmployeeLifecycleIdentifier,
  EmployeeLifecycleLocator,
  EmployeeLifecycleState
} from "../../domain/schemas/employee-lifecycle.js"
import type { Email, PersonId } from "../../domain/schemas/shared.js"
import type { HulyClient } from "../client.js"
import { PersonNotAnEmployeeError, PersonNotFoundError } from "../errors.js"
import { contact } from "../huly-plugins.js"
import type { WorkspaceClientOperations } from "../workspace-client.js"
import { batchGetEmailsForPersons, findPersonByExactEmail, findPersonByExactName } from "./contacts-shared.js"
import {
  decodeEmployeeLifecycleDocument,
  decodeEmployeeLifecycleMembers,
  decodeEmployeeLifecyclePerson,
  decodeEmployeeLifecycleState,
  decodeOptionalEmployeeEmail,
  type EmployeeLifecycleBoundaryOperation,
  type EmployeeLifecycleDocument,
  type EmployeeLifecycleMember
} from "./employee-lifecycle-boundaries.js"
import { hulyQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"

export const employeeLifecycleIdentifier = (locator: EmployeeLifecycleLocator): EmployeeLifecycleIdentifier =>
  "email" in locator ? locator.email : locator.name

export const resolveLifecyclePerson = Effect.fn("EmployeeLifecycle.resolvePerson")(function* (
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

export const findLifecycleEmployee = Effect.fn("EmployeeLifecycle.findEmployeeForPerson")(function* (
  client: HulyClient["Service"],
  personId: PersonId
) {
  const raw = yield* client.findOne<HulyEmployee>(
    contact.mixin.Employee,
    hulyQuery<HulyEmployee>({ _id: toRef<HulyEmployee>(personId) })
  )
  return raw === undefined ? undefined : yield* decodeEmployeeLifecycleDocument(raw, "resolveEmployeeLifecycleTarget")
})

export const resolveLifecycleEmployee = Effect.fn("EmployeeLifecycle.resolveEmployee")(function* (
  client: HulyClient["Service"],
  locator: EmployeeLifecycleLocator
) {
  const identifier = employeeLifecycleIdentifier(locator)
  const person = yield* resolveLifecyclePerson(client, locator)
  if (person === undefined) return yield* new PersonNotFoundError({ identifier })
  const employee = yield* findLifecycleEmployee(client, person._id)
  if (employee === undefined) return yield* new PersonNotAnEmployeeError({ identifier })
  return employee
})

const linkedMember = (
  employee: EmployeeLifecycleDocument,
  members: ReadonlyArray<EmployeeLifecycleMember>
): EmployeeLifecycleMember | undefined => {
  if (employee.personUuid === undefined) return undefined
  return members.find((candidate) => candidate.person === employee.personUuid)
}

const projectRelationship = (
  employee: EmployeeLifecycleDocument,
  member: EmployeeLifecycleMember | undefined
): "linked-without-membership" | "unlinked" | "workspace-member" => {
  if (employee.personUuid === undefined) return "unlinked"
  return member === undefined ? "linked-without-membership" : "workspace-member"
}

const projectAccount = (employee: EmployeeLifecycleDocument): EmployeeLifecycleState["account"] =>
  employee.personUuid === undefined ? { state: "unlinked" } : { state: "linked", personUuid: employee.personUuid }

const projectWorkspaceMembership = (
  member: EmployeeLifecycleMember | undefined
): EmployeeLifecycleState["workspaceMembership"] =>
  member === undefined ? { state: "absent" } : { state: "member", role: member.role }

const projectEmployee = (employee: EmployeeLifecycleDocument): EmployeeLifecycleState["employee"] => ({
  state: employee.active ? "active" : "inactive",
  ...(employee.role === undefined ? {} : { role: employee.role })
})

export const projectEmployeeLifecycleState = Effect.fn("EmployeeLifecycle.projectState")(function* (
  employee: EmployeeLifecycleDocument,
  email: Email | undefined,
  members: ReadonlyArray<EmployeeLifecycleMember>,
  operation: EmployeeLifecycleBoundaryOperation
) {
  const member = linkedMember(employee, members)
  return yield* decodeEmployeeLifecycleState(
    {
      personId: employee._id,
      name: employee.name,
      ...(email === undefined ? {} : { email }),
      relationship: projectRelationship(employee, member),
      account: projectAccount(employee),
      workspaceMembership: projectWorkspaceMembership(member),
      employee: projectEmployee(employee)
    },
    operation
  )
})

export const loadEmployeeLifecycleState = Effect.fn("EmployeeLifecycle.loadState")(function* (
  client: HulyClient["Service"],
  workspace: WorkspaceClientOperations,
  employee: EmployeeLifecycleDocument,
  knownEmail: Email | undefined,
  operation: EmployeeLifecycleBoundaryOperation
) {
  const [emailMap, rawMembers] = yield* Effect.all([
    knownEmail === undefined
      ? batchGetEmailsForPersons(client, [toRef<HulyPerson>(employee._id)])
      : Effect.succeed(new Map([[toRef<HulyPerson>(employee._id), knownEmail]])),
    workspace.getWorkspaceMembers()
  ])
  const members = yield* decodeEmployeeLifecycleMembers(rawMembers, operation)
  const email = yield* decodeOptionalEmployeeEmail(emailMap.get(toRef<HulyPerson>(employee._id)), operation)
  return yield* projectEmployeeLifecycleState(employee, email, members, operation)
})
