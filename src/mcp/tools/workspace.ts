import {
  createAccessLinkParamsJsonSchema,
  createWorkspaceParamsJsonSchema,
  DEFAULT_ACCESS_LINK_ROLE,
  emptyParamsJsonSchema,
  getRegionsParamsJsonSchema,
  listWorkspaceMembersParamsJsonSchema,
  listWorkspacesParamsJsonSchema,
  parseCreateAccessLinkParams,
  parseCreateWorkspaceParams,
  parseGetRegionsParams,
  parseListWorkspaceMembersParams,
  parseListWorkspacesParams,
  parseUpdateGuestSettingsParams,
  parseUpdateMemberRoleParams,
  parseUpdateUserProfileParams,
  updateGuestSettingsParamsJsonSchema,
  updateMemberRoleParamsJsonSchema,
  updateUserProfileParamsJsonSchema,
  WorkspaceInfoSchema
} from "../../domain/schemas.js"
import {
  CreateAccessLinkResultSchema,
  CreateWorkspaceResultSchema,
  DeleteWorkspaceResultSchema,
  GetRegionsResultSchema,
  GetUserProfileResultSchema,
  ListWorkspaceMembersResultSchema,
  ListWorkspacesResultSchema,
  UpdateGuestSettingsResultSchema,
  UpdateMemberRoleResultSchema,
  UpdateUserProfileResultSchema
} from "../../domain/schemas/workspace.js"
import {
  createAccessLink,
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
import { defineNoParamsWorkspaceTool, defineWorkspaceTool, type RegisteredTool } from "./registry.js"
const CATEGORY = "workspace" as const
export const workspaceTools: ReadonlyArray<RegisteredTool> = [
  defineWorkspaceTool(
    {
      name: "list_workspace_members",
      description:
        "List members in the current Huly workspace with their roles. Returns members with account IDs and roles.",
      category: CATEGORY,
      inputSchema: listWorkspaceMembersParamsJsonSchema,
      resultSchema: ListWorkspaceMembersResultSchema
    },
    parseListWorkspaceMembersParams,
    listWorkspaceMembers
  ),
  defineWorkspaceTool(
    {
      name: "update_member_role",
      description:
        "Update a workspace member's role. Requires appropriate permissions. Valid roles: READONLYGUEST, DocGuest, GUEST, USER, MAINTAINER, OWNER, ADMIN.",
      category: CATEGORY,
      inputSchema: updateMemberRoleParamsJsonSchema,
      resultSchema: UpdateMemberRoleResultSchema
    },
    parseUpdateMemberRoleParams,
    updateMemberRole
  ),
  defineNoParamsWorkspaceTool({
    name: "get_workspace_info",
    description: "Get information about the current workspace including name, URL, region, and settings.",
    category: CATEGORY,
    inputSchema: emptyParamsJsonSchema,
    resultSchema: WorkspaceInfoSchema
  }, getWorkspaceInfo),
  defineWorkspaceTool(
    {
      name: "list_workspaces",
      description:
        "List all workspaces accessible to the current user. Returns workspace summaries sorted by last visit.",
      category: CATEGORY,
      inputSchema: listWorkspacesParamsJsonSchema,
      resultSchema: ListWorkspacesResultSchema
    },
    parseListWorkspacesParams,
    listWorkspaces
  ),
  defineWorkspaceTool(
    {
      name: "create_workspace",
      description: "Create a new Huly workspace. Returns the workspace UUID and URL. Optionally specify a region.",
      category: CATEGORY,
      inputSchema: createWorkspaceParamsJsonSchema,
      resultSchema: CreateWorkspaceResultSchema
    },
    parseCreateWorkspaceParams,
    createWorkspace
  ),
  defineNoParamsWorkspaceTool({
    name: "delete_workspace",
    description: "Permanently delete the current workspace. This action cannot be undone. Use with extreme caution.",
    category: CATEGORY,
    inputSchema: emptyParamsJsonSchema,
    resultSchema: DeleteWorkspaceResultSchema
  }, deleteWorkspace),
  defineNoParamsWorkspaceTool({
    name: "get_user_profile",
    description: "Get the current user's profile information including bio, location, and social links.",
    category: CATEGORY,
    inputSchema: emptyParamsJsonSchema,
    resultSchema: GetUserProfileResultSchema
  }, getUserProfile),
  defineWorkspaceTool(
    {
      name: "update_user_profile",
      description:
        "Update the current user's profile. Supports bio, city, country, website, social links, and public visibility.",
      category: CATEGORY,
      inputSchema: updateUserProfileParamsJsonSchema,
      resultSchema: UpdateUserProfileResultSchema
    },
    parseUpdateUserProfileParams,
    updateUserProfile
  ),
  defineWorkspaceTool(
    {
      name: "update_guest_settings",
      description: "Update workspace guest settings. Control read-only guest access and guest sign-up permissions.",
      category: CATEGORY,
      inputSchema: updateGuestSettingsParamsJsonSchema,
      resultSchema: UpdateGuestSettingsResultSchema
    },
    parseUpdateGuestSettingsParams,
    updateGuestSettings
  ),
  defineWorkspaceTool(
    {
      name: "create_access_link",
      description:
        `Create a Huly workspace access link. When role is omitted, role=${DEFAULT_ACCESS_LINK_ROLE}. Supports anonymous reusable guest links by setting personalized=false with notBefore and expiration, and can restrict access to specific Huly space IDs via spaces.`,
      category: CATEGORY,
      inputSchema: createAccessLinkParamsJsonSchema,
      resultSchema: CreateAccessLinkResultSchema
    },
    parseCreateAccessLinkParams,
    createAccessLink
  ),
  defineWorkspaceTool(
    {
      name: "get_regions",
      description: "Get available regions for workspace creation. Returns region codes and display names.",
      category: CATEGORY,
      inputSchema: getRegionsParamsJsonSchema,
      resultSchema: GetRegionsResultSchema
    },
    parseGetRegionsParams,
    getRegions
  )
]
