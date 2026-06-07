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
  parseSpaceMemberMutationParams,
  parseUpdateSpaceParams,
  setSpaceOwnersParamsJsonSchema,
  spaceMemberMutationParamsJsonSchema,
  updateSpaceParamsJsonSchema
} from "../../domain/schemas.js"
import {
  addSpaceMembers,
  getSpace,
  getSpaceType,
  listSpacePermissions,
  listSpaces,
  listSpaceTypes,
  removeSpaceMembers,
  setSpaceOwners,
  updateSpace
} from "../../huly/operations/spaces.js"
import { createToolHandler, type RegisteredTool } from "./registry.js"

const CATEGORY = "spaces" as const

export const spaceTools: ReadonlyArray<RegisteredTool> = [
  {
    name: "list_spaces",
    description:
      "List generic Huly spaces across modules. Defaults to active/non-archived spaces. Returns raw space id, class, type, privacy, archived, autoJoin, member count, and owner count so module-specific tools can reuse the result.",
    category: CATEGORY,
    inputSchema: listSpacesParamsJsonSchema,
    handler: createToolHandler("list_spaces", parseListSpacesParams, listSpaces)
  },
  {
    name: "get_space",
    description:
      "Get one generic Huly space by raw space _id or exact space name. Resolution tries _id first, then exact name. If a name matches multiple spaces, pass class and/or type to narrow; ambiguous errors include matching ids/classes/types.",
    category: CATEGORY,
    inputSchema: getSpaceParamsJsonSchema,
    handler: createToolHandler("get_space", parseGetSpaceParams, getSpace)
  },
  {
    name: "list_space_types",
    description:
      "List configured Huly SpaceType records. Returns descriptor id, base class, target class, default members, autoJoin, and role count for discovering typed-space configuration.",
    category: CATEGORY,
    inputSchema: listSpaceTypesParamsJsonSchema,
    handler: createToolHandler("list_space_types", parseListSpaceTypesParams, listSpaceTypes)
  },
  {
    name: "get_space_type",
    description:
      "Get one Huly SpaceType by raw SpaceType _id or exact name, including descriptor metadata, role definitions, role permission ids/labels, and available permissions.",
    category: CATEGORY,
    inputSchema: getSpaceTypeParamsJsonSchema,
    handler: createToolHandler("get_space_type", parseGetSpaceTypeParams, getSpaceType)
  },
  {
    name: "list_space_permissions",
    description:
      "List core Huly Permission records for space/workspace access control discovery. Filter by scope, objectClass, or search text. This is read-only and does not assign permissions.",
    category: CATEGORY,
    inputSchema: listSpacePermissionsParamsJsonSchema,
    handler: createToolHandler("list_space_permissions", parseListSpacePermissionsParams, listSpacePermissions)
  },
  {
    name: "update_space",
    description:
      "Update safe common metadata on an existing Huly space: name, description, private, archived, and autoJoin. Does not create/delete spaces or mutate module-specific required fields.",
    category: CATEGORY,
    inputSchema: updateSpaceParamsJsonSchema,
    handler: createToolHandler("update_space", parseUpdateSpaceParams, updateSpace)
  },
  {
    name: "add_space_members",
    description:
      "Idempotently add members to an existing Huly space. Members accept account UUID, exact email, or exact person display name and resolve to Huly account UUIDs before replacing the full members array.",
    category: CATEGORY,
    inputSchema: spaceMemberMutationParamsJsonSchema,
    handler: createToolHandler("add_space_members", parseSpaceMemberMutationParams, addSpaceMembers)
  },
  {
    name: "remove_space_members",
    description:
      "Idempotently remove members from an existing Huly space. Members accept account UUID, exact email, or exact person display name and resolve to Huly account UUIDs before replacing the full members array.",
    category: CATEGORY,
    inputSchema: spaceMemberMutationParamsJsonSchema,
    handler: createToolHandler("remove_space_members", parseSpaceMemberMutationParams, removeSpaceMembers)
  },
  {
    name: "set_space_owners",
    description:
      "Replace owners on an existing Huly space. Owners accept account UUID, exact email, or exact person display name. By default, owners are also ensured in members.",
    category: CATEGORY,
    inputSchema: setSpaceOwnersParamsJsonSchema,
    handler: createToolHandler("set_space_owners", parseSetSpaceOwnersParams, setSpaceOwners)
  }
]
