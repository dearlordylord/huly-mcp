import { it as effectIt } from "@effect/vitest"
import { TestClock } from "effect/testing"
import { Deferred, Effect, Fiber, Redacted, Result, Schema } from "effect"
import { expect, it } from "vitest"

import { CliProfileStoreError } from "../../src/profiles/model.js"
import { importLocalToken, TokenImportSchema } from "../../src/profiles/token-management.js"

it("retains the saved credential when the live token check fails", async () => {
  let saved = Redacted.make("original-sentinel")
  const request = Schema.decodeUnknownSync(TokenImportSchema)({
    name: "work",
    destination: { url: "https://huly.example", workspace: "work" },
    token: "replacement-sentinel"
  })
  const result = await Effect.runPromise(
    importLocalToken(request, {
      save: (value) =>
        Effect.sync(() => {
          saved = value.token
        }),
      read: () => Effect.fail(new CliProfileStoreError({ kind: "integration", message: "Unreachable." }))
    }).pipe(Effect.result)
  )

  expect(Result.isFailure(result)).toBe(true)
  expect(Redacted.value(saved)).toBe("original-sentinel")
})

it("saves a replacement only after the live read succeeds", async () => {
  const events: Array<string> = []
  const request = Schema.decodeUnknownSync(TokenImportSchema)({
    name: "work",
    destination: { url: "https://huly.example", workspace: "work" },
    token: "replacement-sentinel"
  })
  await Effect.runPromise(
    importLocalToken(request, {
      save: ({ destination, token }) =>
        Effect.sync(() => {
          expect(destination).toEqual({ url: "https://huly.example", workspace: "work" })
          expect(Redacted.value(token)).toBe("replacement-sentinel")
          events.push("saved")
        }),
      read: () =>
        Effect.sync(() => {
          events.push("verified")
        })
    })
  )

  expect(events).toEqual(["verified", "saved"])
})

effectIt.effect("bounds an unresponsive token verification without saving", () =>
  Effect.gen(function* () {
    const entered = yield* Deferred.make<void>()
    let saved = false
    const request = Schema.decodeUnknownSync(TokenImportSchema)({
      name: "work",
      destination: { url: "https://huly.example", workspace: "work" },
      token: "timeout-sentinel"
    })
    const fiber = yield* importLocalToken(request, {
      read: () => Deferred.succeed(entered, undefined).pipe(Effect.andThen(Effect.never)),
      save: () =>
        Effect.sync(() => {
          saved = true
        })
    }).pipe(Effect.result, Effect.forkChild)
    yield* Deferred.await(entered)
    yield* TestClock.adjust("10 seconds")
    const result = yield* Fiber.join(fiber)
    expect(Result.isFailure(result)).toBe(true)
    expect(saved).toBe(false)
  })
)
