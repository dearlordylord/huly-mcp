import {
  listEmployeesParamsJsonSchema,
  parseListEmployeesParams,
  parseSetEmployeePositionParams,
  setEmployeePositionParamsJsonSchema
} from "../../domain/schemas.js"
import { ListEmployeesResultSchema, SetEmployeePositionResultSchema } from "../../domain/schemas/contacts.js"
import { setEmployeePosition } from "../../huly/operations/employee-position.js"
import { listEmployees } from "../../huly/operations/persons.js"
import { defineTool, type RegisteredTool } from "./registry.js"

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
  )
] as const satisfies ReadonlyArray<RegisteredTool>
