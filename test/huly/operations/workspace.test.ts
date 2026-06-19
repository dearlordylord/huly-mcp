import { describe, it } from "@effect/vitest"
import type { RegionInfo as HulyRegionInfo, WorkspaceLoginInfo } from "@hcengineering/account-client"
import { AccountRole, type AccountUuid, type PersonUuid, type WorkspaceInfoWithStatus } from "@hcengineering/core"
import { Effect } from "effect"
import { expect } from "vitest"
import { assertAt } from "../../../src/utils/assertions.js"

import type { InvalidPersonUuidError } from "../../../src/huly/errors.js"
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
} from "../../../src/huly/operations/workspace.js"
import { WorkspaceClient, type WorkspaceClientUserProfile } from "../../../src/huly/workspace-client.js"
import { accountId, regionId, spaceBrandId, type SpaceId } from "../../helpers/brands.js"

const mkAccountUuid = (id: string): AccountUuid => {
  const pu = id as PersonUuid
  return pu as AccountUuid
}
const mkPersonUuid = (id: string) => id as PersonUuid

const mkWorkspaceInfo = (overrides?: Partial<WorkspaceInfoWithStatus>): WorkspaceInfoWithStatus => ({
  uuid: "ws-1" as WorkspaceInfoWithStatus["uuid"],
  name: "Test Workspace",
  url: "test-workspace",
  region: "us-east",
  createdOn: 1700000000000,
  versionMajor: 1,
  versionMinor: 2,
  versionPatch: 3,
  mode: "active",
  processingAttemps: 0,
  allowReadOnlyGuest: true,
  allowGuestSignUp: false,
  ...overrides
})

describe("listWorkspaceMembers", () => {
  it.effect("returns members with person info", () =>
    Effect.gen(function*() {
      const testLayer = WorkspaceClient.testLayer({
        getWorkspaceMembers: () =>
          Effect.succeed([
            { person: mkAccountUuid("person-1"), role: AccountRole.Owner },
            { person: mkAccountUuid("person-2"), role: AccountRole.User }
          ]),
        getPersonInfo: (account) => {
          if (account === mkPersonUuid("person-1")) {
            return Effect.succeed({
              name: "Alice",
              socialIds: [{ type: "email", value: "alice@test.com" }]
            } as never)
          }
          return Effect.succeed({
            name: "Bob",
            socialIds: []
          } as never)
        }
      })

      const result = yield* listWorkspaceMembers({}).pipe(Effect.provide(testLayer))

      expect(result).toHaveLength(2)
      expect(assertAt(result, 0).personId).toBe("person-1")
      expect(assertAt(result, 0).role).toBe(AccountRole.Owner)
      expect(assertAt(result, 0).name).toBe("Alice")
      expect(assertAt(result, 0).email).toBe("alice@test.com")

      expect(assertAt(result, 1).personId).toBe("person-2")
      expect(assertAt(result, 1).role).toBe(AccountRole.User)
      expect(assertAt(result, 1).name).toBe("Bob")
      expect(assertAt(result, 1).email).toBeUndefined()
    }))

  it.effect("handles person info failure gracefully via Effect.option", () =>
    Effect.gen(function*() {
      const testLayer = WorkspaceClient.testLayer({
        getWorkspaceMembers: () =>
          Effect.succeed([
            { person: mkAccountUuid("person-1"), role: AccountRole.User }
          ]),
        getPersonInfo: () => Effect.fail({ _tag: "HulyConnectionError", message: "fail" } as never)
      })

      const result = yield* listWorkspaceMembers({}).pipe(Effect.provide(testLayer))

      expect(result).toHaveLength(1)
      expect(assertAt(result, 0).personId).toBe("person-1")
      expect(assertAt(result, 0).name).toBeUndefined()
      expect(assertAt(result, 0).email).toBeUndefined()
    }))

  it.effect("respects limit", () =>
    Effect.gen(function*() {
      const members = Array.from({ length: 10 }, (_, i) => ({
        person: mkAccountUuid(`person-${i}`),
        role: AccountRole.User
      }))

      const testLayer = WorkspaceClient.testLayer({
        getWorkspaceMembers: () => Effect.succeed(members),
        getPersonInfo: () => Effect.succeed({ name: "User", socialIds: [] } as never)
      })

      const result = yield* listWorkspaceMembers({ limit: 3 }).pipe(Effect.provide(testLayer))

      expect(result).toHaveLength(3)
    }))
})

describe("updateMemberRole", () => {
  it.effect("updates role and returns result", () =>
    Effect.gen(function*() {
      let capturedAccount: string | undefined
      let capturedRole: AccountRole | undefined

      const testLayer = WorkspaceClient.testLayer({
        updateWorkspaceRole: (account, role) => {
          capturedAccount = account
          capturedRole = role
          return Effect.void
        }
      })

      const result = yield* updateMemberRole({ accountId: accountId("acc-1"), role: "MAINTAINER" }).pipe(
        Effect.provide(testLayer)
      )

      expect(result.accountId).toBe("acc-1")
      expect(result.role).toBe("MAINTAINER")
      expect(result.updated).toBe(true)
      expect(capturedAccount).toBe("acc-1")
      expect(capturedRole).toBe(AccountRole.Maintainer)
    }))
})

describe("getWorkspaceInfo", () => {
  it.effect("returns mapped workspace info", () =>
    Effect.gen(function*() {
      const wsInfo = mkWorkspaceInfo()

      const testLayer = WorkspaceClient.testLayer({
        getWorkspaceInfo: () => Effect.succeed(wsInfo)
      })

      const result = yield* getWorkspaceInfo().pipe(Effect.provide(testLayer))

      expect(result.uuid).toBe("ws-1")
      expect(result.name).toBe("Test Workspace")
      expect(result.url).toBe("test-workspace")
      expect(result.region).toBe("us-east")
      expect(result.createdOn).toBe(1700000000000)
      expect(result.allowReadOnlyGuest).toBe(true)
      expect(result.allowGuestSignUp).toBe(false)
      expect(result.version).toBe("1.2.3")
      expect(result.mode).toBe("active")
    }))

  it.effect("handles undefined region", () =>
    Effect.gen(function*() {
      const wsInfo = mkWorkspaceInfo()
      delete (wsInfo as { region?: unknown }).region

      const testLayer = WorkspaceClient.testLayer({
        getWorkspaceInfo: () => Effect.succeed(wsInfo)
      })

      const result = yield* getWorkspaceInfo().pipe(Effect.provide(testLayer))

      expect(result.region).toBeUndefined()
    }))
})

describe("listWorkspaces", () => {
  it.effect("returns workspace summaries", () =>
    Effect.gen(function*() {
      const workspaces = [
        mkWorkspaceInfo({ uuid: "ws-1" as WorkspaceInfoWithStatus["uuid"], name: "WS 1", lastVisit: 1700000001000 }),
        mkWorkspaceInfo({ uuid: "ws-2" as WorkspaceInfoWithStatus["uuid"], name: "WS 2" })
      ]

      const testLayer = WorkspaceClient.testLayer({
        getUserWorkspaces: () => Effect.succeed(workspaces)
      })

      const result = yield* listWorkspaces({}).pipe(Effect.provide(testLayer))

      expect(result).toHaveLength(2)
      expect(assertAt(result, 0).uuid).toBe("ws-1")
      expect(assertAt(result, 0).name).toBe("WS 1")
      expect(assertAt(result, 0).lastVisit).toBe(1700000001000)
      expect(assertAt(result, 1).uuid).toBe("ws-2")
    }))

  it.effect("respects limit", () =>
    Effect.gen(function*() {
      const workspaces = Array.from({ length: 10 }, (_, i) =>
        mkWorkspaceInfo({ uuid: `ws-${i}` as WorkspaceInfoWithStatus["uuid"], name: `WS ${i}` }))

      const testLayer = WorkspaceClient.testLayer({
        getUserWorkspaces: () =>
          Effect.succeed(workspaces)
      })

      const result = yield* listWorkspaces({ limit: 2 }).pipe(Effect.provide(testLayer))

      expect(result).toHaveLength(2)
    }))
})

describe("createWorkspace", () => {
  it.effect("creates workspace and returns result", () =>
    Effect.gen(function*() {
      let capturedName: string | undefined
      let capturedRegion: string | undefined

      const testLayer = WorkspaceClient.testLayer({
        createWorkspace: (name, region) => {
          capturedName = name
          capturedRegion = region
          return Effect.succeed({
            workspace: "new-ws-uuid",
            workspaceUrl: "new-workspace"
          } as WorkspaceLoginInfo)
        }
      })

      const result = yield* createWorkspace({ name: "New Workspace", region: regionId("eu-west") }).pipe(
        Effect.provide(testLayer)
      )

      expect(result.uuid).toBe("new-ws-uuid")
      expect(result.url).toBe("new-workspace")
      expect(result.name).toBe("New Workspace")
      expect(capturedName).toBe("New Workspace")
      expect(capturedRegion).toBe("eu-west")
    }))
})

describe("deleteWorkspace", () => {
  it.effect("deletes workspace and returns result", () =>
    Effect.gen(function*() {
      let deleteCalled = false

      const testLayer = WorkspaceClient.testLayer({
        deleteWorkspace: () => {
          deleteCalled = true
          return Effect.void
        }
      })

      const result = yield* deleteWorkspace().pipe(Effect.provide(testLayer))

      expect(result.deleted).toBe(true)
      expect(deleteCalled).toBe(true)
    }))
})

describe("getUserProfile", () => {
  it.effect("returns null when profile not found", () =>
    Effect.gen(function*() {
      const testLayer = WorkspaceClient.testLayer({
        getUserProfile: () => Effect.succeed(null)
      })

      const result = yield* getUserProfile().pipe(Effect.provide(testLayer))

      expect(result).toBeNull()
    }))

  it.effect("returns mapped profile when found", () =>
    Effect.gen(function*() {
      const profile: WorkspaceClientUserProfile = {
        uuid: mkPersonUuid("user-uuid-1234-5678-9abc-def012345678"),
        firstName: "John",
        lastName: "Doe",
        bio: "Developer",
        city: "NYC",
        country: "US",
        website: "https://example.com",
        socialLinks: { github: "johndoe" },
        isPublic: true
      }

      let capturedUuid: string | undefined
      const testLayer = WorkspaceClient.testLayer({
        getUserProfile: (uuid) => {
          capturedUuid = uuid as string | undefined
          return Effect.succeed(profile)
        }
      })

      const result = yield* getUserProfile("11111111-2222-3333-4444-555555555555").pipe(Effect.provide(testLayer))

      expect(capturedUuid).toBe("11111111-2222-3333-4444-555555555555")
      expect(result).not.toBeNull()
      expect(result!.personUuid).toBe("user-uuid-1234-5678-9abc-def012345678")
      expect(result!.firstName).toBe("John")
      expect(result!.lastName).toBe("Doe")
      expect(result!.bio).toBe("Developer")
      expect(result!.city).toBe("NYC")
      expect(result!.country).toBe("US")
      expect(result!.website).toBe("https://example.com")
      expect(result!.socialLinks).toEqual({ github: "johndoe" })
      expect(result!.isPublic).toBe(true)
    }))

  it.effect("normalizes nullable profile fields to undefined", () =>
    Effect.gen(function*() {
      const profile: WorkspaceClientUserProfile = {
        uuid: mkPersonUuid("user-uuid-1234-5678-9abc-def012345678"),
        firstName: "John",
        lastName: "Doe",
        bio: null,
        city: null,
        country: null,
        website: null,
        socialLinks: null,
        isPublic: false
      }

      const testLayer = WorkspaceClient.testLayer({
        getUserProfile: () => Effect.succeed(profile)
      })

      const result = yield* getUserProfile().pipe(Effect.provide(testLayer))

      expect(result).not.toBeNull()
      expect(result!.bio).toBeUndefined()
      expect(result!.city).toBeUndefined()
      expect(result!.country).toBeUndefined()
      expect(result!.website).toBeUndefined()
      expect(result!.socialLinks).toBeUndefined()
      expect(result!.isPublic).toBe(false)
    }))

  it.effect("fails with InvalidPersonUuidError for bad UUID format", () =>
    Effect.gen(function*() {
      const testLayer = WorkspaceClient.testLayer({})

      const error = yield* Effect.flip(
        getUserProfile("not-a-valid-uuid").pipe(Effect.provide(testLayer))
      )

      expect(error._tag).toBe("InvalidPersonUuidError")
      expect((error as InvalidPersonUuidError).uuid).toBe("not-a-valid-uuid")
    }))
})

describe("updateUserProfile", () => {
  it.effect("fails when no fields provided", () =>
    Effect.gen(function*() {
      const testLayer = WorkspaceClient.testLayer({})

      const error = yield* Effect.flip(updateUserProfile({}).pipe(Effect.provide(testLayer)))

      expect(error._tag).toBe("NoUpdateFieldsError")
    }))

  it.effect("updates provided fields", () =>
    Effect.gen(function*() {
      let capturedProfile: Record<string, unknown> | undefined

      const testLayer = WorkspaceClient.testLayer({
        setMyProfile: (profile) => {
          capturedProfile = profile as Record<string, unknown>
          return Effect.void
        }
      })

      const result = yield* updateUserProfile({
        bio: "New bio",
        city: "London",
        country: "UK",
        website: "https://new.example.com",
        isPublic: false
      }).pipe(Effect.provide(testLayer))

      expect(result.updated).toBe(true)
      expect(capturedProfile?.bio).toBe("New bio")
      expect(capturedProfile?.city).toBe("London")
      expect(capturedProfile?.country).toBe("UK")
      expect(capturedProfile?.website).toBe("https://new.example.com")
      expect(capturedProfile?.isPublic).toBe(false)
    }))

  it.effect("clears fields when null values provided", () =>
    Effect.gen(function*() {
      let capturedProfile: Record<string, unknown> | undefined

      const testLayer = WorkspaceClient.testLayer({
        setMyProfile: (profile) => {
          capturedProfile = profile as Record<string, unknown>
          return Effect.void
        }
      })

      const result = yield* updateUserProfile({
        bio: null,
        city: null,
        country: null,
        website: null,
        socialLinks: null
      }).pipe(Effect.provide(testLayer))

      expect(result.updated).toBe(true)
      expect(capturedProfile?.bio).toBe("")
      expect(capturedProfile?.city).toBe("")
      expect(capturedProfile?.country).toBe("")
      expect(capturedProfile?.website).toBe("")
      expect(capturedProfile?.socialLinks).toEqual({})
    }))

  it.effect("updates socialLinks", () =>
    Effect.gen(function*() {
      let capturedProfile: Record<string, unknown> | undefined

      const testLayer = WorkspaceClient.testLayer({
        setMyProfile: (profile) => {
          capturedProfile = profile as Record<string, unknown>
          return Effect.void
        }
      })

      const result = yield* updateUserProfile({
        socialLinks: { github: "user", twitter: "user" }
      }).pipe(Effect.provide(testLayer))

      expect(result.updated).toBe(true)
      expect(capturedProfile?.socialLinks).toEqual({ github: "user", twitter: "user" })
    }))
})

describe("updateGuestSettings", () => {
  it.effect("fails when no settings provided", () =>
    Effect.gen(function*() {
      const testLayer = WorkspaceClient.testLayer({})

      const error = yield* Effect.flip(updateGuestSettings({}).pipe(Effect.provide(testLayer)))

      expect(error._tag).toBe("NoUpdateFieldsError")
    }))

  it.effect("updates allowReadOnly", () =>
    Effect.gen(function*() {
      let readOnlyCalled = false

      const testLayer = WorkspaceClient.testLayer({
        updateAllowReadOnlyGuests: (value) => {
          readOnlyCalled = true
          expect(value).toBe(true)
          return Effect.succeed(undefined)
        }
      })

      const result = yield* updateGuestSettings({ allowReadOnly: true }).pipe(Effect.provide(testLayer))

      expect(result.updated).toBe(true)
      expect(result.allowReadOnly).toBe(true)
      expect(readOnlyCalled).toBe(true)
    }))

  it.effect("updates allowSignUp", () =>
    Effect.gen(function*() {
      let signUpCalled = false

      const testLayer = WorkspaceClient.testLayer({
        updateAllowGuestSignUp: (value) => {
          signUpCalled = true
          expect(value).toBe(false)
          return Effect.void
        }
      })

      const result = yield* updateGuestSettings({ allowSignUp: false }).pipe(Effect.provide(testLayer))

      expect(result.updated).toBe(true)
      expect(result.allowSignUp).toBe(false)
      expect(signUpCalled).toBe(true)
    }))

  it.effect("updates both settings", () =>
    Effect.gen(function*() {
      let readOnlyCalled = false
      let signUpCalled = false

      const testLayer = WorkspaceClient.testLayer({
        updateAllowReadOnlyGuests: () => {
          readOnlyCalled = true
          return Effect.succeed(undefined)
        },
        updateAllowGuestSignUp: () => {
          signUpCalled = true
          return Effect.void
        }
      })

      const result = yield* updateGuestSettings({ allowReadOnly: true, allowSignUp: true }).pipe(
        Effect.provide(testLayer)
      )

      expect(result.updated).toBe(true)
      expect(readOnlyCalled).toBe(true)
      expect(signUpCalled).toBe(true)
    }))
})

describe("createAccessLink", () => {
  it.effect("creates guest link with defaults", () =>
    Effect.gen(function*() {
      let capturedRole: AccountRole | undefined

      const testLayer = WorkspaceClient.testLayer({
        createAccessLink: (role) => {
          capturedRole = role
          return Effect.succeed("https://huly.test/guest")
        }
      })

      const result = yield* createAccessLink({}).pipe(Effect.provide(testLayer))

      expect(result.link).toBe("https://huly.test/guest")
      expect(result.role).toBe("GUEST")
      expect(result.spaces).toBeUndefined()
      expect(capturedRole).toBe(AccountRole.Guest)
    }))

  it.effect("passes anonymous link options and space restrictions", () =>
    Effect.gen(function*() {
      let capturedRole: AccountRole | undefined
      let capturedOptions:
        | {
          readonly spaces?: ReadonlyArray<SpaceId>
          readonly personalized?: boolean
          readonly notBefore?: number
          readonly expiration?: number
          readonly navigateUrl?: string
        }
        | undefined

      const testLayer = WorkspaceClient.testLayer({
        createAccessLink: (role, options) => {
          capturedRole = role
          capturedOptions = options
          return Effect.succeed("https://huly.test/anonymous")
        }
      })

      const result = yield* createAccessLink({
        role: "READONLYGUEST",
        spaces: [spaceBrandId("space-docs"), spaceBrandId("space-cards")],
        personalized: false,
        notBefore: 1,
        expiration: 2,
        navigateUrl: "/workbench"
      }).pipe(Effect.provide(testLayer))

      expect(result.link).toBe("https://huly.test/anonymous")
      expect(result.role).toBe("READONLYGUEST")
      expect(result.spaces).toEqual(["space-docs", "space-cards"])
      expect(result.personalized).toBe(false)
      expect(capturedRole).toBe(AccountRole.ReadOnlyGuest)
      expect(capturedOptions).toEqual({
        navigateUrl: "/workbench",
        spaces: ["space-docs", "space-cards"],
        notBefore: 1,
        expiration: 2,
        personalized: false
      })
    }))

  it.effect("forwards a personalized guest's first and last name", () =>
    Effect.gen(function*() {
      let capturedOptions: { readonly firstName?: string; readonly lastName?: string } | undefined

      const testLayer = WorkspaceClient.testLayer({
        createAccessLink: (_role, options) => {
          capturedOptions = options
          return Effect.succeed("https://huly.test/named")
        }
      })

      const result = yield* createAccessLink({
        firstName: "Ada",
        lastName: "Lovelace",
        personalized: true
      }).pipe(Effect.provide(testLayer))

      expect(result.link).toBe("https://huly.test/named")
      expect(capturedOptions).toEqual({ firstName: "Ada", lastName: "Lovelace", personalized: true })
    }))
})

describe("getRegions", () => {
  it.effect("returns mapped region info", () =>
    Effect.gen(function*() {
      const regions: Array<HulyRegionInfo> = [
        { region: "us-east", name: "US East" },
        { region: "eu-west", name: "EU West" }
      ]

      const testLayer = WorkspaceClient.testLayer({
        getRegionInfo: () => Effect.succeed(regions)
      })

      const result = yield* getRegions().pipe(Effect.provide(testLayer))

      expect(result).toHaveLength(2)
      expect(assertAt(result, 0).region).toBe("us-east")
      expect(assertAt(result, 0).name).toBe("US East")
      expect(assertAt(result, 1).region).toBe("eu-west")
      expect(assertAt(result, 1).name).toBe("EU West")
    }))

  it.effect("returns empty array when no regions", () =>
    Effect.gen(function*() {
      const testLayer = WorkspaceClient.testLayer({
        getRegionInfo: () => Effect.succeed([])
      })

      const result = yield* getRegions().pipe(Effect.provide(testLayer))

      expect(result).toHaveLength(0)
    }))
})
