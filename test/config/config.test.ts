import { describe, it, beforeEach, afterEach } from "@effect/vitest"
import { expect } from "vitest"
import { Effect, Redacted, Schema, Cause } from "effect"
import {
  HulyConfigService,
  HulyConfigSchema,
  FileConfigSchema,
  ConfigValidationError,
  ConfigFileError,
} from "../../src/config/config.js"
import * as fs from "node:fs"
import * as path from "node:path"

describe("Config Module", () => {
  // Store original env vars
  const originalEnv: Record<string, string | undefined> = {}
  const envVars = [
    "HULY_URL",
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

    // Clean up config file if created
    const configPath = path.resolve(process.cwd(), ".hulyrc.json")
    if (fs.existsSync(configPath)) {
      fs.unlinkSync(configPath)
    }
  })

  describe("HulyConfigSchema", () => {
    // test-revizorro: approved
    it.effect("validates valid config (with string password input)", () =>
      Effect.gen(function* () {
        // Schema.Redacted expects string input that it transforms to Redacted
        const config = {
          url: "https://huly.app",
          email: "user@example.com",
          password: "secret", // String input, transformed to Redacted
          workspace: "default",
          connectionTimeout: 30000,
        }

        const result = Schema.decodeUnknownSync(HulyConfigSchema)(config)
        expect(result.url).toBe("https://huly.app")
        expect(result.email).toBe("user@example.com")
        expect(Redacted.value(result.password)).toBe("secret")
        expect(result.workspace).toBe("default")
        expect(result.connectionTimeout).toBe(30000)
      })
    )

    // test-revizorro: approved
    it.effect("rejects invalid URL", () =>
      Effect.gen(function* () {
        const config = {
          url: "not-a-url",
          email: "user@example.com",
          password: "secret",
          workspace: "default",
          connectionTimeout: 30000,
        }

        expect(() => Schema.decodeUnknownSync(HulyConfigSchema)(config)).toThrow()
      })
    )

    // test-revizorro: approved
    it.effect("rejects ftp URL", () =>
      Effect.gen(function* () {
        const config = {
          url: "ftp://example.com",
          email: "user@example.com",
          password: "secret",
          workspace: "default",
          connectionTimeout: 30000,
        }

        expect(() => Schema.decodeUnknownSync(HulyConfigSchema)(config)).toThrow()
      })
    )

    // test-revizorro: approved
    it.effect("rejects empty email", () =>
      Effect.gen(function* () {
        const config = {
          url: "https://huly.app",
          email: "   ",
          password: "secret",
          workspace: "default",
          connectionTimeout: 30000,
        }

        expect(() => Schema.decodeUnknownSync(HulyConfigSchema)(config)).toThrow()
      })
    )

    // test-revizorro: approved
    it.effect("rejects negative timeout", () =>
      Effect.gen(function* () {
        const config = {
          url: "https://huly.app",
          email: "user@example.com",
          password: "secret",
          workspace: "default",
          connectionTimeout: -1,
        }

        expect(() => Schema.decodeUnknownSync(HulyConfigSchema)(config)).toThrow()
      })
    )

    // test-revizorro: approved
    it.effect("rejects zero timeout", () =>
      Effect.gen(function* () {
        const config = {
          url: "https://huly.app",
          email: "user@example.com",
          password: "secret",
          workspace: "default",
          connectionTimeout: 0,
        }

        expect(() => Schema.decodeUnknownSync(HulyConfigSchema)(config)).toThrow()
      })
    )

    // test-revizorro: approved
    it.effect("rejects non-integer timeout", () =>
      Effect.gen(function* () {
        const config = {
          url: "https://huly.app",
          email: "user@example.com",
          password: "secret",
          workspace: "default",
          connectionTimeout: 30.5,
        }

        expect(() => Schema.decodeUnknownSync(HulyConfigSchema)(config)).toThrow()
      })
    )
  })

  describe("FileConfigSchema", () => {
    // test-revizorro: approved
    it.effect("validates valid file config", () =>
      Effect.gen(function* () {
        const config = {
          url: "https://huly.app",
          workspace: "default",
          connectionTimeout: 30000,
        }

        const result = Schema.decodeUnknownSync(FileConfigSchema)(config)
        expect(result.url).toBe("https://huly.app")
        expect(result.workspace).toBe("default")
        expect(result.connectionTimeout).toBe(30000)
      })
    )

    // test-revizorro: approved
    it.effect("allows partial config", () =>
      Effect.gen(function* () {
        const config = { url: "https://huly.app" }
        const result = Schema.decodeUnknownSync(FileConfigSchema)(config)
        expect(result.url).toBe("https://huly.app")
        expect(result.workspace).toBeUndefined()
        expect(result.connectionTimeout).toBeUndefined()
      })
    )

    // test-revizorro: approved
    it.effect("allows empty config", () =>
      Effect.gen(function* () {
        const config = {}
        const result = Schema.decodeUnknownSync(FileConfigSchema)(config)
        expect(result.url).toBeUndefined()
        expect(result.workspace).toBeUndefined()
        expect(result.connectionTimeout).toBeUndefined()
      })
    )

    // test-revizorro: approved
    it.effect("ignores credentials in file config (extra fields stripped)", () =>
      Effect.gen(function* () {
        const config = {
          url: "https://huly.app",
          email: "user@example.com",
          password: "secret",
        }

        // Extra fields are stripped - FileConfigSchema only has url, workspace, connectionTimeout
        const result = Schema.decodeUnknownSync(FileConfigSchema)(config)
        expect((result as Record<string, unknown>)["email"]).toBeUndefined()
        expect((result as Record<string, unknown>)["password"]).toBeUndefined()
      })
    )
  })

  describe("ConfigValidationError", () => {
    // test-revizorro: approved
    it.effect("creates with message", () =>
      Effect.gen(function* () {
        const error = new ConfigValidationError({ message: "Invalid config" })
        expect(error._tag).toBe("ConfigValidationError")
        expect(error.message).toBe("Invalid config")
      })
    )

    // test-revizorro: approved
    it.effect("creates with field", () =>
      Effect.gen(function* () {
        const error = new ConfigValidationError({
          message: "Missing required config",
          field: "HULY_URL",
        })
        expect(error.field).toBe("HULY_URL")
      })
    )

    // test-revizorro: approved
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

  describe("ConfigFileError", () => {
    // test-revizorro: approved
    it.effect("creates with message and path", () =>
      Effect.gen(function* () {
        const error = new ConfigFileError({
          message: "Failed to read",
          path: "/path/to/config",
        })
        expect(error._tag).toBe("ConfigFileError")
        expect(error.message).toBe("Failed to read")
        expect(error.path).toBe("/path/to/config")
      })
    )
  })

  describe("HulyConfigService.testLayer", () => {
    // test-revizorro: approved
    it.effect("creates layer with explicit values", () =>
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
        expect(config.email).toBe("test@example.com")
        expect(Redacted.value(config.password)).toBe("test-secret")
        expect(config.workspace).toBe("test-workspace")
        expect(config.connectionTimeout).toBe(5000)
      })
    )

    // test-revizorro: approved
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
    // test-revizorro: approved
    it.effect("loads config from env vars", () =>
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
        expect(config.email).toBe("user@example.com")
        expect(Redacted.value(config.password)).toBe("secret123")
        expect(config.workspace).toBe("my-workspace")
        expect(config.connectionTimeout).toBe(60000)
      })
    )

    // test-revizorro: approved
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

    // test-revizorro: approved
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

    // test-revizorro: approved
    it.effect("fails on missing required HULY_EMAIL", () =>
      Effect.gen(function* () {
        process.env["HULY_URL"] = "https://huly.app"
        process.env["HULY_PASSWORD"] = "secret123"
        process.env["HULY_WORKSPACE"] = "my-workspace"

        const error = yield* Effect.flip(
          HulyConfigService.pipe(Effect.provide(HulyConfigService.layer))
        )

        expect(error._tag).toBe("ConfigValidationError")
      })
    )

    // test-revizorro: approved
    it.effect("fails on missing required HULY_PASSWORD", () =>
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

    // test-revizorro: approved
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

    // test-revizorro: approved
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

    // test-revizorro: approved
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

    // test-revizorro: approved
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
  })

  describe("HulyConfigService.layer (file config)", () => {
    // test-revizorro: approved
    it.effect("loads non-sensitive config from file", () =>
      Effect.gen(function* () {
        // Write config file
        const configPath = path.resolve(process.cwd(), ".hulyrc.json")
        fs.writeFileSync(
          configPath,
          JSON.stringify({
            url: "https://file.huly.app",
            workspace: "file-workspace",
            connectionTimeout: 45000,
          })
        )

        // Provide only credentials via env vars
        process.env["HULY_EMAIL"] = "user@example.com"
        process.env["HULY_PASSWORD"] = "secret123"

        const config = yield* HulyConfigService.pipe(
          Effect.provide(HulyConfigService.layer)
        )

        expect(config.url).toBe("https://file.huly.app")
        expect(config.workspace).toBe("file-workspace")
        expect(config.connectionTimeout).toBe(45000)
        // Verify credentials came from env vars
        expect(config.email).toBe("user@example.com")
        expect(Redacted.value(config.password)).toBe("secret123")
      })
    )

    // test-revizorro: approved
    it.effect("env vars override file config", () =>
      Effect.gen(function* () {
        // Write config file
        const configPath = path.resolve(process.cwd(), ".hulyrc.json")
        fs.writeFileSync(
          configPath,
          JSON.stringify({
            url: "https://file.huly.app",
            workspace: "file-workspace",
            connectionTimeout: 45000,
          })
        )

        // Provide all via env vars (should override file)
        process.env["HULY_URL"] = "https://env.huly.app"
        process.env["HULY_EMAIL"] = "user@example.com"
        process.env["HULY_PASSWORD"] = "secret123"
        process.env["HULY_WORKSPACE"] = "env-workspace"
        process.env["HULY_CONNECTION_TIMEOUT"] = "15000"

        const config = yield* HulyConfigService.pipe(
          Effect.provide(HulyConfigService.layer)
        )

        expect(config.url).toBe("https://env.huly.app")
        expect(config.workspace).toBe("env-workspace")
        expect(config.connectionTimeout).toBe(15000)
      })
    )

    // test-revizorro: approved
    it.effect("handles missing config file gracefully", () =>
      Effect.gen(function* () {
        // Ensure no config file exists
        const configPath = path.resolve(process.cwd(), ".hulyrc.json")
        if (fs.existsSync(configPath)) {
          fs.unlinkSync(configPath)
        }

        // Provide all config via env vars
        process.env["HULY_URL"] = "https://huly.app"
        process.env["HULY_EMAIL"] = "user@example.com"
        process.env["HULY_PASSWORD"] = "secret123"
        process.env["HULY_WORKSPACE"] = "my-workspace"

        const config = yield* HulyConfigService.pipe(
          Effect.provide(HulyConfigService.layer)
        )

        expect(config.url).toBe("https://huly.app")
        expect(config.email).toBe("user@example.com")
        expect(Redacted.value(config.password)).toBe("secret123")
        expect(config.workspace).toBe("my-workspace")
        expect(config.connectionTimeout).toBe(HulyConfigService.DEFAULT_TIMEOUT)
      })
    )

    // test-revizorro: approved
    it.effect("fails on invalid JSON in config file", () =>
      Effect.gen(function* () {
        // Write invalid config file
        const configPath = path.resolve(process.cwd(), ".hulyrc.json")
        fs.writeFileSync(configPath, "{ invalid json }")

        process.env["HULY_EMAIL"] = "user@example.com"
        process.env["HULY_PASSWORD"] = "secret123"

        const error = yield* Effect.flip(
          HulyConfigService.pipe(Effect.provide(HulyConfigService.layer))
        )

        expect(error._tag).toBe("ConfigFileError")
      })
    )

    // test-revizorro: approved
    it.effect("fails on invalid values in config file", () =>
      Effect.gen(function* () {
        // Write config file with invalid URL
        const configPath = path.resolve(process.cwd(), ".hulyrc.json")
        fs.writeFileSync(
          configPath,
          JSON.stringify({
            url: "not-a-valid-url",
            workspace: "test",
          })
        )

        process.env["HULY_EMAIL"] = "user@example.com"
        process.env["HULY_PASSWORD"] = "secret123"

        const error = yield* Effect.flip(
          HulyConfigService.pipe(Effect.provide(HulyConfigService.layer))
        )

        expect(error).toBeDefined()
      })
    )
  })

  describe("Constants", () => {
    // test-revizorro: approved
    it.effect("has correct default timeout", () =>
      Effect.gen(function* () {
        expect(HulyConfigService.DEFAULT_TIMEOUT).toBe(30000)
      })
    )

    // test-revizorro: approved
    it.effect("has correct config file name", () =>
      Effect.gen(function* () {
        expect(HulyConfigService.CONFIG_FILE_NAME).toBe(".hulyrc.json")
      })
    )
  })

  describe("Effect integration", () => {
    // test-revizorro: approved
    it.effect("errors are yieldable", () =>
      Effect.gen(function* () {
        const program = Effect.gen(function* () {
          return yield* new ConfigValidationError({ message: "Test error" })
        })

        const error = yield* Effect.flip(program)
        expect(error._tag).toBe("ConfigValidationError")
      })
    )

    // test-revizorro: approved
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
