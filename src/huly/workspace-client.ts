/**
 * WorkspaceClient service for account-level operations.
 * Uses @hcengineering/account-client for workspace and user management.
 * @module
 */
import type { AccountClient } from "@hcengineering/account-client"
import { getClient as getAccountClient } from "@hcengineering/account-client"
import { loadServerConfig } from "@hcengineering/api-client"
import { Context, Effect, Layer, Redacted, Schedule } from "effect"

import { type Auth, HulyConfigService } from "../config/config.js"
import { HulyAuthError, HulyConnectionError } from "./errors.js"

export type WorkspaceClientError = HulyConnectionError | HulyAuthError

export class WorkspaceClient extends Context.Tag("@hulymcp/WorkspaceClient")<
  WorkspaceClient,
  { readonly client: AccountClient }
>() {
  static readonly layer: Layer.Layer<
    WorkspaceClient,
    WorkspaceClientError,
    HulyConfigService
  > = Layer.scoped(
    WorkspaceClient,
    Effect.gen(function*() {
      const config = yield* HulyConfigService

      const { client } = yield* connectAccountClientWithRetry({
        url: config.url,
        auth: config.auth,
        workspace: config.workspace
      })

      return { client }
    })
  )

  static testLayer(
    mockClient: Partial<AccountClient>
  ): Layer.Layer<WorkspaceClient> {
    const defaultClient: AccountClient = {
      getProviders: () => Promise.resolve([]),
      getUserWorkspaces: () => Promise.resolve([]),
      selectWorkspace: () => Promise.reject(new Error("Not implemented")),
      validateOtp: () => Promise.reject(new Error("Not implemented")),
      loginOtp: () => Promise.reject(new Error("Not implemented")),
      getLoginInfoByToken: () => Promise.resolve(null),
      getLoginWithWorkspaceInfo: () => Promise.reject(new Error("Not implemented")),
      restorePassword: () => Promise.reject(new Error("Not implemented")),
      confirm: () => Promise.reject(new Error("Not implemented")),
      requestPasswordReset: () => Promise.resolve(),
      sendInvite: () => Promise.resolve(),
      resendInvite: () => Promise.resolve(),
      createInviteLink: () => Promise.resolve(""),
      leaveWorkspace: () => Promise.resolve(null),
      changeUsername: () => Promise.resolve(),
      changePassword: () => Promise.resolve(),
      signUpJoin: () => Promise.reject(new Error("Not implemented")),
      join: () => Promise.reject(new Error("Not implemented")),
      createInvite: () => Promise.resolve(""),
      createAccessLink: () => Promise.resolve(""),
      checkJoin: () => Promise.reject(new Error("Not implemented")),
      checkAutoJoin: () => Promise.reject(new Error("Not implemented")),
      getWorkspaceInfo: () => Promise.reject(new Error("Not implemented")),
      getWorkspacesInfo: () => Promise.resolve([]),
      updateLastVisit: () => Promise.resolve(),
      getRegionInfo: () => Promise.resolve([]),
      createWorkspace: () => Promise.reject(new Error("Not implemented")),
      signUpOtp: () => Promise.reject(new Error("Not implemented")),
      signUp: () => Promise.reject(new Error("Not implemented")),
      login: () => Promise.reject(new Error("Not implemented")),
      loginAsGuest: () => Promise.reject(new Error("Not implemented")),
      isReadOnlyGuest: () => Promise.resolve(false),
      getPerson: () => Promise.reject(new Error("Not implemented")),
      getPersonInfo: () => Promise.reject(new Error("Not implemented")),
      getSocialIds: () => Promise.resolve([]),
      getWorkspaceMembers: () => Promise.resolve([]),
      updateWorkspaceRole: () => Promise.resolve(),
      updateAllowReadOnlyGuests: () => Promise.resolve(undefined),
      updateAllowGuestSignUp: () => Promise.resolve(),
      updateWorkspaceName: () => Promise.resolve(),
      deleteWorkspace: () => Promise.resolve(),
      findPersonBySocialKey: () => Promise.resolve(undefined),
      findPersonBySocialId: () => Promise.resolve(undefined),
      findSocialIdBySocialKey: () => Promise.resolve(undefined),
      findFullSocialIdBySocialKey: () => Promise.resolve(undefined),
      findFullSocialIds: () => Promise.resolve([]),
      getMailboxOptions: () => Promise.reject(new Error("Not implemented")),
      getMailboxSecret: () => Promise.resolve(undefined),
      createMailbox: () => Promise.reject(new Error("Not implemented")),
      getMailboxes: () => Promise.resolve([]),
      deleteMailbox: () => Promise.resolve(),
      listAccounts: () => Promise.resolve([]),
      deleteAccount: () => Promise.resolve(),
      workerHandshake: () => Promise.resolve(),
      getPendingWorkspace: () => Promise.resolve(null),
      updateWorkspaceInfo: () => Promise.resolve(),
      listWorkspaces: () => Promise.resolve([]),
      performWorkspaceOperation: () => Promise.resolve(false),
      assignWorkspace: () => Promise.resolve(),
      updateBackupInfo: () => Promise.resolve(),
      updateUsageInfo: () => Promise.resolve(),
      updateWorkspaceRoleBySocialKey: () => Promise.resolve(),
      ensurePerson: () => Promise.reject(new Error("Not implemented")),
      addSocialIdToPerson: () => Promise.reject(new Error("Not implemented")),
      updateSocialId: () => Promise.reject(new Error("Not implemented")),
      exchangeGuestToken: () => Promise.resolve(""),
      releaseSocialId: () => Promise.reject(new Error("Not implemented")),
      createIntegration: () => Promise.resolve(),
      updateIntegration: () => Promise.resolve(),
      deleteIntegration: () => Promise.resolve(),
      getIntegration: () => Promise.resolve(null),
      listIntegrations: () => Promise.resolve([]),
      addIntegrationSecret: () => Promise.resolve(),
      updateIntegrationSecret: () => Promise.resolve(),
      deleteIntegrationSecret: () => Promise.resolve(),
      getIntegrationSecret: () => Promise.resolve(null),
      listIntegrationsSecrets: () => Promise.resolve([]),
      getAccountInfo: () => Promise.reject(new Error("Not implemented")),
      canMergeSpecifiedPersons: () => Promise.resolve(false),
      mergeSpecifiedPersons: () => Promise.resolve(),
      mergeSpecifiedAccounts: () => Promise.resolve(),
      addEmailSocialId: () => Promise.reject(new Error("Not implemented")),
      addHulyAssistantSocialId: () => Promise.reject(new Error("Not implemented")),
      refreshHulyAssistantToken: () => Promise.resolve(),
      updatePasswordAgingRule: () => Promise.resolve(),
      checkPasswordAging: () => Promise.resolve(true),
      setMyProfile: () => Promise.resolve(),
      getUserProfile: () => Promise.resolve(null),
      getSubscriptions: () => Promise.resolve([]),
      getSubscriptionByProviderId: () => Promise.resolve(null),
      getSubscriptionById: () => Promise.resolve(null),
      upsertSubscription: () => Promise.resolve(),
      setCookie: () => Promise.resolve(),
      deleteCookie: () => Promise.resolve()
    }

    return Layer.succeed(WorkspaceClient, {
      client: { ...defaultClient, ...mockClient }
    })
  }
}

interface ConnectionConfig {
  url: string
  auth: Auth
  workspace: string
}

const isAuthError = (error: unknown): boolean => {
  const msg = String(error).toLowerCase()
  return (
    msg.includes("unauthorized")
    || msg.includes("authentication")
    || msg.includes("auth")
    || msg.includes("credentials")
    || msg.includes("401")
    || msg.includes("invalid password")
    || msg.includes("invalid email")
    || msg.includes("login failed")
  )
}

const connectAccountClient = async (
  config: ConnectionConfig
): Promise<{ client: AccountClient; token: string }> => {
  const serverConfig = await loadServerConfig(config.url)
  const accountsUrl = serverConfig.ACCOUNTS_URL

  let token: string

  if (config.auth._tag === "token") {
    token = Redacted.value(config.auth.token)
  } else {
    const tempClient = getAccountClient(accountsUrl)
    const loginInfo = await tempClient.login(
      config.auth.email,
      Redacted.value(config.auth.password)
    )
    if (!loginInfo.token) {
      throw new Error("Login failed: no token returned")
    }
    token = loginInfo.token

    const workspaceLoginInfo = await tempClient.selectWorkspace(config.workspace)
    token = workspaceLoginInfo.token
  }

  const client = getAccountClient(accountsUrl, token)
  return { client, token }
}

const connectAccountClientWithRetry = (
  config: ConnectionConfig
): Effect.Effect<{ client: AccountClient; token: string }, WorkspaceClientError> => {
  const attemptConnect: Effect.Effect<{ client: AccountClient; token: string }, WorkspaceClientError> =
    Effect.tryPromise({
      try: () => connectAccountClient(config),
      catch: (e) => {
        if (isAuthError(e)) {
          return new HulyAuthError({
            message: `Authentication failed: ${String(e)}`
          })
        }
        return new HulyConnectionError({
          message: `Connection failed: ${String(e)}`,
          cause: e
        })
      }
    })

  const retrySchedule = Schedule.exponential("100 millis").pipe(
    Schedule.compose(Schedule.recurs(2))
  )

  return attemptConnect.pipe(
    Effect.retry({
      schedule: retrySchedule,
      while: (e) => !(e instanceof HulyAuthError)
    })
  )
}
