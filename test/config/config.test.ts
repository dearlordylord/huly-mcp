import { describe, it, beforeEach, afterEach } from "@effect/vitest"
import { expect } from "vitest"
import { Effect, Redacted, Schema } from "effect"
import {
  HulyConfigService,
  HulyConfigSchema,
  ConfigValidationError,
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
      Effect.gen(function* () {
        const config = {
          url: "https://huly.app",
          auth: {
            _tag: "password",
            email: "user@example.com",
            password: "secret",
          },
          workspace: "default",
          connectionTimeout: 30000,
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
      })
    )

    it.effect("validates valid config with token auth", () =>
      Effect.gen(function* () {
        const config = {
          url: "https://huly.app",
          auth: {
            _tag: "token",
            token: "my-api-token",
          },
          workspace: "default",
          connectionTimeout: 30000,
        }

        const result = Schema.decodeUnknownSync(HulyConfigSchema)(config)
        expect(result.url).toBe("https://huly.app")
        expect(result.auth._tag).toBe("token")
        if (result.auth._tag === "token") {
          expect(Redacted.value(result.auth.token)).toBe("my-api-token")
        }
        expect(result.workspace).toBe("default")
        expect(result.connectionTimeout).toBe(30000)
      })
    )

    it.effect("rejects invalid URL", () =>
      Effect.gen(function* () {
        const config = {
          url: "not-a-url",
          auth: { _tag: "password", email: "user@example.com", password: "secret" },
          workspace: "default",
          connectionTimeout: 30000,
        }

        expect(() => Schema.decodeUnknownSync(HulyConfigSchema)(config)).toThrow()
      })
    )

    it.effect("rejects ftp URL", () =>
      Effect.gen(function* () {
        const config = {
          url: "ftp://example.com",
          auth: { _tag: "password", email: "user@example.com", password: "secret" },
          workspace: "default",
          connectionTimeout: 30000,
        }

        expect(() => Schema.decodeUnknownSync(HulyConfigSchema)(config)).toThrow()
      })
    )

    it.effect("rejects empty email in password auth", () =>
      Effect.gen(function* () {
        const config = {
          url: "https://huly.app",
          auth: { _tag: "password", email: "   ", password: "secret" },
          workspace: "default",
          connectionTimeout: 30000,
        }

        expect(() => Schema.decodeUnknownSync(HulyConfigSchema)(config)).toThrow()
      })
    )

    it.effect("rejects negative timeout", () =>
      Effect.gen(function* () {
        const config = {
          url: "https://huly.app",
          auth: { _tag: "password", email: "user@example.com", password: "secret" },
          workspace: "default",
          connectionTimeout: -1,
        }

        expect(() => Schema.decodeUnknownSync(HulyConfigSchema)(config)).toThrow()
      })
    )

    it.effect("rejects zero timeout", () =>
      Effect.gen(function* () {
        const config = {
          url: "https://huly.app",
          auth: { _tag: "password", email: "user@example.com", password: "secret" },
          workspace: "default",
          connectionTimeout: 0,
        }

        expect(() => Schema.decodeUnknownSync(HulyConfigSchema)(config)).toThrow()
      })
    )

    it.effect("rejects non-integer timeout", () =>
      Effect.gen(function* () {
        const config = {
          url: "https://huly.app",
          auth: { _tag: "password", email: "user@example.com", password: "secret" },
          workspace: "default",
          connectionTimeout: 30.5,
        }

        expect(() => Schema.decodeUnknownSync(HulyConfigSchema)(config)).toThrow()
      })
    )
  })

  describe("ConfigValidationError", () => {
        it.effect("creates with message", () =>
      Effect.gen(function* () {
        const error = new ConfigValidationError({ message: "Invalid config" })
        expect(error._tag).toBe("ConfigValidationError")
        expect(error.message).toBe("Invalid config")
      })
    )

        it.effect("creates with field", () =>
      Effect.gen(function* () {
        const error = new ConfigValidationError({
          message: "Missing required config",
          field: "HULY_URL",
        })
        expect(error.field).toBe("HULY_URL")
      })
    )

        it.effect("creates with cause", () =>
      Effect.gen(function* () {
        const cause = new Error("underlying error")
        const error = new ConfigValidationError({
          message: "Validation failed",
          cause,
        })
        expect(error.cause).toBe(cause)
      })
    )
  })

  describe("HulyConfigService.testLayer", () => {
    it.effect("creates layer with password auth", () =>
      Effect.gen(function* () {
        const layer = HulyConfigService.testLayer({
          url: "https://test.huly.app",
          email: "test@example.com",
          password: "test-secret",
          workspace: "test-workspace",
          connectionTimeout: 5000,
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
      })
    )

    it.effect("creates layer with token auth", () =>
      Effect.gen(function* () {
        const layer = HulyConfigService.testLayerToken({
          url: "https://test.huly.app",
          token: "test-token",
          workspace: "test-workspace",
          connectionTimeout: 5000,
        })

        const config = yield* HulyConfigService.pipe(Effect.provide(layer))

        expect(config.url).toBe("https://test.huly.app")
        expect(config.auth._tag).toBe("token")
        if (config.auth._tag === "token") {
          expect(Redacted.value(config.auth.token)).toBe("test-token")
        }
        expect(config.workspace).toBe("test-workspace")
        expect(config.connectionTimeout).toBe(5000)
      })
    )

    it.effect("uses default timeout when not provided", () =>
      Effect.gen(function* () {
        const layer = HulyConfigService.testLayer({
          url: "https://test.huly.app",
          email: "test@example.com",
          password: "test-secret",
          workspace: "test-workspace",
        })

        const config = yield* HulyConfigService.pipe(Effect.provide(layer))

        expect(config.connectionTimeout).toBe(HulyConfigService.DEFAULT_TIMEOUT)
      })
    )
  })

  describe("HulyConfigService.layer (env vars)", () => {
    it.effect("loads config with password auth from env vars", () =>
      Effect.gen(function* () {
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
      })
    )

    it.effect("loads config with token auth from env vars", () =>
      Effect.gen(function* () {
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
      })
    )

    it.effect("token takes priority over password", () =>
      Effect.gen(function* () {
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
      })
    )

    it.effect("uses default timeout when not provided", () =>
      Effect.gen(function* () {
        process.env["HULY_URL"] = "https://huly.app"
        process.env["HULY_EMAIL"] = "user@example.com"
        process.env["HULY_PASSWORD"] = "secret123"
        process.env["HULY_WORKSPACE"] = "my-workspace"

        const config = yield* HulyConfigService.pipe(
          Effect.provide(HulyConfigService.layer)
        )

        expect(config.connectionTimeout).toBe(HulyConfigService.DEFAULT_TIMEOUT)
      })
    )

    it.effect("fails on missing required HULY_URL", () =>
      Effect.gen(function* () {
        process.env["HULY_EMAIL"] = "user@example.com"
        process.env["HULY_PASSWORD"] = "secret123"
        process.env["HULY_WORKSPACE"] = "my-workspace"

        const error = yield* Effect.flip(
          HulyConfigService.pipe(Effect.provide(HulyConfigService.layer))
        )

        expect(error._tag).toBe("ConfigValidationError")
      })
    )

    it.effect("fails on missing auth (no token or email/password)", () =>
      Effect.gen(function* () {
        process.env["HULY_URL"] = "https://huly.app"
        process.env["HULY_WORKSPACE"] = "my-workspace"

        const error = yield* Effect.flip(
          HulyConfigService.pipe(Effect.provide(HulyConfigService.layer))
        )

        expect(error._tag).toBe("ConfigValidationError")
      })
    )

    it.effect("fails on missing HULY_PASSWORD when using password auth", () =>
      Effect.gen(function* () {
        process.env["HULY_URL"] = "https://huly.app"
        process.env["HULY_EMAIL"] = "user@example.com"
        process.env["HULY_WORKSPACE"] = "my-workspace"

        const error = yield* Effect.flip(
          HulyConfigService.pipe(Effect.provide(HulyConfigService.layer))
        )

        expect(error._tag).toBe("ConfigValidationError")
      })
    )

    it.effect("fails on missing required HULY_WORKSPACE", () =>
      Effect.gen(function* () {
        process.env["HULY_URL"] = "https://huly.app"
        process.env["HULY_EMAIL"] = "user@example.com"
        process.env["HULY_PASSWORD"] = "secret123"

        const error = yield* Effect.flip(
          HulyConfigService.pipe(Effect.provide(HulyConfigService.layer))
        )

        expect(error._tag).toBe("ConfigValidationError")
      })
    )

    it.effect("fails on invalid URL", () =>
      Effect.gen(function* () {
        process.env["HULY_URL"] = "not-a-url"
        process.env["HULY_EMAIL"] = "user@example.com"
        process.env["HULY_PASSWORD"] = "secret123"
        process.env["HULY_WORKSPACE"] = "my-workspace"

        const error = yield* Effect.flip(
          HulyConfigService.pipe(Effect.provide(HulyConfigService.layer))
        )

        expect(error._tag).toBe("ConfigValidationError")
      })
    )

    it.effect("fails on invalid timeout", () =>
      Effect.gen(function* () {
        process.env["HULY_URL"] = "https://huly.app"
        process.env["HULY_EMAIL"] = "user@example.com"
        process.env["HULY_PASSWORD"] = "secret123"
        process.env["HULY_WORKSPACE"] = "my-workspace"
        process.env["HULY_CONNECTION_TIMEOUT"] = "not-a-number"

        const error = yield* Effect.flip(
          HulyConfigService.pipe(Effect.provide(HulyConfigService.layer))
        )

        expect(error._tag).toBe("ConfigValidationError")
      })
    )

    it.effect("fails on negative timeout", () =>
      Effect.gen(function* () {
        process.env["HULY_URL"] = "https://huly.app"
        process.env["HULY_EMAIL"] = "user@example.com"
        process.env["HULY_PASSWORD"] = "secret123"
        process.env["HULY_WORKSPACE"] = "my-workspace"
        process.env["HULY_CONNECTION_TIMEOUT"] = "-100"

        const error = yield* Effect.flip(
          HulyConfigService.pipe(Effect.provide(HulyConfigService.layer))
        )

        expect(error._tag).toBe("ConfigValidationError")
      })
    )

    it.effect("fails on empty password", () =>
      Effect.gen(function* () {
        process.env["HULY_URL"] = "https://huly.app"
        process.env["HULY_EMAIL"] = "user@example.com"
        process.env["HULY_PASSWORD"] = ""
        process.env["HULY_WORKSPACE"] = "my-workspace"

        const error = yield* Effect.flip(
          HulyConfigService.pipe(Effect.provide(HulyConfigService.layer))
        )

        expect(error._tag).toBe("ConfigValidationError")
      })
    )

    it.effect("fails on whitespace-only password", () =>
      Effect.gen(function* () {
        process.env["HULY_URL"] = "https://huly.app"
        process.env["HULY_EMAIL"] = "user@example.com"
        process.env["HULY_PASSWORD"] = "   "
        process.env["HULY_WORKSPACE"] = "my-workspace"

        const error = yield* Effect.flip(
          HulyConfigService.pipe(Effect.provide(HulyConfigService.layer))
        )

        expect(error._tag).toBe("ConfigValidationError")
      })
    )

    it.effect("fails on whitespace-only email", () =>
      Effect.gen(function* () {
        process.env["HULY_URL"] = "https://huly.app"
        process.env["HULY_EMAIL"] = "   "
        process.env["HULY_PASSWORD"] = "secret123"
        process.env["HULY_WORKSPACE"] = "my-workspace"

        const error = yield* Effect.flip(
          HulyConfigService.pipe(Effect.provide(HulyConfigService.layer))
        )

        expect(error._tag).toBe("ConfigValidationError")
      })
    )

    it.effect("fails on whitespace-only token", () =>
      Effect.gen(function* () {
        process.env["HULY_URL"] = "https://huly.app"
        process.env["HULY_TOKEN"] = "   "
        process.env["HULY_WORKSPACE"] = "my-workspace"

        const error = yield* Effect.flip(
          HulyConfigService.pipe(Effect.provide(HulyConfigService.layer))
        )

        expect(error._tag).toBe("ConfigValidationError")
      })
    )
  })

  describe("Constants", () => {
        it.effect("has correct default timeout", () =>
      Effect.gen(function* () {
        expect(HulyConfigService.DEFAULT_TIMEOUT).toBe(30000)
      })
    )
  })

  describe("Effect integration", () => {
        it.effect("errors are yieldable", () =>
      Effect.gen(function* () {
        const program = Effect.gen(function* () {
          return yield* new ConfigValidationError({ message: "Test error" })
        })

        const error = yield* Effect.flip(program)
        expect(error._tag).toBe("ConfigValidationError")
      })
    )

        it.effect("can pattern match with catchTag", () =>
      Effect.gen(function* () {
        const program = Effect.gen(function* () {
          return yield* new ConfigValidationError({
            message: "Missing value",
            field: "HULY_URL",
          })
        }).pipe(
          Effect.catchTag("ConfigValidationError", (e) =>
            Effect.succeed(`Recovered: ${e.field}`)
          )
        )

        const result = yield* program
        expect(result).toBe("Recovered: HULY_URL")
      })
    )
  })
})
