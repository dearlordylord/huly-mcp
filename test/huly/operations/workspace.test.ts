import { describe, it } from "@effect/vitest"
import type { PersonWithProfile, RegionInfo as HulyRegionInfo, WorkspaceLoginInfo } from "@hcengineering/account-client"
import { AccountRole, type AccountUuid, type PersonUuid, type WorkspaceInfoWithStatus } from "@hcengineering/core"
import { Effect } from "effect"
import { expect } from "vitest"

import type { InvalidPersonUuidError } from "../../../src/huly/errors.js"
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
} from "../../../src/huly/operations/workspace.js"
import { WorkspaceClient } from "../../../src/huly/workspace-client.js"

// eslint-disable-next-line no-restricted-syntax -- test mock requires double cast through unknown
const mkAccountUuid = (id: string) => id as unknown as AccountUuid
// eslint-disable-next-line no-restricted-syntax -- test mock requires double cast through unknown
const mkPersonUuid = (id: string) => id as unknown as PersonUuid

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
  // test-revizorro: approved
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
      expect(result[0].personId).toBe("person-1")
      expect(result[0].role).toBe(AccountRole.Owner)
      expect(result[0].name).toBe("Alice")
      expect(result[0].email).toBe("alice@test.com")

      expect(result[1].personId).toBe("person-2")
      expect(result[1].role).toBe(AccountRole.User)
      expect(result[1].name).toBe("Bob")
      expect(result[1].email).toBeUndefined()
    }))

  // test-revizorro: approved
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
      expect(result[0].personId).toBe("person-1")
      expect(result[0].name).toBeUndefined()
      expect(result[0].email).toBeUndefined()
    }))

  // test-revizorro: approved
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
  // test-revizorro: approved
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

      const result = yield* updateMemberRole({ accountId: "acc-1", role: "MAINTAINER" }).pipe(
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
  // test-revizorro: approved
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

  // test-revizorro: approved
  it.effect("handles undefined region", () =>
    Effect.gen(function*() {
      const wsInfo = mkWorkspaceInfo({ region: undefined })

      const testLayer = WorkspaceClient.testLayer({
        getWorkspaceInfo: () => Effect.succeed(wsInfo)
      })

      const result = yield* getWorkspaceInfo().pipe(Effect.provide(testLayer))

      expect(result.region).toBeUndefined()
    }))
})

describe("listWorkspaces", () => {
  // test-revizorro: approved
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
      expect(result[0].uuid).toBe("ws-1")
      expect(result[0].name).toBe("WS 1")
      expect(result[0].lastVisit).toBe(1700000001000)
      expect(result[1].uuid).toBe("ws-2")
    }))

  // test-revizorro: approved
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
  // test-revizorro: approved
  it.effect("creates workspace and returns result", () =>
    Effect.gen(function*() {
      let capturedName: string | undefined
      let capturedRegion: string | undefined

      const testLayer = WorkspaceClient.testLayer({
        createWorkspace: (name, region) => {
          capturedName = name
          capturedRegion = region
          // eslint-disable-next-line no-restricted-syntax -- test mock requires double cast through unknown
          return Effect.succeed({
            workspace: "new-ws-uuid",
            workspaceUrl: "new-workspace"
          } as unknown as WorkspaceLoginInfo)
        }
      })

      const result = yield* createWorkspace({ name: "New Workspace", region: "eu-west" }).pipe(
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
  // test-revizorro: approved
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
  // test-revizorro: approved
  it.effect("returns null when profile not found", () =>
    Effect.gen(function*() {
      const testLayer = WorkspaceClient.testLayer({
        getUserProfile: () => Effect.succeed(null)
      })

      const result = yield* getUserProfile().pipe(Effect.provide(testLayer))

      expect(result).toBeNull()
    }))

  // test-revizorro: suspect | Missing assertion for personUuid field transformation, doesn't verify UUID passed to mock
  it.effect("returns mapped profile when found", () =>
    Effect.gen(function*() {
      const profile: PersonWithProfile = {
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

      const testLayer = WorkspaceClient.testLayer({
        getUserProfile: () => Effect.succeed(profile)
      })

      const result = yield* getUserProfile("11111111-2222-3333-4444-555555555555").pipe(Effect.provide(testLayer))

      expect(result).not.toBeNull()
      expect(result!.firstName).toBe("John")
      expect(result!.lastName).toBe("Doe")
      expect(result!.bio).toBe("Developer")
      expect(result!.city).toBe("NYC")
      expect(result!.country).toBe("US")
      expect(result!.website).toBe("https://example.com")
      expect(result!.socialLinks).toEqual({ github: "johndoe" })
      expect(result!.isPublic).toBe(true)
    }))

  // test-revizorro: approved
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
  // test-revizorro: approved
  it.effect("returns updated=false when no fields provided", () =>
    Effect.gen(function*() {
      const testLayer = WorkspaceClient.testLayer({})

      const result = yield* updateUserProfile({}).pipe(Effect.provide(testLayer))

      expect(result.updated).toBe(false)
    }))

  // test-revizorro: scheduled
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

  // test-revizorro: approved
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

  // test-revizorro: suspect | missing assertion for result.updated === true, inconsistent with similar test
  it.effect("updates socialLinks", () =>
    Effect.gen(function*() {
      let capturedProfile: Record<string, unknown> | undefined

      const testLayer = WorkspaceClient.testLayer({
        setMyProfile: (profile) => {
          capturedProfile = profile as Record<string, unknown>
          return Effect.void
        }
      })

      yield* updateUserProfile({
        socialLinks: { github: "user", twitter: "user" }
      }).pipe(Effect.provide(testLayer))

      expect(capturedProfile?.socialLinks).toEqual({ github: "user", twitter: "user" })
    }))
})

describe("updateGuestSettings", () => {
  // test-revizorro: approved
  it.effect("returns updated=false when no settings provided", () =>
    Effect.gen(function*() {
      const testLayer = WorkspaceClient.testLayer({})

      const result = yield* updateGuestSettings({}).pipe(Effect.provide(testLayer))

      expect(result.updated).toBe(false)
      expect(result.allowReadOnly).toBeUndefined()
      expect(result.allowSignUp).toBeUndefined()
    }))

  // test-revizorro: approved
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

  // test-revizorro: approved
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

  // test-revizorro: approved
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

describe("getRegions", () => {
  // test-revizorro: approved
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
      expect(result[0].region).toBe("us-east")
      expect(result[0].name).toBe("US East")
      expect(result[1].region).toBe("eu-west")
      expect(result[1].name).toBe("EU West")
    }))

  // test-revizorro: approved
  it.effect("returns empty array when no regions", () =>
    Effect.gen(function*() {
      const testLayer = WorkspaceClient.testLayer({
        getRegionInfo: () => Effect.succeed([])
      })

      const result = yield* getRegions().pipe(Effect.provide(testLayer))

      expect(result).toHaveLength(0)
    }))
})
