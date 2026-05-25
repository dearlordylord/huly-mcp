/**
 * Configuration module for Huly MCP server.
 *
 * Loads config from environment variables.
 *
 * @module
 */
import type { ConfigError } from "effect"
import { Config, ConfigProvider, Context, Effect, Layer, Redacted, Schema } from "effect"

const DEFAULT_TIMEOUT = 30000
const REQUIRED_HULY_CONFIG_HEADERS = ["x-huly-url", "x-huly-workspace", "x-huly-token"] as const
const HULY_CONFIG_HEADERS = [
  ...REQUIRED_HULY_CONFIG_HEADERS,
  "x-huly-connection-timeout"
] as const

type HulyConfigHeader = typeof HULY_CONFIG_HEADERS[number]
type HeaderValue = string | ReadonlyArray<string> | undefined
type ConfigMapEntry = readonly [string, string]
type NormalizedHeaderEntry = readonly [HulyConfigHeader, HeaderValue]

const headerToEnvName: Record<HulyConfigHeader, string> = {
  "x-huly-url": "HULY_URL",
  "x-huly-workspace": "HULY_WORKSPACE",
  "x-huly-token": "HULY_TOKEN",
  "x-huly-connection-timeout": "HULY_CONNECTION_TIMEOUT"
}

const hulyConfigHeaderSet = new Set<string>(HULY_CONFIG_HEADERS)

const isHulyConfigHeader = (name: string): name is HulyConfigHeader => hulyConfigHeaderSet.has(name)
const isConfigMapEntry = (entry: ConfigMapEntry | undefined): entry is ConfigMapEntry => entry !== undefined

/**
 * Schema for URL validation - must be valid http/https URL.
 */
const UrlSchema = Schema.String.pipe(
  Schema.filter((s) => {
    try {
      const url = new URL(s)
      return url.protocol === "http:" || url.protocol === "https:"
    } catch {
      return false
    }
  }, { message: () => "Must be a valid http or https URL" })
)

/**
 * Schema for non-whitespace-only string.
 * Validates that the string is not empty after trimming.
 * Note: Does NOT transform the value - original string is preserved.
 */
const NonWhitespaceString = Schema.String.pipe(
  Schema.filter((s) => s.trim().length > 0, { message: () => "Must not be empty or whitespace-only" })
)

/**
 * Schema for positive integer (timeout in ms).
 * Used for direct validation (e.g., HulyConfigSchema).
 */
const PositiveInt = Schema.Number.pipe(
  Schema.int({ message: () => "Must be an integer" }),
  Schema.positive({ message: () => "Must be positive" })
)

/**
 * Schema for positive integer from string (for env vars).
 */
const PositiveIntFromString = Schema.NumberFromString.pipe(
  Schema.int({ message: () => "Must be an integer" }),
  Schema.positive({ message: () => "Must be positive" })
)

const TokenAuthSchema = Schema.Struct({
  _tag: Schema.Literal("token"),
  token: Schema.Redacted(NonWhitespaceString)
})

const PasswordAuthSchema = Schema.Struct({
  _tag: Schema.Literal("password"),
  email: NonWhitespaceString,
  password: Schema.Redacted(NonWhitespaceString)
})

const AuthSchema = Schema.Union(TokenAuthSchema, PasswordAuthSchema)

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

export class ConfigValidationError extends Schema.TaggedError<ConfigValidationError>()(
  "ConfigValidationError",
  {
    message: Schema.String,
    field: Schema.optional(Schema.String),
    cause: Schema.optional(Schema.Defect)
  }
) {}

/**
 * Build an Effect ConfigProvider from Smithery hosted URL mode headers.
 *
 * If no x-huly-* headers are present, returns undefined so callers can use the
 * existing process environment resolver. If any x-huly-* header is present,
 * only token auth headers are accepted and all required fields must come from
 * headers; missing values are never filled from process env.
 */
export const hulyConfigProviderFromHeaders = (
  headers: Record<string, HeaderValue>
): Effect.Effect<ConfigProvider.ConfigProvider | undefined, ConfigValidationError> =>
  Effect.gen(function*() {
    const hulyHeaders = Object.entries(headers).filter(([name]) => name.toLowerCase().startsWith("x-huly-"))
    if (hulyHeaders.length === 0) return undefined

    const normalized = yield* Effect.forEach(hulyHeaders, ([rawName, value]): Effect.Effect<
      NormalizedHeaderEntry,
      ConfigValidationError
    > => {
      const name = rawName.toLowerCase()
      if (!isHulyConfigHeader(name)) {
        return Effect.fail(
          new ConfigValidationError({
            message: `Unsupported Huly config header "${rawName}". Supported headers: ${
              HULY_CONFIG_HEADERS.join(", ")
            }.`,
            field: rawName
          })
        )
      }

      return Effect.succeed([name, value])
    })

    const normalizedNames = normalized.map(([name]) => name)
    const duplicateName = normalizedNames.find((name, index) => normalizedNames.indexOf(name) !== index)
    if (duplicateName !== undefined) {
      return yield* new ConfigValidationError({
        message: `Duplicate Huly config header "${duplicateName}" received with different casing.`,
        field: duplicateName
      })
    }

    const configEntries = yield* Effect.forEach(HULY_CONFIG_HEADERS, (headerName): Effect.Effect<
      ConfigMapEntry | undefined,
      ConfigValidationError
    > => {
      const value = normalized.find(([name]) => name === headerName)?.[1]
      if (value === undefined) {
        if (REQUIRED_HULY_CONFIG_HEADERS.includes(headerName)) {
          return Effect.fail(
            new ConfigValidationError({
              message: `Missing required Huly config header "${headerName}". When any x-huly-* header is present, `
                + `${REQUIRED_HULY_CONFIG_HEADERS.join(", ")} must all be provided.`,
              field: headerName
            })
          )
        }
        return Effect.succeed(undefined)
      }

      if (typeof value !== "string") {
        return Effect.fail(
          new ConfigValidationError({
            message: `Huly config header "${headerName}" must have exactly one value.`,
            field: headerName
          })
        )
      }

      return Effect.succeed([headerToEnvName[headerName], value])
    })

    return ConfigProvider.fromMap(new Map(configEntries.filter(isConfigMapEntry)))
  })

const TokenAuthFromEnv = Config.map(
  Schema.Config("HULY_TOKEN", Schema.Redacted(NonWhitespaceString)),
  (token): Auth => ({ _tag: "token", token })
)

const PasswordAuthFromEnv = Config.map(
  Config.all({
    email: Schema.Config("HULY_EMAIL", NonWhitespaceString),
    password: Schema.Config("HULY_PASSWORD", Schema.Redacted(NonWhitespaceString))
  }),
  ({ email, password }): Auth => ({ _tag: "password", email, password })
)

const AuthFromEnv = TokenAuthFromEnv.pipe(Config.orElse(() => PasswordAuthFromEnv))

/**
 * Config definition using Effect's Config module.
 * Uses Schema.Config for consistent validation with NonWhitespaceString.
 */
const HulyConfigFromEnv = Config.all({
  url: Schema.Config("HULY_URL", UrlSchema),
  auth: AuthFromEnv,
  workspace: Schema.Config("HULY_WORKSPACE", NonWhitespaceString),
  connectionTimeout: Schema.Config("HULY_CONNECTION_TIMEOUT", PositiveIntFromString).pipe(
    Config.withDefault(DEFAULT_TIMEOUT)
  )
})

const loadConfig: Effect.Effect<HulyConfig, ConfigValidationError> = HulyConfigFromEnv.pipe(
  Effect.mapError((e) =>
    new ConfigValidationError({
      message: `Configuration error: ${e.message}`,
      field: extractFieldFromConfigError(e),
      cause: e
    })
  )
)

const extractFieldFromConfigError = (error: ConfigError.ConfigError): string | undefined => {
  const message = error.message
  // Try to extract key name from message like "Expected HULY_URL to exist..."
  const match = message.match(/Expected\s+(\w+)\s+to/)
  return match?.[1]
}

export class HulyConfigService extends Context.Tag("@hulymcp/HulyConfig")<
  HulyConfigService,
  HulyConfig
>() {
  static readonly DEFAULT_TIMEOUT = DEFAULT_TIMEOUT

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
      connectionTimeout: config.connectionTimeout ?? DEFAULT_TIMEOUT
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
      connectionTimeout: config.connectionTimeout ?? DEFAULT_TIMEOUT
    })
  }
}
