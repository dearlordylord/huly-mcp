/**
 * Workspace management operations using account-client.
 * @module
 */
import type { AccountRole as HulyAccountRole, WorkspaceInfoWithStatus } from "@hcengineering/core"
import { Effect, Option } from "effect"

import { AccountId, PersonUuid, RegionId, WorkspaceUuid } from "../../domain/schemas/shared.js"
import type {
  AccountRole,
  CreateWorkspaceParams,
  CreateWorkspaceResult,
  DeleteWorkspaceResult,
  ListWorkspaceMembersParams,
  ListWorkspacesParams,
  RegionInfo,
  UpdateGuestSettingsParams,
  UpdateGuestSettingsResult,
  UpdateMemberRoleParams,
  UpdateMemberRoleResult,
  UpdateUserProfileParams,
  UpdateUserProfileResult,
  UserProfile,
  WorkspaceInfo,
  WorkspaceMember,
  WorkspaceSummary
} from "../../domain/schemas/workspace.js"
import type { InvalidPersonUuidError } from "../errors.js"
import { HulyConnectionError } from "../errors.js"
import { WorkspaceClient, type WorkspaceClientError } from "../workspace-client.js"
import { validatePersonUuid } from "./shared.js"

// Compile-time assertion: AccountRole string literals must match HulyAccountRole enum values
// If AccountRole has values not in HulyAccountRole, this line will fail to compile
type _AssertAccountRoleCompatible = AccountRole extends `${HulyAccountRole}` ? true : never
void (true as _AssertAccountRoleCompatible)

const toHulyAccountRole = (role: AccountRole): HulyAccountRole => {
  // AccountRole validated by AccountRoleSchema at API boundary.
  // Values match HulyAccountRole enum. Cast safe after schema validation.
  return role as HulyAccountRole
}

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

    const result = yield* Effect.forEach(
      limitedMembers,
      (member) =>
        Effect.gen(function*() {
          let name: string | undefined
          let email: string | undefined

          const personInfoResult = yield* Effect.tryPromise({
            try: () => client.getPersonInfo(member.person),
            catch: () => undefined
          }).pipe(Effect.option)

          if (Option.isSome(personInfoResult)) {
            const personInfo = personInfoResult.value
            name = personInfo.name
            const emailSocialId = personInfo.socialIds.find((s) => s.type === "email")
            email = emailSocialId?.value
          }

          return {
            personId: PersonUuid.make(member.person),
            role: member.role,
            name,
            email
          }
        }),
      { concurrency: 10 }
    )
    return result
  })

export type {
  CreateWorkspaceResult,
  DeleteWorkspaceResult,
  UpdateGuestSettingsResult,
  UpdateMemberRoleResult,
  UpdateUserProfileResult
}

export const updateMemberRole = (
  params: UpdateMemberRoleParams
): Effect.Effect<UpdateMemberRoleResult, UpdateMemberRoleError, WorkspaceClient> =>
  Effect.gen(function*() {
    const { client } = yield* WorkspaceClient

    yield* Effect.tryPromise({
      try: () => client.updateWorkspaceRole(params.accountId, toHulyAccountRole(params.role)),
      catch: (e) =>
        new HulyConnectionError({
          message: `Failed to update member role: ${String(e)}`,
          cause: e
        })
    })

    return {
      accountId: AccountId.make(params.accountId),
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
      uuid: WorkspaceUuid.make(info.uuid),
      name: info.name,
      url: info.url,
      region: info.region !== undefined ? RegionId.make(info.region) : undefined,
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
      uuid: WorkspaceUuid.make(ws.uuid),
      name: ws.name,
      url: ws.url,
      region: ws.region !== undefined ? RegionId.make(ws.region) : undefined,
      createdOn: ws.createdOn,
      lastVisit: ws.lastVisit
    }))
  })

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
      uuid: WorkspaceUuid.make(loginInfo.workspace),
      url: loginInfo.workspaceUrl,
      name: params.name
    }
  })

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
): Effect.Effect<UserProfile | null, GetUserProfileError | InvalidPersonUuidError, WorkspaceClient> =>
  Effect.gen(function*() {
    const { client } = yield* WorkspaceClient

    const validatedUuid = yield* validatePersonUuid(personUuid)
    const profile = yield* Effect.tryPromise({
      try: () => client.getUserProfile(validatedUuid),
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
      personUuid: PersonUuid.make(profile.uuid),
      firstName: profile.firstName,
      lastName: profile.lastName,
      bio: profile.bio,
      city: profile.city,
      country: profile.country,
      website: profile.website,
      socialLinks: profile.socialLinks,
      isPublic: profile.isPublic
    }
  })

export const updateUserProfile = (
  params: UpdateUserProfileParams
): Effect.Effect<UpdateUserProfileResult, UpdateUserProfileError, WorkspaceClient> =>
  Effect.gen(function*() {
    const { client } = yield* WorkspaceClient

    const profileUpdate: Parameters<typeof client.setMyProfile>[0] = {}

    if (params.bio !== undefined) {
      profileUpdate.bio = params.bio === null ? "" : params.bio
    }
    if (params.city !== undefined) {
      profileUpdate.city = params.city === null ? "" : params.city
    }
    if (params.country !== undefined) {
      profileUpdate.country = params.country === null ? "" : params.country
    }
    if (params.website !== undefined) {
      profileUpdate.website = params.website === null ? "" : params.website
    }
    if (params.socialLinks !== undefined) {
      profileUpdate.socialLinks = params.socialLinks === null ? {} : params.socialLinks
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

export const updateGuestSettings = (
  params: UpdateGuestSettingsParams
): Effect.Effect<UpdateGuestSettingsResult, UpdateGuestSettingsError, WorkspaceClient> =>
  Effect.gen(function*() {
    const { client } = yield* WorkspaceClient

    let updated = false

    if (params.allowReadOnly !== undefined) {
      const allowReadOnly = params.allowReadOnly
      yield* Effect.tryPromise({
        try: () => client.updateAllowReadOnlyGuests(allowReadOnly),
        catch: (e) =>
          new HulyConnectionError({
            message: `Failed to update read-only guest setting: ${String(e)}`,
            cause: e
          })
      })
      updated = true
    }

    if (params.allowSignUp !== undefined) {
      const allowSignUp = params.allowSignUp
      yield* Effect.tryPromise({
        try: () => client.updateAllowGuestSignUp(allowSignUp),
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
      region: RegionId.make(r.region),
      name: r.name
    }))
  })
