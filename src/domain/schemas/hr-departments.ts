import { Schema } from "effect"

import { toDraft07JsonSchema, withJsonSchemaPropertyDescriptions } from "./json-schema.js"
import {
  assertUpdateFields,
  atLeastOneUpdateFieldMessage,
  Count,
  DEFAULT_LIMIT,
  hasAtLeastOneDefined,
  LimitParam,
  ListTotal,
  NonEmptyString,
  PersonId,
  PersonLocator,
  PersonName,
  Timestamp,
  withAtLeastOneRequired
} from "./shared.js"

export const DepartmentId = NonEmptyString.pipe(Schema.brand("DepartmentId"))
export type DepartmentId = Schema.Schema.Type<typeof DepartmentId>

export const DepartmentPath = NonEmptyString.pipe(Schema.brand("DepartmentPath"))
export type DepartmentPath = Schema.Schema.Type<typeof DepartmentPath>

export const DepartmentIdentifier = NonEmptyString.pipe(Schema.brand("DepartmentIdentifier"))
export type DepartmentIdentifier = Schema.Schema.Type<typeof DepartmentIdentifier>

export const DepartmentName = NonEmptyString.pipe(
  Schema.check(Schema.makeFilter((value) => (value.includes("/") ? "Department names cannot contain '/'" : undefined))),
  Schema.brand("DepartmentName")
)
export type DepartmentName = Schema.Schema.Type<typeof DepartmentName>

export { PersonLocator } from "./shared.js"

export const DepartmentReferenceSchema = Schema.Struct({ id: DepartmentId, path: DepartmentPath })
export type DepartmentReference = Schema.Schema.Type<typeof DepartmentReferenceSchema>

export const DepartmentPersonSchema = Schema.Struct({ id: PersonId, name: PersonName })
export type DepartmentPerson = Schema.Schema.Type<typeof DepartmentPersonSchema>

export const DepartmentSummarySchema = Schema.Struct({
  id: DepartmentId,
  name: DepartmentName,
  path: DepartmentPath,
  parent: Schema.optionalKey(DepartmentReferenceSchema),
  description: Schema.String,
  avatar: Schema.optionalKey(Schema.String),
  teamLead: Schema.optionalKey(DepartmentPersonSchema),
  managers: Schema.Array(DepartmentPersonSchema),
  subscribers: Schema.Array(DepartmentPersonSchema),
  directStaff: Count,
  derivedMembers: Count,
  subdepartments: Count,
  attachments: Count,
  comments: Count,
  channels: Count,
  createdOn: Schema.optionalKey(Timestamp),
  modifiedOn: Timestamp
})
export type DepartmentSummary = Schema.Schema.Type<typeof DepartmentSummarySchema>

export const ListDepartmentsParamsSchema = Schema.Struct({
  parent: Schema.optional(DepartmentIdentifier.annotateKey({ description: "Exact parent department ID or path." })),
  recursive: Schema.optional(
    Schema.Boolean.annotateKey({ description: "Include all descendants of parent. Defaults to false." })
  ),
  limit: Schema.optional(
    LimitParam.annotateKey({ description: `Maximum departments to return (default: ${DEFAULT_LIMIT}).` })
  )
}).annotate({ title: "ListDepartmentsParams", description: "List path-resolved HR departments." })
export type ListDepartmentsParams = Schema.Schema.Type<typeof ListDepartmentsParamsSchema>

export const GetDepartmentParamsSchema = Schema.Struct({
  department: DepartmentIdentifier.annotateKey({ description: "Exact department ID or full slash-separated path." })
}).annotate({ title: "GetDepartmentParams", description: "Get one HR department." })
export type GetDepartmentParams = Schema.Schema.Type<typeof GetDepartmentParamsSchema>

const DepartmentRelationships = {
  teamLead: Schema.optional(Schema.NullOr(PersonLocator).annotateKey({ description: "Employee locator, or null." })),
  managers: Schema.optional(Schema.Array(PersonLocator).annotateKey({ description: "Exact employee locators." })),
  subscribers: Schema.optional(Schema.Array(PersonLocator).annotateKey({ description: "Exact person locators." }))
}

export const CreateDepartmentParamsSchema = Schema.Struct({
  name: DepartmentName.annotateKey({ description: "Department name; '/' is reserved as the path separator." }),
  parent: Schema.optional(
    DepartmentIdentifier.annotateKey({ description: "Parent ID/path. Omit for a top-level department." })
  ),
  description: Schema.optional(Schema.String.annotateKey({ description: "Plain-text department description." })),
  ...DepartmentRelationships
}).annotate({ title: "CreateDepartmentParams", description: "Create an HR department." })
export type CreateDepartmentParams = Schema.Schema.Type<typeof CreateDepartmentParamsSchema>

export const UPDATE_DEPARTMENT_FIELDS = [
  "name",
  "description",
  "newParent",
  "teamLead",
  "managers",
  "subscribers"
] as const

export const UpdateDepartmentParamsSchema = Schema.Struct({
  department: DepartmentIdentifier.annotateKey({ description: "Exact current department ID or path." }),
  name: Schema.optional(DepartmentName.annotateKey({ description: "New department name." })),
  description: Schema.optional(Schema.String.annotateKey({ description: "New plain-text description." })),
  newParent: Schema.optional(
    Schema.NullOr(DepartmentIdentifier).annotateKey({ description: "New parent ID/path; null moves to top level." })
  ),
  ...DepartmentRelationships
})
  .pipe(
    Schema.check(
      Schema.makeFilter((params) =>
        hasAtLeastOneDefined(params, UPDATE_DEPARTMENT_FIELDS)
          ? undefined
          : atLeastOneUpdateFieldMessage(UPDATE_DEPARTMENT_FIELDS)
      )
    )
  )
  .annotate({ title: "UpdateDepartmentParams", description: "Update an HR department." })
export type UpdateDepartmentParams = Schema.Schema.Type<typeof UpdateDepartmentParamsSchema>
assertUpdateFields<UpdateDepartmentParams>()(["department"], UPDATE_DEPARTMENT_FIELDS)

const DeleteDepartmentPreviewSchema = Schema.Struct({
  department: DepartmentIdentifier,
  execute: Schema.optional(Schema.Literal(false))
})
const DeleteDepartmentExecuteSchema = Schema.Struct({
  department: DepartmentIdentifier,
  execute: Schema.Literal(true),
  expectedSubdepartments: Count,
  expectedAssignedStaff: Count
})
export const DeleteDepartmentParamsSchema = Schema.Union([
  DeleteDepartmentPreviewSchema,
  DeleteDepartmentExecuteSchema
]).annotate({
  title: "DeleteDepartmentParams",
  description:
    "Preview impact by default. To execute, pass execute=true and the exact previewed subdepartment/staff counts. Huly cascades descendants and clears Staff.department."
})
export type DeleteDepartmentParams = Schema.Schema.Type<typeof DeleteDepartmentParamsSchema>

export const DepartmentImpactSchema = Schema.Struct({ subdepartments: Count, assignedStaff: Count })
export type DepartmentImpact = Schema.Schema.Type<typeof DepartmentImpactSchema>

export const DeleteDepartmentResultSchema = Schema.Struct({
  id: DepartmentId,
  path: DepartmentPath,
  impact: DepartmentImpactSchema,
  deleted: Schema.Boolean
})
export type DeleteDepartmentResult = Schema.Schema.Type<typeof DeleteDepartmentResultSchema>

export const ListDepartmentsResultSchema = Schema.Struct({
  departments: Schema.Array(DepartmentSummarySchema),
  total: ListTotal
})
export type ListDepartmentsResult = Schema.Schema.Type<typeof ListDepartmentsResultSchema>

export const DepartmentMutationResultSchema = Schema.Struct({ id: DepartmentId, path: DepartmentPath })
export type DepartmentMutationResult = Schema.Schema.Type<typeof DepartmentMutationResultSchema>

export const StaffSummarySchema = Schema.Struct({
  id: PersonId,
  name: PersonName,
  active: Schema.Boolean,
  department: Schema.optionalKey(DepartmentReferenceSchema),
  position: Schema.optionalKey(Schema.String)
})
export type StaffSummary = Schema.Schema.Type<typeof StaffSummarySchema>

export const ListStaffParamsSchema = Schema.Struct({
  department: Schema.optional(DepartmentIdentifier.annotateKey({ description: "Exact department ID or path." })),
  includeDescendants: Schema.optional(
    Schema.Boolean.annotateKey({ description: "Include staff assigned to descendant departments. Defaults to false." })
  ),
  active: Schema.optional(Schema.Boolean.annotateKey({ description: "Filter by Employee active state." })),
  limit: Schema.optional(LimitParam)
}).annotate({ title: "ListStaffParams", description: "List HR Staff assignments." })
export type ListStaffParams = Schema.Schema.Type<typeof ListStaffParamsSchema>

export const ListStaffResultSchema = Schema.Struct({ staff: Schema.Array(StaffSummarySchema), total: ListTotal })
export type ListStaffResult = Schema.Schema.Type<typeof ListStaffResultSchema>

export const AssignStaffDepartmentParamsSchema = Schema.Struct({
  employee: PersonLocator,
  department: Schema.NullOr(DepartmentIdentifier).annotateKey({
    description: "Exact department ID/path, or null to clear the Staff department assignment."
  })
}).annotate({ title: "AssignStaffDepartmentParams", description: "Write authoritative Staff.department state." })
export type AssignStaffDepartmentParams = Schema.Schema.Type<typeof AssignStaffDepartmentParamsSchema>

export const AssignStaffDepartmentResultSchema = Schema.Struct({
  employeeId: PersonId,
  department: Schema.optionalKey(DepartmentReferenceSchema),
  updated: Schema.Boolean,
  propagation: Schema.Literal("server-derived")
})
export type AssignStaffDepartmentResult = Schema.Schema.Type<typeof AssignStaffDepartmentResultSchema>

export const listDepartmentsParamsJsonSchema = toDraft07JsonSchema(ListDepartmentsParamsSchema)
export const getDepartmentParamsJsonSchema = toDraft07JsonSchema(GetDepartmentParamsSchema)
export const createDepartmentParamsJsonSchema = toDraft07JsonSchema(CreateDepartmentParamsSchema)
export const updateDepartmentParamsJsonSchema = withAtLeastOneRequired(
  toDraft07JsonSchema(UpdateDepartmentParamsSchema),
  UPDATE_DEPARTMENT_FIELDS
)
export const deleteDepartmentParamsJsonSchema = toDraft07JsonSchema(DeleteDepartmentParamsSchema)
export const listStaffParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  toDraft07JsonSchema(ListStaffParamsSchema),
  { limit: `Maximum staff records to return (default: ${DEFAULT_LIMIT}).` }
)
export const assignStaffDepartmentParamsJsonSchema = toDraft07JsonSchema(AssignStaffDepartmentParamsSchema)

export const parseListDepartmentsParams = Schema.decodeUnknownEffect(ListDepartmentsParamsSchema)
export const parseGetDepartmentParams = Schema.decodeUnknownEffect(GetDepartmentParamsSchema)
export const parseCreateDepartmentParams = Schema.decodeUnknownEffect(CreateDepartmentParamsSchema)
export const parseUpdateDepartmentParams = Schema.decodeUnknownEffect(UpdateDepartmentParamsSchema)
export const parseDeleteDepartmentParams = Schema.decodeUnknownEffect(DeleteDepartmentParamsSchema)
export const parseListStaffParams = Schema.decodeUnknownEffect(ListStaffParamsSchema)
export const parseAssignStaffDepartmentParams = Schema.decodeUnknownEffect(AssignStaffDepartmentParamsSchema)
