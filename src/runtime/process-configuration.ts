import { ConfigProvider, Effect, Layer } from "effect"

import { HulyConfigService, sanitizeHulyRuntimeConfigFromEnv } from "../config/config.js"
import { getLazyEnvs } from "../config/startup.js"
import type { McpTransportType } from "../mcp/server.js"
import { resolvedConfigProvider } from "../profiles/config-provider.js"
import { profileRuntimeContext } from "../profiles/runtime-context.js"
import { defaultProfileStore, resolveStdioProfile } from "../profiles/stdio.js"
import type { CliProfileStore } from "../profiles/file-store.js"
import type { ResidentStartupCapture } from "../resident/managed-contract.js"

const bindProfileConfiguration = (
  environment: NodeJS.ProcessEnv,
  profile: Effect.Success<ReturnType<typeof resolveStdioProfile>> | undefined
) => {
  const authMethod: "token" | "password" =
    profile?.auth.method === "token" || environment["HULY_TOKEN"] ? "token" : "password"
  const configLayer =
    profile === undefined
      ? HulyConfigService.layer
      : HulyConfigService.layer.pipe(Layer.provide(ConfigProvider.layer(resolvedConfigProvider(profile))))
  return {
    authMethod,
    configLayer,
    runtimeConfigContext: () =>
      profile === undefined
        ? sanitizeHulyRuntimeConfigFromEnv(environment)
        : profileRuntimeContext(profile, environment)
  }
}

export const resolveProcessConfiguration = Effect.fn("resolveProcessConfiguration")(function* (
  transport: McpTransportType,
  environment: NodeJS.ProcessEnv,
  captured: ResidentStartupCapture | undefined,
  store?: CliProfileStore
) {
  if (captured !== undefined)
    return {
      lazyEnvs: captured.selection.lazyEnvs,
      authMethod: captured.selection.huly.auth._tag,
      configLayer: Layer.succeed(HulyConfigService, captured.selection.huly),
      runtimeConfigContext: () => captured.runtimeContext
    }
  const lazyEnvs = yield* getLazyEnvs(environment)
  const profile =
    transport === "stdio" && environment["HULY_PROFILE"] !== undefined
      ? yield* resolveStdioProfile(environment, store ?? (yield* defaultProfileStore(environment)))
      : undefined
  const configuration = bindProfileConfiguration(environment, profile)
  const configLayer =
    !lazyEnvs && transport === "stdio"
      ? yield* HulyConfigService.pipe(
          Effect.provide(configuration.configLayer),
          Effect.map((config) => Layer.succeed(HulyConfigService, config))
        )
      : configuration.configLayer
  return { lazyEnvs, ...configuration, configLayer }
})
