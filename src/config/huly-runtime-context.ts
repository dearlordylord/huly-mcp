import { Schema } from "effect"

import {
  DEFAULT_HULY_CONNECTION_TIMEOUT,
  HULY_CONFIG_HEADERS,
  REQUIRED_HULY_CONFIG_HEADERS
} from "./huly-config-constants.js"

type HulyConfigHeader = typeof HULY_CONFIG_HEADERS[number]
const HeaderValueSchema = Schema.Union(Schema.String, Schema.Array(Schema.String), Schema.Undefined)
const HeaderRecordSchema = Schema.Record({ key: Schema.String, value: HeaderValueSchema })
type HeaderValue = Schema.Schema.Type<typeof HeaderValueSchema>

interface SanitizedUrlContext {
  readonly configured: boolean
  readonly valid?: boolean
  readonly origin?: string
  readonly host?: string
  readonly protocol?: "http:" | "https:"
}

interface SanitizedWorkspaceContext {
  readonly configured: boolean
  readonly value?: string
}

interface SanitizedConnectionTimeoutContext {
  readonly configured: boolean
  readonly valid?: boolean
  readonly valueMs?: number
  readonly defaultMs: number
  readonly source: "env" | "header" | "default" | "missing" | "invalid"
}

export interface SanitizedHulyRuntimeConfigContext {
  readonly huly: {
    readonly url: SanitizedUrlContext
    readonly workspace: SanitizedWorkspaceContext
    readonly connectionTimeout: SanitizedConnectionTimeoutContext
  }
  readonly auth: {
    readonly method: "token" | "password" | "unknown"
    readonly source: "env" | "header" | "none"
    readonly tokenConfigured: boolean
    readonly emailConfigured: boolean
    readonly passwordConfigured: boolean
  }
  readonly configSources: {
    readonly env: {
      readonly hulyUrl: boolean
      readonly hulyWorkspace: boolean
      readonly hulyToken: boolean
      readonly hulyEmail: boolean
      readonly hulyPassword: boolean
      readonly hulyConnectionTimeout: boolean
      readonly lazyEnvs: boolean
    }
    readonly headers?: {
      readonly present: boolean
      readonly requiredComplete: boolean
      readonly hulyUrl: boolean
      readonly hulyWorkspace: boolean
      readonly hulyToken: boolean
      readonly hulyConnectionTimeout: boolean
      readonly unsupportedHulyHeaders: ReadonlyArray<string>
    }
  }
}

const hulyConfigHeaderSet = new Set<string>(HULY_CONFIG_HEADERS)

const isHulyConfigHeader = (name: string): name is HulyConfigHeader => hulyConfigHeaderSet.has(name)
const isConfiguredHeaderValue = (value: HeaderValue): boolean => value !== undefined

const sanitizeUrl = (value: unknown, configured: boolean): SanitizedUrlContext => {
  if (!configured) return { configured: false }
  if (typeof value !== "string") return { configured: true, valid: false }

  try {
    const url = new URL(value)
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return { configured: true, valid: false }
    }
    return {
      configured: true,
      valid: true,
      origin: url.origin,
      host: url.host,
      protocol: url.protocol
    }
  } catch {
    return { configured: true, valid: false }
  }
}

const sanitizeWorkspace = (value: unknown, configured: boolean): SanitizedWorkspaceContext => {
  if (!configured) return { configured: false }
  return typeof value === "string" ? { configured: true, value } : { configured: true }
}

const parsePositiveInteger = (value: string): number | undefined => {
  if (!/^\d+$/.test(value)) return undefined
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return undefined
  return parsed
}

const sanitizeTimeout = (
  value: unknown,
  configured: boolean,
  source: "env" | "header"
): SanitizedConnectionTimeoutContext => {
  if (!configured) {
    return {
      configured: false,
      valid: true,
      valueMs: DEFAULT_HULY_CONNECTION_TIMEOUT,
      defaultMs: DEFAULT_HULY_CONNECTION_TIMEOUT,
      source: "default"
    }
  }

  if (typeof value !== "string") {
    return {
      configured: true,
      valid: false,
      defaultMs: DEFAULT_HULY_CONNECTION_TIMEOUT,
      source: "invalid"
    }
  }

  const parsed = parsePositiveInteger(value)
  if (parsed === undefined) {
    return {
      configured: true,
      valid: false,
      defaultMs: DEFAULT_HULY_CONNECTION_TIMEOUT,
      source: "invalid"
    }
  }

  return {
    configured: true,
    valid: true,
    valueMs: parsed,
    defaultMs: DEFAULT_HULY_CONNECTION_TIMEOUT,
    source
  }
}

const envFlag = (env: NodeJS.ProcessEnv, name: string): boolean => env[name] !== undefined

const lazyEnvsEnabled = (env: NodeJS.ProcessEnv): boolean => env["LAZY_ENVS"]?.toLowerCase() === "true"

const sanitizeAuthFromEnv = (
  env: NodeJS.ProcessEnv
): SanitizedHulyRuntimeConfigContext["auth"] => {
  const tokenConfigured = envFlag(env, "HULY_TOKEN")
  const emailConfigured = envFlag(env, "HULY_EMAIL")
  const passwordConfigured = envFlag(env, "HULY_PASSWORD")

  if (tokenConfigured) {
    return {
      method: "token",
      source: "env",
      tokenConfigured,
      emailConfigured,
      passwordConfigured
    }
  }

  if (emailConfigured && passwordConfigured) {
    return {
      method: "password",
      source: "env",
      tokenConfigured,
      emailConfigured,
      passwordConfigured
    }
  }

  return {
    method: "unknown",
    source: "none",
    tokenConfigured,
    emailConfigured,
    passwordConfigured
  }
}

export const sanitizeHulyRuntimeConfigFromEnv = (
  env: NodeJS.ProcessEnv
): SanitizedHulyRuntimeConfigContext => ({
  huly: {
    url: sanitizeUrl(env["HULY_URL"], envFlag(env, "HULY_URL")),
    workspace: sanitizeWorkspace(env["HULY_WORKSPACE"], envFlag(env, "HULY_WORKSPACE")),
    connectionTimeout: sanitizeTimeout(
      env["HULY_CONNECTION_TIMEOUT"],
      envFlag(env, "HULY_CONNECTION_TIMEOUT"),
      "env"
    )
  },
  auth: sanitizeAuthFromEnv(env),
  configSources: {
    env: {
      hulyUrl: envFlag(env, "HULY_URL"),
      hulyWorkspace: envFlag(env, "HULY_WORKSPACE"),
      hulyToken: envFlag(env, "HULY_TOKEN"),
      hulyEmail: envFlag(env, "HULY_EMAIL"),
      hulyPassword: envFlag(env, "HULY_PASSWORD"),
      hulyConnectionTimeout: envFlag(env, "HULY_CONNECTION_TIMEOUT"),
      lazyEnvs: lazyEnvsEnabled(env)
    }
  }
})

interface HeaderInspection {
  readonly present: boolean
  readonly requiredComplete: boolean
  readonly hulyUrl: boolean
  readonly hulyWorkspace: boolean
  readonly hulyToken: boolean
  readonly hulyConnectionTimeout: boolean
  readonly unsupportedHulyHeaders: ReadonlyArray<string>
  readonly values: ReadonlyMap<HulyConfigHeader, HeaderValue>
}

const emptyHeaderInspection = (): HeaderInspection => ({
  present: false,
  requiredComplete: false,
  hulyUrl: false,
  hulyWorkspace: false,
  hulyToken: false,
  hulyConnectionTimeout: false,
  unsupportedHulyHeaders: [],
  values: new Map<HulyConfigHeader, HeaderValue>()
})

const normalizeHeaderEntry = ([rawName, value]: readonly [string, HeaderValue]): readonly [string, HeaderValue] => [
  rawName.toLowerCase(),
  value
]

const toHulyConfigHeaderEntry = (
  [name, value]: readonly [string, HeaderValue]
): readonly [HulyConfigHeader, HeaderValue] | undefined => isHulyConfigHeader(name) ? [name, value] : undefined

const isDefinedHeaderEntry = (
  entry: readonly [HulyConfigHeader, HeaderValue] | undefined
): entry is readonly [HulyConfigHeader, HeaderValue] => entry !== undefined

const inspectHeaders = (headers: unknown): HeaderInspection => {
  const decoded = Schema.decodeUnknownEither(HeaderRecordSchema)(headers)
  if (decoded._tag === "Left") return emptyHeaderInspection()

  const entries = Object.entries(decoded.right)
    .map(normalizeHeaderEntry)
    .filter(([name]) => name.startsWith("x-huly-"))
  const supportedEntries = entries.map(toHulyConfigHeaderEntry).filter(isDefinedHeaderEntry)
  const values = new Map<HulyConfigHeader, HeaderValue>(supportedEntries)
  const unsupportedHulyHeaders = entries
    .flatMap(([name]) => isHulyConfigHeader(name) ? [] : [name])
    .filter((name, index, names) => names.indexOf(name) === index)
    .sort()

  const hulyUrl = isConfiguredHeaderValue(values.get("x-huly-url"))
  const hulyWorkspace = isConfiguredHeaderValue(values.get("x-huly-workspace"))
  const hulyToken = isConfiguredHeaderValue(values.get("x-huly-token"))
  const hulyConnectionTimeout = isConfiguredHeaderValue(values.get("x-huly-connection-timeout"))
  const requiredComplete = REQUIRED_HULY_CONFIG_HEADERS.every((name) => isConfiguredHeaderValue(values.get(name)))

  return {
    present: values.size > 0 || unsupportedHulyHeaders.length > 0,
    requiredComplete,
    hulyUrl,
    hulyWorkspace,
    hulyToken,
    hulyConnectionTimeout,
    unsupportedHulyHeaders,
    values
  }
}

const sanitizeAuthFromHeaders = (
  inspection: HeaderInspection
): SanitizedHulyRuntimeConfigContext["auth"] => ({
  method: inspection.hulyToken ? "token" : "unknown",
  source: inspection.hulyToken ? "header" : "none",
  tokenConfigured: inspection.hulyToken,
  emailConfigured: false,
  passwordConfigured: false
})

export const sanitizeHulyRuntimeConfigFromHeaders = (
  headers: unknown,
  env: NodeJS.ProcessEnv = process.env
): SanitizedHulyRuntimeConfigContext => {
  const envContext = sanitizeHulyRuntimeConfigFromEnv(env)
  const inspection = inspectHeaders(headers)
  const headerSources = {
    present: inspection.present,
    requiredComplete: inspection.requiredComplete,
    hulyUrl: inspection.hulyUrl,
    hulyWorkspace: inspection.hulyWorkspace,
    hulyToken: inspection.hulyToken,
    hulyConnectionTimeout: inspection.hulyConnectionTimeout,
    unsupportedHulyHeaders: inspection.unsupportedHulyHeaders
  }

  if (!inspection.present) {
    return {
      ...envContext,
      configSources: {
        ...envContext.configSources,
        headers: headerSources
      }
    }
  }

  return {
    huly: {
      url: sanitizeUrl(inspection.values.get("x-huly-url"), inspection.hulyUrl),
      workspace: sanitizeWorkspace(inspection.values.get("x-huly-workspace"), inspection.hulyWorkspace),
      connectionTimeout: sanitizeTimeout(
        inspection.values.get("x-huly-connection-timeout"),
        inspection.hulyConnectionTimeout,
        "header"
      )
    },
    auth: sanitizeAuthFromHeaders(inspection),
    configSources: {
      env: envContext.configSources.env,
      headers: headerSources
    }
  }
}
