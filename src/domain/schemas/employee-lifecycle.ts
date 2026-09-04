import { Schema } from "effect"

import { toDraft07JsonSchema } from "./json-schema.js"
import { AccountRoleSchema } from "./workspace.js"
import {
  Count,
  DEFAULT_LIMIT,
  Email,
  LimitParam,
  NonNegativeInteger,
  PersonId,
  PersonName,
  PersonUuid
} from "./shared.js"

const ByEmail = Schema.Struct({ email: Email, name: Schema.optionalKey(Schema.Never) })
const ByName = Schema.Struct({ name: PersonName, email: Schema.optionalKey(Schema.Never) })

export const EmployeeLifecycleLocatorSchema = Schema.Union([ByEmail, ByName]).annotate({
  title: "EmployeeLifecycleLocator",
  description: "Exact employee locator. Provide exactly one of email or Huly display name; ambiguous matches fail.",
  jsonSchema: {
    oneOf: [
      { type: "object", required: ["email"] },
      { type: "object", required: ["name"] }
    ]
  }
})
export type EmployeeLifecycleLocator = Schema.Schema.Type<typeof EmployeeLifecycleLocatorSchema>

const AccountStateSchema = Schema.Union([
  Schema.Struct({ state: Schema.Literal("unlinked") }),
  Schema.Struct({ state: Schema.Literal("linked"), personUuid: PersonUuid })
])
const WorkspaceMembershipStateSchema = Schema.Union([
  Schema.Struct({ state: Schema.Literal("absent") }),
  Schema.Struct({ state: Schema.Literal("member"), role: AccountRoleSchema })
])
export const EmployeeInvitationRoleSchema = Schema.Literals(["USER", "GUEST"]).annotate({
  identifier: "EmployeeInvitationRole",
  description: "Employee role persisted by the Contact Employee model and used for the workspace invitation."
})
export type EmployeeInvitationRole = Schema.Schema.Type<typeof EmployeeInvitationRoleSchema>
const EmployeeStateSchema = Schema.Union([
  Schema.Struct({ state: Schema.Literal("active"), role: Schema.optionalKey(EmployeeInvitationRoleSchema) }),
  Schema.Struct({ state: Schema.Literal("inactive"), role: Schema.optionalKey(EmployeeInvitationRoleSchema) })
])

export const EmployeeLifecycleStateSchema = Schema.Struct({
  personId: PersonId,
  name: PersonName,
  email: Schema.optionalKey(Email),
  account: AccountStateSchema,
  workspaceMembership: WorkspaceMembershipStateSchema,
  employee: EmployeeStateSchema
})
export type EmployeeLifecycleState = Schema.Schema.Type<typeof EmployeeLifecycleStateSchema>

const InviteExistingEmployeeParamsSchema = Schema.Struct({
  mode: Schema.Literal("invite-existing"),
  employee: EmployeeLifecycleLocatorSchema,
  role: Schema.optionalKey(EmployeeInvitationRoleSchema)
})
const CreateOrPromoteEmployeeParamsSchema = Schema.Struct({
  mode: Schema.Literal("create-or-promote"),
  name: PersonName,
  email: Email,
  role: Schema.optionalKey(EmployeeInvitationRoleSchema)
})
export const InviteEmployeeParamsSchema = Schema.Union([
  InviteExistingEmployeeParamsSchema,
  CreateOrPromoteEmployeeParamsSchema
]).annotate({
  title: "InviteEmployeeParams",
  description:
    "Use invite-existing to resend an inactive employee invitation by exact locator. Use create-or-promote with an exact Huly display name and email to create or promote a Person before sending the invitation."
})
export type InviteEmployeeParams = Schema.Schema.Type<typeof InviteEmployeeParamsSchema>

export const InviteEmployeeResultSchema = Schema.Union([
  Schema.Struct({
    outcome: Schema.Literal("employee-prepared-and-invited"),
    email: Email,
    role: EmployeeInvitationRoleSchema,
    personId: PersonId,
    changes: Schema.Struct({
      personCreated: Schema.Boolean,
      nameUpdated: Schema.Boolean,
      emailIdentityCreated: Schema.Boolean,
      employeeCreated: Schema.Boolean,
      employeeReactivated: Schema.Boolean,
      employeeRoleUpdated: Schema.Boolean
    })
  }),
  Schema.Struct({
    outcome: Schema.Literal("invitation-resent"),
    email: Email,
    role: EmployeeInvitationRoleSchema,
    employee: EmployeeLifecycleStateSchema
  })
])
export type InviteEmployeeResult = Schema.Schema.Type<typeof InviteEmployeeResultSchema>

export const ListInactiveEmployeesParamsSchema = Schema.Struct({
  limit: Schema.optionalKey(LimitParam),
  offset: Schema.optionalKey(NonNegativeInteger)
})
export type ListInactiveEmployeesParams = Schema.Schema.Type<typeof ListInactiveEmployeesParamsSchema>
export const ListInactiveEmployeesResultSchema = Schema.Struct({
  employees: Schema.Array(EmployeeLifecycleStateSchema),
  total: Count,
  offset: NonNegativeInteger,
  truncated: Schema.Boolean,
  nextOffset: Schema.optionalKey(NonNegativeInteger)
})
export type ListInactiveEmployeesResult = Schema.Schema.Type<typeof ListInactiveEmployeesResultSchema>

const EmployeeLifecycleActionSchema = Schema.Literals(["deactivate", "kick"])
const PreviewEmployeeDeactivationParamsSchema = Schema.Struct({
  employee: EmployeeLifecycleLocatorSchema,
  action: EmployeeLifecycleActionSchema,
  execute: Schema.optionalKey(Schema.Literal(false)),
  expectedPersonId: Schema.optionalKey(Schema.Never),
  expectedPersonUuid: Schema.optionalKey(Schema.Never),
  expectedEmployeeActive: Schema.optionalKey(Schema.Never),
  expectedWorkspaceRole: Schema.optionalKey(Schema.Never)
})
const ExecuteEmployeeDeactivationParamsSchema = Schema.Struct({
  employee: EmployeeLifecycleLocatorSchema,
  action: EmployeeLifecycleActionSchema,
  execute: Schema.Literal(true),
  expectedPersonId: PersonId,
  expectedPersonUuid: Schema.NullOr(PersonUuid),
  expectedEmployeeActive: Schema.Boolean,
  expectedWorkspaceRole: Schema.NullOr(AccountRoleSchema)
})
export const DeactivateEmployeeParamsSchema = Schema.Union([
  PreviewEmployeeDeactivationParamsSchema,
  ExecuteEmployeeDeactivationParamsSchema
]).annotate({
  title: "DeactivateEmployeeParams",
  description:
    "Preview by default. Execution requires execute=true and the exact person/account/employee/workspace state returned by the preview."
})
export type DeactivateEmployeeParams = Schema.Schema.Type<typeof DeactivateEmployeeParamsSchema>

const EmployeeLifecycleMutationSchema = Schema.Struct({
  employeeDeactivated: Schema.Boolean,
  workspaceMemberRemoved: Schema.Boolean
})
export const DeactivateEmployeeResultSchema = Schema.Union([
  Schema.Struct({
    executed: Schema.Literal(false),
    action: EmployeeLifecycleActionSchema,
    impact: EmployeeLifecycleStateSchema
  }),
  Schema.Struct({
    executed: Schema.Literal(true),
    action: EmployeeLifecycleActionSchema,
    impactBefore: EmployeeLifecycleStateSchema,
    changes: EmployeeLifecycleMutationSchema
  })
])
export type DeactivateEmployeeResult = Schema.Schema.Type<typeof DeactivateEmployeeResultSchema>

export const inviteEmployeeParamsJsonSchema = toDraft07JsonSchema(InviteEmployeeParamsSchema)
export const listInactiveEmployeesParamsJsonSchema = toDraft07JsonSchema(ListInactiveEmployeesParamsSchema)
export const deactivateEmployeeParamsJsonSchema = toDraft07JsonSchema(DeactivateEmployeeParamsSchema)

export const parseInviteEmployeeParams = Schema.decodeUnknownEffect(InviteEmployeeParamsSchema)
export const parseListInactiveEmployeesParams = Schema.decodeUnknownEffect(ListInactiveEmployeesParamsSchema)
export const parseDeactivateEmployeeParams = Schema.decodeUnknownEffect(DeactivateEmployeeParamsSchema)

export const EMPLOYEE_LIFECYCLE_DEFAULT_LIMIT = DEFAULT_LIMIT
