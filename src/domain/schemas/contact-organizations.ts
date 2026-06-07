import { JSONSchema, Schema } from "effect"

import type { PersonName } from "./shared.js"
import {
  assertUpdateFields,
  atLeastOneUpdateFieldMessage,
  Count,
  Email,
  enumValuesDescription,
  hasAtLeastOneDefined,
  LimitParam,
  MemberReference,
  NonEmptyString,
  OrganizationId,
  PersonId,
  UrlString,
  withAtLeastOneRequired
} from "./shared.js"

export interface OrganizationMembershipSummary {
  readonly id: OrganizationId
  readonly name: string
}

export interface OrganizationSummary {
  readonly id: OrganizationId
  readonly name: string
  readonly city?: string | undefined
  readonly members: Count
  readonly url: UrlString
  readonly modifiedOn?: number | undefined
}

export const OrganizationSummarySchema = Schema.Struct({
  id: OrganizationId,
  name: NonEmptyString,
  city: Schema.optional(Schema.String),
  members: Count,
  url: UrlString,
  modifiedOn: Schema.optional(Schema.Number)
})

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

export const UPDATE_ORGANIZATION_FIELDS = [
  "name",
  "city",
  "description"
] as const satisfies ReadonlyArray<"name" | "city" | "description">
const updateOrganizationFieldMessage = atLeastOneUpdateFieldMessage(UPDATE_ORGANIZATION_FIELDS)

export const UpdateOrganizationParamsSchema = Schema.Struct({
  identifier: NonEmptyString.annotations({
    description: "Organization ID or exact name"
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
}).pipe(
  Schema.filter((params) =>
    hasAtLeastOneDefined(params, UPDATE_ORGANIZATION_FIELDS) ? undefined : updateOrganizationFieldMessage
  )
).annotations({
  title: "UpdateOrganizationParams",
  description:
    `Update fields on an existing organization. Only provided fields are modified. ${updateOrganizationFieldMessage}`
})

export type UpdateOrganizationParams = Schema.Schema.Type<typeof UpdateOrganizationParamsSchema>
assertUpdateFields<UpdateOrganizationParams>()(["identifier"], UPDATE_ORGANIZATION_FIELDS)

export const DeleteOrganizationParamsSchema = Schema.Struct({
  identifier: NonEmptyString.annotations({
    description: "Organization ID or exact name"
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

// MCP-facing contact channel names backed by Huly SDK contact.channelProvider refs in organization-channel-providers.
export const OrganizationChannelProviderValues = [
  "email",
  "phone",
  "linkedin",
  "twitter",
  "github",
  "facebook",
  "telegram",
  "homepage",
  "whatsapp",
  "skype",
  "profile",
  "viber"
] as const
const OrganizationChannelProviderSchema = Schema.Literal(...OrganizationChannelProviderValues)
export type OrganizationChannelProvider = Schema.Schema.Type<typeof OrganizationChannelProviderSchema>

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
  provider: OrganizationChannelProviderSchema.annotations({
    description: `Channel type: ${enumValuesDescription(OrganizationChannelProviderValues)}`
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
export const listOrganizationMembersParamsJsonSchema = JSONSchema.make(ListOrganizationMembersParamsSchema)
export const listPersonOrganizationsParamsJsonSchema = JSONSchema.make(ListPersonOrganizationsParamsSchema)
export const removeOrganizationMemberParamsJsonSchema = JSONSchema.make(RemoveOrganizationMemberParamsSchema)
export const listOrganizationsParamsJsonSchema = JSONSchema.make(ListOrganizationsParamsSchema)
export const createOrganizationParamsJsonSchema = JSONSchema.make(CreateOrganizationParamsSchema)
export const getOrganizationParamsJsonSchema = JSONSchema.make(GetOrganizationParamsSchema)
export const updateOrganizationParamsJsonSchema = withAtLeastOneRequired(
  JSONSchema.make(UpdateOrganizationParamsSchema),
  UPDATE_ORGANIZATION_FIELDS
)
export const deleteOrganizationParamsJsonSchema = JSONSchema.make(DeleteOrganizationParamsSchema)

export const parseAddOrganizationChannelParams = Schema.decodeUnknown(AddOrganizationChannelParamsSchema)
export const parseAddOrganizationMemberParams = Schema.decodeUnknown(AddOrganizationMemberParamsSchema)
export const parseListOrganizationMembersParams = Schema.decodeUnknown(ListOrganizationMembersParamsSchema)
export const parseListPersonOrganizationsParams = Schema.decodeUnknown(ListPersonOrganizationsParamsSchema)
export const parseRemoveOrganizationMemberParams = Schema.decodeUnknown(RemoveOrganizationMemberParamsSchema)
export const parseListOrganizationsParams = Schema.decodeUnknown(ListOrganizationsParamsSchema)
export const parseCreateOrganizationParams = Schema.decodeUnknown(CreateOrganizationParamsSchema)
export const parseGetOrganizationParams = Schema.decodeUnknown(GetOrganizationParamsSchema)
export const parseUpdateOrganizationParams = Schema.decodeUnknown(UpdateOrganizationParamsSchema)
export const parseDeleteOrganizationParams = Schema.decodeUnknown(DeleteOrganizationParamsSchema)

export interface CreateOrganizationResult {
  readonly id: OrganizationId
}

export interface GetOrganizationResult {
  readonly id: OrganizationId
  readonly name: string
  readonly city?: string | undefined
  readonly description?: string | undefined
  readonly members: Count
  readonly url: UrlString
  readonly modifiedOn?: number | undefined
}

export const GetOrganizationResultSchema = Schema.Struct({
  id: OrganizationId,
  name: NonEmptyString,
  city: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
  members: Count,
  url: UrlString,
  modifiedOn: Schema.optional(Schema.Number)
})

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
