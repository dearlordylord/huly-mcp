import {
  createSpaceParamsJsonSchema,
  getGlobalSpaceAdminsParamsJsonSchema,
  parseCreateSpaceParams,
  parseGetGlobalSpaceAdminsParams,
  parseSetGlobalSpaceAdminsParams,
  setGlobalSpaceAdminsParamsJsonSchema,
  CreateSpaceResultSchema,
  GetGlobalSpaceAdminsResultSchema,
  SetGlobalSpaceAdminsResultSchema
} from "../../domain/schemas/spaces-administration.js"
import {
  getSpaceParamsJsonSchema,
  getSpaceTypeParamsJsonSchema,
  listSpacePermissionsParamsJsonSchema,
  listSpacesParamsJsonSchema,
  listSpaceTypesParamsJsonSchema,
  parseGetSpaceParams,
  parseGetSpaceTypeParams,
  parseListSpacePermissionsParams,
  parseListSpacesParams,
  parseListSpaceTypesParams,
  parseSetSpaceOwnersParams,
  parseSetSpaceRoleMembersParams,
  parseSpaceMemberMutationParams,
  parseSpaceRoleMemberMutationParams,
  parseUpdateSpaceParams,
  setSpaceOwnersParamsJsonSchema,
  setSpaceRoleMembersParamsJsonSchema,
  spaceMemberMutationParamsJsonSchema,
  spaceRoleMemberMutationParamsJsonSchema,
  updateSpaceParamsJsonSchema,
  AddSpaceMembersResultSchema,
  AddSpaceRoleMembersResultSchema,
  GetSpaceResultSchema,
  GetSpaceTypeResultSchema,
  ListSpacePermissionsResultSchema,
  ListSpacesResultSchema,
  ListSpaceTypesResultSchema,
  RemoveSpaceMembersResultSchema,
  RemoveSpaceRoleMembersResultSchema,
  SetSpaceOwnersResultSchema,
  SetSpaceRoleMembersResultSchema,
  UpdateSpaceResultSchema
} from "../../domain/schemas/spaces.js"
import { DEFAULT_INCLUDE_ARCHIVED } from "../../domain/schemas/shared.js"

import {
  addSpaceMembers,
  addSpaceRoleMembers,
  createSpace,
  getGlobalSpaceAdmins,
  getSpace,
  getSpaceType,
  listSpacePermissions,
  listSpaces,
  listSpaceTypes,
  removeSpaceMembers,
  removeSpaceRoleMembers,
  setSpaceOwners,
  setGlobalSpaceAdmins,
  setSpaceRoleMembers,
  updateSpace
} from "../../huly/operations/spaces.js"
import { defineTool, type RegisteredTool } from "./registry.js"

const CATEGORY = "spaces" as const

export const spaceTools = [
  defineTool(
    {
      name: "list_spaces",
      description: `List generic Huly spaces across modules. When includeArchived is omitted, includeArchived=${DEFAULT_INCLUDE_ARCHIVED}. Returns raw space id, class, type, privacy, archived, autoJoin, member count, and owner count so module-specific tools can reuse the result.`,
      category: CATEGORY,
      inputSchema: listSpacesParamsJsonSchema,
      resultSchema: ListSpacesResultSchema
    },
    parseListSpacesParams,
    listSpaces
  ),
  defineTool(
    {
      name: "get_space",
      description:
        "Get one generic Huly space by raw space _id or exact space name. Resolution tries _id first, then exact name. If a name matches multiple spaces, pass class and/or type to narrow; ambiguous errors include matching ids/classes/types.",
      category: CATEGORY,
      inputSchema: getSpaceParamsJsonSchema,
      resultSchema: GetSpaceResultSchema
    },
    parseGetSpaceParams,
    getSpace
  ),
  defineTool(
    {
      name: "list_space_types",
      description:
        "List configured Huly SpaceType records. Returns descriptor id, base class, target class, default members, autoJoin, and role count for discovering typed-space configuration.",
      category: CATEGORY,
      inputSchema: listSpaceTypesParamsJsonSchema,
      resultSchema: ListSpaceTypesResultSchema
    },
    parseListSpaceTypesParams,
    listSpaceTypes
  ),
  defineTool(
    {
      name: "get_space_type",
      description:
        "Get one Huly SpaceType by raw SpaceType _id or exact name, including descriptor metadata, role definitions, role permission ids/labels, and available permissions.",
      category: CATEGORY,
      inputSchema: getSpaceTypeParamsJsonSchema,
      resultSchema: GetSpaceTypeResultSchema
    },
    parseGetSpaceTypeParams,
    getSpaceType
  ),
  defineTool(
    {
      name: "list_space_permissions",
      description:
        "List core Huly Permission records for space/workspace access control discovery. Filter by scope, objectClass, or search text. This is read-only and does not assign permissions.",
      category: CATEGORY,
      inputSchema: listSpacePermissionsParamsJsonSchema,
      resultSchema: ListSpacePermissionsResultSchema
    },
    parseListSpacePermissionsParams,
    listSpacePermissions
  ),
  defineTool(
    {
      name: "create_space",
      description:
        "Create a generic Huly typed space by SpaceType _id or exact name. This single call resolves member, owner, and role locators; applies SpaceType default members; and creates role assignments. For safety, only non-system types whose SDK descriptor base class is exactly core:class:TypedSpace are supported. Specialized project, teamspace, drive, funnel, vacancy, and similar types fail with a typed error directing callers to their purpose-built tools. Defaults: private=false, autoJoin=false, restricted=false, owners=[calling account].",
      category: CATEGORY,
      inputSchema: createSpaceParamsJsonSchema,
      annotations: { destructiveHint: false },
      resultSchema: CreateSpaceResultSchema
    },
    parseCreateSpaceParams,
    createSpace
  ),
  defineTool(
    {
      name: "get_global_space_admins",
      description:
        "Get the workspace-wide Huly space administrators from the stable core Admin role on the all-spaces typed space. Returns account UUIDs and requires no raw space, role, or mixin refs.",
      category: CATEGORY,
      inputSchema: getGlobalSpaceAdminsParamsJsonSchema,
      resultSchema: GetGlobalSpaceAdminsResultSchema
    },
    parseGetGlobalSpaceAdminsParams,
    getGlobalSpaceAdmins
  ),
  defineTool(
    {
      name: "set_global_space_admins",
      description:
        "Replace the workspace-wide Huly space-admin list. Admins accept account UUIDs, exact emails, or exact person display names; pass admins=[] to clear the role. The tool resolves the stable core all-spaces space and Admin role internally.",
      category: CATEGORY,
      inputSchema: setGlobalSpaceAdminsParamsJsonSchema,
      annotations: { idempotentHint: true, destructiveHint: true },
      resultSchema: SetGlobalSpaceAdminsResultSchema
    },
    parseSetGlobalSpaceAdminsParams,
    setGlobalSpaceAdmins
  ),
  defineTool(
    {
      name: "update_space",
      description:
        "Update safe common metadata on an existing Huly space: name, description, private, archived, and autoJoin. Does not create/delete spaces or mutate module-specific required fields.",
      category: CATEGORY,
      inputSchema: updateSpaceParamsJsonSchema,
      resultSchema: UpdateSpaceResultSchema
    },
    parseUpdateSpaceParams,
    updateSpace
  ),
  defineTool(
    {
      name: "add_space_members",
      description:
        "Idempotently add members to an existing Huly space. Members accept account UUID, exact email, or exact person display name and resolve to Huly account UUIDs before replacing the full members array.",
      category: CATEGORY,
      inputSchema: spaceMemberMutationParamsJsonSchema,
      resultSchema: AddSpaceMembersResultSchema
    },
    parseSpaceMemberMutationParams,
    addSpaceMembers
  ),
  defineTool(
    {
      name: "remove_space_members",
      description:
        "Idempotently remove members from an existing Huly space. Members accept account UUID, exact email, or exact person display name and resolve to Huly account UUIDs before replacing the full members array.",
      category: CATEGORY,
      inputSchema: spaceMemberMutationParamsJsonSchema,
      resultSchema: RemoveSpaceMembersResultSchema
    },
    parseSpaceMemberMutationParams,
    removeSpaceMembers
  ),
  defineTool(
    {
      name: "set_space_owners",
      description:
        "Replace owners on an existing Huly space. Owners accept account UUID, exact email, or exact person display name. By default, owners are also ensured in members.",
      category: CATEGORY,
      inputSchema: setSpaceOwnersParamsJsonSchema,
      resultSchema: SetSpaceOwnersResultSchema
    },
    parseSetSpaceOwnersParams,
    setSpaceOwners
  ),
  defineTool(
    {
      name: "set_space_role_members",
      description:
        "Replace members assigned to one role on a typed Huly space while preserving all other role assignments. Role accepts a raw role _id or exact role name from the space's SpaceType. Members accept account UUID, exact email, or exact person display name; pass members=[] to clear this role.",
      category: CATEGORY,
      inputSchema: setSpaceRoleMembersParamsJsonSchema,
      annotations: { idempotentHint: true, destructiveHint: false },
      resultSchema: SetSpaceRoleMembersResultSchema
    },
    parseSetSpaceRoleMembersParams,
    setSpaceRoleMembers
  ),
  defineTool(
    {
      name: "add_space_role_members",
      description:
        "Idempotently add members to one role on a typed Huly space while preserving all other role assignments. Role accepts a raw role _id or exact role name from the space's SpaceType. Members accept account UUID, exact email, or exact person display name.",
      category: CATEGORY,
      inputSchema: spaceRoleMemberMutationParamsJsonSchema,
      annotations: { idempotentHint: true, destructiveHint: false },
      resultSchema: AddSpaceRoleMembersResultSchema
    },
    parseSpaceRoleMemberMutationParams,
    addSpaceRoleMembers
  ),
  defineTool(
    {
      name: "remove_space_role_members",
      description:
        "Idempotently remove members from one role on a typed Huly space while preserving all other role assignments. Role accepts a raw role _id or exact role name from the space's SpaceType. Members accept account UUID, exact email, or exact person display name.",
      category: CATEGORY,
      inputSchema: spaceRoleMemberMutationParamsJsonSchema,
      annotations: { idempotentHint: true, destructiveHint: false },
      resultSchema: RemoveSpaceRoleMembersResultSchema
    },
    parseSpaceRoleMemberMutationParams,
    removeSpaceRoleMembers
  )
] as const satisfies ReadonlyArray<RegisteredTool>
