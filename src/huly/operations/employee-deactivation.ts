import type { Employee as HulyEmployee, Person as HulyPerson } from "@hcengineering/contact"
import type { Space } from "@hcengineering/core"
import { Effect } from "effect"

import {
  type DeactivateEmployeeParams,
  type DeactivateEmployeeResult,
  EMPLOYEE_LIFECYCLE_DEFAULT_LIMIT,
  type EmployeeLifecycleIdentifier,
  type EmployeeLifecycleState,
  EmployeeLifecycleStateGuards,
  ExpectedEmployeeLifecycleStateSchema,
  type ListInactiveEmployeesParams,
  type ListInactiveEmployeesResult
} from "../../domain/schemas/employee-lifecycle.js"
import { Count, NonNegativeInteger } from "../../domain/schemas/shared.js"
import { HulyClient, type HulyClientError } from "../client.js"
import {
  EmployeeDeactivationPartialFailureError,
  EmployeeLifecycleImpactMismatchError,
  EmployeeLifecycleStateError,
  type HulyDataInvalidError,
  type PersonIdentifierAmbiguousError,
  type PersonNotAnEmployeeError,
  type PersonNotFoundError
} from "../errors.js"
import { contact } from "../huly-plugins.js"
import { WorkspaceClient, type WorkspaceClientOperations } from "../workspace-client.js"
import { batchGetEmailsForPersons } from "./contacts-shared.js"
import {
  decodeEmployeeLifecycleDocuments,
  decodeEmployeeLifecycleMembers,
  type EmployeeLifecycleDocument
} from "./employee-lifecycle-boundaries.js"
import {
  employeeLifecycleIdentifier,
  loadEmployeeLifecycleState,
  projectEmployeeLifecycleState,
  resolveLifecycleEmployee
} from "./employee-lifecycle-state.js"
import { hulyQuery } from "./query-helpers.js"
import { toAccountUuid, toRef } from "./sdk-boundary.js"

type EmployeeDeactivationError =
  | EmployeeDeactivationPartialFailureError
  | EmployeeLifecycleImpactMismatchError
  | EmployeeLifecycleStateError
  | HulyClientError
  | HulyDataInvalidError
  | PersonIdentifierAmbiguousError
  | PersonNotAnEmployeeError
  | PersonNotFoundError

const expectedPersonUuid = (expected: Extract<DeactivateEmployeeParams, { readonly execute: true }>["expected"]) =>
  ExpectedEmployeeLifecycleStateSchema.guards.unlinked(expected) ? undefined : expected.personUuid

const impactPersonUuid = (impact: EmployeeLifecycleState) =>
  EmployeeLifecycleStateGuards.unlinked(impact) ? undefined : impact.account.personUuid

const expectedWorkspaceRole = (expected: Extract<DeactivateEmployeeParams, { readonly execute: true }>["expected"]) =>
  ExpectedEmployeeLifecycleStateSchema.guards["workspace-member"](expected) ? expected.workspaceRole : undefined

const impactWorkspaceRole = (impact: EmployeeLifecycleState) =>
  EmployeeLifecycleStateGuards["workspace-member"](impact) ? impact.workspaceMembership.role : undefined

export const listInactiveEmployees = Effect.fn("EmployeeLifecycle.listInactive")(function* (
  params: ListInactiveEmployeesParams
): Effect.fn.Return<ListInactiveEmployeesResult, EmployeeDeactivationError, HulyClient | WorkspaceClient> {
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
    projectEmployeeLifecycleState(
      employee,
      emailMap.get(toRef<HulyPerson>(employee._id)),
      members,
      "listInactiveEmployees"
    )
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

const assertExpectedImpact = (
  params: Extract<DeactivateEmployeeParams, { readonly execute: true }>,
  impact: EmployeeLifecycleState,
  identifier: EmployeeLifecycleIdentifier
): Effect.Effect<void, EmployeeLifecycleImpactMismatchError> => {
  const mismatches = [
    params.expected.relationship === impact.relationship ? undefined : "relationship differs",
    params.expected.personId === impact.personId ? undefined : "person ID differs",
    expectedPersonUuid(params.expected) === impactPersonUuid(impact) ? undefined : "account link differs",
    params.expected.employeeActive === (impact.employee.state === "active") ? undefined : "Employee.active differs",
    expectedWorkspaceRole(params.expected) === impactWorkspaceRole(impact)
      ? undefined
      : "workspace membership or role differs"
  ].filter((message) => message !== undefined)
  return mismatches.length === 0
    ? Effect.void
    : Effect.fail(new EmployeeLifecycleImpactMismatchError({ identifier, reason: mismatches.join(", ") }))
}

const executeEmployeeDeactivation = Effect.fn("EmployeeLifecycle.executeDeactivation")(function* (
  client: HulyClient["Service"],
  workspace: WorkspaceClientOperations,
  employee: EmployeeLifecycleDocument,
  impact: EmployeeLifecycleState,
  action: "deactivate" | "kick"
) {
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
  const removalTarget =
    action === "kick" && EmployeeLifecycleStateGuards["workspace-member"](impact)
      ? impact.account.personUuid
      : undefined
  const workspaceMemberRemoved = removalTarget !== undefined
  if (removalTarget !== undefined) {
    yield* workspace
      .leaveWorkspace(toAccountUuid(removalTarget))
      .pipe(
        Effect.mapError(
          (error) =>
            new EmployeeDeactivationPartialFailureError({
              personId: employee._id,
              personUuid: removalTarget,
              action: "kick",
              failedOperation: "leaveWorkspace",
              completedChanges: employeeDeactivated ? ["employeeDeactivated"] : [],
              reason: error.message
            })
        )
      )
  }
  const result: Extract<DeactivateEmployeeResult, { readonly executed: true }> =
    action === "deactivate"
      ? { outcome: "deactivated", executed: true, action, impactBefore: impact, changes: { employeeDeactivated } }
      : {
          outcome: "kicked",
          executed: true,
          action,
          impactBefore: impact,
          changes: { employeeDeactivated, workspaceMemberRemoved }
        }
  return result
})

export const deactivateEmployee = Effect.fn("EmployeeLifecycle.deactivate")(function* (
  params: DeactivateEmployeeParams
): Effect.fn.Return<DeactivateEmployeeResult, EmployeeDeactivationError, HulyClient | WorkspaceClient> {
  const client = yield* HulyClient
  const workspace = yield* WorkspaceClient
  const identifier = employeeLifecycleIdentifier(params.employee)
  const employee = yield* resolveLifecycleEmployee(client, params.employee)
  if (employee.personUuid !== undefined && toAccountUuid(employee.personUuid) === client.getAccountUuid()) {
    return yield* new EmployeeLifecycleStateError({
      identifier,
      reason: "the authenticated employee cannot deactivate or kick itself"
    })
  }
  const impact = yield* loadEmployeeLifecycleState(
    client,
    workspace,
    employee,
    "email" in params.employee ? params.employee.email : undefined,
    "deactivateEmployee"
  )
  if (params.execute !== true) return { outcome: "preview", executed: false, action: params.action, impact }
  yield* assertExpectedImpact(params, impact, identifier)
  return yield* executeEmployeeDeactivation(client, workspace, employee, impact, params.action)
})
