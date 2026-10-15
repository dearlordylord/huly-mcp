import { it as effectIt } from "@effect/vitest"
import { Deferred, Effect, Fiber, Redacted, Result } from "effect"
import { TestClock } from "effect/testing"
import { expect, it } from "vitest"

import { makeLinuxSecretService, type SecretServiceConnect } from "../../src/profiles/linux-secret-service.js"
import type { SecretServiceRequest } from "../../src/profiles/secret-service-protocol.js"

const connection =
  (reply: (request: SecretServiceRequest) => unknown, events: Array<string>): SecretServiceConnect =>
  () =>
    Effect.succeed({
      call: (request) =>
        Effect.sync(() => {
          events.push(request._tag)
          return reply(request)
        }),
      close: Effect.sync(() => {
        events.push("closed")
      })
    })

it("reads a parsed secret and supports missing items, creation and idempotent deletion", async () => {
  const events: Array<string> = []
  let present = false
  const native = makeLinuxSecretService(
    "unix:path=/fixture",
    connection((request) => {
      switch (request._tag) {
        case "SearchItems":
          return [present ? ["/item"] : [], []]
        case "OpenSession":
          return [{}, "/session"]
        case "GetSecret":
          return [["/session", [], Buffer.from("stored-sentinel"), "text/plain"]]
        case "ReadDefaultCollection":
          return ["/collection"]
        case "CollectionLocked":
          return [{ value: false }]
        case "CreateItem":
          present = true
          return ["/item", "/"]
        case "DeleteItem":
          present = false
          return ["/"]
      }
    }, events)
  )
  expect(await Effect.runPromise(native.read("key"))).toBeUndefined()
  await Effect.runPromise(native.remove("key"))
  await Effect.runPromise(native.save("key", Redacted.make("stored-sentinel")))
  const read = await Effect.runPromise(native.read("key"))
  expect(read === undefined ? undefined : Redacted.value(read)).toBe("stored-sentinel")
  await Effect.runPromise(native.remove("key"))
  expect(present).toBe(false)
  expect(events.filter((event) => event === "closed")).toHaveLength(5)
})

it("refuses missing sessions, ambiguous items and unusable default collections", async () => {
  expect(
    Result.isFailure(await Effect.runPromise(makeLinuxSecretService(undefined).read("key").pipe(Effect.result)))
  ).toBe(true)
  for (const response of [
    [["/one", "/two"], []],
    [[], ["/locked"]]
  ]) {
    const native = makeLinuxSecretService(
      "unix:path=/fixture",
      connection(() => response, [])
    )
    expect(Result.isFailure(await Effect.runPromise(native.read("key").pipe(Effect.result)))).toBe(true)
    expect(Result.isFailure(await Effect.runPromise(native.remove("key").pipe(Effect.result)))).toBe(true)
  }
  for (const collection of ["/", "/collection"]) {
    const events: Array<string> = []
    const native = makeLinuxSecretService(
      "unix:path=/fixture",
      connection((request) => (request._tag === "ReadDefaultCollection" ? [collection] : [{ value: true }]), events)
    )
    expect(
      Result.isFailure(await Effect.runPromise(native.save("key", Redacted.make("secret")).pipe(Effect.result)))
    ).toBe(true)
    expect(events).not.toContain("OpenSession")
    expect(events.at(-1)).toBe("closed")
  }
})

it("refuses a returned prompt without attempting interactive behavior and releases the connection", async () => {
  const events: Array<string> = []
  const native = makeLinuxSecretService(
    "unix:path=/fixture",
    connection((request) => {
      switch (request._tag) {
        case "ReadDefaultCollection":
          return ["/collection"]
        case "CollectionLocked":
          return [{ value: false }]
        case "OpenSession":
          return [{}, "/session"]
        case "CreateItem":
          return ["/item", "/prompt"]
        default:
          throw new Error("Unexpected protocol operation")
      }
    }, events)
  )
  const result = await Effect.runPromise(native.save("key", Redacted.make("prompt-sentinel")).pipe(Effect.result))
  expect(Result.isFailure(result)).toBe(true)
  expect(events).toEqual(["ReadDefaultCollection", "CollectionLocked", "OpenSession", "CreateItem", "closed"])
  expect(JSON.stringify(result)).not.toContain("prompt-sentinel")
})

it("refuses locked items and malformed responses without obtaining or deleting secrets", async () => {
  const events: Array<string> = []
  const locked = makeLinuxSecretService(
    "unix:path=/fixture",
    connection(() => [[], ["/locked"]], events)
  )
  expect(Result.isFailure(await Effect.runPromise(locked.read("key").pipe(Effect.result)))).toBe(true)
  expect(Result.isFailure(await Effect.runPromise(locked.remove("key").pipe(Effect.result)))).toBe(true)
  expect(events).toEqual(["SearchItems", "closed", "SearchItems", "closed"])
  const malformed = makeLinuxSecretService(
    "unix:path=/fixture",
    connection(() => "not a search result", [])
  )
  expect(Result.isFailure(await Effect.runPromise(malformed.read("key").pipe(Effect.result)))).toBe(true)
})

effectIt.effect("bounds a stalled service request and closes its connection", () =>
  Effect.gen(function* () {
    const entered = yield* Deferred.make<void>()
    let closed = false
    const native = makeLinuxSecretService("unix:path=/fixture", () =>
      Effect.succeed({
        call: () => Deferred.succeed(entered, undefined).pipe(Effect.andThen(Effect.never)),
        close: Effect.sync(() => {
          closed = true
        })
      })
    )
    const fiber = yield* native.read("key").pipe(Effect.result, Effect.forkChild)
    yield* Deferred.await(entered)
    yield* TestClock.adjust("5 seconds")
    expect(Result.isFailure(yield* Fiber.join(fiber))).toBe(true)
    expect(closed).toBe(true)
  })
)
