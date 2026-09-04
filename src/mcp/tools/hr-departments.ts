import {
  AssignStaffDepartmentResultSchema,
  assignStaffDepartmentParamsJsonSchema,
  createDepartmentParamsJsonSchema,
  deleteDepartmentParamsJsonSchema,
  DeleteDepartmentResultSchema,
  DepartmentMutationResultSchema,
  DepartmentSummarySchema,
  getDepartmentParamsJsonSchema,
  ListDepartmentsResultSchema,
  listDepartmentsParamsJsonSchema,
  ListStaffResultSchema,
  listStaffParamsJsonSchema,
  parseAssignStaffDepartmentParams,
  parseCreateDepartmentParams,
  parseDeleteDepartmentParams,
  parseGetDepartmentParams,
  parseListDepartmentsParams,
  parseListStaffParams,
  parseUpdateDepartmentParams,
  updateDepartmentParamsJsonSchema
} from "../../domain/schemas.js"
import { getDepartment, listDepartments, listStaff } from "../../huly/operations/hr-departments-read.js"
import {
  assignStaffDepartment,
  createDepartment,
  deleteDepartment,
  updateDepartment
} from "../../huly/operations/hr-departments-write.js"
import { defineTool, type RegisteredTool } from "./registry.js"

const CATEGORY = "hr" as const

export const hrDepartmentTools = [
  defineTool(
    {
      name: "list_departments",
      description:
        "List HR departments with exact full paths, hierarchy, managers, subscribers, team lead, direct Staff assignments, server-derived member count, and stable counters. Scope by exact parent path/ID; recursive=false returns direct children.",
      category: CATEGORY,
      inputSchema: listDepartmentsParamsJsonSchema,
      resultSchema: ListDepartmentsResultSchema
    },
    parseListDepartmentsParams,
    listDepartments
  ),
  defineTool(
    {
      name: "get_department",
      description: "Get one HR department by exact full slash-separated path or department ID.",
      category: CATEGORY,
      inputSchema: getDepartmentParamsJsonSchema,
      resultSchema: DepartmentSummarySchema
    },
    parseGetDepartmentParams,
    getDepartment
  ),
  defineTool(
    {
      name: "create_department",
      description:
        "Create a top-level or nested HR department. Parent and people use exact paths/IDs/names/emails and reject ambiguity. Names cannot contain '/'. Department.members starts empty and remains server-derived.",
      category: CATEGORY,
      inputSchema: createDepartmentParamsJsonSchema,
      resultSchema: DepartmentMutationResultSchema
    },
    parseCreateDepartmentParams,
    createDepartment
  ),
  defineTool(
    {
      name: "update_department",
      description:
        "Rename, move, or replace department metadata and people. Rejects duplicate sibling names, parent cycles, and moves of subtrees with server-derived members; clear Staff.department assignments before moving a populated subtree. newParent=null moves top-level; teamLead=null clears. Never writes Department.members.",
      category: CATEGORY,
      inputSchema: updateDepartmentParamsJsonSchema,
      resultSchema: DepartmentMutationResultSchema
    },
    parseUpdateDepartmentParams,
    updateDepartment
  ),
  defineTool(
    {
      name: "delete_department",
      description:
        "Preview destructive impact by default. Execution requires execute=true plus exact previewed descendant and assigned-Staff counts; Huly then cascades descendant deletion and clears affected Staff assignments.",
      category: CATEGORY,
      inputSchema: deleteDepartmentParamsJsonSchema,
      resultSchema: DeleteDepartmentResultSchema
    },
    parseDeleteDepartmentParams,
    deleteDepartment
  ),
  defineTool(
    {
      name: "list_staff",
      description:
        "List HR Staff and authoritative department assignments. Optionally scope by exact department path/ID, include descendants, and filter Employee active state.",
      category: CATEGORY,
      inputSchema: listStaffParamsJsonSchema,
      resultSchema: ListStaffResultSchema
    },
    parseListStaffParams,
    listStaff
  ),
  defineTool(
    {
      name: "assign_staff_department",
      description:
        "Assign an exact employee ID/email/display name by writing only authoritative Staff.department. Use department=null to clear. Department.members hierarchy propagation is performed asynchronously by Huly's server trigger.",
      category: CATEGORY,
      inputSchema: assignStaffDepartmentParamsJsonSchema,
      resultSchema: AssignStaffDepartmentResultSchema
    },
    parseAssignStaffDepartmentParams,
    assignStaffDepartment
  )
] as const satisfies ReadonlyArray<RegisteredTool>
