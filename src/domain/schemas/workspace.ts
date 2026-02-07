import { Schema } from "effect"

import {
  AccountId,
  EmptyParamsSchema,
  LimitParam,
  makeJsonSchema,
  NonEmptyString,
  PersonUuid,
  RegionId,
  Timestamp,
  WorkspaceUuid
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

export const WorkspaceMemberSchema = Schema.Struct({
  personId: PersonUuid,
  role: AccountRoleSchema,
  name: Schema.optional(Schema.String),
  email: Schema.optional(Schema.String)
}).annotations({
  title: "WorkspaceMember",
  description: "Workspace member with role information"
})

export type WorkspaceMember = Schema.Schema.Type<typeof WorkspaceMemberSchema>

export const WorkspaceInfoSchema = Schema.Struct({
  uuid: WorkspaceUuid,
  name: Schema.String,
  url: Schema.String,
  region: Schema.optional(RegionId),
  createdOn: Timestamp,
  allowReadOnlyGuest: Schema.optional(Schema.Boolean),
  allowGuestSignUp: Schema.optional(Schema.Boolean),
  version: Schema.optional(Schema.String),
  mode: Schema.optional(Schema.String)
}).annotations({
  title: "WorkspaceInfo",
  description: "Workspace information"
})

export type WorkspaceInfo = Schema.Schema.Type<typeof WorkspaceInfoSchema>

export const WorkspaceSummarySchema = Schema.Struct({
  uuid: WorkspaceUuid,
  name: Schema.String,
  url: Schema.String,
  region: Schema.optional(RegionId),
  createdOn: Timestamp,
  lastVisit: Schema.optional(Timestamp)
}).annotations({
  title: "WorkspaceSummary",
  description: "Workspace summary for list operations"
})

export type WorkspaceSummary = Schema.Schema.Type<typeof WorkspaceSummarySchema>

export const RegionInfoSchema = Schema.Struct({
  region: RegionId,
  name: Schema.String
}).annotations({
  title: "RegionInfo",
  description: "Available region information"
})

export type RegionInfo = Schema.Schema.Type<typeof RegionInfoSchema>

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
}).annotations({
  title: "UserProfile",
  description: "User profile information"
})

export type UserProfile = Schema.Schema.Type<typeof UserProfileSchema>

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

export const listWorkspaceMembersParamsJsonSchema = makeJsonSchema(ListWorkspaceMembersParamsSchema)
export const updateMemberRoleParamsJsonSchema = makeJsonSchema(UpdateMemberRoleParamsSchema)
export const listWorkspacesParamsJsonSchema = makeJsonSchema(ListWorkspacesParamsSchema)
export const createWorkspaceParamsJsonSchema = makeJsonSchema(CreateWorkspaceParamsSchema)
export const updateUserProfileParamsJsonSchema = makeJsonSchema(UpdateUserProfileParamsSchema)
export const updateGuestSettingsParamsJsonSchema = makeJsonSchema(UpdateGuestSettingsParamsSchema)
export const getRegionsParamsJsonSchema = makeJsonSchema(GetRegionsParamsSchema)

export const parseListWorkspaceMembersParams = Schema.decodeUnknown(ListWorkspaceMembersParamsSchema)
export const parseUpdateMemberRoleParams = Schema.decodeUnknown(UpdateMemberRoleParamsSchema)
export const parseListWorkspacesParams = Schema.decodeUnknown(ListWorkspacesParamsSchema)
export const parseCreateWorkspaceParams = Schema.decodeUnknown(CreateWorkspaceParamsSchema)
export const parseUpdateUserProfileParams = Schema.decodeUnknown(UpdateUserProfileParamsSchema)
export const parseUpdateGuestSettingsParams = Schema.decodeUnknown(UpdateGuestSettingsParamsSchema)
export const parseGetRegionsParams = Schema.decodeUnknown(GetRegionsParamsSchema)

// --- Result Schemas ---

export const UpdateMemberRoleResultSchema = Schema.Struct({
  accountId: AccountId,
  role: AccountRoleSchema,
  updated: Schema.Boolean
}).annotations({ title: "UpdateMemberRoleResult", description: "Result of update member role operation" })
export type UpdateMemberRoleResult = Schema.Schema.Type<typeof UpdateMemberRoleResultSchema>

export const CreateWorkspaceResultSchema = Schema.Struct({
  uuid: WorkspaceUuid,
  url: Schema.String,
  name: Schema.String
}).annotations({ title: "CreateWorkspaceResult", description: "Result of create workspace operation" })
export type CreateWorkspaceResult = Schema.Schema.Type<typeof CreateWorkspaceResultSchema>

export const DeleteWorkspaceResultSchema = Schema.Struct({
  deleted: Schema.Boolean
}).annotations({ title: "DeleteWorkspaceResult", description: "Result of delete workspace operation" })
export type DeleteWorkspaceResult = Schema.Schema.Type<typeof DeleteWorkspaceResultSchema>

export const UpdateUserProfileResultSchema = Schema.Struct({
  updated: Schema.Boolean
}).annotations({ title: "UpdateUserProfileResult", description: "Result of update user profile operation" })
export type UpdateUserProfileResult = Schema.Schema.Type<typeof UpdateUserProfileResultSchema>

export const UpdateGuestSettingsResultSchema = Schema.Struct({
  updated: Schema.Boolean,
  allowReadOnly: Schema.optional(Schema.Boolean),
  allowSignUp: Schema.optional(Schema.Boolean)
}).annotations({ title: "UpdateGuestSettingsResult", description: "Result of update guest settings operation" })
export type UpdateGuestSettingsResult = Schema.Schema.Type<typeof UpdateGuestSettingsResultSchema>
