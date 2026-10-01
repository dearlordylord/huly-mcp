import {
  sanitizeHulyRuntimeConfigFromEnv,
  type SanitizedHulyRuntimeConfigContext
} from "../config/huly-runtime-context.js"
import type { ResolvedCliConfiguration } from "./model.js"

export const profileRuntimeContext = (
  configuration: ResolvedCliConfiguration,
  environment: NodeJS.ProcessEnv
): SanitizedHulyRuntimeConfigContext => {
  const context = sanitizeHulyRuntimeConfigFromEnv({
    ...environment,
    ...(configuration.url === undefined ? {} : { HULY_URL: configuration.url }),
    ...(configuration.workspace === undefined ? {} : { HULY_WORKSPACE: configuration.workspace })
  })
  const injected =
    environment["HULY_TOKEN"] !== undefined ||
    environment["HULY_EMAIL"] !== undefined ||
    environment["HULY_PASSWORD"] !== undefined
  return {
    ...context,
    configSources: sanitizeHulyRuntimeConfigFromEnv(environment).configSources,
    auth:
      configuration.auth.method === "token" && !injected
        ? {
            method: "token",
            source: "profile",
            tokenConfigured: true,
            emailConfigured: false,
            passwordConfigured: false
          }
        : context.auth
  }
}
