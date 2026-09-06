import type { TxOperations } from "@hcengineering/core"
import { Redacted, Schema } from "effect"
import { createRequire } from "node:module"

import { HulyConfigSchema } from "../src/config/config.js"
import { AccountUuid, PersonId } from "../src/domain/schemas/shared.js"

const decodeHulyConfig = Schema.decodeUnknownSync(HulyConfigSchema)
const decodeAccountUuid = Schema.decodeUnknownSync(AccountUuid)
const decodePersonId = Schema.decodeUnknownSync(PersonId)

const require = createRequire(import.meta.url)
// eslint-disable-next-line @typescript-eslint/consistent-type-imports, no-restricted-syntax -- CJS interop boundary: api-client does not expose these helpers as ESM runtime named exports under tsx.
const apiClient = require("@hcengineering/api-client") as typeof import("@hcengineering/api-client")

interface IntegrationHulyConnection {
  readonly accountUuid: AccountUuid
  readonly client: TxOperations
  readonly primarySocialId: PersonId
  readonly socialIds: ReadonlyArray<PersonId>
}

const loadIntegrationHulyConfig = () => {
  const token = process.env["HULY_TOKEN"]
  const auth =
    token === undefined || token.trim() === ""
      ? { _tag: "password" as const, email: process.env["HULY_EMAIL"], password: process.env["HULY_PASSWORD"] }
      : { _tag: "token" as const, token }

  return decodeHulyConfig({
    url: process.env["HULY_URL"],
    workspace: process.env["HULY_WORKSPACE"],
    connectionTimeout: 30_000,
    auth
  })
}

export const connectIntegrationHuly = async (): Promise<IntegrationHulyConnection> => {
  const config = loadIntegrationHulyConfig()
  const serverConfig = await apiClient.loadServerConfig(config.url)
  const auth =
    config.auth._tag === "token"
      ? { token: Redacted.value(config.auth.token), workspace: config.workspace }
      : { email: config.auth.email, password: Redacted.value(config.auth.password), workspace: config.workspace }
  const { endpoint, token, workspaceId } = await apiClient.getWorkspaceToken(config.url, auth, serverConfig)
  const account = await apiClient.createRestClient(endpoint, workspaceId, token).getAccount()
  const client = await apiClient.createRestTxOperations(endpoint, workspaceId, token)
  return {
    accountUuid: decodeAccountUuid(account.uuid),
    client,
    primarySocialId: decodePersonId(account.primarySocialId),
    socialIds: account.socialIds.map((socialId) => decodePersonId(socialId))
  }
}
