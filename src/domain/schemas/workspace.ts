import { JSONSchema, Schema } from "effect"

import type { PersonName, UrlString } from "./shared.js"
import {
  AccountId,
  Email,
  EmptyParamsSchema,
  LimitParam,
  NonEmptyString,
  PersonUuid,
  RegionId,
  UrlString as UrlStringSchema,
  WorkspaceMode,
  WorkspaceName,
  WorkspaceUuid,
  WorkspaceVersion
} from "./shared.js"

export const AccountRoleSchema = Schema.Literal(
  "READONLYGUEST",
  "DocGuest",
  "GUEST",
  "USER",
  "MAINTAINER",
  "OWNER",
  "ADMIN"
).annotations({
  title: "AccountRole",
  description: "Workspace member role"
})

export type AccountRole = Schema.Schema.Type<typeof AccountRoleSchema>

export const AccountRoleValues = [
  "READONLYGUEST",
  "DocGuest",
  "GUEST",
  "USER",
  "MAINTAINER",
  "OWNER",
  "ADMIN"
] as const

// No codec needed — internal type, not used for runtime validation
export interface WorkspaceMember {
  readonly personId: PersonUuid
  readonly role: AccountRole
  readonly name?: PersonName | undefined
  readonly email?: Email | undefined
}

export interface WorkspaceInfo {
  readonly uuid: WorkspaceUuid
  readonly name: WorkspaceName
  readonly url: UrlString
  readonly region?: RegionId | undefined
  readonly createdOn: number
  readonly allowReadOnlyGuest?: boolean | undefined
  readonly allowGuestSignUp?: boolean | undefined
  readonly version?: WorkspaceVersion | undefined
  readonly mode?: WorkspaceMode | undefined
}

export interface WorkspaceSummary {
  readonly uuid: WorkspaceUuid
  readonly name: WorkspaceName
  readonly url: UrlString
  readonly region?: RegionId | undefined
  readonly createdOn: number
  readonly lastVisit?: number | undefined
}

export interface RegionInfo {
  readonly region: RegionId
  readonly name: string
}

export interface UserProfile {
  readonly personUuid: PersonUuid
  readonly firstName: string
  readonly lastName: string
  readonly bio?: string | undefined
  readonly city?: string | undefined
  readonly country?: string | undefined
  readonly website?: string | undefined
  readonly socialLinks?: { readonly [x: string]: string } | undefined
  readonly isPublic: boolean
}

export const ListWorkspaceMembersParamsSchema = Schema.Struct({
  limit: Schema.optional(
    LimitParam.annotations({
      description: "Maximum number of members to return (default: 50)"
    })
  )
}).annotations({
  title: "ListWorkspaceMembersParams",
  description: "Parameters for listing workspace members"
})

export type ListWorkspaceMembersParams = Schema.Schema.Type<typeof ListWorkspaceMembersParamsSchema>

export const UpdateMemberRoleParamsSchema = Schema.Struct({
  accountId: AccountId.annotations({
    description: "Account UUID of the member"
  }),
  role: AccountRoleSchema.annotations({
    description: "New role for the member"
  })
}).annotations({
  title: "UpdateMemberRoleParams",
  description: "Parameters for updating a member's role"
})

export type UpdateMemberRoleParams = Schema.Schema.Type<typeof UpdateMemberRoleParamsSchema>

export const ListWorkspacesParamsSchema = Schema.Struct({
  limit: Schema.optional(
    LimitParam.annotations({
      description: "Maximum number of workspaces to return (default: 50)"
    })
  )
}).annotations({
  title: "ListWorkspacesParams",
  description: "Parameters for listing workspaces"
})

export type ListWorkspacesParams = Schema.Schema.Type<typeof ListWorkspacesParamsSchema>

export const CreateWorkspaceParamsSchema = Schema.Struct({
  name: NonEmptyString.annotations({
    description: "Name for the new workspace"
  }),
  region: Schema.optional(
    RegionId.annotations({
      description: "Region for the workspace (optional)"
    })
  )
}).annotations({
  title: "CreateWorkspaceParams",
  description: "Parameters for creating a workspace"
})

export type CreateWorkspaceParams = Schema.Schema.Type<typeof CreateWorkspaceParamsSchema>

export const UpdateUserProfileParamsSchema = Schema.Struct({
  bio: Schema.optional(
    Schema.NullOr(Schema.String).annotations({
      description: "Bio text (null to clear)"
    })
  ),
  city: Schema.optional(
    Schema.NullOr(Schema.String).annotations({
      description: "City (null to clear)"
    })
  ),
  country: Schema.optional(
    Schema.NullOr(Schema.String).annotations({
      description: "Country (null to clear)"
    })
  ),
  website: Schema.optional(
    Schema.NullOr(Schema.String).annotations({
      description: "Website URL (null to clear)"
    })
  ),
  socialLinks: Schema.optional(
    Schema.NullOr(Schema.Record({ key: Schema.String, value: Schema.String })).annotations({
      description: "Social links as key-value pairs (null to clear)"
    })
  ),
  isPublic: Schema.optional(
    Schema.Boolean.annotations({
      description: "Whether profile is public"
    })
  )
}).annotations({
  title: "UpdateUserProfileParams",
  description: "Parameters for updating user profile"
})

export type UpdateUserProfileParams = Schema.Schema.Type<typeof UpdateUserProfileParamsSchema>

export const UpdateGuestSettingsParamsSchema = Schema.Struct({
  allowReadOnly: Schema.optional(
    Schema.Boolean.annotations({
      description: "Allow read-only guests"
    })
  ),
  allowSignUp: Schema.optional(
    Schema.Boolean.annotations({
      description: "Allow guest sign-up"
    })
  )
}).annotations({
  title: "UpdateGuestSettingsParams",
  description: "Parameters for updating guest settings"
})

export type UpdateGuestSettingsParams = Schema.Schema.Type<typeof UpdateGuestSettingsParamsSchema>

export const GetRegionsParamsSchema = EmptyParamsSchema

export type GetRegionsParams = Schema.Schema.Type<typeof GetRegionsParamsSchema>

export const listWorkspaceMembersParamsJsonSchema = JSONSchema.make(ListWorkspaceMembersParamsSchema)
export const updateMemberRoleParamsJsonSchema = JSONSchema.make(UpdateMemberRoleParamsSchema)
export const listWorkspacesParamsJsonSchema = JSONSchema.make(ListWorkspacesParamsSchema)
export const createWorkspaceParamsJsonSchema = JSONSchema.make(CreateWorkspaceParamsSchema)
export const updateUserProfileParamsJsonSchema = JSONSchema.make(UpdateUserProfileParamsSchema)
export const updateGuestSettingsParamsJsonSchema = JSONSchema.make(UpdateGuestSettingsParamsSchema)
export const getRegionsParamsJsonSchema = JSONSchema.make(GetRegionsParamsSchema)

export const parseListWorkspaceMembersParams = Schema.decodeUnknown(ListWorkspaceMembersParamsSchema)
export const parseUpdateMemberRoleParams = Schema.decodeUnknown(UpdateMemberRoleParamsSchema)
export const parseListWorkspacesParams = Schema.decodeUnknown(ListWorkspacesParamsSchema)
export const parseCreateWorkspaceParams = Schema.decodeUnknown(CreateWorkspaceParamsSchema)
export const parseUpdateUserProfileParams = Schema.decodeUnknown(UpdateUserProfileParamsSchema)
export const parseUpdateGuestSettingsParams = Schema.decodeUnknown(UpdateGuestSettingsParamsSchema)
export const parseGetRegionsParams = Schema.decodeUnknown(GetRegionsParamsSchema)

// No codec needed — internal type, not used for runtime validation
export interface UpdateMemberRoleResult {
  readonly accountId: AccountId
  readonly role: AccountRole
  readonly updated: boolean
}

export interface CreateWorkspaceResult {
  readonly uuid: WorkspaceUuid
  readonly url: UrlString
  readonly name: WorkspaceName
}

export interface DeleteWorkspaceResult {
  readonly deleted: boolean
}

export interface UpdateUserProfileResult {
  readonly updated: boolean
}

export interface UpdateGuestSettingsResult {
  readonly updated: boolean
  readonly allowReadOnly?: boolean | undefined
  readonly allowSignUp?: boolean | undefined
}

export const WorkspaceMemberSchema = Schema.Struct({
  personId: PersonUuid,
  role: AccountRoleSchema,
  name: Schema.optional(NonEmptyString),
  email: Schema.optional(Email)
})

export const WorkspaceInfoSchema = Schema.Struct({
  uuid: WorkspaceUuid,
  name: WorkspaceName,
  url: UrlStringSchema,
  region: Schema.optional(RegionId),
  createdOn: Schema.Number,
  allowReadOnlyGuest: Schema.optional(Schema.Boolean),
  allowGuestSignUp: Schema.optional(Schema.Boolean),
  version: Schema.optional(WorkspaceVersion),
  mode: Schema.optional(WorkspaceMode)
})

export const WorkspaceSummarySchema = Schema.Struct({
  uuid: WorkspaceUuid,
  name: WorkspaceName,
  url: UrlStringSchema,
  region: Schema.optional(RegionId),
  createdOn: Schema.Number,
  lastVisit: Schema.optional(Schema.Number)
})

export const RegionInfoSchema = Schema.Struct({
  region: RegionId,
  name: Schema.String
})

export const UserProfileSchema = Schema.Struct({
  personUuid: PersonUuid,
  firstName: Schema.String,
  lastName: Schema.String,
  bio: Schema.optional(Schema.String),
  city: Schema.optional(Schema.String),
  country: Schema.optional(Schema.String),
  website: Schema.optional(Schema.String),
  socialLinks: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.String })),
  isPublic: Schema.Boolean
})

export const UpdateMemberRoleResultSchema = Schema.Struct({
  accountId: AccountId,
  role: AccountRoleSchema,
  updated: Schema.Boolean
})

export const CreateWorkspaceResultSchema = Schema.Struct({
  uuid: WorkspaceUuid,
  url: UrlStringSchema,
  name: WorkspaceName
})

export const DeleteWorkspaceResultSchema = Schema.Struct({
  deleted: Schema.Boolean
})

export const UpdateUserProfileResultSchema = Schema.Struct({
  updated: Schema.Boolean
})

export const UpdateGuestSettingsResultSchema = Schema.Struct({
  updated: Schema.Boolean,
  allowReadOnly: Schema.optional(Schema.Boolean),
  allowSignUp: Schema.optional(Schema.Boolean)
})

export const ListWorkspaceMembersResultSchema = Schema.Array(WorkspaceMemberSchema)
export const ListWorkspacesResultSchema = Schema.Array(WorkspaceSummarySchema)
export const GetRegionsResultSchema = Schema.Array(RegionInfoSchema)
export const GetUserProfileResultSchema = Schema.NullOr(UserProfileSchema)
