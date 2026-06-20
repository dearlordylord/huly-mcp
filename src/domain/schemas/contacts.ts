import { JSONSchema, Schema } from "effect"

import { ContactChannelSummarySchema } from "./contact-channels.js"
import { OrganizationMembershipSummarySchema } from "./contact-organizations.js"
import {
  assertUpdateFields,
  atLeastOneUpdateFieldMessage,
  DEFAULT_LIMIT,
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
export const EmployeeSummarySchema = Schema.Struct({
  id: PersonId,
  name: PersonName,
  email: Schema.optional(Email),
  position: Schema.optional(Schema.String),
  active: Schema.Boolean,
  url: UrlString,
  modifiedOn: Schema.optional(Schema.Number)
})
export type EmployeeSummary = Schema.Schema.Type<typeof EmployeeSummarySchema>

const ListPersonsParamsBase = Schema.Struct({
  nameSearch: Schema.optional(Schema.String.annotations({
    description: "Search persons by name substring (case-insensitive). Mutually exclusive with nameRegex."
  })),
  nameRegex: Schema.optional(Schema.String.annotations({
    description:
      "Filter persons by name using Huly $regex. On the supported Postgres backend this is SQL SIMILAR TO, not JavaScript RegExp; matching is case-sensitive and the pattern must match the whole name: use '%' for any string (e.g., '%Smith%' contains, 'Smith%' prefix). Mutually exclusive with nameSearch; use nameSearch for simple substring matching."
  })),
  emailSearch: Schema.optional(Schema.String.annotations({
    description: "Search persons by email substring (case-insensitive)"
  })),
  limit: Schema.optional(
    LimitParam.annotations({
      description: `Maximum number of persons to return (default: ${DEFAULT_LIMIT})`
    })
  )
})

export const ListPersonsParamsSchema = ListPersonsParamsBase.pipe(
  Schema.filter((params) => {
    if (params.nameSearch !== undefined && params.nameRegex !== undefined) {
      return "Cannot provide both 'nameSearch' and 'nameRegex'. Use one or the other."
    }
    return undefined
  })
).annotations({
  title: "ListPersonsParams",
  description: "Parameters for listing persons"
})

export type ListPersonsParams = Schema.Schema.Type<typeof ListPersonsParamsSchema>

const GetPersonByIdSchema = Schema.Struct({
  personId: PersonId.annotations({
    description: "Person ID"
  })
}).annotations({
  title: "GetPersonById",
  description: "Get person by ID"
})

const GetPersonByEmailSchema = Schema.Struct({
  email: Email.annotations({
    description: "Person email address"
  })
}).annotations({
  title: "GetPersonByEmail",
  description: "Get person by email"
})

export const GetPersonParamsSchema = Schema.Union(
  GetPersonByIdSchema,
  GetPersonByEmailSchema
).annotations({
  title: "GetPersonParams",
  description: "Parameters for getting a single person (provide personId or email)"
})

export type GetPersonParams = Schema.Schema.Type<typeof GetPersonParamsSchema>

export const CreatePersonParamsSchema = Schema.Struct({
  firstName: NonEmptyString.annotations({
    description: "First name"
  }),
  lastName: NonEmptyString.annotations({
    description: "Last name"
  }),
  email: Schema.optional(Email.annotations({
    description: "Email address"
  })),
  city: Schema.optional(Schema.String.annotations({
    description: "City"
  }))
}).annotations({
  title: "CreatePersonParams",
  description: "Parameters for creating a person"
})

export type CreatePersonParams = Schema.Schema.Type<typeof CreatePersonParamsSchema>

export const UPDATE_PERSON_FIELDS = [
  "firstName",
  "lastName",
  "city"
] as const satisfies ReadonlyArray<"firstName" | "lastName" | "city">
const updatePersonFieldMessage = atLeastOneUpdateFieldMessage(UPDATE_PERSON_FIELDS)

export const UpdatePersonParamsSchema = Schema.Struct({
  personId: PersonId.annotations({
    description: "Person ID"
  }),
  firstName: Schema.optional(NonEmptyString.annotations({
    description: "New first name"
  })),
  lastName: Schema.optional(NonEmptyString.annotations({
    description: "New last name"
  })),
  city: Schema.optional(
    Schema.NullOr(Schema.String).annotations({
      description: "New city (null to clear)"
    })
  )
}).pipe(
  Schema.filter((params) => hasAtLeastOneDefined(params, UPDATE_PERSON_FIELDS) ? undefined : updatePersonFieldMessage)
).annotations({
  title: "UpdatePersonParams",
  description: `Parameters for updating a person. ${updatePersonFieldMessage}`
})

export type UpdatePersonParams = Schema.Schema.Type<typeof UpdatePersonParamsSchema>
assertUpdateFields<UpdatePersonParams>()(["personId"], UPDATE_PERSON_FIELDS)

export const DeletePersonParamsSchema = Schema.Struct({
  personId: PersonId.annotations({
    description: "Person ID"
  })
}).annotations({
  title: "DeletePersonParams",
  description: "Parameters for deleting a person"
})

export type DeletePersonParams = Schema.Schema.Type<typeof DeletePersonParamsSchema>

export const ListEmployeesParamsSchema = Schema.Struct({
  limit: Schema.optional(
    LimitParam.annotations({
      description: `Maximum number of employees to return (default: ${DEFAULT_LIMIT})`
    })
  )
}).annotations({
  title: "ListEmployeesParams",
  description: "Parameters for listing employees"
})

export type ListEmployeesParams = Schema.Schema.Type<typeof ListEmployeesParamsSchema>

export const listPersonsParamsJsonSchema = JSONSchema.make(ListPersonsParamsSchema)
export const getPersonParamsJsonSchema = JSONSchema.make(GetPersonParamsSchema)
export const createPersonParamsJsonSchema = JSONSchema.make(CreatePersonParamsSchema)
export const updatePersonParamsJsonSchema = withAtLeastOneRequired(
  JSONSchema.make(UpdatePersonParamsSchema),
  UPDATE_PERSON_FIELDS
)
export const deletePersonParamsJsonSchema = JSONSchema.make(DeletePersonParamsSchema)
export const listEmployeesParamsJsonSchema = JSONSchema.make(ListEmployeesParamsSchema)

export const parseListPersonsParams = Schema.decodeUnknown(ListPersonsParamsSchema)
export const parseGetPersonParams = Schema.decodeUnknown(GetPersonParamsSchema)
export const parseCreatePersonParams = Schema.decodeUnknown(CreatePersonParamsSchema)
export const parseUpdatePersonParams = Schema.decodeUnknown(UpdatePersonParamsSchema)
export const parseDeletePersonParams = Schema.decodeUnknown(DeletePersonParamsSchema)
export const parseListEmployeesParams = Schema.decodeUnknown(ListEmployeesParamsSchema)
export const CreatePersonResultSchema = Schema.Struct({
  id: PersonId
})
export type CreatePersonResult = Schema.Schema.Type<typeof CreatePersonResultSchema>
export const UpdatePersonResultSchema = Schema.Struct({
  id: PersonId,
  updated: Schema.Boolean
})
export type UpdatePersonResult = Schema.Schema.Type<typeof UpdatePersonResultSchema>
export const DeletePersonResultSchema = Schema.Struct({
  id: PersonId,
  deleted: Schema.Boolean
})
export type DeletePersonResult = Schema.Schema.Type<typeof DeletePersonResultSchema>

export const ListPersonsResultSchema = Schema.Array(PersonSummarySchema)
export const GetPersonResultSchema = PersonSchema
export const ListEmployeesResultSchema = Schema.Array(EmployeeSummarySchema)
