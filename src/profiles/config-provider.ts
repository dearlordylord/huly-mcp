import { ConfigProvider, Redacted } from "effect"
import type { ResolvedCliConfiguration } from "./model.js"

export const resolvedConfigProvider = (configuration: ResolvedCliConfiguration): ConfigProvider.ConfigProvider => {
  const entries = new Map<string, string>()
  if (configuration.url !== undefined) entries.set("HULY_URL", configuration.url)
  if (configuration.workspace !== undefined) entries.set("HULY_WORKSPACE", configuration.workspace)
  if (configuration.connectionTimeout !== undefined) {
    entries.set("HULY_CONNECTION_TIMEOUT", configuration.connectionTimeout)
  }
  if (configuration.auth.method === "token") {
    entries.set("HULY_TOKEN", Redacted.value(configuration.auth.token))
  } else if (configuration.auth.method === "password") {
    if (configuration.auth.credentialState !== "password-only") {
      entries.set("HULY_EMAIL", configuration.auth.email)
    }
    if (configuration.auth.credentialState !== "email-only") {
      entries.set("HULY_PASSWORD", Redacted.value(configuration.auth.password))
    }
  }
  return ConfigProvider.fromUnknown(Object.fromEntries(entries))
}
