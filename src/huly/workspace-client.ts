/**
 * WorkspaceClient - Workspace and account management operations.
 *
 * Uses @hcengineering/account-client (AccountClient) for:
 * - Workspace lifecycle: create, delete, list workspaces
 * - Member management: list members, update roles
 * - User profiles: get/update profile settings
 * - Guest settings: read-only access, sign-up permissions
 * - Regions: available deployment regions
 *
 * For data operations within a workspace (issues, documents, etc.),
 * see HulyClient in client.ts.
 *
 * @module
 */
import type {
  AccountClient,
  PersonWithProfile,
  RegionInfo,
  UserProfile,
  WorkspaceLoginInfo
} from "@hcengineering/account-client"
import type {
  AccountRole,
  Person,
  PersonInfo,
  PersonUuid,
  SocialId,
  WorkspaceInfoWithStatus,
  WorkspaceMemberInfo
} from "@hcengineering/core"
import { Context, Effect, Layer } from "effect"

import { HulyConfigService } from "../config/config.js"
import type { SpaceId } from "../domain/schemas/shared.js"
import { authToOptions, type ConnectionConfig, type ConnectionError, connectWithRetry } from "./client.js"
import { type HulyConnectionOperation, makeOperationConnectionError } from "./errors-base.js"
import { HulySdk, type HulySdkDependencies } from "./sdk-deps.js"

export type WorkspaceClientError = ConnectionError

interface CreateAccessLinkOptions {
  readonly firstName?: string
  readonly lastName?: string
  readonly navigateUrl?: string
  readonly spaces?: ReadonlyArray<SpaceId>
  readonly notBefore?: number
  readonly expiration?: number
  readonly personalized?: boolean
}

export type WorkspaceClientUserProfile = Omit<
  PersonWithProfile,
  "bio" | "city" | "country" | "website" | "socialLinks"
> & {
  readonly bio?: string | null
  readonly city?: string | null
  readonly country?: string | null
  readonly website?: string | null
  readonly socialLinks?: Record<string, string> | null
}

export interface WorkspaceClientOperations {
  readonly getWorkspaceMembers: () => Effect.Effect<Array<WorkspaceMemberInfo>, WorkspaceClientError>
  readonly getCurrentPerson: () => Effect.Effect<Person, WorkspaceClientError>
  readonly getCurrentSocialIds: (includeDeleted?: boolean) => Effect.Effect<Array<SocialId>, WorkspaceClientError>
  readonly getPersonInfo: (account: PersonUuid) => Effect.Effect<PersonInfo, WorkspaceClientError>
  readonly canMergeSpecifiedPersons?: (
    primaryPerson: PersonUuid,
    secondaryPerson: PersonUuid
  ) => Effect.Effect<boolean, WorkspaceClientError>
  readonly mergeSpecifiedPersons?: (
    primaryPerson: PersonUuid,
    secondaryPerson: PersonUuid
  ) => Effect.Effect<void, WorkspaceClientError>
  readonly updateWorkspaceRole: (account: string, role: AccountRole) => Effect.Effect<void, WorkspaceClientError>
  readonly getWorkspaceInfo: (updateLastVisit?: boolean) => Effect.Effect<WorkspaceInfoWithStatus, WorkspaceClientError>
  readonly getUserWorkspaces: () => Effect.Effect<Array<WorkspaceInfoWithStatus>, WorkspaceClientError>
  readonly createWorkspace: (name: string, region?: string) => Effect.Effect<WorkspaceLoginInfo, WorkspaceClientError>
  readonly deleteWorkspace: () => Effect.Effect<void, WorkspaceClientError>
  readonly getUserProfile: (
    personUuid?: PersonUuid
  ) => Effect.Effect<WorkspaceClientUserProfile | null, WorkspaceClientError>
  readonly setMyProfile: (
    profile: Partial<Omit<UserProfile, "personUuid">>
  ) => Effect.Effect<void, WorkspaceClientError>
  readonly createAccessLink: (
    role: AccountRole,
    options?: CreateAccessLinkOptions
  ) => Effect.Effect<string, WorkspaceClientError>
  readonly updateAllowReadOnlyGuests: (
    readOnlyGuestsAllowed: boolean
  ) => Effect.Effect<{ guestPerson: Person; guestSocialIds: Array<SocialId> } | undefined, WorkspaceClientError>
  readonly updateAllowGuestSignUp: (guestSignUpAllowed: boolean) => Effect.Effect<void, WorkspaceClientError>
  readonly getRegionInfo: () => Effect.Effect<Array<RegionInfo>, WorkspaceClientError>
}

export class WorkspaceClient extends Context.Service<WorkspaceClient, WorkspaceClientOperations>()(
  "@hulymcp/WorkspaceClient"
) {
  static readonly layerWithDependencies: Layer.Layer<
    WorkspaceClient,
    WorkspaceClientError,
    HulyConfigService | HulySdk
  > = Layer.effect(
    WorkspaceClient,
    Effect.gen(function* () {
      const config = yield* HulyConfigService
      const sdk = yield* HulySdk

      const { client } = yield* connectAccountClientWithRetry(
        { url: config.url, auth: config.auth, workspace: config.workspace },
        sdk
      )

      const withClient = <A>(
        op: (client: AccountClient) => Promise<A>,
        operation: HulyConnectionOperation
      ): Effect.Effect<A, WorkspaceClientError> =>
        Effect.tryPromise({ try: () => op(client), catch: (error) => makeOperationConnectionError(operation, error) })

      type AccountClientAccessLinkOptions = NonNullable<Parameters<AccountClient["createAccessLink"]>[1]>

      const accessLinkIdentityOptions = (options: CreateAccessLinkOptions): AccountClientAccessLinkOptions => ({
        ...(options.firstName !== undefined ? { firstName: options.firstName } : {}),
        ...(options.lastName !== undefined ? { lastName: options.lastName } : {}),
        ...(options.navigateUrl !== undefined ? { navigateUrl: options.navigateUrl } : {}),
        ...(options.spaces !== undefined ? { spaces: [...options.spaces] } : {})
      })

      const accessLinkTimingOptions = (options: CreateAccessLinkOptions): AccountClientAccessLinkOptions => ({
        ...(options.notBefore !== undefined ? { notBefore: options.notBefore } : {}),
        ...(options.expiration !== undefined ? { expiration: options.expiration } : {}),
        ...(options.personalized !== undefined ? { personalized: options.personalized } : {})
      })

      const toAccountClientAccessLinkOptions = (
        options: CreateAccessLinkOptions | undefined
      ): Parameters<AccountClient["createAccessLink"]>[1] =>
        options === undefined
          ? undefined
          : { ...accessLinkIdentityOptions(options), ...accessLinkTimingOptions(options) }

      const operations: WorkspaceClientOperations = {
        getWorkspaceMembers: () => withClient((c) => c.getWorkspaceMembers(), "getWorkspaceMembers"),
        getCurrentPerson: () => withClient((c) => c.getPerson(), "getCurrentPerson"),
        getCurrentSocialIds: (includeDeleted) =>
          withClient((c) => c.getSocialIds(includeDeleted), "getCurrentSocialIds"),
        getPersonInfo: (account) => withClient((c) => c.getPersonInfo(account), "getPersonInfo"),
        canMergeSpecifiedPersons: (primaryPerson, secondaryPerson) =>
          withClient((c) => c.canMergeSpecifiedPersons(primaryPerson, secondaryPerson), "canMergeSpecifiedPersons"),
        mergeSpecifiedPersons: (primaryPerson, secondaryPerson) =>
          withClient((c) => c.mergeSpecifiedPersons(primaryPerson, secondaryPerson), "mergeSpecifiedPersons"),
        updateWorkspaceRole: (account, role) =>
          withClient((c) => c.updateWorkspaceRole(account, role), "updateWorkspaceRole"),
        getWorkspaceInfo: (updateLastVisit) =>
          withClient((c) => c.getWorkspaceInfo(updateLastVisit), "getWorkspaceInfo"),
        getUserWorkspaces: () => withClient((c) => c.getUserWorkspaces(), "getUserWorkspaces"),
        createWorkspace: (name, region) => withClient((c) => c.createWorkspace(name, region), "createWorkspace"),
        deleteWorkspace: () => withClient((c) => c.deleteWorkspace(), "deleteWorkspace"),
        getUserProfile: (personUuid) => withClient((c) => c.getUserProfile(personUuid), "getUserProfile"),
        setMyProfile: (profile) => withClient((c) => c.setMyProfile(profile), "setMyProfile"),
        createAccessLink: (role, options) =>
          withClient((c) => c.createAccessLink(role, toAccountClientAccessLinkOptions(options)), "createAccessLink"),
        updateAllowReadOnlyGuests: (readOnlyGuestsAllowed) =>
          withClient((c) => c.updateAllowReadOnlyGuests(readOnlyGuestsAllowed), "updateAllowReadOnlyGuests"),
        updateAllowGuestSignUp: (guestSignUpAllowed) =>
          withClient((c) => c.updateAllowGuestSignUp(guestSignUpAllowed), "updateAllowGuestSignUp"),
        getRegionInfo: () => withClient((c) => c.getRegionInfo(), "getRegionInfo")
      }

      return operations
    })
  )

  static readonly layer: Layer.Layer<WorkspaceClient, WorkspaceClientError, HulyConfigService> =
    WorkspaceClient.layerWithDependencies.pipe(Layer.provide(HulySdk.defaultLayer))

  static testLayer(mockOps: Partial<WorkspaceClientOperations>): Layer.Layer<WorkspaceClient> {
    const notImplemented = (name: string) => (): Effect.Effect<never, WorkspaceClientError> =>
      Effect.die(new Error(`${name} not implemented in test layer`))

    const defaultOps: WorkspaceClientOperations = {
      getWorkspaceMembers: () => Effect.succeed([]),
      getCurrentPerson: notImplemented("getCurrentPerson"),
      getCurrentSocialIds: notImplemented("getCurrentSocialIds"),
      getPersonInfo: notImplemented("getPersonInfo"),
      updateWorkspaceRole: notImplemented("updateWorkspaceRole"),
      getWorkspaceInfo: notImplemented("getWorkspaceInfo"),
      getUserWorkspaces: () => Effect.succeed([]),
      createWorkspace: notImplemented("createWorkspace"),
      deleteWorkspace: notImplemented("deleteWorkspace"),
      getUserProfile: () => Effect.succeed(null),
      setMyProfile: notImplemented("setMyProfile"),
      createAccessLink: notImplemented("createAccessLink"),
      updateAllowReadOnlyGuests: notImplemented("updateAllowReadOnlyGuests"),
      updateAllowGuestSignUp: notImplemented("updateAllowGuestSignUp"),
      getRegionInfo: () => Effect.succeed([])
    }

    return Layer.succeed(WorkspaceClient, { ...defaultOps, ...mockOps })
  }
}

const connectAccountClient = async (
  config: ConnectionConfig,
  sdk: HulySdkDependencies
): Promise<{ client: AccountClient; token: string }> => {
  const serverConfig = await sdk.loadServerConfig(config.url)
  const authOptions = authToOptions(config.auth, config.workspace)
  const { token } = await sdk.getWorkspaceToken(config.url, authOptions, serverConfig)
  const client = sdk.getAccountClient(serverConfig.ACCOUNTS_URL, token)
  return { client, token }
}

const connectAccountClientWithRetry = (
  config: ConnectionConfig,
  sdk: HulySdkDependencies
): Effect.Effect<{ client: AccountClient; token: string }, ConnectionError> =>
  connectWithRetry(() => connectAccountClient(config, sdk), config.url)
