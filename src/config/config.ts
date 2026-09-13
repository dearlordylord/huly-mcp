/**
 * Configuration module for Huly MCP server.
 *
 * Loads config from environment variables.
 *
 * @module
 */
import { Config, ConfigProvider, Context, Effect, Layer, Redacted, Schema } from "effect"
import type { SchemaIssue } from "effect"

import {
  DEFAULT_HULY_CONNECTION_TIMEOUT,
  HULY_CONFIG_HEADERS,
  REQUIRED_HULY_CONFIG_HEADERS
} from "./huly-config-constants.js"

export {
  type SanitizedHulyRuntimeConfigContext,
  sanitizeHulyRuntimeConfigFromEnv,
  sanitizeHulyRuntimeConfigFromHeaders
} from "./huly-runtime-context.js"

type HulyConfigHeader = (typeof HULY_CONFIG_HEADERS)[number]
type HulyEnvNamePattern = `HULY_${string}`
const HeaderValueSchema = Schema.Union([Schema.String, Schema.Array(Schema.String), Schema.Undefined])
const HeaderRecordSchema = Schema.Record(Schema.String, HeaderValueSchema)
type HeaderRecord = Schema.Schema.Type<typeof HeaderRecordSchema>
type HeaderValue = Schema.Schema.Type<typeof HeaderValueSchema>
type UrlHeaderEntries = ReadonlyMap<HulyConfigEnvName, string>

type UrlHeaderConfig =
  | { readonly _tag: "NoUrlHeaders" }
  | { readonly _tag: "UrlHeaders"; readonly entries: UrlHeaderEntries }

const headerToEnvName = {
  "x-huly-url": "HULY_URL",
  "x-huly-workspace": "HULY_WORKSPACE",
  "x-huly-token": "HULY_TOKEN",
  "x-huly-connection-timeout": "HULY_CONNECTION_TIMEOUT"
} as const satisfies Record<HulyConfigHeader, HulyEnvNamePattern>

type HulyConfigEnvName = (typeof headerToEnvName)[HulyConfigHeader]
type ConfigMapEntry = readonly [HulyConfigEnvName, string]

const hulyConfigHeaderSet = new Set<string>(HULY_CONFIG_HEADERS)

const isHulyConfigHeader = (name: string): name is HulyConfigHeader => hulyConfigHeaderSet.has(name)
const isConfigMapEntry = (entry: ConfigMapEntry | undefined): entry is ConfigMapEntry => entry !== undefined

/**
 * Schema for URL validation - must be valid http/https URL.
 */
const UrlSchema = Schema.String.pipe(
  Schema.check(
    Schema.makeFilter(
      (s) => {
        try {
          const url = new URL(s)
          return url.protocol === "http:" || url.protocol === "https:"
        } catch {
          return false
        }
      },
      { message: "Must be a valid http or https URL" }
    )
  )
)

/**
 * Schema for non-whitespace-only string.
 * Validates that the string is not empty after trimming.
 * Note: Does NOT transform the value - original string is preserved.
 */
const NonWhitespaceString = Schema.String.pipe(
  Schema.check(Schema.makeFilter((s) => s.trim().length > 0, { message: "Must not be empty or whitespace-only" }))
)

/**
 * Schema for positive integer (timeout in ms).
 * Used for direct validation (e.g., HulyConfigSchema).
 */
const PositiveInt = Schema.Number.pipe(
  Schema.check(
    Schema.isInt({ message: "Must be an integer" }),
    Schema.isGreaterThan(0, { message: "Must be positive" })
  )
)

/**
 * Schema for positive integer from string (for env vars).
 */
const PositiveIntFromString = Schema.NumberFromString.pipe(
  Schema.check(
    Schema.isInt({ message: "Must be an integer" }),
    Schema.isGreaterThan(0, { message: "Must be positive" })
  )
)

const TokenAuthSchema = Schema.Struct({
  _tag: Schema.Literal("token"),
  token: Schema.RedactedFromValue(NonWhitespaceString)
})

const PasswordAuthSchema = Schema.Struct({
  _tag: Schema.Literal("password"),
  email: NonWhitespaceString,
  password: Schema.RedactedFromValue(NonWhitespaceString)
})

const AuthSchema = Schema.Union([TokenAuthSchema, PasswordAuthSchema])

export type Auth = Schema.Schema.Type<typeof AuthSchema>

/**
 * Full configuration schema.
 */
export const HulyConfigSchema = Schema.Struct({
  url: UrlSchema,
  auth: AuthSchema,
  workspace: NonWhitespaceString,
  connectionTimeout: PositiveInt
})

type HulyConfig = Schema.Schema.Type<typeof HulyConfigSchema>

export class ConfigValidationError extends Schema.TaggedError<ConfigValidationError>()("ConfigValidationError", {
  message: Schema.String,
  field: Schema.optional(Schema.String),
  cause: Schema.optional(Schema.Defect())
}) {}

const configValidationError = (message: string, field: string): ConfigValidationError =>
  new ConfigValidationError({ message, field })

const decodeHeaderRecord = (headers: unknown): Effect.Effect<HeaderRecord, ConfigValidationError> =>
  Schema.decodeUnknownEffect(HeaderRecordSchema)(headers).pipe(
    Effect.mapError(
      (cause) =>
        new ConfigValidationError({
          message: `Invalid HTTP request headers: ${cause.message}`,
          field: "headers",
          cause
        })
    )
  )

const parseUrlHeaderConfig = (headers: HeaderRecord): Effect.Effect<UrlHeaderConfig, ConfigValidationError> =>
  Effect.gen(function* () {
    const hulyHeaders = Object.entries(headers).filter(([name]) => name.toLowerCase().startsWith("x-huly-"))
    if (!hulyHeaders.some(([name]) => isHulyConfigHeader(name.toLowerCase()))) return { _tag: "NoUrlHeaders" }

    const normalized = yield* Effect.forEach(
      hulyHeaders,
      ([rawName, value]): Effect.Effect<readonly [HulyConfigHeader, HeaderValue], ConfigValidationError> => {
        const name = rawName.toLowerCase()
        if (!isHulyConfigHeader(name)) {
          return Effect.fail(
            configValidationError(
              `Unsupported Huly config header "${rawName}". Supported headers: ${HULY_CONFIG_HEADERS.join(", ")}.`,
              rawName
            )
          )
        }

        return Effect.succeed([name, value])
      }
    )

    const normalizedNames = normalized.map(([name]) => name)
    const duplicateName = normalizedNames.find((name, index) => normalizedNames.indexOf(name) !== index)
    if (duplicateName !== undefined) {
      return yield* configValidationError(
        `Duplicate Huly config header "${duplicateName}" received with different casing.`,
        duplicateName
      )
    }

    const normalizedHeaders = new Map(normalized)
    const configEntries = yield* Effect.forEach(
      HULY_CONFIG_HEADERS,
      (headerName): Effect.Effect<ConfigMapEntry | undefined, ConfigValidationError> => {
        const value = normalizedHeaders.get(headerName)
        if (value === undefined) {
          if (REQUIRED_HULY_CONFIG_HEADERS.includes(headerName)) {
            return Effect.fail(
              configValidationError(
                `Missing required Huly config header "${headerName}". When any supported x-huly-* header is present, ` +
                  `${REQUIRED_HULY_CONFIG_HEADERS.join(", ")} must all be provided.`,
                headerName
              )
            )
          }
          return Effect.succeed(undefined)
        }

        if (typeof value !== "string") {
          return Effect.fail(
            configValidationError(`Huly config header "${headerName}" must have exactly one value.`, headerName)
          )
        }

        return Effect.succeed([headerToEnvName[headerName], value])
      }
    )

    return { _tag: "UrlHeaders", entries: new Map(configEntries.filter(isConfigMapEntry)) }
  })

const configProviderFromUrlHeaders = (
  config: Extract<UrlHeaderConfig, { readonly _tag: "UrlHeaders" }>
): ConfigProvider.ConfigProvider => ConfigProvider.fromUnknown(Object.fromEntries(config.entries))

/**
 * Build an Effect ConfigProvider from URL mode headers.
 *
 * If no supported x-huly-* config headers are present (unrelated x-huly-* headers
 * such as proxy trace ids included), returns undefined so callers can use the
 * existing process environment resolver. If any supported x-huly-* header is present,
 * unsupported x-huly-* headers are rejected,
 * only token auth headers are accepted and all required fields must come from
 * headers; missing values are never filled from process env.
 */
export const hulyConfigProviderFromHeaders = (
  headers: unknown
): Effect.Effect<ConfigProvider.ConfigProvider | undefined, ConfigValidationError> =>
  decodeHeaderRecord(headers).pipe(
    Effect.flatMap(parseUrlHeaderConfig),
    Effect.flatMap((config) =>
      config._tag === "NoUrlHeaders" ? Effect.succeed(undefined) : Effect.succeed(configProviderFromUrlHeaders(config))
    )
  )

const TokenAuthFromEnv = Config.map(
  Config.schema(Schema.RedactedFromValue(NonWhitespaceString), "HULY_TOKEN"),
  (token): Auth => ({ _tag: "token", token })
)

const PasswordAuthFromEnv = Config.map(
  Config.all({
    email: Config.schema(NonWhitespaceString, "HULY_EMAIL"),
    password: Config.schema(Schema.RedactedFromValue(NonWhitespaceString), "HULY_PASSWORD")
  }),
  ({ email, password }): Auth => ({ _tag: "password", email, password })
)

const AuthFromEnv = TokenAuthFromEnv.pipe(Config.orElse(() => PasswordAuthFromEnv))

/**
 * Config definition using Effect's Config module.
 * Uses Config.schema for consistent validation with NonWhitespaceString.
 */
const HulyConfigFromEnv = Config.all({
  url: Config.schema(UrlSchema, "HULY_URL"),
  auth: AuthFromEnv,
  workspace: Config.schema(NonWhitespaceString, "HULY_WORKSPACE"),
  connectionTimeout: Config.schema(PositiveIntFromString, "HULY_CONNECTION_TIMEOUT").pipe(
    Config.withDefault(DEFAULT_HULY_CONNECTION_TIMEOUT)
  )
})

const loadConfig: Effect.Effect<HulyConfig, ConfigValidationError> = HulyConfigFromEnv.pipe(
  Effect.mapError(
    (e) =>
      new ConfigValidationError({
        message: `Configuration error: ${e.message}`,
        field: extractFieldFromConfigError(e),
        cause: e
      })
  )
)

const fieldFromIssue = (issue: SchemaIssue.Issue): string | undefined => {
  switch (issue._tag) {
    case "Pointer": {
      const field = issue.path.find(
        (segment): segment is string => typeof segment === "string" && segment.startsWith("HULY_")
      )
      return field ?? fieldFromIssue(issue.issue)
    }
    case "Filter":
    case "Encoding":
      return fieldFromIssue(issue.issue)
    case "Composite":
    case "AnyOf":
      return issue.issues.map(fieldFromIssue).find((field) => field !== undefined)
    default:
      return undefined
  }
}

const extractFieldFromConfigError = (error: Config.ConfigError): string | undefined =>
  Schema.isSchemaError(error.cause) ? fieldFromIssue(error.cause.issue) : undefined

export class HulyConfigService extends Context.Service<HulyConfigService, HulyConfig>()("@hulymcp/HulyConfig") {
  static readonly DEFAULT_TIMEOUT = DEFAULT_HULY_CONNECTION_TIMEOUT

  static readonly layer: Layer.Layer<HulyConfigService, ConfigValidationError> = Layer.effect(
    HulyConfigService,
    loadConfig
  )

  /** Bypasses validation - for testing only. */
  static testLayer(config: {
    url: string
    email: string
    password: string
    workspace: string
    connectionTimeout?: number
  }): Layer.Layer<HulyConfigService> {
    return Layer.succeed(HulyConfigService, {
      url: config.url,
      auth: { _tag: "password", email: config.email, password: Redacted.make(config.password) },
      workspace: config.workspace,
      connectionTimeout: config.connectionTimeout ?? DEFAULT_HULY_CONNECTION_TIMEOUT
    })
  }

  /** Bypasses validation - for testing only. */
  static testLayerToken(config: {
    url: string
    token: string
    workspace: string
    connectionTimeout?: number
  }): Layer.Layer<HulyConfigService> {
    return Layer.succeed(HulyConfigService, {
      url: config.url,
      auth: { _tag: "token", token: Redacted.make(config.token) },
      workspace: config.workspace,
      connectionTimeout: config.connectionTimeout ?? DEFAULT_HULY_CONNECTION_TIMEOUT
    })
  }
}
