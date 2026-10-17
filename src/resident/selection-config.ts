import { ConfigProvider, Effect, Layer } from "effect"

import {
  HulyConfigService,
  sanitizeHulyRuntimeConfigFromEnv,
  type SanitizedHulyRuntimeConfigContext
} from "../config/config.js"
import { getLazyEnvs } from "../config/startup.js"
import { loadMcpProcessPolicy } from "../mcp/process-policy.js"
import { ProfileEnvironmentSchema } from "../profiles/model.js"
import { resolvedConfigProvider } from "../profiles/config-provider.js"
import { type CredentialStoreSelector, selectCredentialStore } from "../profiles/credential-store.js"
import type { CliProfileStore } from "../profiles/file-store.js"
import { profileRuntimeContext } from "../profiles/runtime-context.js"
import { defaultProfileStore, resolveStdioProfile } from "../profiles/stdio.js"
import type { ResidentSelection } from "./compatibility-contract.js"

export const captureResidentSelection = Effect.fn("captureResidentSelection")(function* (
  environment: NodeJS.ProcessEnv,
  store?: CliProfileStore,
  credentialStore: CredentialStoreSelector = selectCredentialStore
) {
  const snapshot = { ...environment }
  const provider = ConfigProvider.fromUnknown(snapshot)
  const profile =
    snapshot["HULY_PROFILE"] === undefined
      ? undefined
      : yield* resolveStdioProfile(snapshot, store ?? (yield* defaultProfileStore(snapshot)), credentialStore)
  const hulyProvider = profile === undefined ? provider : resolvedConfigProvider(profile)
  const huly = yield* HulyConfigService.pipe(
    Effect.provide(HulyConfigService.layer.pipe(Layer.provide(ConfigProvider.layer(hulyProvider))))
  )
  const { lazyEnvs, policy } = yield* Effect.all({
    lazyEnvs: getLazyEnvs(snapshot),
    policy: loadMcpProcessPolicy
  }).pipe(Effect.provide(ConfigProvider.layer(provider)))
  const selection: ResidentSelection = { huly, policy, lazyEnvs }
  // This projection stays internal; the MCP context output schema owns its serialized form.
  const context =
    profile === undefined ? sanitizeHulyRuntimeConfigFromEnv(snapshot) : profileRuntimeContext(profile, snapshot)
  const runtimeContext: SanitizedHulyRuntimeConfigContext = {
    ...context,
    auth: { ...context.auth, method: huly.auth._tag }
  }
  return { selection, runtimeContext }
})

export const captureManualResidentSelection = Effect.fn("captureManualResidentSelection")(function* (
  environment: NodeJS.ProcessEnv
) {
  const snapshot = { ...environment }
  const selectsAuthority = Object.keys(ProfileEnvironmentSchema.fields).some((key) => snapshot[key] !== undefined)
  const policy = yield* loadMcpProcessPolicy.pipe(
    Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown(snapshot)))
  )
  const selectsPolicy =
    policy.tools.length > 0 ||
    policy.toolsets.length > 0 ||
    policy.exposure.configuredMode !== "auto" ||
    policy.exposure.proxyOutputStrict
  if (!selectsAuthority && !selectsPolicy) return undefined
  return yield* captureResidentSelection(snapshot)
})
