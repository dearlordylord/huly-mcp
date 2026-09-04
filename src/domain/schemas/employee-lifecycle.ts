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
const EmployeeStateSchema = Schema.Union([
  Schema.Struct({ state: Schema.Literal("active") }),
  Schema.Struct({ state: Schema.Literal("inactive") })
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

export const InviteEmployeeParamsSchema = Schema.Struct({
  employee: EmployeeLifecycleLocatorSchema,
  role: Schema.optionalKey(AccountRoleSchema)
})
export type InviteEmployeeParams = Schema.Schema.Type<typeof InviteEmployeeParamsSchema>

export const InviteEmployeeResultSchema = Schema.Union([
  Schema.Struct({ outcome: Schema.Literal("invitation-sent"), email: Email, role: AccountRoleSchema }),
  Schema.Struct({
    outcome: Schema.Literal("invitation-resent"),
    email: Email,
    role: AccountRoleSchema,
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
