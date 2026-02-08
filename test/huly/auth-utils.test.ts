import { describe, it } from "@effect/vitest"
import { PlatformError, Severity, Status } from "@hcengineering/platform"
import { Effect, Fiber, Redacted, TestClock } from "effect"
import { expect } from "vitest"
import type { Auth } from "../../src/config/config.js"
import { authToOptions, connectWithRetry } from "../../src/huly/auth-utils.js"
import { HulyAuthError, HulyConnectionError } from "../../src/huly/errors.js"

const makePlatformError = (code: string): PlatformError<Record<string, never>> =>
  new PlatformError(new Status(Severity.ERROR, code as never, {}))

describe("auth-utils", () => {
  describe("authToOptions", () => {
    // test-revizorro: approved
    it.effect("returns token and workspace for token auth", () =>
      Effect.gen(function*() {
        const auth: Auth = { _tag: "token", token: Redacted.make("my-secret-token") }
        const result = authToOptions(auth, "test-workspace")
        expect(result).toStrictEqual({ token: "my-secret-token", workspace: "test-workspace" })
      }))

    // test-revizorro: approved
    it.effect("returns email, password, and workspace for password auth", () =>
      Effect.gen(function*() {
        const auth: Auth = {
          _tag: "password",
          email: "user@example.com",
          password: Redacted.make("hunter2")
        }
        const result = authToOptions(auth, "my-ws")
        expect(result).toStrictEqual({
          email: "user@example.com",
          password: "hunter2",
          workspace: "my-ws"
        })
      }))
  })

  describe("connectWithRetry", () => {
    // test-revizorro: approved
    it.effect("resolves on successful connection", () =>
      Effect.gen(function*() {
        const result = yield* connectWithRetry(() => Promise.resolve("connected"), "test")
        expect(result).toBe("connected")
      }))

    // test-revizorro: approved
    it.effect("retries on non-auth errors and eventually fails with HulyConnectionError", () =>
      Effect.gen(function*() {
        let callCount = 0
        const fiber = yield* Effect.fork(
          connectWithRetry(() => {
            callCount++
            return Promise.reject(new Error("network down"))
          }, "connect")
        )

        // Advance past exponential backoff: 100ms + 200ms
        yield* TestClock.adjust("500 millis")

        const error = yield* Effect.flip(Fiber.join(fiber))
        expect(error).toBeInstanceOf(HulyConnectionError)
        expect(error._tag).toBe("HulyConnectionError")
        expect(error.message).toContain("connect")
        expect(error.message).toContain("network down")
        // 1 initial + 2 retries = 3 total calls
        expect(callCount).toBe(3)
      }))

    // test-revizorro: approved
    it.effect("does not retry on auth errors, fails immediately with HulyAuthError", () =>
      Effect.gen(function*() {
        let callCount = 0
        const error = yield* Effect.flip(
          connectWithRetry(() => {
            callCount++
            return Promise.reject(makePlatformError("platform:status:Unauthorized"))
          }, "auth-test")
        )

        expect(error).toBeInstanceOf(HulyAuthError)
        expect(error._tag).toBe("HulyAuthError")
        expect(error.message).toContain("auth-test")
        expect(callCount).toBe(1)
      }))

    // test-revizorro: approved
    it.effect("succeeds after initial failures when retry works", () =>
      Effect.gen(function*() {
        let callCount = 0
        const fiber = yield* Effect.fork(
          connectWithRetry(() => {
            callCount++
            if (callCount < 3) {
              return Promise.reject(new Error("transient failure"))
            }
            return Promise.resolve("recovered")
          }, "retry-test")
        )

        yield* TestClock.adjust("500 millis")

        const result = yield* Fiber.join(fiber)
        expect(result).toBe("recovered")
        expect(callCount).toBe(3)
      }))

    // test-revizorro: approved
    it.effect("maps all auth status codes to HulyAuthError", () =>
      Effect.gen(function*() {
        const authCodes = [
          "platform:status:Unauthorized",
          "platform:status:TokenExpired",
          "platform:status:TokenNotActive",
          "platform:status:PasswordExpired",
          "platform:status:Forbidden",
          "platform:status:InvalidPassword",
          "platform:status:AccountNotFound",
          "platform:status:AccountNotConfirmed"
        ]

        for (const code of authCodes) {
          const error = yield* Effect.flip(
            connectWithRetry(() => Promise.reject(makePlatformError(code)), "auth")
          )
          expect(error).toBeInstanceOf(HulyAuthError)
        }
      }))

    // test-revizorro: approved
    it.effect("maps non-auth PlatformError to HulyConnectionError", () =>
      Effect.gen(function*() {
        const fiber = yield* Effect.fork(
          connectWithRetry(
            () => Promise.reject(makePlatformError("platform:status:InternalServerError")),
            "server"
          )
        )

        yield* TestClock.adjust("500 millis")

        const error = yield* Effect.flip(Fiber.join(fiber))
        expect(error).toBeInstanceOf(HulyConnectionError)
        expect(error._tag).toBe("HulyConnectionError")
      }))
  })
})
