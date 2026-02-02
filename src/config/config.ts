/**
 * Configuration module for Huly MCP server.
 *
 * Loads config from environment variables and optional .hulyrc.json file.
 * Credentials (email, password) only from env vars for security.
 * Non-sensitive config (url, workspace, timeout) can come from file.
 * Env vars always override file config.
 *
 * @module
 */
import * as fs from "node:fs"
import * as path from "node:path"

import type { ConfigError } from "effect"
import { Config, ConfigProvider, Context, Effect, Layer, Option, Redacted, Schema } from "effect"

const DEFAULT_TIMEOUT = 30000
const CONFIG_FILE_NAME = ".hulyrc.json"

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
 * Schema for positive integer from string (for env vars/config).
 */
const PositiveIntFromString = Schema.NumberFromString.pipe(
  Schema.int({ message: () => "Must be an integer" }),
  Schema.positive({ message: () => "Must be positive" })
)

/**
 * Schema for optional config file content (.hulyrc.json).
 * Only non-sensitive values allowed.
 */
export const FileConfigSchema = Schema.Struct({
  url: Schema.optional(UrlSchema),
  workspace: Schema.optional(NonWhitespaceString),
  connectionTimeout: Schema.optional(PositiveInt)
})

export type FileConfig = Schema.Schema.Type<typeof FileConfigSchema>

/**
 * Full configuration schema after merging sources.
 */
export const HulyConfigSchema = Schema.Struct({
  url: UrlSchema,
  email: NonWhitespaceString,
  password: Schema.Redacted(NonWhitespaceString),
  workspace: NonWhitespaceString,
  connectionTimeout: PositiveInt
})

export type HulyConfig = Schema.Schema.Type<typeof HulyConfigSchema>

export class ConfigValidationError extends Schema.TaggedError<ConfigValidationError>()(
  "ConfigValidationError",
  {
    message: Schema.String,
    field: Schema.optional(Schema.String),
    cause: Schema.optional(Schema.Defect)
  }
) {}

export class ConfigFileError extends Schema.TaggedError<ConfigFileError>()(
  "ConfigFileError",
  {
    message: Schema.String,
    path: Schema.String,
    cause: Schema.optional(Schema.Defect)
  }
) {}

export type HulyConfigError = ConfigValidationError | ConfigFileError

const toError = (e: unknown): Error => e instanceof Error ? e : new Error(String(e))

const loadFileConfigProvider = (
  filePath: string
): Effect.Effect<Option.Option<ConfigProvider.ConfigProvider>, ConfigFileError> =>
  Effect.gen(function*() {
    const exists = yield* Effect.sync(() => fs.existsSync(filePath))

    if (!exists) {
      return Option.none()
    }

    const content = yield* Effect.try({
      try: () => fs.readFileSync(filePath, "utf-8"),
      catch: (e) =>
        new ConfigFileError({
          message: "Failed to read config file",
          path: filePath,
          cause: toError(e)
        })
    })

    const parsed = yield* Effect.try({
      try: () => JSON.parse(content) as unknown,
      catch: (e) =>
        new ConfigFileError({
          message: "Config file is not valid JSON",
          path: filePath,
          cause: toError(e)
        })
    })

    const decoded = yield* Schema.decodeUnknown(FileConfigSchema)(parsed).pipe(
      Effect.mapError(
        (e) =>
          new ConfigFileError({
            message: `Config file validation failed: ${e.message}`,
            path: filePath
          })
      )
    )

    const configMap = Object.fromEntries(
      [
        ["HULY_URL", decoded.url],
        ["HULY_WORKSPACE", decoded.workspace],
        ["HULY_CONNECTION_TIMEOUT", decoded.connectionTimeout?.toString()]
      ].filter((entry): entry is [string, string] => entry[1] !== undefined)
    )

    return Option.some(ConfigProvider.fromJson(configMap))
  })

/**
 * Build a ConfigProvider that reads from env vars first, then falls back to file.
 * Defers process.cwd() evaluation to runtime.
 */
const buildConfigProvider = (): Effect.Effect<ConfigProvider.ConfigProvider, ConfigFileError> =>
  Effect.gen(function*() {
    const configPath = yield* Effect.sync(() => path.resolve(process.cwd(), CONFIG_FILE_NAME))
    const fileProviderOption = yield* loadFileConfigProvider(configPath)

    return Option.match(fileProviderOption, {
      onNone: () => ConfigProvider.fromEnv(),
      onSome: (fileProvider) => ConfigProvider.orElse(ConfigProvider.fromEnv(), () => fileProvider)
    })
  })

/**
 * Config definition using Effect's Config module.
 * Uses Schema.Config for consistent validation with NonWhitespaceString.
 */
const HulyConfigFromEnv = Config.all({
  url: Schema.Config("HULY_URL", UrlSchema),
  email: Schema.Config("HULY_EMAIL", NonWhitespaceString),
  password: Schema.Config("HULY_PASSWORD", Schema.Redacted(NonWhitespaceString)),
  workspace: Schema.Config("HULY_WORKSPACE", NonWhitespaceString),
  connectionTimeout: Schema.Config("HULY_CONNECTION_TIMEOUT", PositiveIntFromString).pipe(
    Config.withDefault(DEFAULT_TIMEOUT)
  )
})

const loadConfig: Effect.Effect<HulyConfig, HulyConfigError> = Effect.gen(function*() {
  const provider = yield* buildConfigProvider()

  return yield* HulyConfigFromEnv.pipe(
    Effect.provide(Layer.setConfigProvider(provider)),
    Effect.mapError((e) =>
      new ConfigValidationError({
        message: `Configuration error: ${e.message}`,
        field: extractFieldFromConfigError(e),
        cause: e
      })
    )
  )
})

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
  static readonly CONFIG_FILE_NAME = CONFIG_FILE_NAME

  static readonly layer: Layer.Layer<HulyConfigService, HulyConfigError> = Layer.effect(
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
      email: config.email,
      password: Redacted.make(config.password),
      workspace: config.workspace,
      connectionTimeout: config.connectionTimeout ?? DEFAULT_TIMEOUT
    })
  }
}
