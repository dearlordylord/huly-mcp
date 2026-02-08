import {
  createWorkspaceParamsJsonSchema,
  emptyParamsJsonSchema,
  getRegionsParamsJsonSchema,
  listWorkspaceMembersParamsJsonSchema,
  listWorkspacesParamsJsonSchema,
  parseCreateWorkspaceParams,
  parseGetRegionsParams,
  parseListWorkspaceMembersParams,
  parseListWorkspacesParams,
  parseUpdateGuestSettingsParams,
  parseUpdateMemberRoleParams,
  parseUpdateUserProfileParams,
  updateGuestSettingsParamsJsonSchema,
  updateMemberRoleParamsJsonSchema,
  updateUserProfileParamsJsonSchema
} from "../../domain/schemas.js"
import {
  createWorkspace,
  deleteWorkspace,
  getRegions,
  getUserProfile,
  getWorkspaceInfo,
  listWorkspaceMembers,
  listWorkspaces,
  updateGuestSettings,
  updateMemberRole,
  updateUserProfile
} from "../../huly/operations/workspace.js"
import { createNoParamsWorkspaceToolHandler, createWorkspaceToolHandler, type RegisteredTool } from "./registry.js"

const CATEGORY = "workspace" as const

export const workspaceTools: ReadonlyArray<RegisteredTool> = [
  {
    name: "list_workspace_members",
    description:
      "List members in the current Huly workspace with their roles. Returns members with account IDs and roles.",
    category: CATEGORY,
    inputSchema: listWorkspaceMembersParamsJsonSchema,
    handler: createWorkspaceToolHandler(
      "list_workspace_members",
      parseListWorkspaceMembersParams,
      listWorkspaceMembers
    )
  },
  {
    name: "update_member_role",
    description:
      "Update a workspace member's role. Requires appropriate permissions. Valid roles: READONLYGUEST, DocGuest, GUEST, USER, MAINTAINER, OWNER, ADMIN.",
    category: CATEGORY,
    inputSchema: updateMemberRoleParamsJsonSchema,
    handler: createWorkspaceToolHandler(
      "update_member_role",
      parseUpdateMemberRoleParams,
      updateMemberRole
    )
  },
  {
    name: "get_workspace_info",
    description: "Get information about the current workspace including name, URL, region, and settings.",
    category: CATEGORY,
    inputSchema: emptyParamsJsonSchema,
    handler: createNoParamsWorkspaceToolHandler(
      "get_workspace_info",
      getWorkspaceInfo
    )
  },
  {
    name: "list_workspaces",
    description:
      "List all workspaces accessible to the current user. Returns workspace summaries sorted by last visit.",
    category: CATEGORY,
    inputSchema: listWorkspacesParamsJsonSchema,
    handler: createWorkspaceToolHandler(
      "list_workspaces",
      parseListWorkspacesParams,
      listWorkspaces
    )
  },
  {
    name: "create_workspace",
    description: "Create a new Huly workspace. Returns the workspace UUID and URL. Optionally specify a region.",
    category: CATEGORY,
    inputSchema: createWorkspaceParamsJsonSchema,
    handler: createWorkspaceToolHandler(
      "create_workspace",
      parseCreateWorkspaceParams,
      createWorkspace
    )
  },
  {
    name: "delete_workspace",
    description: "Permanently delete the current workspace. This action cannot be undone. Use with extreme caution.",
    category: CATEGORY,
    inputSchema: emptyParamsJsonSchema,
    handler: createNoParamsWorkspaceToolHandler(
      "delete_workspace",
      deleteWorkspace
    )
  },
  {
    name: "get_user_profile",
    description: "Get the current user's profile information including bio, location, and social links.",
    category: CATEGORY,
    inputSchema: emptyParamsJsonSchema,
    handler: createNoParamsWorkspaceToolHandler(
      "get_user_profile",
      getUserProfile
    )
  },
  {
    name: "update_user_profile",
    description:
      "Update the current user's profile. Supports bio, city, country, website, social links, and public visibility.",
    category: CATEGORY,
    inputSchema: updateUserProfileParamsJsonSchema,
    handler: createWorkspaceToolHandler(
      "update_user_profile",
      parseUpdateUserProfileParams,
      updateUserProfile
    )
  },
  {
    name: "update_guest_settings",
    description: "Update workspace guest settings. Control read-only guest access and guest sign-up permissions.",
    category: CATEGORY,
    inputSchema: updateGuestSettingsParamsJsonSchema,
    handler: createWorkspaceToolHandler(
      "update_guest_settings",
      parseUpdateGuestSettingsParams,
      updateGuestSettings
    )
  },
  {
    name: "get_regions",
    description: "Get available regions for workspace creation. Returns region codes and display names.",
    category: CATEGORY,
    inputSchema: getRegionsParamsJsonSchema,
    handler: createWorkspaceToolHandler(
      "get_regions",
      parseGetRegionsParams,
      getRegions
    )
  }
]
