import { Schema } from "effect"

import { LimitParam, makeJsonSchema, NonEmptyString, Timestamp } from "./shared.js"

export const PersonSummarySchema = Schema.Struct({
  id: NonEmptyString,
  name: Schema.String,
  city: Schema.optional(Schema.String),
  email: Schema.optional(Schema.String),
  modifiedOn: Schema.optional(Timestamp)
}).annotations({
  title: "PersonSummary",
  description: "Person summary for list operations"
})

export type PersonSummary = Schema.Schema.Type<typeof PersonSummarySchema>

export const PersonSchema = Schema.Struct({
  id: NonEmptyString,
  name: Schema.String,
  firstName: Schema.optional(Schema.String),
  lastName: Schema.optional(Schema.String),
  city: Schema.optional(Schema.String),
  email: Schema.optional(Schema.String),
  channels: Schema.optional(Schema.Array(Schema.Struct({
    provider: Schema.String,
    value: Schema.String
  }))),
  modifiedOn: Schema.optional(Timestamp),
  createdOn: Schema.optional(Timestamp)
}).annotations({
  title: "Person",
  description: "Full person with all fields"
})

export type Person = Schema.Schema.Type<typeof PersonSchema>

export const EmployeeSummarySchema = Schema.Struct({
  id: NonEmptyString,
  name: Schema.String,
  email: Schema.optional(Schema.String),
  position: Schema.optional(Schema.String),
  active: Schema.Boolean,
  modifiedOn: Schema.optional(Timestamp)
}).annotations({
  title: "EmployeeSummary",
  description: "Employee summary for list operations"
})

export type EmployeeSummary = Schema.Schema.Type<typeof EmployeeSummarySchema>

export const OrganizationSummarySchema = Schema.Struct({
  id: NonEmptyString,
  name: Schema.String,
  city: Schema.optional(Schema.String),
  members: Schema.Number,
  modifiedOn: Schema.optional(Timestamp)
}).annotations({
  title: "OrganizationSummary",
  description: "Organization summary for list operations"
})

export type OrganizationSummary = Schema.Schema.Type<typeof OrganizationSummarySchema>

export const ListPersonsParamsSchema = Schema.Struct({
  nameSearch: Schema.optional(Schema.String.annotations({
    description: "Search persons by name substring (case-insensitive)"
  })),
  emailSearch: Schema.optional(Schema.String.annotations({
    description: "Search persons by email substring (case-insensitive)"
  })),
  limit: Schema.optional(
    LimitParam.annotations({
      description: "Maximum number of persons to return (default: 50)"
    })
  )
}).annotations({
  title: "ListPersonsParams",
  description: "Parameters for listing persons"
})

export type ListPersonsParams = Schema.Schema.Type<typeof ListPersonsParamsSchema>

// TODO better typing (and usage)
export const GetPersonParamsSchema = Schema.Struct({
  personId: Schema.optional(NonEmptyString.annotations({
    description: "Person ID"
  })),
  email: Schema.optional(Schema.String.annotations({
    description: "Person email address"
  }))
}).pipe(
  Schema.filter((params) => {
    if (params.personId === undefined && params.email === undefined) {
      return { path: [], message: "Either personId or email must be provided" }
    }
    return true
  })
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
  email: Schema.optional(Schema.String.annotations({
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

export const UpdatePersonParamsSchema = Schema.Struct({
  personId: NonEmptyString.annotations({
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
}).annotations({
  title: "UpdatePersonParams",
  description: "Parameters for updating a person"
})

export type UpdatePersonParams = Schema.Schema.Type<typeof UpdatePersonParamsSchema>

export const DeletePersonParamsSchema = Schema.Struct({
  personId: NonEmptyString.annotations({
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
      description: "Maximum number of employees to return (default: 50)"
    })
  )
}).annotations({
  title: "ListEmployeesParams",
  description: "Parameters for listing employees"
})

export type ListEmployeesParams = Schema.Schema.Type<typeof ListEmployeesParamsSchema>

export const ListOrganizationsParamsSchema = Schema.Struct({
  limit: Schema.optional(
    LimitParam.annotations({
      description: "Maximum number of organizations to return (default: 50)"
    })
  )
}).annotations({
  title: "ListOrganizationsParams",
  description: "Parameters for listing organizations"
})

export type ListOrganizationsParams = Schema.Schema.Type<typeof ListOrganizationsParamsSchema>

export const CreateOrganizationParamsSchema = Schema.Struct({
  name: NonEmptyString.annotations({
    description: "Organization name"
  }),
  members: Schema.optional(
    Schema.Array(Schema.String).annotations({
      description: "Member person IDs or emails"
    })
  )
}).annotations({
  title: "CreateOrganizationParams",
  description: "Parameters for creating an organization"
})

export type CreateOrganizationParams = Schema.Schema.Type<typeof CreateOrganizationParamsSchema>

export const listPersonsParamsJsonSchema = makeJsonSchema(ListPersonsParamsSchema)
export const getPersonParamsJsonSchema = makeJsonSchema(GetPersonParamsSchema)
export const createPersonParamsJsonSchema = makeJsonSchema(CreatePersonParamsSchema)
export const updatePersonParamsJsonSchema = makeJsonSchema(UpdatePersonParamsSchema)
export const deletePersonParamsJsonSchema = makeJsonSchema(DeletePersonParamsSchema)
export const listEmployeesParamsJsonSchema = makeJsonSchema(ListEmployeesParamsSchema)
export const listOrganizationsParamsJsonSchema = makeJsonSchema(ListOrganizationsParamsSchema)
export const createOrganizationParamsJsonSchema = makeJsonSchema(CreateOrganizationParamsSchema)

export const parseListPersonsParams = Schema.decodeUnknown(ListPersonsParamsSchema)
export const parseGetPersonParams = Schema.decodeUnknown(GetPersonParamsSchema)
export const parseCreatePersonParams = Schema.decodeUnknown(CreatePersonParamsSchema)
export const parseUpdatePersonParams = Schema.decodeUnknown(UpdatePersonParamsSchema)
export const parseDeletePersonParams = Schema.decodeUnknown(DeletePersonParamsSchema)
export const parseListEmployeesParams = Schema.decodeUnknown(ListEmployeesParamsSchema)
export const parseListOrganizationsParams = Schema.decodeUnknown(ListOrganizationsParamsSchema)
export const parseCreateOrganizationParams = Schema.decodeUnknown(CreateOrganizationParamsSchema)
