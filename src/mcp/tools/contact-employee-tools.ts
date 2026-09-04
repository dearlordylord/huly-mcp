import {
  listEmployeesParamsJsonSchema,
  parseListEmployeesParams,
  parseSetEmployeePositionParams,
  setEmployeePositionParamsJsonSchema
} from "../../domain/schemas.js"
import { ListEmployeesResultSchema, SetEmployeePositionResultSchema } from "../../domain/schemas/contacts.js"
import {
  deactivateEmployeeParamsJsonSchema,
  DeactivateEmployeeResultSchema,
  inviteEmployeeParamsJsonSchema,
  InviteEmployeeResultSchema,
  listInactiveEmployeesParamsJsonSchema,
  ListInactiveEmployeesResultSchema,
  parseDeactivateEmployeeParams,
  parseInviteEmployeeParams,
  parseListInactiveEmployeesParams
} from "../../domain/schemas/employee-lifecycle.js"
import { deactivateEmployee, inviteEmployee, listInactiveEmployees } from "../../huly/operations/employee-lifecycle.js"
import { setEmployeePosition } from "../../huly/operations/employee-position.js"
import { listEmployees } from "../../huly/operations/persons.js"
import { defineHulyWorkspaceTool, defineTool, type RegisteredTool } from "./registry.js"

const CATEGORY = "contacts" as const

export const contactEmployeeTools = [
  defineTool(
    {
      name: "list_employees",
      description:
        "List employees (persons who are team members), sorted by modification date (newest first). Each summary exposes stable Contact Employee fields city, email, role, statuses count, personUuid, position, active, and modifiedOn. SDK avatarType/avatar/avatarProps are provider/blob metadata; attachment/comment/channel counters and social identity collections are derived; birthday/profile need separate contracts; createdOn/createdBy/modifiedBy and class/space refs are internal metadata and intentionally unsupported in this projection.",
      category: CATEGORY,
      inputSchema: listEmployeesParamsJsonSchema,
      resultSchema: ListEmployeesResultSchema
    },
    parseListEmployeesParams,
    listEmployees
  ),
  defineTool(
    {
      name: "set_employee_position",
      description:
        "Idempotently set an employee's official position on contact.mixin.Employee. employee must be an object with exactly one locator field: {id}, {email}, or {name}; combined locator modalities are rejected. The selected ID, email, or display name is exact, and duplicate email/name matches are rejected. The position field is required: pass a string to set it, or null/an empty string to clear it. Omitting position fails schema parsing and performs no mutation. This updates the Contact Employee mixin, not an HR Staff record.",
      category: CATEGORY,
      inputSchema: setEmployeePositionParamsJsonSchema,
      resultSchema: SetEmployeePositionResultSchema,
      annotations: { idempotentHint: true }
    },
    parseSetEmployeePositionParams,
    setEmployeePosition
  ),
  defineHulyWorkspaceTool(
    {
      name: "invite_employee",
      description:
        "Create or promote and invite an employee, or resend an inactive employee invitation. mode=create-or-promote requires the exact Huly display name and email; one checked atomic transaction creates or updates the Person, email SocialIdentity, and active Employee before sending. A changed authoritative precondition sends no invite and directs the caller to retry in a fresh session. mode=invite-existing requires an exact email/name locator and rejects active or non-Employee targets. Omitted role preserves the Employee role; an explicit different role is persisted atomically before resend. Returns no invitation link, credential, or token; an invitation-provider failure reports completed preparation.",
      category: CATEGORY,
      inputSchema: inviteEmployeeParamsJsonSchema,
      resultSchema: InviteEmployeeResultSchema
    },
    parseInviteEmployeeParams,
    inviteEmployee
  ),
  defineHulyWorkspaceTool(
    {
      name: "list_inactive_employees",
      description:
        "List every inactive Employee before applying output pagination. Each result distinguishes the account link, workspace membership and role, Person identity, and Employee active state so an agent can choose reinvite, deactivate, or kick safely.",
      category: CATEGORY,
      inputSchema: listInactiveEmployeesParamsJsonSchema,
      resultSchema: ListInactiveEmployeesResultSchema
    },
    parseListInactiveEmployeesParams,
    listInactiveEmployees
  ),
  defineHulyWorkspaceTool(
    {
      name: "deactivate_employee",
      description:
        "Preview or execute an employee lifecycle change resolved by exact email or exact display name. action=deactivate only sets Employee.active=false and retains workspace membership; action=kick then removes the linked account from the workspace. If workspace removal fails after deactivation, the typed partial failure lists completed changes and directs a safe preview-and-retry. Preview is the default. Execution requires execute=true plus one exact expected relationship object copied from the preview: unlinked, linked-without-membership, or workspace-member. Any changed Person ID, account UUID, Employee active flag, membership, or workspace role is rejected. The authenticated employee cannot target itself.",
      category: CATEGORY,
      inputSchema: deactivateEmployeeParamsJsonSchema,
      resultSchema: DeactivateEmployeeResultSchema,
      annotations: { destructiveHint: true, idempotentHint: true }
    },
    parseDeactivateEmployeeParams,
    deactivateEmployee
  )
] as const satisfies ReadonlyArray<RegisteredTool>
