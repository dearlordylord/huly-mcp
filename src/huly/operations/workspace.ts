/**
 * Workspace management operations using account-client.
 * @module
 */
import type {
  AccountRole as HulyAccountRole,
  PersonUuid,
  WorkspaceInfoWithStatus
} from "@hcengineering/core"
import { Effect } from "effect"

import type {
  CreateWorkspaceParams,
  ListWorkspaceMembersParams,
  ListWorkspacesParams,
  RegionInfo,
  UpdateGuestSettingsParams,
  UpdateMemberRoleParams,
  UpdateUserProfileParams,
  UserProfile,
  WorkspaceInfo,
  WorkspaceMember,
  WorkspaceSummary
} from "../../domain/schemas/workspace.js"
import { HulyConnectionError } from "../errors.js"
import { WorkspaceClient, type WorkspaceClientError } from "../workspace-client.js"

export type ListWorkspaceMembersError = WorkspaceClientError
export type UpdateMemberRoleError = WorkspaceClientError
export type GetWorkspaceInfoError = WorkspaceClientError
export type ListWorkspacesError = WorkspaceClientError
export type CreateWorkspaceError = WorkspaceClientError
export type DeleteWorkspaceError = WorkspaceClientError
export type GetUserProfileError = WorkspaceClientError
export type UpdateUserProfileError = WorkspaceClientError
export type UpdateGuestSettingsError = WorkspaceClientError
export type GetRegionsError = WorkspaceClientError

const formatVersion = (info: WorkspaceInfoWithStatus): string =>
  `${info.versionMajor}.${info.versionMinor}.${info.versionPatch}`

export const listWorkspaceMembers = (
  params: ListWorkspaceMembersParams
): Effect.Effect<Array<WorkspaceMember>, ListWorkspaceMembersError, WorkspaceClient> =>
  Effect.gen(function*() {
    const { client } = yield* WorkspaceClient
    const limit = Math.min(params.limit ?? 50, 200)

    const members = yield* Effect.tryPromise({
      try: () => client.getWorkspaceMembers(),
      catch: (e) =>
        new HulyConnectionError({
          message: `Failed to get workspace members: ${String(e)}`,
          cause: e
        })
    })

    const limitedMembers = members.slice(0, limit)

    const result: Array<WorkspaceMember> = []
    for (const member of limitedMembers) {
      let name: string | undefined
      let email: string | undefined

      const personInfoResult = yield* Effect.tryPromise({
        try: () => client.getPersonInfo(member.person),
        catch: () => undefined
      }).pipe(Effect.option)

      if (personInfoResult._tag === "Some" && personInfoResult.value !== undefined) {
        const personInfo = personInfoResult.value
        name = personInfo.name
        const emailSocialId = personInfo.socialIds?.find((s) => s.type === "email")
        email = emailSocialId?.value
      }

      result.push({
        personId: member.person,
        role: member.role,
        name,
        email
      })
    }

    return result
  })

export interface UpdateMemberRoleResult {
  accountId: string
  role: string
  updated: boolean
}

export const updateMemberRole = (
  params: UpdateMemberRoleParams
): Effect.Effect<UpdateMemberRoleResult, UpdateMemberRoleError, WorkspaceClient> =>
  Effect.gen(function*() {
    const { client } = yield* WorkspaceClient

    yield* Effect.tryPromise({
      try: () => client.updateWorkspaceRole(params.accountId, params.role as HulyAccountRole),
      catch: (e) =>
        new HulyConnectionError({
          message: `Failed to update member role: ${String(e)}`,
          cause: e
        })
    })

    return {
      accountId: params.accountId,
      role: params.role,
      updated: true
    }
  })

export const getWorkspaceInfo = (): Effect.Effect<WorkspaceInfo, GetWorkspaceInfoError, WorkspaceClient> =>
  Effect.gen(function*() {
    const { client } = yield* WorkspaceClient

    const info = yield* Effect.tryPromise({
      try: () => client.getWorkspaceInfo(false),
      catch: (e) =>
        new HulyConnectionError({
          message: `Failed to get workspace info: ${String(e)}`,
          cause: e
        })
    })

    return {
      uuid: info.uuid,
      name: info.name,
      url: info.url,
      region: info.region,
      createdOn: info.createdOn,
      allowReadOnlyGuest: info.allowReadOnlyGuest,
      allowGuestSignUp: info.allowGuestSignUp,
      version: formatVersion(info),
      mode: info.mode
    }
  })

export const listWorkspaces = (
  params: ListWorkspacesParams
): Effect.Effect<Array<WorkspaceSummary>, ListWorkspacesError, WorkspaceClient> =>
  Effect.gen(function*() {
    const { client } = yield* WorkspaceClient
    const limit = Math.min(params.limit ?? 50, 200)

    const workspaces = yield* Effect.tryPromise({
      try: () => client.getUserWorkspaces(),
      catch: (e) =>
        new HulyConnectionError({
          message: `Failed to list workspaces: ${String(e)}`,
          cause: e
        })
    })

    return workspaces.slice(0, limit).map((ws) => ({
      uuid: ws.uuid,
      name: ws.name,
      url: ws.url,
      region: ws.region,
      createdOn: ws.createdOn,
      lastVisit: ws.lastVisit
    }))
  })

export interface CreateWorkspaceResult {
  uuid: string
  url: string
  name: string
}

export const createWorkspace = (
  params: CreateWorkspaceParams
): Effect.Effect<CreateWorkspaceResult, CreateWorkspaceError, WorkspaceClient> =>
  Effect.gen(function*() {
    const { client } = yield* WorkspaceClient

    const loginInfo = yield* Effect.tryPromise({
      try: () => client.createWorkspace(params.name, params.region),
      catch: (e) =>
        new HulyConnectionError({
          message: `Failed to create workspace: ${String(e)}`,
          cause: e
        })
    })

    return {
      uuid: loginInfo.workspace,
      url: loginInfo.workspaceUrl,
      name: params.name
    }
  })

export interface DeleteWorkspaceResult {
  deleted: boolean
}

export const deleteWorkspace = (): Effect.Effect<DeleteWorkspaceResult, DeleteWorkspaceError, WorkspaceClient> =>
  Effect.gen(function*() {
    const { client } = yield* WorkspaceClient

    yield* Effect.tryPromise({
      try: () => client.deleteWorkspace(),
      catch: (e) =>
        new HulyConnectionError({
          message: `Failed to delete workspace: ${String(e)}`,
          cause: e
        })
    })

    return { deleted: true }
  })

export const getUserProfile = (
  personUuid?: string
): Effect.Effect<UserProfile | null, GetUserProfileError, WorkspaceClient> =>
  Effect.gen(function*() {
    const { client } = yield* WorkspaceClient

    const profile = yield* Effect.tryPromise({
      try: () => client.getUserProfile(personUuid as PersonUuid | undefined),
      catch: (e) =>
        new HulyConnectionError({
          message: `Failed to get user profile: ${String(e)}`,
          cause: e
        })
    })

    if (profile === null) {
      return null
    }

    return {
      personUuid: profile.uuid,
      firstName: profile.firstName,
      lastName: profile.lastName,
      bio: profile.bio,
      city: profile.city,
      country: profile.country,
      website: profile.website,
      socialLinks: profile.socialLinks,
      isPublic: profile.isPublic ?? false
    }
  })

export interface UpdateUserProfileResult {
  updated: boolean
}

export const updateUserProfile = (
  params: UpdateUserProfileParams
): Effect.Effect<UpdateUserProfileResult, UpdateUserProfileError, WorkspaceClient> =>
  Effect.gen(function*() {
    const { client } = yield* WorkspaceClient

    const profileUpdate: Parameters<typeof client.setMyProfile>[0] = {}

    if (params.bio !== undefined && params.bio !== null) {
      profileUpdate.bio = params.bio
    }
    if (params.city !== undefined && params.city !== null) {
      profileUpdate.city = params.city
    }
    if (params.country !== undefined && params.country !== null) {
      profileUpdate.country = params.country
    }
    if (params.website !== undefined && params.website !== null) {
      profileUpdate.website = params.website
    }
    if (params.socialLinks !== undefined && params.socialLinks !== null) {
      profileUpdate.socialLinks = params.socialLinks as Record<string, string>
    }
    if (params.isPublic !== undefined) {
      profileUpdate.isPublic = params.isPublic
    }

    if (Object.keys(profileUpdate).length === 0) {
      return { updated: false }
    }

    yield* Effect.tryPromise({
      try: () => client.setMyProfile(profileUpdate),
      catch: (e) =>
        new HulyConnectionError({
          message: `Failed to update user profile: ${String(e)}`,
          cause: e
        })
    })

    return { updated: true }
  })

export interface UpdateGuestSettingsResult {
  updated: boolean
  allowReadOnly: boolean | undefined
  allowSignUp: boolean | undefined
}

export const updateGuestSettings = (
  params: UpdateGuestSettingsParams
): Effect.Effect<UpdateGuestSettingsResult, UpdateGuestSettingsError, WorkspaceClient> =>
  Effect.gen(function*() {
    const { client } = yield* WorkspaceClient

    let updated = false

    if (params.allowReadOnly !== undefined) {
      yield* Effect.tryPromise({
        try: () => client.updateAllowReadOnlyGuests(params.allowReadOnly!),
        catch: (e) =>
          new HulyConnectionError({
            message: `Failed to update read-only guest setting: ${String(e)}`,
            cause: e
          })
      })
      updated = true
    }

    if (params.allowSignUp !== undefined) {
      yield* Effect.tryPromise({
        try: () => client.updateAllowGuestSignUp(params.allowSignUp!),
        catch: (e) =>
          new HulyConnectionError({
            message: `Failed to update guest sign-up setting: ${String(e)}`,
            cause: e
          })
      })
      updated = true
    }

    return {
      updated,
      allowReadOnly: params.allowReadOnly,
      allowSignUp: params.allowSignUp
    }
  })

export const getRegions = (): Effect.Effect<Array<RegionInfo>, GetRegionsError, WorkspaceClient> =>
  Effect.gen(function*() {
    const { client } = yield* WorkspaceClient

    const regions = yield* Effect.tryPromise({
      try: () => client.getRegionInfo(),
      catch: (e) =>
        new HulyConnectionError({
          message: `Failed to get regions: ${String(e)}`,
          cause: e
        })
    })

    return regions.map((r) => ({
      region: r.region,
      name: r.name
    }))
  })
