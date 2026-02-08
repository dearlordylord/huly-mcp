import { describe, it } from "@effect/vitest"
import type { AccountClient, PersonWithProfile, RegionInfo, WorkspaceLoginInfo } from "@hcengineering/account-client"
import type {
  AccountRole,
  Person,
  PersonInfo,
  PersonUuid,
  SocialId,
  WorkspaceInfoWithStatus,
  WorkspaceMemberInfo
} from "@hcengineering/core"
import { Cause, Effect, Exit, Layer } from "effect"
import { beforeEach, expect, vi } from "vitest"

import { HulyConfigService } from "../../src/config/config.js"
import { HulyConnectionError } from "../../src/huly/errors.js"
import { WorkspaceClient, type WorkspaceClientError } from "../../src/huly/workspace-client.js"

// --- mocks for external Huly SDK modules ---

const mockGetWorkspaceMembers = vi.fn<() => Promise<Array<WorkspaceMemberInfo>>>()
const mockGetPersonInfo = vi.fn<(account: PersonUuid) => Promise<PersonInfo>>()
const mockUpdateWorkspaceRole = vi.fn<(account: string, role: AccountRole) => Promise<void>>()
const mockGetWorkspaceInfo = vi.fn<(updateLastVisit?: boolean) => Promise<WorkspaceInfoWithStatus>>()
const mockGetUserWorkspaces = vi.fn<() => Promise<Array<WorkspaceInfoWithStatus>>>()
const mockCreateWorkspace = vi.fn<(name: string, region?: string) => Promise<WorkspaceLoginInfo>>()
const mockDeleteWorkspace = vi.fn<() => Promise<void>>()
const mockGetUserProfile = vi.fn<(personUuid?: PersonUuid) => Promise<PersonWithProfile | null>>()
const mockSetMyProfile = vi.fn<(profile: Record<string, unknown>) => Promise<void>>()
const mockUpdateAllowReadOnlyGuests = vi.fn<
  (v: boolean) => Promise<{ guestPerson: Person; guestSocialIds: Array<SocialId> } | undefined>
>()
const mockUpdateAllowGuestSignUp = vi.fn<(v: boolean) => Promise<void>>()
const mockGetRegionInfo = vi.fn<() => Promise<Array<RegionInfo>>>()

// eslint-disable-next-line no-restricted-syntax -- test mock requires double cast through unknown
const mockAccountClient: AccountClient = {
  getWorkspaceMembers: mockGetWorkspaceMembers,
  getPersonInfo: mockGetPersonInfo,
  updateWorkspaceRole: mockUpdateWorkspaceRole,
  getWorkspaceInfo: mockGetWorkspaceInfo,
  getUserWorkspaces: mockGetUserWorkspaces,
  createWorkspace: mockCreateWorkspace,
  deleteWorkspace: mockDeleteWorkspace,
  getUserProfile: mockGetUserProfile,
  setMyProfile: mockSetMyProfile,
  updateAllowReadOnlyGuests: mockUpdateAllowReadOnlyGuests,
  updateAllowGuestSignUp: mockUpdateAllowGuestSignUp,
  getRegionInfo: mockGetRegionInfo
} as unknown as AccountClient

vi.mock("@hcengineering/account-client", () => ({
  getClient: () => mockAccountClient
}))

vi.mock("@hcengineering/api-client", () => ({
  loadServerConfig: () => Promise.resolve({ ACCOUNTS_URL: "http://accounts.test" }),
  getWorkspaceToken: () =>
    Promise.resolve({ token: "test-token", endpoint: "http://endpoint.test", workspaceId: "ws-id" })
}))

const testConfig = HulyConfigService.testLayer({
  url: "http://huly.test",
  email: "test@test.com",
  password: "pass",
  workspace: "test-ws"
})

describe("WorkspaceClient.layer (real layer)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // test-revizorro: scheduled
  it.effect("constructs layer and getWorkspaceMembers delegates to AccountClient", () =>
    Effect.gen(function*() {
      const mockMembers: Array<WorkspaceMemberInfo> = [
        // eslint-disable-next-line no-restricted-syntax -- test mock requires double cast through unknown
        { person: "p1" as unknown as WorkspaceMemberInfo["person"], role: 0 as AccountRole }
      ]
      mockGetWorkspaceMembers.mockResolvedValue(mockMembers)

      const client = yield* WorkspaceClient
      const result = yield* client.getWorkspaceMembers()

      expect(result).toEqual(mockMembers)
      expect(mockGetWorkspaceMembers).toHaveBeenCalledOnce()
    }).pipe(Effect.provide(Layer.provide(WorkspaceClient.layer, testConfig))))

  // test-revizorro: approved
  it.effect("getPersonInfo delegates to AccountClient", () =>
    Effect.gen(function*() {
      // eslint-disable-next-line no-restricted-syntax -- test mock requires double cast through unknown
      const personInfo = { name: "Alice", socialIds: [] } as unknown as PersonInfo
      mockGetPersonInfo.mockResolvedValue(personInfo)

      const client = yield* WorkspaceClient
      const result = yield* client.getPersonInfo("person-1" as PersonUuid)

      expect(result).toEqual(personInfo)
      expect(mockGetPersonInfo).toHaveBeenCalledWith("person-1")
    }).pipe(Effect.provide(Layer.provide(WorkspaceClient.layer, testConfig))))

  // test-revizorro: approved
  it.effect("updateWorkspaceRole delegates to AccountClient", () =>
    Effect.gen(function*() {
      mockUpdateWorkspaceRole.mockResolvedValue(undefined)

      const client = yield* WorkspaceClient
      yield* client.updateWorkspaceRole("acc-1", 1 as AccountRole)

      expect(mockUpdateWorkspaceRole).toHaveBeenCalledWith("acc-1", 1)
    }).pipe(Effect.provide(Layer.provide(WorkspaceClient.layer, testConfig))))

  // test-revizorro: approved
  it.effect("getWorkspaceInfo delegates to AccountClient", () =>
    Effect.gen(function*() {
      // eslint-disable-next-line no-restricted-syntax -- test mock requires double cast through unknown
      const wsInfo = { uuid: "ws-1", name: "Test" } as unknown as WorkspaceInfoWithStatus
      mockGetWorkspaceInfo.mockResolvedValue(wsInfo)

      const client = yield* WorkspaceClient
      const result = yield* client.getWorkspaceInfo(true)

      expect(result).toEqual(wsInfo)
      expect(mockGetWorkspaceInfo).toHaveBeenCalledWith(true)
    }).pipe(Effect.provide(Layer.provide(WorkspaceClient.layer, testConfig))))

  // test-revizorro: approved
  it.effect("getWorkspaceInfo without arg delegates correctly", () =>
    Effect.gen(function*() {
      // eslint-disable-next-line no-restricted-syntax -- test mock requires double cast through unknown
      const wsInfo = { uuid: "ws-2", name: "Test2" } as unknown as WorkspaceInfoWithStatus
      mockGetWorkspaceInfo.mockResolvedValue(wsInfo)

      const client = yield* WorkspaceClient
      const result = yield* client.getWorkspaceInfo()

      expect(result).toEqual(wsInfo)
      expect(mockGetWorkspaceInfo).toHaveBeenCalledWith(undefined)
    }).pipe(Effect.provide(Layer.provide(WorkspaceClient.layer, testConfig))))

  // test-revizorro: approved
  it.effect("getUserWorkspaces delegates to AccountClient", () =>
    Effect.gen(function*() {
      // eslint-disable-next-line no-restricted-syntax -- test mock requires double cast through unknown
      const workspaces = [{ uuid: "ws-1" }] as unknown as Array<WorkspaceInfoWithStatus>
      mockGetUserWorkspaces.mockResolvedValue(workspaces)

      const client = yield* WorkspaceClient
      const result = yield* client.getUserWorkspaces()

      expect(result).toEqual(workspaces)
      expect(mockGetUserWorkspaces).toHaveBeenCalledOnce()
    }).pipe(Effect.provide(Layer.provide(WorkspaceClient.layer, testConfig))))

  // test-revizorro: approved
  it.effect("createWorkspace delegates to AccountClient", () =>
    Effect.gen(function*() {
      // eslint-disable-next-line no-restricted-syntax -- test mock requires double cast through unknown
      const loginInfo = { workspace: "new-ws", workspaceUrl: "new-ws-url" } as unknown as WorkspaceLoginInfo
      mockCreateWorkspace.mockResolvedValue(loginInfo)

      const client = yield* WorkspaceClient
      const result = yield* client.createWorkspace("My Workspace", "us-east")

      expect(result).toEqual(loginInfo)
      expect(mockCreateWorkspace).toHaveBeenCalledWith("My Workspace", "us-east")
    }).pipe(Effect.provide(Layer.provide(WorkspaceClient.layer, testConfig))))

  // test-revizorro: scheduled
  it.effect("deleteWorkspace delegates to AccountClient", () =>
    Effect.gen(function*() {
      mockDeleteWorkspace.mockResolvedValue(undefined)

      const client = yield* WorkspaceClient
      yield* client.deleteWorkspace()

      expect(mockDeleteWorkspace).toHaveBeenCalledOnce()
    }).pipe(Effect.provide(Layer.provide(WorkspaceClient.layer, testConfig))))

  // test-revizorro: approved
  it.effect("getUserProfile delegates to AccountClient", () =>
    Effect.gen(function*() {
      // eslint-disable-next-line no-restricted-syntax -- test mock requires double cast through unknown
      const profile = { uuid: "p1", firstName: "John" } as unknown as PersonWithProfile
      mockGetUserProfile.mockResolvedValue(profile)

      const client = yield* WorkspaceClient
      const result = yield* client.getUserProfile("person-uuid" as PersonUuid)

      expect(result).toEqual(profile)
      expect(mockGetUserProfile).toHaveBeenCalledWith("person-uuid")
    }).pipe(Effect.provide(Layer.provide(WorkspaceClient.layer, testConfig))))

  // test-revizorro: approved
  it.effect("getUserProfile without arg delegates correctly", () =>
    Effect.gen(function*() {
      mockGetUserProfile.mockResolvedValue(null)

      const client = yield* WorkspaceClient
      const result = yield* client.getUserProfile()

      expect(result).toBeNull()
      expect(mockGetUserProfile).toHaveBeenCalledWith(undefined)
    }).pipe(Effect.provide(Layer.provide(WorkspaceClient.layer, testConfig))))

  // test-revizorro: approved
  it.effect("setMyProfile delegates to AccountClient", () =>
    Effect.gen(function*() {
      mockSetMyProfile.mockResolvedValue(undefined)

      const client = yield* WorkspaceClient
      yield* client.setMyProfile({ bio: "dev" })

      expect(mockSetMyProfile).toHaveBeenCalledWith({ bio: "dev" })
    }).pipe(Effect.provide(Layer.provide(WorkspaceClient.layer, testConfig))))

  // test-revizorro: suspect | Mock only returns undefined, missing test for object return type; weak assertion that just checks mock passthrough
  it.effect("updateAllowReadOnlyGuests delegates to AccountClient", () =>
    Effect.gen(function*() {
      mockUpdateAllowReadOnlyGuests.mockResolvedValue(undefined)

      const client = yield* WorkspaceClient
      const result = yield* client.updateAllowReadOnlyGuests(true)

      expect(result).toBeUndefined()
      expect(mockUpdateAllowReadOnlyGuests).toHaveBeenCalledWith(true)
    }).pipe(Effect.provide(Layer.provide(WorkspaceClient.layer, testConfig))))

  // test-revizorro: suspect | Missing assertion on Effect result; doesn't verify return value or effect execution
  it.effect("updateAllowGuestSignUp delegates to AccountClient", () =>
    Effect.gen(function*() {
      mockUpdateAllowGuestSignUp.mockResolvedValue(undefined)

      const client = yield* WorkspaceClient
      yield* client.updateAllowGuestSignUp(false)

      expect(mockUpdateAllowGuestSignUp).toHaveBeenCalledWith(false)
    }).pipe(Effect.provide(Layer.provide(WorkspaceClient.layer, testConfig))))

  // test-revizorro: approved
  it.effect("getRegionInfo delegates to AccountClient", () =>
    Effect.gen(function*() {
      const regions: Array<RegionInfo> = [{ region: "us-east", name: "US East" }]
      mockGetRegionInfo.mockResolvedValue(regions)

      const client = yield* WorkspaceClient
      const result = yield* client.getRegionInfo()

      expect(result).toEqual(regions)
      expect(mockGetRegionInfo).toHaveBeenCalledOnce()
    }).pipe(Effect.provide(Layer.provide(WorkspaceClient.layer, testConfig))))

  describe("error handling (withClient)", () => {
    // test-revizorro: approved
    it.effect("wraps operation rejection as HulyConnectionError", () =>
      Effect.gen(function*() {
        mockGetWorkspaceMembers.mockRejectedValue(new Error("network failure"))

        const client = yield* WorkspaceClient
        const error = yield* Effect.flip(client.getWorkspaceMembers())

        expect(error._tag).toBe("HulyConnectionError")
        expect(error.message).toContain("Failed to get workspace members")
        expect(error.message).toContain("network failure")
      }).pipe(Effect.provide(Layer.provide(WorkspaceClient.layer, testConfig))))

    // test-revizorro: approved
    it.effect("wraps getPersonInfo rejection as HulyConnectionError", () =>
      Effect.gen(function*() {
        mockGetPersonInfo.mockRejectedValue(new Error("person lookup failed"))

        const client = yield* WorkspaceClient
        const error = yield* Effect.flip(client.getPersonInfo("p1" as PersonUuid))

        expect(error._tag).toBe("HulyConnectionError")
        expect(error.message).toContain("Failed to get person info")
      }).pipe(Effect.provide(Layer.provide(WorkspaceClient.layer, testConfig))))

    // test-revizorro: approved
    it.effect("wraps updateWorkspaceRole rejection", () =>
      Effect.gen(function*() {
        mockUpdateWorkspaceRole.mockRejectedValue(new Error("role update error"))

        const client = yield* WorkspaceClient
        const error = yield* Effect.flip(client.updateWorkspaceRole("acc", 0 as AccountRole))

        expect(error._tag).toBe("HulyConnectionError")
        expect(error.message).toContain("Failed to update workspace role")
      }).pipe(Effect.provide(Layer.provide(WorkspaceClient.layer, testConfig))))

    // test-revizorro: approved
    it.effect("wraps getWorkspaceInfo rejection", () =>
      Effect.gen(function*() {
        mockGetWorkspaceInfo.mockRejectedValue(new Error("ws info error"))

        const client = yield* WorkspaceClient
        const error = yield* Effect.flip(client.getWorkspaceInfo())

        expect(error._tag).toBe("HulyConnectionError")
        expect(error.message).toContain("Failed to get workspace info")
      }).pipe(Effect.provide(Layer.provide(WorkspaceClient.layer, testConfig))))

    // test-revizorro: approved
    it.effect("wraps getUserWorkspaces rejection", () =>
      Effect.gen(function*() {
        mockGetUserWorkspaces.mockRejectedValue(new Error("list error"))

        const client = yield* WorkspaceClient
        const error = yield* Effect.flip(client.getUserWorkspaces())

        expect(error._tag).toBe("HulyConnectionError")
        expect(error.message).toContain("Failed to get user workspaces")
      }).pipe(Effect.provide(Layer.provide(WorkspaceClient.layer, testConfig))))

    // test-revizorro: approved
    it.effect("wraps createWorkspace rejection", () =>
      Effect.gen(function*() {
        mockCreateWorkspace.mockRejectedValue(new Error("create error"))

        const client = yield* WorkspaceClient
        const error = yield* Effect.flip(client.createWorkspace("new"))

        expect(error._tag).toBe("HulyConnectionError")
        expect(error.message).toContain("Failed to create workspace")
      }).pipe(Effect.provide(Layer.provide(WorkspaceClient.layer, testConfig))))

    // test-revizorro: approved
    it.effect("wraps deleteWorkspace rejection", () =>
      Effect.gen(function*() {
        mockDeleteWorkspace.mockRejectedValue(new Error("delete error"))

        const client = yield* WorkspaceClient
        const error = yield* Effect.flip(client.deleteWorkspace())

        expect(error._tag).toBe("HulyConnectionError")
        expect(error.message).toContain("Failed to delete workspace")
      }).pipe(Effect.provide(Layer.provide(WorkspaceClient.layer, testConfig))))

    // test-revizorro: approved
    it.effect("wraps getUserProfile rejection", () =>
      Effect.gen(function*() {
        mockGetUserProfile.mockRejectedValue(new Error("profile error"))

        const client = yield* WorkspaceClient
        const error = yield* Effect.flip(client.getUserProfile())

        expect(error._tag).toBe("HulyConnectionError")
        expect(error.message).toContain("Failed to get user profile")
      }).pipe(Effect.provide(Layer.provide(WorkspaceClient.layer, testConfig))))

    // test-revizorro: approved
    it.effect("wraps setMyProfile rejection", () =>
      Effect.gen(function*() {
        mockSetMyProfile.mockRejectedValue(new Error("set profile error"))

        const client = yield* WorkspaceClient
        const error = yield* Effect.flip(client.setMyProfile({}))

        expect(error._tag).toBe("HulyConnectionError")
        expect(error.message).toContain("Failed to set my profile")
      }).pipe(Effect.provide(Layer.provide(WorkspaceClient.layer, testConfig))))

    // test-revizorro: approved
    it.effect("wraps updateAllowReadOnlyGuests rejection", () =>
      Effect.gen(function*() {
        mockUpdateAllowReadOnlyGuests.mockRejectedValue(new Error("guest error"))

        const client = yield* WorkspaceClient
        const error = yield* Effect.flip(client.updateAllowReadOnlyGuests(true))

        expect(error._tag).toBe("HulyConnectionError")
        expect(error.message).toContain("Failed to update read-only guest setting")
      }).pipe(Effect.provide(Layer.provide(WorkspaceClient.layer, testConfig))))

    // test-revizorro: approved
    it.effect("wraps updateAllowGuestSignUp rejection", () =>
      Effect.gen(function*() {
        mockUpdateAllowGuestSignUp.mockRejectedValue(new Error("signup error"))

        const client = yield* WorkspaceClient
        const error = yield* Effect.flip(client.updateAllowGuestSignUp(false))

        expect(error._tag).toBe("HulyConnectionError")
        expect(error.message).toContain("Failed to update guest sign-up setting")
      }).pipe(Effect.provide(Layer.provide(WorkspaceClient.layer, testConfig))))

    // test-revizorro: approved
    it.effect("wraps getRegionInfo rejection", () =>
      Effect.gen(function*() {
        mockGetRegionInfo.mockRejectedValue(new Error("region error"))

        const client = yield* WorkspaceClient
        const error = yield* Effect.flip(client.getRegionInfo())

        expect(error._tag).toBe("HulyConnectionError")
        expect(error.message).toContain("Failed to get region info")
      }).pipe(Effect.provide(Layer.provide(WorkspaceClient.layer, testConfig))))
  })
})

describe("WorkspaceClient.testLayer", () => {
  // test-revizorro: suspect | only checks .toBeDefined() - doesn't test actual default behaviors or return values
  it.effect("provides all default operations", () =>
    Effect.gen(function*() {
      const client = yield* WorkspaceClient.pipe(
        Effect.provide(WorkspaceClient.testLayer({}))
      )

      expect(client.getWorkspaceMembers).toBeDefined()
      expect(client.getPersonInfo).toBeDefined()
      expect(client.updateWorkspaceRole).toBeDefined()
      expect(client.getWorkspaceInfo).toBeDefined()
      expect(client.getUserWorkspaces).toBeDefined()
      expect(client.createWorkspace).toBeDefined()
      expect(client.deleteWorkspace).toBeDefined()
      expect(client.getUserProfile).toBeDefined()
      expect(client.setMyProfile).toBeDefined()
      expect(client.updateAllowReadOnlyGuests).toBeDefined()
      expect(client.updateAllowGuestSignUp).toBeDefined()
      expect(client.getRegionInfo).toBeDefined()
    }))

  // test-revizorro: suspect | Tests only the test layer mock, not actual getWorkspaceMembers behavior; needs to verify real AccountClient integration
  it.effect("default getWorkspaceMembers returns empty array", () =>
    Effect.gen(function*() {
      const client = yield* WorkspaceClient.pipe(
        Effect.provide(WorkspaceClient.testLayer({}))
      )
      const result = yield* client.getWorkspaceMembers()
      expect(result).toEqual([])
    }))

  // test-revizorro: approved
  it.effect("default getUserWorkspaces returns empty array", () =>
    Effect.gen(function*() {
      const client = yield* WorkspaceClient.pipe(
        Effect.provide(WorkspaceClient.testLayer({}))
      )
      const result = yield* client.getUserWorkspaces()
      expect(result).toEqual([])
    }))

  // test-revizorro: approved
  it.effect("default getUserProfile returns null", () =>
    Effect.gen(function*() {
      const client = yield* WorkspaceClient.pipe(
        Effect.provide(WorkspaceClient.testLayer({}))
      )
      const result = yield* client.getUserProfile()
      expect(result).toBeNull()
    }))

  // test-revizorro: suspect | tests hardcoded test layer default, not actual behavior
  it.effect("default getRegionInfo returns empty array", () =>
    Effect.gen(function*() {
      const client = yield* WorkspaceClient.pipe(
        Effect.provide(WorkspaceClient.testLayer({}))
      )
      const result = yield* client.getRegionInfo()
      expect(result).toEqual([])
    }))

  // test-revizorro: scheduled
  it.effect("default getPersonInfo dies (not implemented)", () =>
    Effect.gen(function*() {
      const client = yield* WorkspaceClient.pipe(
        Effect.provide(WorkspaceClient.testLayer({}))
      )
      const exit = yield* Effect.exit(client.getPersonInfo("p" as PersonUuid))
      expect(Exit.isFailure(exit) && Cause.isDie(exit.cause)).toBe(true)
    }))

  // test-revizorro: approved
  it.effect("default updateWorkspaceRole dies (not implemented)", () =>
    Effect.gen(function*() {
      const client = yield* WorkspaceClient.pipe(
        Effect.provide(WorkspaceClient.testLayer({}))
      )
      const exit = yield* Effect.exit(client.updateWorkspaceRole("acc", 0 as AccountRole))
      expect(Exit.isFailure(exit) && Cause.isDie(exit.cause)).toBe(true)
    }))

  // test-revizorro: approved
  it.effect("default getWorkspaceInfo dies (not implemented)", () =>
    Effect.gen(function*() {
      const client = yield* WorkspaceClient.pipe(
        Effect.provide(WorkspaceClient.testLayer({}))
      )
      const exit = yield* Effect.exit(client.getWorkspaceInfo())
      expect(Exit.isFailure(exit) && Cause.isDie(exit.cause)).toBe(true)
    }))

  // test-revizorro: scheduled
  it.effect("default createWorkspace dies (not implemented)", () =>
    Effect.gen(function*() {
      const client = yield* WorkspaceClient.pipe(
        Effect.provide(WorkspaceClient.testLayer({}))
      )
      const exit = yield* Effect.exit(client.createWorkspace("ws"))
      expect(Exit.isFailure(exit) && Cause.isDie(exit.cause)).toBe(true)
    }))

  // test-revizorro: approved
  it.effect("default deleteWorkspace dies (not implemented)", () =>
    Effect.gen(function*() {
      const client = yield* WorkspaceClient.pipe(
        Effect.provide(WorkspaceClient.testLayer({}))
      )
      const exit = yield* Effect.exit(client.deleteWorkspace())
      expect(Exit.isFailure(exit) && Cause.isDie(exit.cause)).toBe(true)
    }))

  // test-revizorro: approved
  it.effect("default setMyProfile dies (not implemented)", () =>
    Effect.gen(function*() {
      const client = yield* WorkspaceClient.pipe(
        Effect.provide(WorkspaceClient.testLayer({}))
      )
      const exit = yield* Effect.exit(client.setMyProfile({}))
      expect(Exit.isFailure(exit) && Cause.isDie(exit.cause)).toBe(true)
    }))

  // test-revizorro: approved
  it.effect("default updateAllowReadOnlyGuests dies (not implemented)", () =>
    Effect.gen(function*() {
      const client = yield* WorkspaceClient.pipe(
        Effect.provide(WorkspaceClient.testLayer({}))
      )
      const exit = yield* Effect.exit(client.updateAllowReadOnlyGuests(true))
      expect(Exit.isFailure(exit) && Cause.isDie(exit.cause)).toBe(true)
    }))

  // test-revizorro: approved
  it.effect("default updateAllowGuestSignUp dies (not implemented)", () =>
    Effect.gen(function*() {
      const client = yield* WorkspaceClient.pipe(
        Effect.provide(WorkspaceClient.testLayer({}))
      )
      const exit = yield* Effect.exit(client.updateAllowGuestSignUp(true))
      expect(Exit.isFailure(exit) && Cause.isDie(exit.cause)).toBe(true)
    }))

  // test-revizorro: approved
  it.effect("overrides merge with defaults", () =>
    Effect.gen(function*() {
      // eslint-disable-next-line no-restricted-syntax -- test mock requires double cast through unknown
      const customMembers = [{ person: "p1" }] as unknown as Array<WorkspaceMemberInfo>
      const client = yield* WorkspaceClient.pipe(
        Effect.provide(WorkspaceClient.testLayer({
          getWorkspaceMembers: () => Effect.succeed(customMembers)
        }))
      )

      const members = yield* client.getWorkspaceMembers()
      expect(members).toHaveLength(1)

      // Other defaults still work
      const profile = yield* client.getUserProfile()
      expect(profile).toBeNull()
    }))

  // test-revizorro: approved
  it.effect("can mock operation to return error", () =>
    Effect.gen(function*() {
      const client = yield* WorkspaceClient.pipe(
        Effect.provide(WorkspaceClient.testLayer({
          getWorkspaceMembers: () => Effect.fail(new HulyConnectionError({ message: "mock error" }))
        }))
      )

      const error = yield* Effect.flip(client.getWorkspaceMembers())
      expect(error._tag).toBe("HulyConnectionError")
      expect(error.message).toBe("mock error")
    }))
})

describe("WorkspaceClientError type", () => {
  // test-revizorro: suspect | Test claims to verify union but only tests HulyConnectionError path, not HulyAuthError
  it.effect("is union of HulyConnectionError and HulyAuthError", () =>
    Effect.gen(function*() {
      const handleError = (error: WorkspaceClientError): string => {
        switch (error._tag) {
          case "HulyConnectionError":
            return `Connection: ${error.message}`
          case "HulyAuthError":
            return `Auth: ${error.message}`
        }
      }

      const connErr = new HulyConnectionError({ message: "timeout" })
      expect(handleError(connErr)).toBe("Connection: timeout")
    }))
})
