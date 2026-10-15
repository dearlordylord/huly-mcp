import { Effect, Redacted, Result, Schema } from "effect"
import { expect, it } from "vitest"

import { makeMacosKeychain } from "../../src/profiles/macos-keychain.js"
import {
  macosKeychainUnavailable,
  macosSecurityArguments,
  MacosSecurityReplySchema
} from "../../src/profiles/macos-keychain-protocol.js"
import { makeMacosPasswords } from "../../src/profiles/macos-passwords.js"

const reply = (status: number) =>
  Effect.succeed(Schema.decodeUnknownSync(MacosSecurityReplySchema)({ status, output: "" }))

it.each([0, 44])("refuses deletion status %s when the credential remains in the search list", async (status) => {
  const native = makeMacosKeychain(
    { read: () => Effect.succeed(Redacted.make("retained-private-sentinel")), save: () => Effect.void },
    (request) => reply(request._tag === "Locate" ? 0 : status)
  )
  const result = await Effect.runPromise(native.remove("key").pipe(Effect.result))
  expect(Result.isFailure(result)).toBe(true)
  expect(JSON.stringify(result)).not.toContain("retained-private-sentinel")
})

it("refuses locked or denied reads before attempting deletion", async () => {
  let removed = false
  const native = makeMacosKeychain(
    { read: () => Effect.fail(macosKeychainUnavailable()), save: () => Effect.void },
    (request) => {
      if (request._tag === "Remove") removed = true
      return reply(0)
    }
  )
  expect(Result.isFailure(await Effect.runPromise(native.remove("key").pipe(Effect.result)))).toBe(true)
  expect(removed).toBe(false)
})

it("supports write/read/replace/delete and missing deletion across the search list", async () => {
  const values = new Map<string, string>()
  const passwords = makeMacosPasswords(async () => ({
    list: async () => JSON.stringify([...values].map(([account, password]) => ({ account, password }))),
    save: async (key, value) => {
      values.set(key, value)
    }
  }))
  const native = makeMacosKeychain(passwords, (request) => {
    if (request._tag === "Remove") values.delete(request.key)
    return reply(request._tag === "Remove" || values.has(request.key) ? 0 : 44)
  })
  expect(await Effect.runPromise(native.read("account"))).toBeUndefined()
  await Effect.runPromise(native.save("account", Redacted.make("first-sentinel")))
  const value = await Effect.runPromise(native.read("account"))
  expect(value === undefined ? undefined : Redacted.value(value)).toBe("first-sentinel")
  expect(JSON.stringify(value)).not.toContain("first-sentinel")
  await Effect.runPromise(native.save("account", Redacted.make("second-sentinel")))
  expect(values.get("account")).toBe("second-sentinel")
  await Effect.runPromise(native.remove("account"))
  await Effect.runPromise(native.remove("account"))
  expect(values.size).toBe(0)
})

it("rejects metadata command errors, deletion errors and inaccessible confirmation", async () => {
  const passwords = { read: () => Effect.succeed(Redacted.make("secret")), save: () => Effect.void }
  const denied = makeMacosKeychain(passwords, () => reply(36))
  expect(Result.isFailure(await Effect.runPromise(denied.read("key").pipe(Effect.result)))).toBe(true)
  const deletionDenied = makeMacosKeychain(passwords, (request) => reply(request._tag === "Remove" ? 36 : 0))
  expect(Result.isFailure(await Effect.runPromise(deletionDenied.remove("key").pipe(Effect.result)))).toBe(true)
  let removed = false
  const confirmationDenied = makeMacosKeychain(passwords, (request) => {
    if (request._tag === "Remove") {
      removed = true
      return reply(0)
    }
    return reply(removed ? 36 : 0)
  })
  expect(Result.isFailure(await Effect.runPromise(confirmationDenied.remove("key").pipe(Effect.result)))).toBe(true)
})

it.each([
  "[]",
  "not-json",
  JSON.stringify([{ account: "key", password: 42 }]),
  JSON.stringify([
    { account: "key", password: "one" },
    { account: "key", password: "two" }
  ])
])("refuses inaccessible, malformed or ambiguous SDK records", async (payload) => {
  const passwords = makeMacosPasswords(async () => ({ list: async () => payload, save: async () => {} }))
  expect(Result.isFailure(await Effect.runPromise(passwords.read("key").pipe(Effect.result)))).toBe(true)
})

it("maps SDK load and save failures without exposing private native errors", async () => {
  const failed = makeMacosPasswords(async () => {
    throw new Error("native-private-sentinel")
  })
  for (const operation of [failed.read("key"), failed.save("key", Redacted.make("secret"))]) {
    const result = await Effect.runPromise(operation.pipe(Effect.result))
    expect(Result.isFailure(result)).toBe(true)
    expect(JSON.stringify(result)).toContain("macOS controls access prompts")
    expect(JSON.stringify(result)).not.toContain("native-private-sentinel")
  }
})

it("uses metadata-only search-list queries with no secret argument values", () => {
  expect(macosSecurityArguments({ _tag: "Locate", key: "key" })).toEqual([
    "find-generic-password",
    "-s",
    "io.github.dearlordylord.huly-mcp",
    "-a",
    "key"
  ])
  expect(macosSecurityArguments({ _tag: "Remove", key: "key" })[0]).toBe("delete-generic-password")
})
