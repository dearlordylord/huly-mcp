import { JSONSchema, Schema } from "effect"

import type { ListTotal } from "./shared.js"
import {
  AccountUuid,
  assertUpdateFields,
  atLeastOneUpdateFieldMessage,
  Count,
  DEFAULT_LIMIT,
  hasAtLeastOneDefined,
  LimitParam,
  NonEmptyString,
  ObjectClassName,
  PermissionId,
  RoleId,
  SpaceClassFilter,
  SpaceId,
  SpaceIdentifier,
  SpaceTypeId,
  SpaceTypeIdentifier,
  withAtLeastOneRequired
} from "./shared.js"

const limitDescription = (subject: string): string => `Maximum ${subject} to return (default: ${DEFAULT_LIMIT}).`

export const SpacePermissionScopeSchema = Schema.Literal("space", "workspace")
export type SpacePermissionScope = Schema.Schema.Type<typeof SpacePermissionScopeSchema>

export const SpaceMemberIdentifier = NonEmptyString.pipe(Schema.brand("SpaceMemberIdentifier"))
export type SpaceMemberIdentifier = Schema.Schema.Type<typeof SpaceMemberIdentifier>

const SpaceMemberIdentifierSchema = SpaceMemberIdentifier.annotations({
  description:
    "Workspace member to resolve. Accepts a Huly account UUID directly, an exact email address, or an exact person display name."
})

export const SpaceRoleAssignmentSchema = Schema.Struct({
  roleId: RoleId,
  members: Schema.Array(AccountUuid)
})
export type SpaceRoleAssignment = Schema.Schema.Type<typeof SpaceRoleAssignmentSchema>

export const SpaceSummarySchema = Schema.Struct({
  id: SpaceId,
  name: NonEmptyString,
  description: Schema.optional(Schema.String),
  class: ObjectClassName,
  type: Schema.optional(SpaceTypeId),
  private: Schema.Boolean,
  archived: Schema.Boolean,
  autoJoin: Schema.optional(Schema.Boolean),
  membersCount: Count,
  ownersCount: Count
})
export type SpaceSummary = Schema.Schema.Type<typeof SpaceSummarySchema>

export const SpaceDetailSchema = Schema.Struct({
  id: SpaceId,
  name: NonEmptyString,
  description: Schema.String,
  class: ObjectClassName,
  type: Schema.optional(SpaceTypeId),
  private: Schema.Boolean,
  archived: Schema.Boolean,
  autoJoin: Schema.optional(Schema.Boolean),
  members: Schema.Array(AccountUuid),
  owners: Schema.Array(AccountUuid),
  roleAssignments: Schema.optional(Schema.Array(SpaceRoleAssignmentSchema))
})
export type SpaceDetail = Schema.Schema.Type<typeof SpaceDetailSchema>

export const SpaceTypeSummarySchema = Schema.Struct({
  id: SpaceTypeId,
  name: NonEmptyString,
  shortDescription: Schema.optional(Schema.String),
  descriptor: NonEmptyString,
  baseClass: Schema.optional(ObjectClassName),
  targetClass: ObjectClassName,
  defaultMembers: Schema.Array(AccountUuid),
  autoJoin: Schema.optional(Schema.Boolean),
  rolesCount: Count
})
export type SpaceTypeSummary = Schema.Schema.Type<typeof SpaceTypeSummarySchema>

export const SpacePermissionSummarySchema = Schema.Struct({
  id: PermissionId,
  label: NonEmptyString,
  description: Schema.optional(Schema.String),
  scope: Schema.optional(SpacePermissionScopeSchema),
  objectClass: Schema.optional(ObjectClassName),
  txClass: Schema.optional(ObjectClassName),
  forbid: Schema.optional(Schema.Boolean)
})
export type SpacePermissionSummary = Schema.Schema.Type<typeof SpacePermissionSummarySchema>

export const SpaceRoleSummarySchema = Schema.Struct({
  id: RoleId,
  name: NonEmptyString,
  permissions: Schema.Array(PermissionId),
  permissionLabels: Schema.Array(NonEmptyString)
})
export type SpaceRoleSummary = Schema.Schema.Type<typeof SpaceRoleSummarySchema>

export const SpaceTypeDetailSchema = Schema.Struct({
  id: SpaceTypeId,
  name: NonEmptyString,
  shortDescription: Schema.optional(Schema.String),
  descriptor: NonEmptyString,
  descriptorName: Schema.optional(NonEmptyString),
  descriptorDescription: Schema.optional(NonEmptyString),
  baseClass: Schema.optional(ObjectClassName),
  targetClass: ObjectClassName,
  defaultMembers: Schema.Array(AccountUuid),
  autoJoin: Schema.optional(Schema.Boolean),
  roles: Schema.Array(SpaceRoleSummarySchema),
  availablePermissions: Schema.Array(SpacePermissionSummarySchema)
})
export type SpaceTypeDetail = Schema.Schema.Type<typeof SpaceTypeDetailSchema>

export const ListSpacesParamsSchema = Schema.Struct({
  includeArchived: Schema.optional(Schema.Boolean.annotations({
    description:
      "Include archived spaces in results. Defaults to false, so only active/non-archived spaces are returned."
  })),
  class: Schema.optional(SpaceClassFilter.annotations({
    description:
      "Optional raw Huly space class ID to filter results, for example 'tracker:class:Project' or 'document:class:Teamspace'."
  })),
  type: Schema.optional(SpaceTypeId.annotations({
    description: "Optional raw Huly SpaceType _id to filter typed spaces."
  })),
  limit: Schema.optional(LimitParam.annotations({ description: limitDescription("spaces") }))
})
export type ListSpacesParams = Schema.Schema.Type<typeof ListSpacesParamsSchema>

export interface ListSpacesResult {
  readonly spaces: ReadonlyArray<SpaceSummary>
  readonly total: ListTotal
}

export const GetSpaceParamsSchema = Schema.Struct({
  space: SpaceIdentifier.annotations({
    description:
      "Space _id or exact space name. Resolution tries _id first, then exact name. Duplicate names require class and/or type narrowing."
  }),
  includeArchived: Schema.optional(Schema.Boolean.annotations({
    description:
      "Allow matching archived spaces by exact name. Defaults to false for name lookup. ID lookup can return archived spaces."
  })),
  class: Schema.optional(SpaceClassFilter.annotations({
    description: "Optional raw Huly space class ID used to disambiguate exact-name lookup."
  })),
  type: Schema.optional(SpaceTypeId.annotations({
    description: "Optional raw Huly SpaceType _id used to disambiguate exact-name lookup."
  }))
})
export type GetSpaceParams = Schema.Schema.Type<typeof GetSpaceParamsSchema>

export const ListSpaceTypesParamsSchema = Schema.Struct({
  targetClass: Schema.optional(SpaceClassFilter.annotations({
    description: "Optional raw Huly target space class ID to filter configured space types."
  })),
  limit: Schema.optional(LimitParam.annotations({ description: limitDescription("space types") }))
})
export type ListSpaceTypesParams = Schema.Schema.Type<typeof ListSpaceTypesParamsSchema>

export interface ListSpaceTypesResult {
  readonly spaceTypes: ReadonlyArray<SpaceTypeSummary>
  readonly total: ListTotal
}

export const GetSpaceTypeParamsSchema = Schema.Struct({
  spaceType: SpaceTypeIdentifier.annotations({
    description: "SpaceType _id or exact name. Resolution tries _id first, then exact name."
  })
})
export type GetSpaceTypeParams = Schema.Schema.Type<typeof GetSpaceTypeParamsSchema>

export const ListSpacePermissionsParamsSchema = Schema.Struct({
  scope: Schema.optional(SpacePermissionScopeSchema.annotations({
    description: "Filter permissions by Huly scope: space or workspace."
  })),
  objectClass: Schema.optional(SpaceClassFilter.annotations({
    description: "Filter permissions bound to this raw Huly object class ID."
  })),
  search: Schema.optional(NonEmptyString.annotations({
    description: "Case-insensitive substring search across permission id, label, and description."
  })),
  limit: Schema.optional(LimitParam.annotations({ description: limitDescription("permissions") }))
})
export type ListSpacePermissionsParams = Schema.Schema.Type<typeof ListSpacePermissionsParamsSchema>

export interface ListSpacePermissionsResult {
  readonly permissions: ReadonlyArray<SpacePermissionSummary>
  readonly total: ListTotal
}

export const UPDATE_SPACE_FIELDS = ["name", "description", "private", "archived", "autoJoin"] as const

export const UpdateSpaceParamsSchema = Schema.Struct({
  space: SpaceIdentifier.annotations({
    description:
      "Space _id or exact space name to update. Use class/type narrowing if the name is shared by multiple spaces."
  }),
  class: Schema.optional(SpaceClassFilter.annotations({
    description: "Optional raw Huly space class ID used to disambiguate exact-name lookup."
  })),
  type: Schema.optional(SpaceTypeId.annotations({
    description: "Optional raw Huly SpaceType _id used to disambiguate exact-name lookup."
  })),
  name: Schema.optional(NonEmptyString.annotations({ description: "New space display name." })),
  description: Schema.optional(
    Schema.String.annotations({ description: "New plain-text description. Use an empty string to clear." })
  ),
  private: Schema.optional(Schema.Boolean.annotations({ description: "Whether the space is private." })),
  archived: Schema.optional(Schema.Boolean.annotations({ description: "Whether the space is archived." })),
  autoJoin: Schema.optional(
    Schema.Boolean.annotations({ description: "Whether workspace members should auto-join the space when supported." })
  )
}).pipe(
  Schema.filter((params) =>
    hasAtLeastOneDefined(params, UPDATE_SPACE_FIELDS)
      ? undefined
      : atLeastOneUpdateFieldMessage(UPDATE_SPACE_FIELDS)
  )
)
export type UpdateSpaceParams = Schema.Schema.Type<typeof UpdateSpaceParamsSchema>
assertUpdateFields<UpdateSpaceParams>()(["space", "class", "type"], UPDATE_SPACE_FIELDS)

export interface UpdateSpaceResult {
  readonly id: SpaceId
  readonly updated: boolean
}

export const SpaceMemberMutationParamsSchema = Schema.Struct({
  space: SpaceIdentifier.annotations({
    description:
      "Space _id or exact space name whose members should change. Use class/type narrowing if the name is shared by multiple spaces."
  }),
  class: Schema.optional(SpaceClassFilter.annotations({
    description: "Optional raw Huly space class ID used to disambiguate exact-name lookup."
  })),
  type: Schema.optional(SpaceTypeId.annotations({
    description: "Optional raw Huly SpaceType _id used to disambiguate exact-name lookup."
  })),
  members: Schema.Array(SpaceMemberIdentifierSchema).pipe(Schema.minItems(1)).annotations({
    description:
      "Members to add or remove. Each entry may be an account UUID, exact email address, or exact person name."
  })
})
export type SpaceMemberMutationParams = Schema.Schema.Type<typeof SpaceMemberMutationParamsSchema>

export interface SpaceMemberMutationResult {
  readonly id: SpaceId
  readonly members: ReadonlyArray<AccountUuid>
  readonly changed: boolean
}

export const SetSpaceOwnersParamsSchema = Schema.Struct({
  space: SpaceIdentifier.annotations({
    description:
      "Space _id or exact space name whose owners should be replaced. Use class/type narrowing if the name is shared by multiple spaces."
  }),
  class: Schema.optional(SpaceClassFilter.annotations({
    description: "Optional raw Huly space class ID used to disambiguate exact-name lookup."
  })),
  type: Schema.optional(SpaceTypeId.annotations({
    description: "Optional raw Huly SpaceType _id used to disambiguate exact-name lookup."
  })),
  owners: Schema.Array(SpaceMemberIdentifierSchema).annotations({
    description:
      "Replacement owner list. Each entry may be an account UUID, exact email address, or exact person name. Pass [] to clear owners."
  }),
  ensureMembers: Schema.optional(Schema.Boolean.annotations({
    description: "Also add each owner to members. Defaults to true."
  }))
})
export type SetSpaceOwnersParams = Schema.Schema.Type<typeof SetSpaceOwnersParamsSchema>

export interface SetSpaceOwnersResult {
  readonly id: SpaceId
  readonly owners: ReadonlyArray<AccountUuid>
  readonly members: ReadonlyArray<AccountUuid>
  readonly changed: boolean
}

export const listSpacesParamsJsonSchema = JSONSchema.make(ListSpacesParamsSchema)
export const getSpaceParamsJsonSchema = JSONSchema.make(GetSpaceParamsSchema)
export const listSpaceTypesParamsJsonSchema = JSONSchema.make(ListSpaceTypesParamsSchema)
export const getSpaceTypeParamsJsonSchema = JSONSchema.make(GetSpaceTypeParamsSchema)
export const listSpacePermissionsParamsJsonSchema = JSONSchema.make(ListSpacePermissionsParamsSchema)
export const updateSpaceParamsJsonSchema = withAtLeastOneRequired(
  JSONSchema.make(UpdateSpaceParamsSchema),
  UPDATE_SPACE_FIELDS
)
export const spaceMemberMutationParamsJsonSchema = JSONSchema.make(SpaceMemberMutationParamsSchema)
export const setSpaceOwnersParamsJsonSchema = JSONSchema.make(SetSpaceOwnersParamsSchema)

export const parseListSpacesParams = Schema.decodeUnknown(ListSpacesParamsSchema)
export const parseGetSpaceParams = Schema.decodeUnknown(GetSpaceParamsSchema)
export const parseListSpaceTypesParams = Schema.decodeUnknown(ListSpaceTypesParamsSchema)
export const parseGetSpaceTypeParams = Schema.decodeUnknown(GetSpaceTypeParamsSchema)
export const parseListSpacePermissionsParams = Schema.decodeUnknown(ListSpacePermissionsParamsSchema)
export const parseUpdateSpaceParams = Schema.decodeUnknown(UpdateSpaceParamsSchema)
export const parseSpaceMemberMutationParams = Schema.decodeUnknown(SpaceMemberMutationParamsSchema)
export const parseSetSpaceOwnersParams = Schema.decodeUnknown(SetSpaceOwnersParamsSchema)
