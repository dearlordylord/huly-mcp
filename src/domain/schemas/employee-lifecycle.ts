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
export const EmployeeLifecycleIdentifierSchema = Schema.Union([Email, PersonId, PersonName])
export type EmployeeLifecycleIdentifier = Schema.Schema.Type<typeof EmployeeLifecycleIdentifierSchema>

const AccountStateSchema = Schema.Union([
  Schema.Struct({ state: Schema.Literal("unlinked") }),
  Schema.Struct({ state: Schema.Literal("linked"), personUuid: PersonUuid })
]).pipe(Schema.toTaggedUnion("state"))
const WorkspaceMembershipStateSchema = Schema.Union([
  Schema.Struct({ state: Schema.Literal("absent") }),
  Schema.Struct({ state: Schema.Literal("member"), role: AccountRoleSchema })
]).pipe(Schema.toTaggedUnion("state"))
export const EmployeeInvitationRoleSchema = Schema.Literals(["USER", "GUEST"]).annotate({
  identifier: "EmployeeInvitationRole",
  description: "Employee role persisted by the Contact Employee model and used for the workspace invitation."
})
export type EmployeeInvitationRole = Schema.Schema.Type<typeof EmployeeInvitationRoleSchema>
const EmployeeStateSchema = Schema.Union([
  Schema.Struct({ state: Schema.Literal("active"), role: Schema.optionalKey(EmployeeInvitationRoleSchema) }),
  Schema.Struct({ state: Schema.Literal("inactive"), role: Schema.optionalKey(EmployeeInvitationRoleSchema) })
]).pipe(Schema.toTaggedUnion("state"))

const EmployeeLifecycleStateFields = {
  personId: PersonId,
  name: PersonName,
  email: Schema.optionalKey(Email),
  employee: EmployeeStateSchema
}
const EmployeeLifecycleStateTaggedSchema = Schema.Union([
  Schema.Struct({
    ...EmployeeLifecycleStateFields,
    relationship: Schema.Literal("unlinked"),
    account: AccountStateSchema.cases.unlinked,
    workspaceMembership: WorkspaceMembershipStateSchema.cases.absent
  }),
  Schema.Struct({
    ...EmployeeLifecycleStateFields,
    relationship: Schema.Literal("linked-without-membership"),
    account: AccountStateSchema.cases.linked,
    workspaceMembership: WorkspaceMembershipStateSchema.cases.absent
  }),
  Schema.Struct({
    ...EmployeeLifecycleStateFields,
    relationship: Schema.Literal("workspace-member"),
    account: AccountStateSchema.cases.linked,
    workspaceMembership: WorkspaceMembershipStateSchema.cases.member
  })
]).pipe(Schema.toTaggedUnion("relationship"))
export const EmployeeLifecycleStateSchema = EmployeeLifecycleStateTaggedSchema.annotate({
  identifier: "EmployeeLifecycleState",
  description:
    "Exact employee state. Unlinked employees cannot be workspace members; linked employees distinguish absent membership from an assigned workspace role."
})
export const EmployeeLifecycleStateGuards = EmployeeLifecycleStateTaggedSchema.guards
export type EmployeeLifecycleState = Schema.Schema.Type<typeof EmployeeLifecycleStateSchema>

const InactiveEmployeeLifecycleStateFields = {
  ...EmployeeLifecycleStateFields,
  employee: EmployeeStateSchema.cases.inactive
}
export const InactiveEmployeeLifecycleStateSchema = Schema.Union([
  Schema.Struct({
    ...InactiveEmployeeLifecycleStateFields,
    relationship: Schema.Literal("unlinked"),
    account: AccountStateSchema.cases.unlinked,
    workspaceMembership: WorkspaceMembershipStateSchema.cases.absent
  }),
  Schema.Struct({
    ...InactiveEmployeeLifecycleStateFields,
    relationship: Schema.Literal("linked-without-membership"),
    account: AccountStateSchema.cases.linked,
    workspaceMembership: WorkspaceMembershipStateSchema.cases.absent
  }),
  Schema.Struct({
    ...InactiveEmployeeLifecycleStateFields,
    relationship: Schema.Literal("workspace-member"),
    account: AccountStateSchema.cases.linked,
    workspaceMembership: WorkspaceMembershipStateSchema.cases.member
  })
])
  .pipe(Schema.toTaggedUnion("relationship"))
  .annotate({
    identifier: "InactiveEmployeeLifecycleState",
    description: "Exact lifecycle projection for an inactive Contact Employee."
  })
export type InactiveEmployeeLifecycleState = Schema.Schema.Type<typeof InactiveEmployeeLifecycleStateSchema>

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
const InviteEmployeeParamsTaggedSchema = Schema.Union([
  InviteExistingEmployeeParamsSchema,
  CreateOrPromoteEmployeeParamsSchema
]).pipe(Schema.toTaggedUnion("mode"))
export const InviteEmployeeParamsSchema = InviteEmployeeParamsTaggedSchema.annotate({
  title: "InviteEmployeeParams",
  description:
    "Use invite-existing to resend an inactive employee invitation by exact locator. Omit role to preserve the Employee role; an explicit role is persisted before resend. Use create-or-promote with an exact Huly display name and email to create or promote a Person before sending the invitation."
})
export const InviteEmployeeParamsGuards = InviteEmployeeParamsTaggedSchema.guards
export type InviteEmployeeParams = Schema.Schema.Type<typeof InviteEmployeeParamsSchema>

export const EmployeePreparationChangeSchema = Schema.Literals([
  "personCreated",
  "nameUpdated",
  "emailIdentityCreated",
  "employeeCreated",
  "employeeReactivated",
  "employeeRoleUpdated"
])
export type EmployeePreparationChange = Schema.Schema.Type<typeof EmployeePreparationChangeSchema>
const NamePreparation = Schema.Literal("nameUpdated")
const IdentityPreparation = Schema.Literal("emailIdentityCreated")
const CreatedPreparation = Schema.Literal("employeeCreated")
const ReactivatedPreparation = Schema.Literal("employeeReactivated")
const RolePreparation = Schema.Literal("employeeRoleUpdated")
export const EmployeeInvitationProgressSchema = Schema.Union([
  Schema.Tuple([]),
  Schema.Tuple([NamePreparation]),
  Schema.Tuple([IdentityPreparation]),
  Schema.Tuple([NamePreparation, IdentityPreparation]),
  Schema.Tuple([CreatedPreparation]),
  Schema.Tuple([NamePreparation, CreatedPreparation]),
  Schema.Tuple([IdentityPreparation, CreatedPreparation]),
  Schema.Tuple([NamePreparation, IdentityPreparation, CreatedPreparation]),
  Schema.Tuple([ReactivatedPreparation]),
  Schema.Tuple([NamePreparation, ReactivatedPreparation]),
  Schema.Tuple([IdentityPreparation, ReactivatedPreparation]),
  Schema.Tuple([NamePreparation, IdentityPreparation, ReactivatedPreparation]),
  Schema.Tuple([RolePreparation]),
  Schema.Tuple([NamePreparation, RolePreparation]),
  Schema.Tuple([IdentityPreparation, RolePreparation]),
  Schema.Tuple([NamePreparation, IdentityPreparation, RolePreparation]),
  Schema.Tuple([ReactivatedPreparation, RolePreparation]),
  Schema.Tuple([NamePreparation, ReactivatedPreparation, RolePreparation]),
  Schema.Tuple([IdentityPreparation, ReactivatedPreparation, RolePreparation]),
  Schema.Tuple([NamePreparation, IdentityPreparation, ReactivatedPreparation, RolePreparation]),
  Schema.Tuple([Schema.Literal("personCreated"), IdentityPreparation, CreatedPreparation])
])
export type EmployeeInvitationProgress = Schema.Schema.Type<typeof EmployeeInvitationProgressSchema>
const ExistingEmployeeTransitionSchema = Schema.Literals([
  "created",
  "reactivated",
  "role-updated",
  "reactivated-and-role-updated",
  "unchanged"
])
export const EmployeePreparationChangesSchema = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("person-created") }),
  Schema.Struct({
    kind: Schema.Literal("existing-person"),
    nameUpdated: Schema.Boolean,
    emailIdentityCreated: Schema.Boolean,
    employeeTransition: ExistingEmployeeTransitionSchema
  })
]).pipe(Schema.toTaggedUnion("kind"))

export const InviteEmployeeResultSchema = Schema.Union([
  Schema.Struct({
    outcome: Schema.Literal("employee-prepared-and-invited"),
    email: Email,
    role: EmployeeInvitationRoleSchema,
    personId: PersonId,
    changes: EmployeePreparationChangesSchema
  }),
  Schema.Struct({
    outcome: Schema.Literal("invitation-resent"),
    email: Email,
    role: EmployeeInvitationRoleSchema,
    employee: InactiveEmployeeLifecycleStateSchema
  })
]).pipe(Schema.toTaggedUnion("outcome"))
export type InviteEmployeeResult = Schema.Schema.Type<typeof InviteEmployeeResultSchema>

export const ListInactiveEmployeesParamsSchema = Schema.Struct({
  limit: Schema.optionalKey(LimitParam),
  offset: Schema.optionalKey(NonNegativeInteger)
})
export type ListInactiveEmployeesParams = Schema.Schema.Type<typeof ListInactiveEmployeesParamsSchema>
const ListInactiveEmployeesResultFields = {
  employees: Schema.Array(InactiveEmployeeLifecycleStateSchema),
  total: Count,
  offset: NonNegativeInteger
}
export const ListInactiveEmployeesResultSchema = Schema.Union([
  Schema.Struct({
    ...ListInactiveEmployeesResultFields,
    truncated: Schema.Literal(true),
    nextOffset: NonNegativeInteger
  }),
  Schema.Struct({
    ...ListInactiveEmployeesResultFields,
    truncated: Schema.Literal(false),
    nextOffset: Schema.optionalKey(Schema.Never)
  })
])
export type ListInactiveEmployeesResult = Schema.Schema.Type<typeof ListInactiveEmployeesResultSchema>

const EmployeeLifecycleActionSchema = Schema.Literals(["deactivate", "kick"])
const PreviewEmployeeDeactivationParamsSchema = Schema.Struct({
  employee: EmployeeLifecycleLocatorSchema,
  action: EmployeeLifecycleActionSchema,
  execute: Schema.optionalKey(Schema.Literal(false)),
  expected: Schema.optionalKey(Schema.Never)
})
export const ExpectedEmployeeLifecycleStateSchema = Schema.Union([
  Schema.Struct({ relationship: Schema.Literal("unlinked"), personId: PersonId, employeeActive: Schema.Boolean }),
  Schema.Struct({
    relationship: Schema.Literal("linked-without-membership"),
    personId: PersonId,
    personUuid: PersonUuid,
    employeeActive: Schema.Boolean
  }),
  Schema.Struct({
    relationship: Schema.Literal("workspace-member"),
    personId: PersonId,
    personUuid: PersonUuid,
    employeeActive: Schema.Boolean,
    workspaceRole: AccountRoleSchema
  })
]).pipe(Schema.toTaggedUnion("relationship"))
const ExecuteEmployeeDeactivationParamsSchema = Schema.Struct({
  employee: EmployeeLifecycleLocatorSchema,
  action: EmployeeLifecycleActionSchema,
  execute: Schema.Literal(true),
  expected: ExpectedEmployeeLifecycleStateSchema
})
export const DeactivateEmployeeParamsSchema = Schema.Union([
  PreviewEmployeeDeactivationParamsSchema,
  ExecuteEmployeeDeactivationParamsSchema
]).annotate({
  title: "DeactivateEmployeeParams",
  description:
    "Preview by default. Execution requires execute=true and one exact expected relationship variant copied from the previewed person/account/employee/workspace state."
})
export type DeactivateEmployeeParams = Schema.Schema.Type<typeof DeactivateEmployeeParamsSchema>

const EmployeeLifecycleMutationSchema = Schema.Struct({
  employeeDeactivated: Schema.Boolean,
  workspaceMemberRemoved: Schema.Boolean
})
export const EmployeeKickProgressSchema = Schema.Union([
  Schema.Tuple([]),
  Schema.Tuple([Schema.Literal("employeeDeactivated")])
])

export const EmployeePreparationOperationSchema = Schema.Literal("prepareEmployee")
export const EmployeeInvitationOperationSchema = Schema.Literals(["sendInvite", "resendInvite"])
export const EmployeeWorkspaceRemovalOperationSchema = Schema.Literal("leaveWorkspace")
export const DeactivateEmployeeResultSchema = Schema.Union([
  Schema.Struct({
    outcome: Schema.Literal("preview"),
    executed: Schema.Literal(false),
    action: EmployeeLifecycleActionSchema,
    impact: EmployeeLifecycleStateSchema
  }),
  Schema.Struct({
    outcome: Schema.Literal("deactivated"),
    executed: Schema.Literal(true),
    action: Schema.Literal("deactivate"),
    impactBefore: EmployeeLifecycleStateSchema,
    changes: Schema.Struct({ employeeDeactivated: Schema.Boolean })
  }),
  Schema.Struct({
    outcome: Schema.Literal("kicked"),
    executed: Schema.Literal(true),
    action: Schema.Literal("kick"),
    impactBefore: EmployeeLifecycleStateSchema,
    changes: EmployeeLifecycleMutationSchema
  })
]).pipe(Schema.toTaggedUnion("outcome"))
export type DeactivateEmployeeResult = Schema.Schema.Type<typeof DeactivateEmployeeResultSchema>

export const inviteEmployeeParamsJsonSchema = toDraft07JsonSchema(InviteEmployeeParamsSchema)
export const listInactiveEmployeesParamsJsonSchema = toDraft07JsonSchema(ListInactiveEmployeesParamsSchema)
export const deactivateEmployeeParamsJsonSchema = toDraft07JsonSchema(DeactivateEmployeeParamsSchema)

export const parseInviteEmployeeParams = Schema.decodeUnknownEffect(InviteEmployeeParamsSchema)
export const parseListInactiveEmployeesParams = Schema.decodeUnknownEffect(ListInactiveEmployeesParamsSchema)
export const parseDeactivateEmployeeParams = Schema.decodeUnknownEffect(DeactivateEmployeeParamsSchema)

export const EMPLOYEE_LIFECYCLE_DEFAULT_LIMIT = DEFAULT_LIMIT
