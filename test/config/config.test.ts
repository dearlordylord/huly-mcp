import { afterEach, beforeEach, describe, it } from "@effect/vitest"
import { Effect, Redacted, Schema } from "effect"
import { expect } from "vitest"
import {
  ConfigValidationError,
  hulyConfigProviderFromHeaders,
  HulyConfigSchema,
  HulyConfigService,
  sanitizeHulyRuntimeConfigFromEnv,
  sanitizeHulyRuntimeConfigFromHeaders
} from "../../src/config/config.js"

describe("Config Module", () => {
  // Store original env vars
  const originalEnv: Record<string, string | undefined> = {}
  const envVars = [
    "HULY_URL",
    "HULY_TOKEN",
    "HULY_EMAIL",
    "HULY_PASSWORD",
    "HULY_WORKSPACE",
    "HULY_CONNECTION_TIMEOUT",
    "LAZY_ENVS"
  ]

  beforeEach(() => {
    // Save and clear env vars
    for (const key of envVars) {
      originalEnv[key] = process.env[key]
      delete process.env[key]
    }
  })

  afterEach(() => {
    // Restore env vars
    for (const key of envVars) {
      if (originalEnv[key] !== undefined) {
        process.env[key] = originalEnv[key]
      } else {
        delete process.env[key]
      }
    }
  })

  describe("HulyConfigSchema", () => {
    it.effect("validates valid config with password auth", () =>
      Effect.gen(function*() {
        const config = {
          url: "https://huly.app",
          auth: {
            _tag: "password",
            email: "user@example.com",
            password: "secret"
          },
          workspace: "default",
          connectionTimeout: 30000
        }

        const result = Schema.decodeUnknownSync(HulyConfigSchema)(config)
        expect(result.url).toBe("https://huly.app")
        expect(result.auth._tag).toBe("password")
        if (result.auth._tag === "password") {
          expect(result.auth.email).toBe("user@example.com")
          expect(Redacted.value(result.auth.password)).toBe("secret")
        }
        expect(result.workspace).toBe("default")
        expect(result.connectionTimeout).toBe(30000)
      }))

    it.effect("validates valid config with token auth", () =>
      Effect.gen(function*() {
        const config = {
          url: "https://huly.app",
          auth: {
            _tag: "token",
            token: "my-api-token"
          },
          workspace: "default",
          connectionTimeout: 30000
        }

        const result = Schema.decodeUnknownSync(HulyConfigSchema)(config)
        expect(result.url).toBe("https://huly.app")
        expect(result.auth._tag).toBe("token")
        if (result.auth._tag === "token") {
          expect(Redacted.value(result.auth.token)).toBe("my-api-token")
        }
        expect(result.workspace).toBe("default")
        expect(result.connectionTimeout).toBe(30000)
      }))

    it.effect("rejects invalid URL", () =>
      Effect.gen(function*() {
        const config = {
          url: "not-a-url",
          auth: { _tag: "password", email: "user@example.com", password: "secret" },
          workspace: "default",
          connectionTimeout: 30000
        }

        expect(() => Schema.decodeUnknownSync(HulyConfigSchema)(config)).toThrow()
      }))

    it.effect("rejects ftp URL", () =>
      Effect.gen(function*() {
        const config = {
          url: "ftp://example.com",
          auth: { _tag: "password", email: "user@example.com", password: "secret" },
          workspace: "default",
          connectionTimeout: 30000
        }

        expect(() => Schema.decodeUnknownSync(HulyConfigSchema)(config)).toThrow()
      }))

    it.effect("rejects empty email in password auth", () =>
      Effect.gen(function*() {
        const config = {
          url: "https://huly.app",
          auth: { _tag: "password", email: "   ", password: "secret" },
          workspace: "default",
          connectionTimeout: 30000
        }

        expect(() => Schema.decodeUnknownSync(HulyConfigSchema)(config)).toThrow()
      }))

    it.effect("rejects negative timeout", () =>
      Effect.gen(function*() {
        const config = {
          url: "https://huly.app",
          auth: { _tag: "password", email: "user@example.com", password: "secret" },
          workspace: "default",
          connectionTimeout: -1
        }

        expect(() => Schema.decodeUnknownSync(HulyConfigSchema)(config)).toThrow()
      }))

    it.effect("rejects zero timeout", () =>
      Effect.gen(function*() {
        const config = {
          url: "https://huly.app",
          auth: { _tag: "password", email: "user@example.com", password: "secret" },
          workspace: "default",
          connectionTimeout: 0
        }

        expect(() => Schema.decodeUnknownSync(HulyConfigSchema)(config)).toThrow()
      }))

    it.effect("rejects non-integer timeout", () =>
      Effect.gen(function*() {
        const config = {
          url: "https://huly.app",
          auth: { _tag: "password", email: "user@example.com", password: "secret" },
          workspace: "default",
          connectionTimeout: 30.5
        }

        expect(() => Schema.decodeUnknownSync(HulyConfigSchema)(config)).toThrow()
      }))
  })

  describe("ConfigValidationError", () => {
    it.effect("creates with message", () =>
      Effect.gen(function*() {
        const error = new ConfigValidationError({ message: "Invalid config" })
        expect(error._tag).toBe("ConfigValidationError")
        expect(error.message).toBe("Invalid config")
      }))

    it.effect("creates with field", () =>
      Effect.gen(function*() {
        const error = new ConfigValidationError({
          message: "Missing required config",
          field: "HULY_URL"
        })
        expect(error.field).toBe("HULY_URL")
      }))

    it.effect("creates with cause", () =>
      Effect.gen(function*() {
        const cause = new Error("underlying error")
        const error = new ConfigValidationError({
          message: "Validation failed",
          cause
        })
        expect(error.cause).toBe(cause)
      }))
  })

  describe("HulyConfigService.testLayer", () => {
    it.effect("creates layer with password auth", () =>
      Effect.gen(function*() {
        const layer = HulyConfigService.testLayer({
          url: "https://test.huly.app",
          email: "test@example.com",
          password: "test-secret",
          workspace: "test-workspace",
          connectionTimeout: 5000
        })

        const config = yield* HulyConfigService.pipe(Effect.provide(layer))

        expect(config.url).toBe("https://test.huly.app")
        expect(config.auth._tag).toBe("password")
        if (config.auth._tag === "password") {
          expect(config.auth.email).toBe("test@example.com")
          expect(Redacted.value(config.auth.password)).toBe("test-secret")
        }
        expect(config.workspace).toBe("test-workspace")
        expect(config.connectionTimeout).toBe(5000)
      }))

    it.effect("creates layer with token auth", () =>
      Effect.gen(function*() {
        const layer = HulyConfigService.testLayerToken({
          url: "https://test.huly.app",
          token: "test-token",
          workspace: "test-workspace",
          connectionTimeout: 5000
        })

        const config = yield* HulyConfigService.pipe(Effect.provide(layer))

        expect(config.url).toBe("https://test.huly.app")
        expect(config.auth._tag).toBe("token")
        if (config.auth._tag === "token") {
          expect(Redacted.value(config.auth.token)).toBe("test-token")
        }
        expect(config.workspace).toBe("test-workspace")
        expect(config.connectionTimeout).toBe(5000)
      }))

    it.effect("uses default timeout when not provided", () =>
      Effect.gen(function*() {
        const layer = HulyConfigService.testLayer({
          url: "https://test.huly.app",
          email: "test@example.com",
          password: "test-secret",
          workspace: "test-workspace"
        })

        const config = yield* HulyConfigService.pipe(Effect.provide(layer))

        expect(config.connectionTimeout).toBe(HulyConfigService.DEFAULT_TIMEOUT)
      }))
  })

  describe("HulyConfigService.layer (env vars)", () => {
    it.effect("loads config with password auth from env vars", () =>
      Effect.gen(function*() {
        process.env["HULY_URL"] = "https://huly.app"
        process.env["HULY_EMAIL"] = "user@example.com"
        process.env["HULY_PASSWORD"] = "secret123"
        process.env["HULY_WORKSPACE"] = "my-workspace"
        process.env["HULY_CONNECTION_TIMEOUT"] = "60000"

        const config = yield* HulyConfigService.pipe(
          Effect.provide(HulyConfigService.layer)
        )

        expect(config.url).toBe("https://huly.app")
        expect(config.auth._tag).toBe("password")
        if (config.auth._tag === "password") {
          expect(config.auth.email).toBe("user@example.com")
          expect(Redacted.value(config.auth.password)).toBe("secret123")
        }
        expect(config.workspace).toBe("my-workspace")
        expect(config.connectionTimeout).toBe(60000)
      }))

    it.effect("loads config with token auth from env vars", () =>
      Effect.gen(function*() {
        process.env["HULY_URL"] = "https://huly.app"
        process.env["HULY_TOKEN"] = "my-api-token"
        process.env["HULY_WORKSPACE"] = "my-workspace"
        process.env["HULY_CONNECTION_TIMEOUT"] = "60000"

        const config = yield* HulyConfigService.pipe(
          Effect.provide(HulyConfigService.layer)
        )

        expect(config.url).toBe("https://huly.app")
        expect(config.auth._tag).toBe("token")
        if (config.auth._tag === "token") {
          expect(Redacted.value(config.auth.token)).toBe("my-api-token")
        }
        expect(config.workspace).toBe("my-workspace")
        expect(config.connectionTimeout).toBe(60000)
      }))

    it.effect("token takes priority over password", () =>
      Effect.gen(function*() {
        process.env["HULY_URL"] = "https://huly.app"
        process.env["HULY_TOKEN"] = "my-api-token"
        process.env["HULY_EMAIL"] = "user@example.com"
        process.env["HULY_PASSWORD"] = "secret123"
        process.env["HULY_WORKSPACE"] = "my-workspace"

        const config = yield* HulyConfigService.pipe(
          Effect.provide(HulyConfigService.layer)
        )

        expect(config.auth._tag).toBe("token")
        if (config.auth._tag === "token") {
          expect(Redacted.value(config.auth.token)).toBe("my-api-token")
        }
      }))

    it.effect("uses default timeout when not provided", () =>
      Effect.gen(function*() {
        process.env["HULY_URL"] = "https://huly.app"
        process.env["HULY_EMAIL"] = "user@example.com"
        process.env["HULY_PASSWORD"] = "secret123"
        process.env["HULY_WORKSPACE"] = "my-workspace"

        const config = yield* HulyConfigService.pipe(
          Effect.provide(HulyConfigService.layer)
        )

        expect(config.connectionTimeout).toBe(HulyConfigService.DEFAULT_TIMEOUT)
      }))

    it.effect("fails on missing required HULY_URL", () =>
      Effect.gen(function*() {
        process.env["HULY_EMAIL"] = "user@example.com"
        process.env["HULY_PASSWORD"] = "secret123"
        process.env["HULY_WORKSPACE"] = "my-workspace"

        const error = yield* Effect.flip(
          HulyConfigService.pipe(Effect.provide(HulyConfigService.layer))
        )

        expect(error._tag).toBe("ConfigValidationError")
      }))

    it.effect("fails on missing auth (no token or email/password)", () =>
      Effect.gen(function*() {
        process.env["HULY_URL"] = "https://huly.app"
        process.env["HULY_WORKSPACE"] = "my-workspace"

        const error = yield* Effect.flip(
          HulyConfigService.pipe(Effect.provide(HulyConfigService.layer))
        )

        expect(error._tag).toBe("ConfigValidationError")
      }))

    it.effect("fails on missing HULY_PASSWORD when using password auth", () =>
      Effect.gen(function*() {
        process.env["HULY_URL"] = "https://huly.app"
        process.env["HULY_EMAIL"] = "user@example.com"
        process.env["HULY_WORKSPACE"] = "my-workspace"

        const error = yield* Effect.flip(
          HulyConfigService.pipe(Effect.provide(HulyConfigService.layer))
        )

        expect(error._tag).toBe("ConfigValidationError")
      }))

    it.effect("fails on missing required HULY_WORKSPACE", () =>
      Effect.gen(function*() {
        process.env["HULY_URL"] = "https://huly.app"
        process.env["HULY_EMAIL"] = "user@example.com"
        process.env["HULY_PASSWORD"] = "secret123"

        const error = yield* Effect.flip(
          HulyConfigService.pipe(Effect.provide(HulyConfigService.layer))
        )

        expect(error._tag).toBe("ConfigValidationError")
      }))

    it.effect("fails on invalid URL", () =>
      Effect.gen(function*() {
        process.env["HULY_URL"] = "not-a-url"
        process.env["HULY_EMAIL"] = "user@example.com"
        process.env["HULY_PASSWORD"] = "secret123"
        process.env["HULY_WORKSPACE"] = "my-workspace"

        const error = yield* Effect.flip(
          HulyConfigService.pipe(Effect.provide(HulyConfigService.layer))
        )

        expect(error._tag).toBe("ConfigValidationError")
      }))

    it.effect("fails on invalid timeout", () =>
      Effect.gen(function*() {
        process.env["HULY_URL"] = "https://huly.app"
        process.env["HULY_EMAIL"] = "user@example.com"
        process.env["HULY_PASSWORD"] = "secret123"
        process.env["HULY_WORKSPACE"] = "my-workspace"
        process.env["HULY_CONNECTION_TIMEOUT"] = "not-a-number"

        const error = yield* Effect.flip(
          HulyConfigService.pipe(Effect.provide(HulyConfigService.layer))
        )

        expect(error._tag).toBe("ConfigValidationError")
      }))

    it.effect("fails on negative timeout", () =>
      Effect.gen(function*() {
        process.env["HULY_URL"] = "https://huly.app"
        process.env["HULY_EMAIL"] = "user@example.com"
        process.env["HULY_PASSWORD"] = "secret123"
        process.env["HULY_WORKSPACE"] = "my-workspace"
        process.env["HULY_CONNECTION_TIMEOUT"] = "-100"

        const error = yield* Effect.flip(
          HulyConfigService.pipe(Effect.provide(HulyConfigService.layer))
        )

        expect(error._tag).toBe("ConfigValidationError")
      }))

    it.effect("fails on empty password", () =>
      Effect.gen(function*() {
        process.env["HULY_URL"] = "https://huly.app"
        process.env["HULY_EMAIL"] = "user@example.com"
        process.env["HULY_PASSWORD"] = ""
        process.env["HULY_WORKSPACE"] = "my-workspace"

        const error = yield* Effect.flip(
          HulyConfigService.pipe(Effect.provide(HulyConfigService.layer))
        )

        expect(error._tag).toBe("ConfigValidationError")
      }))

    it.effect("fails on whitespace-only password", () =>
      Effect.gen(function*() {
        process.env["HULY_URL"] = "https://huly.app"
        process.env["HULY_EMAIL"] = "user@example.com"
        process.env["HULY_PASSWORD"] = "   "
        process.env["HULY_WORKSPACE"] = "my-workspace"

        const error = yield* Effect.flip(
          HulyConfigService.pipe(Effect.provide(HulyConfigService.layer))
        )

        expect(error._tag).toBe("ConfigValidationError")
      }))

    it.effect("fails on whitespace-only email", () =>
      Effect.gen(function*() {
        process.env["HULY_URL"] = "https://huly.app"
        process.env["HULY_EMAIL"] = "   "
        process.env["HULY_PASSWORD"] = "secret123"
        process.env["HULY_WORKSPACE"] = "my-workspace"

        const error = yield* Effect.flip(
          HulyConfigService.pipe(Effect.provide(HulyConfigService.layer))
        )

        expect(error._tag).toBe("ConfigValidationError")
      }))

    it.effect("fails on whitespace-only token", () =>
      Effect.gen(function*() {
        process.env["HULY_URL"] = "https://huly.app"
        process.env["HULY_TOKEN"] = "   "
        process.env["HULY_WORKSPACE"] = "my-workspace"

        const error = yield* Effect.flip(
          HulyConfigService.pipe(Effect.provide(HulyConfigService.layer))
        )

        expect(error._tag).toBe("ConfigValidationError")
      }))
  })

  describe("hulyConfigProviderFromHeaders", () => {
    it.effect("loads token config from complete URL headers", () =>
      Effect.gen(function*() {
        const provider = yield* hulyConfigProviderFromHeaders({
          "x-huly-url": "https://huly.app",
          "x-huly-workspace": "my-workspace",
          "x-huly-token": "my-api-token",
          "x-huly-connection-timeout": "60000"
        })

        expect(provider).toBeDefined()
        if (provider === undefined) return

        const config = yield* HulyConfigService.pipe(
          Effect.provide(HulyConfigService.layer),
          Effect.withConfigProvider(provider)
        )

        expect(config.url).toBe("https://huly.app")
        expect(config.workspace).toBe("my-workspace")
        expect(config.auth._tag).toBe("token")
        if (config.auth._tag === "token") {
          expect(Redacted.value(config.auth.token)).toBe("my-api-token")
        }
        expect(config.connectionTimeout).toBe(60000)
      }))

    it.effect("fails when one URL header is present and a required header is missing", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          hulyConfigProviderFromHeaders({
            "x-huly-url": "https://huly.app",
            "x-huly-token": "my-api-token"
          })
        )

        expect(error._tag).toBe("ConfigValidationError")
        expect(error.field).toBe("x-huly-workspace")
      }))

    it.effect("returns undefined when no Huly headers are present", () =>
      Effect.gen(function*() {
        const provider = yield* hulyConfigProviderFromHeaders({
          authorization: "Bearer unrelated"
        })

        expect(provider).toBeUndefined()
      }))

    it.effect("rejects multi-value Huly headers", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          hulyConfigProviderFromHeaders({
            "x-huly-url": ["https://a.example", "https://b.example"],
            "x-huly-workspace": "my-workspace",
            "x-huly-token": "my-api-token"
          })
        )

        expect(error._tag).toBe("ConfigValidationError")
        expect(error.field).toBe("x-huly-url")
      }))

    it.effect("rejects non-HTTP header values before config mapping", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          hulyConfigProviderFromHeaders({
            "x-huly-url": 123,
            "x-huly-workspace": "my-workspace",
            "x-huly-token": "my-api-token"
          })
        )

        expect(error._tag).toBe("ConfigValidationError")
        expect(error.field).toBe("headers")
      }))

    it.effect("rejects unsupported x-huly headers", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(
          hulyConfigProviderFromHeaders({
            "x-huly-url": "https://huly.app",
            "x-huly-workspace": "my-workspace",
            "x-huly-token": "my-api-token",
            "x-huly-email": "user@example.com"
          })
        )

        expect(error._tag).toBe("ConfigValidationError")
        expect(error.field).toBe("x-huly-email")
      }))
  })

  describe("sanitized runtime config context", () => {
    it.effect("reports env token auth without exposing token value", () =>
      Effect.gen(function*() {
        const context = sanitizeHulyRuntimeConfigFromEnv({
          HULY_URL: "https://huly.app",
          HULY_TOKEN: "secret-token",
          HULY_WORKSPACE: "my-workspace"
        })

        expect(context.auth).toMatchObject({
          method: "token",
          source: "env",
          tokenConfigured: true,
          emailConfigured: false,
          passwordConfigured: false
        })
        expect(JSON.stringify(context)).not.toContain("secret-token")
      }))

    it.effect("reports env password auth without exposing email or password values", () =>
      Effect.gen(function*() {
        const context = sanitizeHulyRuntimeConfigFromEnv({
          HULY_URL: "https://huly.app",
          HULY_EMAIL: "user@example.com",
          HULY_PASSWORD: "secret-password",
          HULY_WORKSPACE: "my-workspace"
        })

        expect(context.auth).toMatchObject({
          method: "password",
          source: "env",
          tokenConfigured: false,
          emailConfigured: true,
          passwordConfigured: true
        })
        const serialized = JSON.stringify(context)
        expect(serialized).not.toContain("user@example.com")
        expect(serialized).not.toContain("secret-password")
      }))

    it.effect("does not fail when env config is missing in lazy mode", () =>
      Effect.gen(function*() {
        const context = sanitizeHulyRuntimeConfigFromEnv({ LAZY_ENVS: "true" })

        expect(context.huly.url).toEqual({ configured: false })
        expect(context.huly.workspace).toEqual({ configured: false })
        expect(context.auth).toMatchObject({ method: "unknown", source: "none" })
        expect(context.configSources.env.lazyEnvs).toBe(true)
      }))

    it.effect("does not return an empty configured workspace value", () =>
      Effect.gen(function*() {
        const context = sanitizeHulyRuntimeConfigFromEnv({ HULY_WORKSPACE: "" })

        expect(context.huly.workspace).toEqual({ configured: true })
      }))

    it.effect("sanitizes URL credentials, path, query, and hash", () =>
      Effect.gen(function*() {
        const context = sanitizeHulyRuntimeConfigFromEnv({
          HULY_URL: "https://url-user:credential-secret@example.huly.app/workspace?token=query-secret#hash",
          HULY_TOKEN: "secret-token",
          HULY_WORKSPACE: "my-workspace"
        })

        expect(context.huly.url).toEqual({
          configured: true,
          valid: true,
          origin: "https://example.huly.app",
          host: "example.huly.app",
          protocol: "https:"
        })
        const serialized = JSON.stringify(context)
        expect(serialized).not.toContain("url-user")
        expect(serialized).not.toContain("credential-secret")
        expect(serialized).not.toContain("query-secret")
        expect(serialized).not.toContain("workspace?")
      }))

    it.effect("reports invalid URL without returning the raw value", () =>
      Effect.gen(function*() {
        const context = sanitizeHulyRuntimeConfigFromEnv({
          HULY_URL: "not a url",
          HULY_TOKEN: "secret-token",
          HULY_WORKSPACE: "my-workspace"
        })

        expect(context.huly.url).toEqual({ configured: true, valid: false })
        expect(JSON.stringify(context)).not.toContain("not a url")
      }))

    it.effect("reports missing timeout as the default", () =>
      Effect.gen(function*() {
        const context = sanitizeHulyRuntimeConfigFromEnv({})

        expect(context.huly.connectionTimeout).toEqual({
          configured: false,
          valid: true,
          valueMs: HulyConfigService.DEFAULT_TIMEOUT,
          defaultMs: HulyConfigService.DEFAULT_TIMEOUT,
          source: "default"
        })
      }))

    it.effect("reports invalid timeout without returning a value", () =>
      Effect.gen(function*() {
        const context = sanitizeHulyRuntimeConfigFromEnv({
          HULY_CONNECTION_TIMEOUT: "nope"
        })

        expect(context.huly.connectionTimeout).toEqual({
          configured: true,
          valid: false,
          defaultMs: HulyConfigService.DEFAULT_TIMEOUT,
          source: "invalid"
        })
      }))

    it.effect("reports complete header token config without exposing header values", () =>
      Effect.gen(function*() {
        const context = sanitizeHulyRuntimeConfigFromHeaders(
          {
            "x-huly-url": "https://header-user:header-pass@header.huly.app/path?token=header-query-secret",
            "x-huly-workspace": "header-workspace",
            "x-huly-token": "header-token",
            "x-huly-connection-timeout": "45000"
          },
          {
            HULY_URL: "https://env.huly.app",
            HULY_TOKEN: "env-token",
            HULY_WORKSPACE: "env-workspace"
          }
        )

        expect(context.auth).toMatchObject({ method: "token", source: "header", tokenConfigured: true })
        expect(context.huly.url.origin).toBe("https://header.huly.app")
        expect(context.huly.workspace).toEqual({ configured: true, value: "header-workspace" })
        expect(context.huly.connectionTimeout).toMatchObject({ source: "header", valueMs: 45000 })
        expect(context.configSources.headers).toMatchObject({
          present: true,
          requiredComplete: true,
          hulyUrl: true,
          hulyWorkspace: true,
          hulyToken: true,
          hulyConnectionTimeout: true
        })
        const serialized = JSON.stringify(context)
        expect(serialized).not.toContain("header-token")
        expect(serialized).not.toContain("env-token")
        expect(serialized).not.toContain("header-user")
        expect(serialized).not.toContain("header-pass")
        expect(serialized).not.toContain("header-query-secret")
      }))

    it.effect("reports unsupported x-huly headers without values", () =>
      Effect.gen(function*() {
        const context = sanitizeHulyRuntimeConfigFromHeaders({
          "x-huly-url": "https://huly.app",
          "x-huly-token": "secret-token",
          "x-huly-email": "user@example.com"
        })

        expect(context.configSources.headers).toMatchObject({
          present: true,
          requiredComplete: false,
          unsupportedHulyHeaders: ["x-huly-email"]
        })
        const serialized = JSON.stringify(context)
        expect(serialized).not.toContain("user@example.com")
        expect(serialized).not.toContain("secret-token")
      }))
  })

  describe("Constants", () => {
    it.effect("has correct default timeout", () =>
      Effect.gen(function*() {
        expect(HulyConfigService.DEFAULT_TIMEOUT).toBe(30000)
      }))
  })

  describe("Effect integration", () => {
    it.effect("errors are yieldable", () =>
      Effect.gen(function*() {
        const program = Effect.gen(function*() {
          return yield* new ConfigValidationError({ message: "Test error" })
        })

        const error = yield* Effect.flip(program)
        expect(error._tag).toBe("ConfigValidationError")
      }))

    it.effect("can pattern match with catchTag", () =>
      Effect.gen(function*() {
        const program = Effect.gen(function*() {
          return yield* new ConfigValidationError({
            message: "Missing value",
            field: "HULY_URL"
          })
        }).pipe(
          Effect.catchTag("ConfigValidationError", (e) => Effect.succeed(`Recovered: ${e.field}`))
        )

        const result = yield* program
        expect(result).toBe("Recovered: HULY_URL")
      }))
  })
})
