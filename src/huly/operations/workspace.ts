/**
 * Workspace management operations using account-client.
 * @module
 */
import { AccountRole as HulyAccountRole, type WorkspaceInfoWithStatus } from "@hcengineering/core"
import { Effect, Option } from "effect"

import {
  AccountId,
  Email,
  PersonName,
  PersonUuid,
  RegionId,
  UrlString,
  WorkspaceMode,
  WorkspaceName,
  WorkspaceUuid,
  WorkspaceVersion
} from "../../domain/schemas/shared.js"
import type {
  AccountRole,
  CreateAccessLinkParams,
  CreateAccessLinkResult,
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
import { UPDATE_GUEST_SETTINGS_FIELDS, UPDATE_USER_PROFILE_FIELDS } from "../../domain/schemas/workspace.js"
import type { InvalidPersonUuidError, NoUpdateFieldsError } from "../errors.js"
import { WorkspaceClient, type WorkspaceClientError } from "../workspace-client.js"
import { clampLimit } from "./query-helpers.js"
import { validatePersonUuid } from "./sdk-boundary.js"
import { type DirectUpdateEntry, requireUpdateFields } from "./update-guards.js"

// Exhaustive map guarantees compile-time alignment between AccountRole literals and HulyAccountRole enum.
// If either side adds a value, TS will error here.
const accountRoleMap: Record<AccountRole, HulyAccountRole> = {
  READONLYGUEST: HulyAccountRole.ReadOnlyGuest,
  DocGuest: HulyAccountRole.DocGuest,
  GUEST: HulyAccountRole.Guest,
  USER: HulyAccountRole.User,
  MAINTAINER: HulyAccountRole.Maintainer,
  OWNER: HulyAccountRole.Owner,
  ADMIN: HulyAccountRole.Admin
}

type MappedAccountRole = typeof accountRoleMap[keyof typeof accountRoleMap]
type ExactAccountRoleMapping = [HulyAccountRole] extends [MappedAccountRole]
  ? [MappedAccountRole] extends [HulyAccountRole] ? true : never
  : never

const exactAccountRoleMapping = <T extends true>(value: T): T => value
exactAccountRoleMapping<ExactAccountRoleMapping>(true)

const toHulyAccountRole = (role: AccountRole): HulyAccountRole => accountRoleMap[role]

type ListWorkspaceMembersError = WorkspaceClientError
type UpdateMemberRoleError = WorkspaceClientError
type GetWorkspaceInfoError = WorkspaceClientError
type ListWorkspacesError = WorkspaceClientError
type CreateWorkspaceError = WorkspaceClientError
type DeleteWorkspaceError = WorkspaceClientError
type GetUserProfileError = WorkspaceClientError
type UpdateUserProfileError = WorkspaceClientError | NoUpdateFieldsError
type UpdateGuestSettingsError = WorkspaceClientError | NoUpdateFieldsError
type CreateAccessLinkError = WorkspaceClientError
type GetRegionsError = WorkspaceClientError

const formatVersion = (info: WorkspaceInfoWithStatus): string =>
  `${info.versionMajor}.${info.versionMinor}.${info.versionPatch}`

const nullToUndefined = <T>(value: T | null | undefined): T | undefined => value ?? undefined

type CreateAccessLinkOptions = Parameters<WorkspaceClient["Type"]["createAccessLink"]>[1]

const toCreateAccessLinkOptions = (params: CreateAccessLinkParams): CreateAccessLinkOptions => {
  return {
    ...(params.firstName !== undefined ? { firstName: params.firstName } : {}),
    ...(params.lastName !== undefined ? { lastName: params.lastName } : {}),
    ...(params.navigateUrl !== undefined ? { navigateUrl: params.navigateUrl } : {}),
    ...(params.spaces !== undefined ? { spaces: params.spaces } : {}),
    ...(params.notBefore !== undefined ? { notBefore: params.notBefore } : {}),
    ...(params.expiration !== undefined ? { expiration: params.expiration } : {}),
    ...(params.personalized !== undefined ? { personalized: params.personalized } : {})
  }
}

export const listWorkspaceMembers = (
  params: ListWorkspaceMembersParams
): Effect.Effect<Array<WorkspaceMember>, ListWorkspaceMembersError, WorkspaceClient> =>
  Effect.gen(function*() {
    const ops = yield* WorkspaceClient
    const limit = clampLimit(params.limit)

    const members = yield* ops.getWorkspaceMembers()

    const limitedMembers = members.slice(0, limit)

    const result = yield* Effect.forEach(
      limitedMembers,
      (member) =>
        Effect.gen(function*() {
          const personInfoResult = yield* ops.getPersonInfo(member.person).pipe(Effect.option)
          const { email, name }: { email: string | undefined; name: string | undefined } =
            Option.isSome(personInfoResult)
              ? {
                name: personInfoResult.value.name,
                email: personInfoResult.value.socialIds.find((s) => s.type === "email")?.value
              }
              : { name: undefined, email: undefined }

          return {
            personId: PersonUuid.make(member.person),
            role: member.role,
            name: name !== undefined ? PersonName.make(name) : undefined,
            email: email !== undefined ? Email.make(email) : undefined
          }
        }),
      { concurrency: 10 }
    )
    return result
  })

export const updateMemberRole = (
  params: UpdateMemberRoleParams
): Effect.Effect<UpdateMemberRoleResult, UpdateMemberRoleError, WorkspaceClient> =>
  Effect.gen(function*() {
    const ops = yield* WorkspaceClient

    yield* ops.updateWorkspaceRole(params.accountId, toHulyAccountRole(params.role))

    return {
      accountId: AccountId.make(params.accountId),
      role: params.role,
      updated: true
    }
  })

export const getWorkspaceInfo = (): Effect.Effect<WorkspaceInfo, GetWorkspaceInfoError, WorkspaceClient> =>
  Effect.gen(function*() {
    const ops = yield* WorkspaceClient

    const info = yield* ops.getWorkspaceInfo(false)

    return {
      uuid: WorkspaceUuid.make(info.uuid),
      name: WorkspaceName.make(info.name),
      url: UrlString.make(info.url),
      region: info.region !== undefined ? RegionId.make(info.region) : undefined,
      createdOn: info.createdOn,
      allowReadOnlyGuest: info.allowReadOnlyGuest,
      allowGuestSignUp: info.allowGuestSignUp,
      version: WorkspaceVersion.make(formatVersion(info)),
      mode: WorkspaceMode.make(info.mode)
    }
  })

export const listWorkspaces = (
  params: ListWorkspacesParams
): Effect.Effect<Array<WorkspaceSummary>, ListWorkspacesError, WorkspaceClient> =>
  Effect.gen(function*() {
    const ops = yield* WorkspaceClient
    const limit = clampLimit(params.limit)

    const workspaces = yield* ops.getUserWorkspaces()

    return workspaces.slice(0, limit).map((ws) => ({
      uuid: WorkspaceUuid.make(ws.uuid),
      name: WorkspaceName.make(ws.name),
      url: UrlString.make(ws.url),
      region: ws.region !== undefined ? RegionId.make(ws.region) : undefined,
      createdOn: ws.createdOn,
      lastVisit: ws.lastVisit
    }))
  })

export const createWorkspace = (
  params: CreateWorkspaceParams
): Effect.Effect<CreateWorkspaceResult, CreateWorkspaceError, WorkspaceClient> =>
  Effect.gen(function*() {
    const ops = yield* WorkspaceClient

    const loginInfo = yield* ops.createWorkspace(params.name, params.region)

    return {
      uuid: WorkspaceUuid.make(loginInfo.workspace),
      url: UrlString.make(loginInfo.workspaceUrl),
      name: WorkspaceName.make(params.name)
    }
  })

export const deleteWorkspace = (): Effect.Effect<DeleteWorkspaceResult, DeleteWorkspaceError, WorkspaceClient> =>
  Effect.gen(function*() {
    const ops = yield* WorkspaceClient

    yield* ops.deleteWorkspace()

    return { deleted: true }
  })

export const getUserProfile = (
  personUuid?: string
): Effect.Effect<UserProfile | null, GetUserProfileError | InvalidPersonUuidError, WorkspaceClient> =>
  Effect.gen(function*() {
    const ops = yield* WorkspaceClient

    const validatedUuid = yield* validatePersonUuid(personUuid)
    const profile = yield* ops.getUserProfile(validatedUuid)

    if (profile === null) {
      return null
    }

    return {
      personUuid: PersonUuid.make(profile.uuid),
      firstName: profile.firstName,
      lastName: profile.lastName,
      bio: nullToUndefined(profile.bio),
      city: nullToUndefined(profile.city),
      country: nullToUndefined(profile.country),
      website: nullToUndefined(profile.website),
      socialLinks: nullToUndefined(profile.socialLinks),
      isPublic: profile.isPublic
    }
  })

export const updateUserProfile = (
  params: UpdateUserProfileParams
): Effect.Effect<UpdateUserProfileResult, UpdateUserProfileError, WorkspaceClient> =>
  Effect.gen(function*() {
    yield* requireUpdateFields("update_user_profile", params, UPDATE_USER_PROFILE_FIELDS)

    const ops = yield* WorkspaceClient

    type UpdateUserProfileField = typeof UPDATE_USER_PROFILE_FIELDS[number]
    type UserProfileUpdate = Parameters<typeof ops.setMyProfile>[0]
    type UpdateUserProfileEntries = {
      readonly [Field in UpdateUserProfileField]: DirectUpdateEntry<UpdateUserProfileField, UserProfileUpdate, Field>
    }
    const profileEntries = {
      bio: params.bio === undefined ? {} : { bio: params.bio === null ? "" : params.bio },
      city: params.city === undefined ? {} : { city: params.city === null ? "" : params.city },
      country: params.country === undefined ? {} : { country: params.country === null ? "" : params.country },
      website: params.website === undefined ? {} : { website: params.website === null ? "" : params.website },
      socialLinks: params.socialLinks === undefined
        ? {}
        : { socialLinks: params.socialLinks === null ? {} : params.socialLinks },
      isPublic: params.isPublic === undefined ? {} : { isPublic: params.isPublic }
    } satisfies UpdateUserProfileEntries
    const profileUpdate: UserProfileUpdate = {}
    Object.assign(profileUpdate, ...Object.values(profileEntries))

    yield* ops.setMyProfile(profileUpdate)

    return { updated: true }
  })

export const updateGuestSettings = (
  params: UpdateGuestSettingsParams
): Effect.Effect<UpdateGuestSettingsResult, UpdateGuestSettingsError, WorkspaceClient> =>
  Effect.gen(function*() {
    yield* requireUpdateFields("update_guest_settings", params, UPDATE_GUEST_SETTINGS_FIELDS)

    const ops = yield* WorkspaceClient

    type UpdateGuestSettingsField = typeof UPDATE_GUEST_SETTINGS_FIELDS[number]
    type UpdateGuestSettingsEntries = {
      readonly [Field in UpdateGuestSettingsField]: Effect.Effect<void, WorkspaceClientError>
    }
    const updateEntries = {
      allowReadOnly: params.allowReadOnly === undefined
        ? Effect.void
        : ops.updateAllowReadOnlyGuests(params.allowReadOnly),
      allowSignUp: params.allowSignUp === undefined ? Effect.void : ops.updateAllowGuestSignUp(params.allowSignUp)
    } satisfies UpdateGuestSettingsEntries
    yield* Effect.all(Object.values(updateEntries), { discard: true })

    return {
      updated: true,
      allowReadOnly: params.allowReadOnly,
      allowSignUp: params.allowSignUp
    }
  })

export const createAccessLink = (
  params: CreateAccessLinkParams
): Effect.Effect<CreateAccessLinkResult, CreateAccessLinkError, WorkspaceClient> =>
  Effect.gen(function*() {
    const ops = yield* WorkspaceClient
    const role = params.role ?? "GUEST"

    const link = yield* ops.createAccessLink(toHulyAccountRole(role), toCreateAccessLinkOptions(params))

    return {
      link: UrlString.make(link),
      role,
      spaces: params.spaces,
      personalized: params.personalized
    }
  })

export const getRegions = (): Effect.Effect<Array<RegionInfo>, GetRegionsError, WorkspaceClient> =>
  Effect.gen(function*() {
    const ops = yield* WorkspaceClient

    const regions = yield* ops.getRegionInfo()

    return regions.map((r) => ({
      region: RegionId.make(r.region),
      name: r.name
    }))
  })
