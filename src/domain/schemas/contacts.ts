import { Schema } from "effect"

import { ContactChannelSummarySchema } from "./contact-channels.js"
import { OrganizationMembershipSummarySchema } from "./contact-organizations.js"
import {
  toDraft07JsonSchema,
  withJsonSchemaPropertyDescriptions,
  withJsonSchemaUnionPropertyDescriptions
} from "./json-schema.js"
import {
  assertUpdateFields,
  atLeastOneUpdateFieldMessage,
  AccountUuid,
  DEFAULT_LIMIT,
  Count,
  Email,
  hasAtLeastOneDefined,
  LimitParam,
  NonEmptyString,
  PersonId,
  PersonName,
  UrlString,
  withAtLeastOneRequired
} from "./shared.js"
export const PersonSummarySchema = Schema.Struct({
  id: PersonId,
  name: PersonName,
  city: Schema.optional(Schema.String),
  email: Schema.optional(Email),
  url: UrlString,
  modifiedOn: Schema.optional(Schema.Number)
})
export type PersonSummary = Schema.Schema.Type<typeof PersonSummarySchema>
export const PersonSchema = Schema.Struct({
  id: PersonId,
  name: PersonName,
  firstName: Schema.optional(Schema.String),
  lastName: Schema.optional(Schema.String),
  city: Schema.optional(Schema.String),
  email: Schema.optional(Email),
  channels: Schema.optional(Schema.Array(ContactChannelSummarySchema)),
  organizations: Schema.optional(Schema.Array(OrganizationMembershipSummarySchema)),
  url: UrlString,
  modifiedOn: Schema.optional(Schema.Number),
  createdOn: Schema.optional(Schema.Number)
})
export type Person = Schema.Schema.Type<typeof PersonSchema>

export const EmployeeRoleSchema = Schema.Literals(["USER", "GUEST"]).annotate({
  identifier: "EmployeeRole",
  title: "EmployeeRole",
  description: "Huly Contact Employee role."
})
export type EmployeeRole = Schema.Schema.Type<typeof EmployeeRoleSchema>

const EmployeeIdLocatorSchema = Schema.Struct({
  id: PersonId.annotateKey({ description: "Exact Huly Employee/Person ID." }),
  email: Schema.optionalKey(Schema.Never),
  name: Schema.optionalKey(Schema.Never)
})

const EmployeeEmailLocatorSchema = Schema.Struct({
  email: Email.annotateKey({ description: "Exact employee email address." }),
  id: Schema.optionalKey(Schema.Never),
  name: Schema.optionalKey(Schema.Never)
})

const EmployeeNameLocatorSchema = Schema.Struct({
  name: PersonName.annotateKey({ description: "Exact employee display name." }),
  id: Schema.optionalKey(Schema.Never),
  email: Schema.optionalKey(Schema.Never)
})

export const EmployeeLocatorSchema = Schema.Union([
  EmployeeIdLocatorSchema,
  EmployeeEmailLocatorSchema,
  EmployeeNameLocatorSchema
]).annotate({
  title: "EmployeeLocator",
  description:
    "Structured exact employee locator. Provide exactly one of id, email, or name; combining modalities is rejected.",
  jsonSchema: { oneOf: [{ required: ["id"] }, { required: ["email"] }, { required: ["name"] }] }
})
export type EmployeeLocator = Schema.Schema.Type<typeof EmployeeLocatorSchema>

export const EmployeeSummarySchema = Schema.Struct({
  id: PersonId,
  name: PersonName,
  city: Schema.optionalKey(Schema.String),
  email: Schema.optionalKey(Email),
  role: Schema.optionalKey(EmployeeRoleSchema),
  statuses: Schema.optionalKey(Count),
  personUuid: Schema.optionalKey(AccountUuid),
  position: Schema.optionalKey(Schema.String),
  active: Schema.Boolean,
  url: UrlString,
  modifiedOn: Schema.optionalKey(Schema.Number)
}).annotate({
  title: "EmployeeSummary",
  description:
    "Stable Employee projection. SDK avatarType/avatar/avatarProps are provider/blob metadata, attachment/comment/channel counters and socialIds are derived collections, birthday/profile need separate contracts, and createdOn/createdBy/modifiedBy plus class/space refs are internal audit or SDK metadata; these fields are intentionally unsupported here."
})
export type EmployeeSummary = Schema.Schema.Type<typeof EmployeeSummarySchema>

const ListPersonsParamsBase = Schema.Struct({
  nameSearch: Schema.optional(
    Schema.String.annotateKey({
      description: "Search persons by name substring (case-insensitive). Mutually exclusive with nameRegex."
    })
  ),
  nameRegex: Schema.optional(
    Schema.String.annotateKey({
      description:
        "Filter persons by name using Huly $regex. On the supported Postgres backend this is SQL SIMILAR TO, not JavaScript RegExp; matching is case-sensitive and the pattern must match the whole name: use '%' for any string (e.g., '%Smith%' contains, 'Smith%' prefix). Mutually exclusive with nameSearch; use nameSearch for simple substring matching."
    })
  ),
  emailSearch: Schema.optional(
    Schema.String.annotateKey({ description: "Search persons by email substring (case-insensitive)" })
  ),
  limit: Schema.optional(
    LimitParam.annotateKey({ description: `Maximum number of persons to return (default: ${DEFAULT_LIMIT})` })
  )
})

export const ListPersonsParamsSchema = ListPersonsParamsBase.pipe(
  Schema.check(
    Schema.makeFilter((params) => {
      if (params.nameSearch !== undefined && params.nameRegex !== undefined) {
        return "Cannot provide both 'nameSearch' and 'nameRegex'. Use one or the other."
      }
      return undefined
    })
  )
).annotate({ title: "ListPersonsParams", description: "Parameters for listing persons" })

export type ListPersonsParams = Schema.Schema.Type<typeof ListPersonsParamsSchema>

const GetPersonByIdSchema = Schema.Struct({ personId: PersonId.annotateKey({ description: "Person ID" }) }).annotate({
  title: "GetPersonById",
  description: "Get person by ID"
})

const GetPersonByEmailSchema = Schema.Struct({
  email: Email.annotateKey({ description: "Person email address" })
}).annotate({ title: "GetPersonByEmail", description: "Get person by email" })

export const GetPersonParamsSchema = Schema.Union([GetPersonByIdSchema, GetPersonByEmailSchema]).annotate({
  title: "GetPersonParams",
  description: "Parameters for getting a single person (provide personId or email)"
})

export type GetPersonParams = Schema.Schema.Type<typeof GetPersonParamsSchema>

export const CreatePersonParamsSchema = Schema.Struct({
  firstName: NonEmptyString.annotateKey({ description: "First name" }),
  lastName: NonEmptyString.annotateKey({ description: "Last name" }),
  email: Schema.optional(Email.annotateKey({ description: "Email address" })),
  city: Schema.optional(Schema.String.annotateKey({ description: "City" }))
}).annotate({ title: "CreatePersonParams", description: "Parameters for creating a person" })

export type CreatePersonParams = Schema.Schema.Type<typeof CreatePersonParamsSchema>

export const UPDATE_PERSON_FIELDS = ["firstName", "lastName", "city"] as const satisfies ReadonlyArray<
  "firstName" | "lastName" | "city"
>
const updatePersonFieldMessage = atLeastOneUpdateFieldMessage(UPDATE_PERSON_FIELDS)

export const UpdatePersonParamsSchema = Schema.Struct({
  personId: PersonId.annotateKey({ description: "Person ID" }),
  firstName: Schema.optional(NonEmptyString.annotateKey({ description: "New first name" })),
  lastName: Schema.optional(NonEmptyString.annotateKey({ description: "New last name" })),
  city: Schema.optional(Schema.NullOr(Schema.String).annotateKey({ description: "New city (null to clear)" }))
})
  .pipe(
    Schema.check(
      Schema.makeFilter((params) =>
        hasAtLeastOneDefined(params, UPDATE_PERSON_FIELDS) ? undefined : updatePersonFieldMessage
      )
    )
  )
  .annotate({
    title: "UpdatePersonParams",
    description: `Parameters for updating a person. ${updatePersonFieldMessage}`
  })

export type UpdatePersonParams = Schema.Schema.Type<typeof UpdatePersonParamsSchema>
assertUpdateFields<UpdatePersonParams>()(["personId"], UPDATE_PERSON_FIELDS)

export const DeletePersonParamsSchema = Schema.Struct({
  personId: PersonId.annotateKey({ description: "Person ID" })
}).annotate({ title: "DeletePersonParams", description: "Parameters for deleting a person" })

export type DeletePersonParams = Schema.Schema.Type<typeof DeletePersonParamsSchema>

export const ListEmployeesParamsSchema = Schema.Struct({
  limit: Schema.optional(
    LimitParam.annotateKey({ description: `Maximum number of employees to return (default: ${DEFAULT_LIMIT})` })
  )
}).annotate({ title: "ListEmployeesParams", description: "Parameters for listing employees" })

export type ListEmployeesParams = Schema.Schema.Type<typeof ListEmployeesParamsSchema>

export const SetEmployeePositionParamsSchema = Schema.Struct({
  employee: EmployeeLocatorSchema.annotateKey({
    description:
      "Structured exact employee locator. Provide exactly one of id, email, or name; combined locator modalities are rejected."
  }),
  position: Schema.NullOr(Schema.String).annotateKey({
    description: "Official position on contact.mixin.Employee. Pass null or an empty string to clear it."
  })
}).annotate({
  title: "SetEmployeePositionParams",
  description:
    "Set an employee's Contact Employee-mixin position. The position field is required; omit it to perform no mutation."
})

export type SetEmployeePositionParams = Schema.Schema.Type<typeof SetEmployeePositionParamsSchema>

export const listPersonsParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  toDraft07JsonSchema(ListPersonsParamsSchema),
  {
    nameSearch: "Search persons by name substring (case-insensitive). Mutually exclusive with nameRegex.",
    nameRegex: "Filter persons by name using Huly $regex. Mutually exclusive with nameSearch.",
    emailSearch: "Search persons by email substring (case-insensitive)",
    limit: `Maximum number of persons to return (default: ${DEFAULT_LIMIT})`
  }
)
export const getPersonParamsJsonSchema = withJsonSchemaUnionPropertyDescriptions(
  toDraft07JsonSchema(GetPersonParamsSchema),
  { personId: "Person ID", email: "Person email address" }
)
export const createPersonParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  toDraft07JsonSchema(CreatePersonParamsSchema),
  { firstName: "First name", lastName: "Last name", email: "Email address", city: "City" }
)
export const updatePersonParamsJsonSchema = withAtLeastOneRequired(
  withJsonSchemaPropertyDescriptions(toDraft07JsonSchema(UpdatePersonParamsSchema), {
    personId: "Person ID",
    firstName: "New first name",
    lastName: "New last name",
    city: "New city (null to clear)"
  }),
  UPDATE_PERSON_FIELDS
)
export const deletePersonParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  toDraft07JsonSchema(DeletePersonParamsSchema),
  { personId: "Person ID" }
)
export const listEmployeesParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  toDraft07JsonSchema(ListEmployeesParamsSchema),
  { limit: `Maximum number of employees to return (default: ${DEFAULT_LIMIT})` }
)
export const setEmployeePositionParamsJsonSchema = withJsonSchemaPropertyDescriptions(
  toDraft07JsonSchema(SetEmployeePositionParamsSchema),
  {
    employee:
      "Structured exact employee locator: provide exactly one of id, email, or name. Ambiguous names or emails and combined locator modalities are rejected.",
    position:
      "Official position on contact.mixin.Employee. Pass null or an empty string to clear it; omit it to fail without mutating."
  }
)

export const parseListPersonsParams = Schema.decodeUnknownEffect(ListPersonsParamsSchema)
export const parseGetPersonParams = Schema.decodeUnknownEffect(GetPersonParamsSchema)
export const parseCreatePersonParams = Schema.decodeUnknownEffect(CreatePersonParamsSchema)
export const parseUpdatePersonParams = Schema.decodeUnknownEffect(UpdatePersonParamsSchema)
export const parseDeletePersonParams = Schema.decodeUnknownEffect(DeletePersonParamsSchema)
export const parseListEmployeesParams = Schema.decodeUnknownEffect(ListEmployeesParamsSchema)
export const parseSetEmployeePositionParams = Schema.decodeUnknownEffect(SetEmployeePositionParamsSchema)
export const CreatePersonResultSchema = Schema.Struct({ id: PersonId })
export type CreatePersonResult = Schema.Schema.Type<typeof CreatePersonResultSchema>
export const UpdatePersonResultSchema = Schema.Struct({ id: PersonId, updated: Schema.Boolean })
export type UpdatePersonResult = Schema.Schema.Type<typeof UpdatePersonResultSchema>
export const DeletePersonResultSchema = Schema.Struct({ id: PersonId, deleted: Schema.Boolean })
export type DeletePersonResult = Schema.Schema.Type<typeof DeletePersonResultSchema>

export const ListPersonsResultSchema = Schema.Array(PersonSummarySchema)
export const GetPersonResultSchema = PersonSchema
export const ListEmployeesResultSchema = Schema.Array(EmployeeSummarySchema)
export const SetEmployeePositionResultSchema = Schema.Struct({
  id: PersonId,
  updated: Schema.Boolean,
  position: Schema.NullOr(Schema.String)
})
export type SetEmployeePositionResult = Schema.Schema.Type<typeof SetEmployeePositionResultSchema>
