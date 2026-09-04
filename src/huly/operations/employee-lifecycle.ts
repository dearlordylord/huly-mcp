import type { Person as HulyPerson, SocialIdentity } from "@hcengineering/contact"
import { generateId, SocialIdType } from "@hcengineering/core"
import { Effect } from "effect"

import {
  type EmployeeInvitationRole,
  type EmployeePreparationChange,
  EmployeePreparationChangesSchema,
  type InviteEmployeeParams,
  InviteEmployeeParamsGuards,
  type InviteEmployeeResult
} from "../../domain/schemas/employee-lifecycle.js"
import { HulyTransactionScope, PersonId, type Email } from "../../domain/schemas/shared.js"
import { SocialIdentityId } from "../../domain/schemas/person-administration.js"
import { HulyClient, type HulyClientError } from "../client.js"
import {
  EmployeeInvitationPartialFailureError,
  EmployeeLifecycleStateError,
  EmployeePreparationConflictError,
  type HulyDataInvalidError,
  type PersonIdentifierAmbiguousError,
  PersonNotAnEmployeeError,
  PersonNotFoundError
} from "../errors.js"
import type { EmployeePreparationPlan } from "../employee-preparation.js"
import { contact } from "../huly-plugins.js"
import { WorkspaceClient, type WorkspaceClientOperations } from "../workspace-client.js"
import {
  decodeEmployeeLifecycleIdentities,
  decodeEmployeeLifecycleState,
  type EmployeeLifecycleDocument,
  type EmployeeLifecycleIdentity,
  type EmployeeLifecyclePerson
} from "./employee-lifecycle-boundaries.js"
import {
  employeeLifecycleIdentifier,
  findLifecycleEmployee,
  loadEmployeeLifecycleState,
  resolveLifecyclePerson
} from "./employee-lifecycle-state.js"
import { hulyQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"
import { toHulyAccountRole } from "./workspace.js"

type EmployeeLifecycleError =
  | EmployeeInvitationPartialFailureError
  | EmployeeLifecycleStateError
  | EmployeePreparationConflictError
  | HulyClientError
  | HulyDataInvalidError
  | PersonIdentifierAmbiguousError
  | PersonNotAnEmployeeError
  | PersonNotFoundError

const DEFAULT_INVITE_ROLE: EmployeeInvitationRole = "USER"

type EmployeePreparedResult = Extract<InviteEmployeeResult, { readonly outcome: "employee-prepared-and-invited" }>

const preparationChanges = (changes: EmployeePreparedResult["changes"]): Array<EmployeePreparationChange> => {
  const completed: Array<EmployeePreparationChange> = []
  if (EmployeePreparationChangesSchema.guards["person-created"](changes)) {
    return ["personCreated", "emailIdentityCreated", "employeeCreated"]
  }
  if (changes.nameUpdated) completed.push("nameUpdated")
  if (changes.emailIdentityCreated) completed.push("emailIdentityCreated")
  if (changes.employeeTransition === "created") completed.push("employeeCreated")
  if (["reactivated", "reactivated-and-role-updated"].includes(changes.employeeTransition)) {
    completed.push("employeeReactivated")
  }
  if (["role-updated", "reactivated-and-role-updated"].includes(changes.employeeTransition)) {
    completed.push("employeeRoleUpdated")
  }
  return completed
}

const findEmailIdentity = Effect.fn("EmployeeLifecycle.findEmailIdentity")(function* (
  client: HulyClient["Service"],
  personId: PersonId,
  email: Email
) {
  const raw = yield* client.findAll<SocialIdentity>(
    contact.class.SocialIdentity,
    hulyQuery<SocialIdentity>({ attachedTo: toRef<HulyPerson>(personId), type: SocialIdType.EMAIL, value: email })
  )
  const identities = yield* decodeEmployeeLifecycleIdentities(raw, "prepareEmployee")
  if (identities.length > 1) {
    return yield* new EmployeeLifecycleStateError({
      identifier: email,
      reason: `multiple active email SocialIdentities exist for Person '${personId}'`
    })
  }
  const identity = identities[0]
  if (identity?.isDeleted === true) {
    return yield* new EmployeeLifecycleStateError({
      identifier: email,
      reason: `the exact email SocialIdentity for Person '${personId}' is deleted and cannot be reused safely`
    })
  }
  return identity
})

const commitPreparation = Effect.fn("EmployeeLifecycle.commitPreparation")(function* (
  client: HulyClient["Service"],
  preparation: EmployeePreparationPlan
) {
  const commit = client.commitEmployeePreparation
  if (commit === undefined) {
    return yield* new EmployeeLifecycleStateError({
      identifier: preparation.email,
      reason: "the connected Huly adapter does not support checked atomic Employee preparation"
    })
  }
  const result = yield* commit(preparation)
  if (result === "condition-not-met") {
    return yield* new EmployeePreparationConflictError({
      personId: preparation.personId,
      email: preparation.email,
      operation: "prepareEmployee",
      reason: "a Person, email identity, or Employee precondition no longer matches"
    })
  }
})

interface EmployeePreparationInput {
  readonly existing: EmployeeLifecyclePerson | undefined
  readonly employee: EmployeeLifecycleDocument | undefined
  readonly identity: EmployeeLifecycleIdentity | undefined
  readonly personId: PersonId
  readonly name: Extract<InviteEmployeeParams, { readonly mode: "create-or-promote" }>["name"]
  readonly email: Email
  readonly role: EmployeeInvitationRole
}

const makeEmployeePreparationPlan = (input: EmployeePreparationInput): EmployeePreparationPlan => {
  const base = {
    name: input.name,
    email: input.email,
    targetRole: input.role,
    scope: HulyTransactionScope.make(`huly-mcp:employee-lifecycle:${input.email}`)
  }
  if (input.existing === undefined) {
    return {
      ...base,
      kind: "create-person",
      personId: input.personId,
      identityId: SocialIdentityId.make(generateId<SocialIdentity>())
    }
  }
  const identity: Extract<EmployeePreparationPlan, { readonly kind: "prepare-existing" }>["identity"] =
    input.identity === undefined
      ? { state: "create", identityId: SocialIdentityId.make(generateId<SocialIdentity>()) }
      : { state: "existing", identityId: input.identity._id }
  const employee: Extract<EmployeePreparationPlan, { readonly kind: "prepare-existing" }>["employee"] =
    input.employee === undefined
      ? { state: "create" }
      : {
          state: "update",
          previousActive: input.employee.active,
          ...(input.employee.role === undefined ? {} : { previousRole: input.employee.role })
        }
  return {
    ...base,
    kind: "prepare-existing",
    personId: input.personId,
    previousName: input.existing.name,
    identity,
    employee
  }
}

const employeeTransition = (
  employee: EmployeeLifecycleDocument | undefined,
  role: EmployeeInvitationRole
): Extract<EmployeePreparedResult["changes"], { readonly kind: "existing-person" }>["employeeTransition"] => {
  if (employee === undefined) return "created"
  const reactivated = !employee.active
  const roleUpdated = employee.role !== role
  if (reactivated && roleUpdated) return "reactivated-and-role-updated"
  if (reactivated) return "reactivated"
  return roleUpdated ? "role-updated" : "unchanged"
}

const preparationResultChanges = (input: EmployeePreparationInput): EmployeePreparedResult["changes"] => {
  if (input.existing === undefined) return { kind: "person-created" }
  return {
    kind: "existing-person",
    nameUpdated: input.existing.name !== input.name,
    emailIdentityCreated: input.identity === undefined,
    employeeTransition: employeeTransition(input.employee, input.role)
  }
}

const resolvePreparationPerson = (
  byEmail: EmployeeLifecyclePerson | undefined,
  byName: EmployeeLifecyclePerson | undefined,
  email: Email
): Effect.Effect<EmployeeLifecyclePerson | undefined, EmployeeLifecycleStateError> => {
  if (byEmail !== undefined && byName !== undefined && byEmail._id !== byName._id) {
    return Effect.fail(
      new EmployeeLifecycleStateError({
        identifier: email,
        reason: `the exact email and exact name resolve to different People ('${byEmail._id}' and '${byName._id}')`
      })
    )
  }
  return Effect.succeed(byEmail ?? byName)
}

const prepareEmployee = Effect.fn("EmployeeLifecycle.prepareEmployee")(function* (
  client: HulyClient["Service"],
  name: Extract<InviteEmployeeParams, { readonly mode: "create-or-promote" }>["name"],
  email: Email,
  role: EmployeeInvitationRole
) {
  const [byEmail, byName] = yield* Effect.all([
    resolveLifecyclePerson(client, { email }),
    resolveLifecyclePerson(client, { name })
  ])
  const existing = yield* resolvePreparationPerson(byEmail, byName, email)
  const personId = existing?._id ?? PersonId.make(generateId<HulyPerson>())
  const existingEmployee = existing === undefined ? undefined : yield* findLifecycleEmployee(client, personId)
  const emailIdentity = existing === undefined ? undefined : yield* findEmailIdentity(client, personId, email)
  const input = { existing, employee: existingEmployee, identity: emailIdentity, personId, name, email, role }
  const preparation = makeEmployeePreparationPlan(input)
  yield* commitPreparation(client, preparation)
  return { personId, changes: preparationResultChanges(input) }
})

const invitePreparedEmployee = Effect.fn("EmployeeLifecycle.invitePrepared")(function* (
  client: HulyClient["Service"],
  workspace: WorkspaceClientOperations,
  params: Extract<InviteEmployeeParams, { readonly mode: "create-or-promote" }>
): Effect.fn.Return<InviteEmployeeResult, EmployeeLifecycleError> {
  const role = params.role ?? DEFAULT_INVITE_ROLE
  const prepared = yield* prepareEmployee(client, params.name, params.email, role)
  const completedChanges = preparationChanges(prepared.changes)
  yield* workspace
    .sendInvite(params.email, toHulyAccountRole(role))
    .pipe(
      Effect.mapError(
        (error) =>
          new EmployeeInvitationPartialFailureError({
            personId: prepared.personId,
            email: params.email,
            operation: "sendInvite",
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
})

const resolveReinviteTarget = Effect.fn("EmployeeLifecycle.resolveReinviteTarget")(function* (
  client: HulyClient["Service"],
  workspace: WorkspaceClientOperations,
  params: Extract<InviteEmployeeParams, { readonly mode: "invite-existing" }>
) {
  const identifier = employeeLifecycleIdentifier(params.employee)
  const person = yield* resolveLifecyclePerson(client, params.employee)
  if (person === undefined) return yield* new PersonNotFoundError({ identifier })
  const employee = yield* findLifecycleEmployee(client, person._id)
  if (employee === undefined) return yield* new PersonNotAnEmployeeError({ identifier })
  if (employee.active) {
    return yield* new EmployeeLifecycleStateError({
      identifier,
      reason: "the employee is active; invitation resend is only valid for an inactive employee"
    })
  }
  const state = yield* loadEmployeeLifecycleState(
    client,
    workspace,
    employee,
    "email" in params.employee ? params.employee.email : undefined,
    "inviteEmployee"
  )
  const email = state.email
  if (email === undefined) {
    return yield* new EmployeeLifecycleStateError({
      identifier,
      reason: "the inactive employee has no exact email social identity or email channel"
    })
  }
  const role = params.role ?? employee.role
  if (role === undefined) {
    return yield* new EmployeeLifecycleStateError({
      identifier,
      reason: "the inactive Employee has no persisted USER/GUEST role; provide an explicit role to reconcile it"
    })
  }
  return { person, employee, state, email, role }
})

const reinviteEmployee = Effect.fn("EmployeeLifecycle.reinvite")(function* (
  client: HulyClient["Service"],
  workspace: WorkspaceClientOperations,
  params: Extract<InviteEmployeeParams, { readonly mode: "invite-existing" }>
): Effect.fn.Return<InviteEmployeeResult, EmployeeLifecycleError> {
  const { email, employee, person, role, state } = yield* resolveReinviteTarget(client, workspace, params)
  const employeeRoleUpdated = employee.role !== role
  if (employeeRoleUpdated) {
    const preparation: EmployeePreparationPlan = {
      kind: "reconcile-role",
      personId: person._id,
      previousName: person.name,
      employee: {
        state: "update",
        previousActive: employee.active,
        ...(employee.role === undefined ? {} : { previousRole: employee.role })
      },
      name: person.name,
      email,
      targetRole: role,
      scope: HulyTransactionScope.make(`huly-mcp:employee-lifecycle:${email}`)
    }
    yield* commitPreparation(client, preparation)
  }
  const projected = employeeRoleUpdated
    ? yield* decodeEmployeeLifecycleState(
        { ...state, employee: { state: "inactive", role } },
        "inviteEmployee.roleReconciliation"
      )
    : state
  const resend = workspace.resendInvite(email, toHulyAccountRole(role))
  if (employeeRoleUpdated) {
    yield* resend.pipe(
      Effect.mapError(
        (error) =>
          new EmployeeInvitationPartialFailureError({
            personId: person._id,
            email,
            operation: "resendInvite",
            completedChanges: ["employeeRoleUpdated"],
            reason: error.message
          })
      )
    )
  } else {
    yield* resend
  }
  return { outcome: "invitation-resent", email, role, employee: projected }
})

export const inviteEmployee = Effect.fn("EmployeeLifecycle.invite")(function* (
  params: InviteEmployeeParams
): Effect.fn.Return<InviteEmployeeResult, EmployeeLifecycleError, HulyClient | WorkspaceClient> {
  const client = yield* HulyClient
  const workspace = yield* WorkspaceClient
  return InviteEmployeeParamsGuards["create-or-promote"](params)
    ? yield* invitePreparedEmployee(client, workspace, params)
    : yield* reinviteEmployee(client, workspace, params)
})

export { deactivateEmployee, listInactiveEmployees } from "./employee-deactivation.js"
