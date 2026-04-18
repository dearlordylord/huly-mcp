import { JSONSchema, Schema } from "effect"

import type { ContactProvider, PersonName } from "./shared.js"
import { Email, LimitParam, MemberReference, NonEmptyString, OrganizationId, PersonId } from "./shared.js"

// No codec needed — internal type, not used for runtime validation
export interface PersonSummary {
  readonly id: PersonId
  readonly name: PersonName
  readonly city?: string | undefined
  readonly email?: Email | undefined
  readonly modifiedOn?: number | undefined
}

export interface OrganizationMembershipSummary {
  readonly id: OrganizationId
  readonly name: string
}

export interface Person {
  readonly id: PersonId
  readonly name: PersonName
  readonly firstName?: string | undefined
  readonly lastName?: string | undefined
  readonly city?: string | undefined
  readonly email?: Email | undefined
  readonly channels?: ReadonlyArray<{ readonly provider: ContactProvider; readonly value: string }> | undefined
  readonly organizations?: ReadonlyArray<OrganizationMembershipSummary> | undefined
  readonly modifiedOn?: number | undefined
  readonly createdOn?: number | undefined
}

export interface EmployeeSummary {
  readonly id: PersonId
  readonly name: PersonName
  readonly email?: Email | undefined
  readonly position?: string | undefined
  readonly active: boolean
  readonly modifiedOn?: number | undefined
}

export interface OrganizationSummary {
  readonly id: OrganizationId
  readonly name: string
  readonly city?: string | undefined
  readonly members: number
  readonly modifiedOn?: number | undefined
}

const ListPersonsParamsBase = Schema.Struct({
  nameSearch: Schema.optional(Schema.String.annotations({
    description: "Search persons by name substring (case-insensitive). Mutually exclusive with nameRegex."
  })),
  nameRegex: Schema.optional(Schema.String.annotations({
    description:
      "Filter persons by name using a regex pattern (e.g., '^Smith'). Mutually exclusive with nameSearch. Note: regex support depends on the Huly backend; use nameSearch for broader compatibility."
  })),
  emailSearch: Schema.optional(Schema.String.annotations({
    description: "Search persons by email substring (case-insensitive)"
  })),
  limit: Schema.optional(
    LimitParam.annotations({
      description: "Maximum number of persons to return (default: 50)"
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
}).annotations({
  title: "UpdatePersonParams",
  description: "Parameters for updating a person"
})

export type UpdatePersonParams = Schema.Schema.Type<typeof UpdatePersonParamsSchema>

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
    Schema.Array(MemberReference).annotations({
      description: "Member person IDs or emails"
    })
  )
}).annotations({
  title: "CreateOrganizationParams",
  description: "Parameters for creating an organization"
})

export type CreateOrganizationParams = Schema.Schema.Type<typeof CreateOrganizationParamsSchema>

export const GetOrganizationParamsSchema = Schema.Struct({
  identifier: NonEmptyString.annotations({
    description: "Organization ID or exact name"
  })
}).annotations({
  title: "GetOrganizationParams",
  description: "Parameters for getting a single organization"
})

export type GetOrganizationParams = Schema.Schema.Type<typeof GetOrganizationParamsSchema>

export const UpdateOrganizationParamsSchema = Schema.Struct({
  organizationId: OrganizationId.annotations({
    description: "Organization ID to update"
  }),
  name: Schema.optional(NonEmptyString.annotations({
    description: "New organization name"
  })),
  city: Schema.optional(
    Schema.NullOr(Schema.String).annotations({
      description: "New city (null to clear)"
    })
  ),
  description: Schema.optional(
    Schema.NullOr(Schema.String).annotations({
      description: "New description/notes (null to clear). Supports multi-line plain text."
    })
  )
}).annotations({
  title: "UpdateOrganizationParams",
  description: "Update fields on an existing organization. Only provided fields are modified."
})

export type UpdateOrganizationParams = Schema.Schema.Type<typeof UpdateOrganizationParamsSchema>

export const DeleteOrganizationParamsSchema = Schema.Struct({
  organizationId: OrganizationId.annotations({
    description: "Organization ID to delete"
  })
}).annotations({
  title: "DeleteOrganizationParams",
  description: "Parameters for deleting an organization"
})

export type DeleteOrganizationParams = Schema.Schema.Type<typeof DeleteOrganizationParamsSchema>

export const ListOrganizationMembersParamsSchema = Schema.Struct({
  organizationId: NonEmptyString.annotations({
    description: "Organization ID or exact name"
  })
}).annotations({
  title: "ListOrganizationMembersParams",
  description: "List persons who are members of an organization"
})

export type ListOrganizationMembersParams = Schema.Schema.Type<typeof ListOrganizationMembersParamsSchema>

const ListPersonOrganizationsByIdSchema = Schema.Struct({
  personId: PersonId.annotations({
    description: "Person ID"
  })
})

const ListPersonOrganizationsByEmailSchema = Schema.Struct({
  email: Email.annotations({
    description: "Person email address"
  })
})

export const ListPersonOrganizationsParamsSchema = Schema.Union(
  ListPersonOrganizationsByIdSchema,
  ListPersonOrganizationsByEmailSchema
).annotations({
  title: "ListPersonOrganizationsParams",
  description: "List organizations a person is a member of (provide personId or email)"
})

export type ListPersonOrganizationsParams = Schema.Schema.Type<typeof ListPersonOrganizationsParamsSchema>

export const RemoveOrganizationMemberParamsSchema = Schema.Struct({
  organizationId: NonEmptyString.annotations({
    description: "Organization ID or exact name"
  }),
  personIdentifier: NonEmptyString.annotations({
    description: "Person ID or email address to unlink from the organization"
  })
}).annotations({
  title: "RemoveOrganizationMemberParams",
  description: "Parameters for removing a person from an organization"
})

export type RemoveOrganizationMemberParams = Schema.Schema.Type<typeof RemoveOrganizationMemberParamsSchema>

export const AddOrganizationChannelParamsSchema = Schema.Struct({
  organizationId: NonEmptyString.annotations({
    description: "Organization ID or exact name"
  }),
  provider: NonEmptyString.annotations({
    description: "Channel type: email, phone, linkedin, twitter, github, facebook, telegram, homepage"
  }),
  value: NonEmptyString.annotations({
    description: "Channel value (email address, phone number, URL, username)"
  })
}).annotations({
  title: "AddOrganizationChannelParams",
  description: "Parameters for adding a contact channel to an organization"
})

export type AddOrganizationChannelParams = Schema.Schema.Type<typeof AddOrganizationChannelParamsSchema>

export const AddOrganizationMemberParamsSchema = Schema.Struct({
  organizationId: NonEmptyString.annotations({
    description: "Organization ID or exact name"
  }),
  personIdentifier: NonEmptyString.annotations({
    description: "Person ID or email address"
  })
}).annotations({
  title: "AddOrganizationMemberParams",
  description: "Parameters for adding a person as an organization member"
})

export type AddOrganizationMemberParams = Schema.Schema.Type<typeof AddOrganizationMemberParamsSchema>

export const addOrganizationChannelParamsJsonSchema = JSONSchema.make(AddOrganizationChannelParamsSchema)
export const addOrganizationMemberParamsJsonSchema = JSONSchema.make(AddOrganizationMemberParamsSchema)

export const parseAddOrganizationChannelParams = Schema.decodeUnknown(AddOrganizationChannelParamsSchema)
export const parseAddOrganizationMemberParams = Schema.decodeUnknown(AddOrganizationMemberParamsSchema)

export const listOrganizationMembersParamsJsonSchema = JSONSchema.make(ListOrganizationMembersParamsSchema)
export const listPersonOrganizationsParamsJsonSchema = JSONSchema.make(ListPersonOrganizationsParamsSchema)
export const removeOrganizationMemberParamsJsonSchema = JSONSchema.make(RemoveOrganizationMemberParamsSchema)

export const parseListOrganizationMembersParams = Schema.decodeUnknown(ListOrganizationMembersParamsSchema)
export const parseListPersonOrganizationsParams = Schema.decodeUnknown(ListPersonOrganizationsParamsSchema)
export const parseRemoveOrganizationMemberParams = Schema.decodeUnknown(RemoveOrganizationMemberParamsSchema)

export const listPersonsParamsJsonSchema = JSONSchema.make(ListPersonsParamsSchema)
export const getPersonParamsJsonSchema = JSONSchema.make(GetPersonParamsSchema)
export const createPersonParamsJsonSchema = JSONSchema.make(CreatePersonParamsSchema)
export const updatePersonParamsJsonSchema = JSONSchema.make(UpdatePersonParamsSchema)
export const deletePersonParamsJsonSchema = JSONSchema.make(DeletePersonParamsSchema)
export const listEmployeesParamsJsonSchema = JSONSchema.make(ListEmployeesParamsSchema)
export const listOrganizationsParamsJsonSchema = JSONSchema.make(ListOrganizationsParamsSchema)
export const createOrganizationParamsJsonSchema = JSONSchema.make(CreateOrganizationParamsSchema)
export const getOrganizationParamsJsonSchema = JSONSchema.make(GetOrganizationParamsSchema)
export const updateOrganizationParamsJsonSchema = JSONSchema.make(UpdateOrganizationParamsSchema)
export const deleteOrganizationParamsJsonSchema = JSONSchema.make(DeleteOrganizationParamsSchema)

export const parseListPersonsParams = Schema.decodeUnknown(ListPersonsParamsSchema)
export const parseGetPersonParams = Schema.decodeUnknown(GetPersonParamsSchema)
export const parseCreatePersonParams = Schema.decodeUnknown(CreatePersonParamsSchema)
export const parseUpdatePersonParams = Schema.decodeUnknown(UpdatePersonParamsSchema)
export const parseDeletePersonParams = Schema.decodeUnknown(DeletePersonParamsSchema)
export const parseListEmployeesParams = Schema.decodeUnknown(ListEmployeesParamsSchema)
export const parseListOrganizationsParams = Schema.decodeUnknown(ListOrganizationsParamsSchema)
export const parseCreateOrganizationParams = Schema.decodeUnknown(CreateOrganizationParamsSchema)
export const parseGetOrganizationParams = Schema.decodeUnknown(GetOrganizationParamsSchema)
export const parseUpdateOrganizationParams = Schema.decodeUnknown(UpdateOrganizationParamsSchema)
export const parseDeleteOrganizationParams = Schema.decodeUnknown(DeleteOrganizationParamsSchema)

// No codec needed — internal type, not used for runtime validation
export interface CreatePersonResult {
  readonly id: PersonId
}

export interface UpdatePersonResult {
  readonly id: PersonId
  readonly updated: boolean
}

export interface DeletePersonResult {
  readonly id: PersonId
  readonly deleted: boolean
}

export interface CreateOrganizationResult {
  readonly id: OrganizationId
}

export interface GetOrganizationResult {
  readonly id: OrganizationId
  readonly name: string
  readonly city?: string | undefined
  readonly description?: string | undefined
  readonly members: number
  readonly modifiedOn?: number | undefined
}

export interface UpdateOrganizationResult {
  readonly id: OrganizationId
  readonly updated: boolean
}

export interface DeleteOrganizationResult {
  readonly id: OrganizationId
  readonly deleted: boolean
}

export interface OrganizationMemberEntry {
  readonly personId: PersonId
  readonly name: PersonName
  readonly email?: Email | undefined
}

export interface ListOrganizationMembersResult {
  readonly organizationId: OrganizationId
  readonly members: ReadonlyArray<OrganizationMemberEntry>
}

export interface ListPersonOrganizationsResult {
  readonly personId: PersonId
  readonly organizations: ReadonlyArray<OrganizationMembershipSummary>
}

export interface RemoveOrganizationMemberResult {
  readonly id: OrganizationId
  readonly removed: boolean
}
