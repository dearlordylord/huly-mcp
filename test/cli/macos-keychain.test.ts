import { Effect, Redacted, Result } from "effect"
import { expect, it } from "vitest"

import { makeMacosKeychain } from "../../src/profiles/macos-keychain.js"

it("wraps native values, replaces and deletes through the injected Keychain entry port", async () => {
  const entries = new Map<string, string>()
  const native = makeMacosKeychain(async (key) => ({
    getPassword: async () => entries.get(key) ?? null,
    setPassword: async (value) => {
      entries.set(key, value)
    },
    deleteCredential: async () => entries.delete(key)
  }))
  expect(await Effect.runPromise(native.read("account"))).toBeUndefined()
  await Effect.runPromise(native.save("account", Redacted.make("first-sentinel")))
  const value = await Effect.runPromise(native.read("account"))
  expect(value === undefined ? undefined : Redacted.value(value)).toBe("first-sentinel")
  expect(JSON.stringify(value)).not.toContain("first-sentinel")
  await Effect.runPromise(native.save("account", Redacted.make("second-sentinel")))
  expect(entries.get("account")).toBe("second-sentinel")
  await Effect.runPromise(native.remove("account"))
  await Effect.runPromise(native.remove("account"))
  expect(entries.size).toBe(0)
})

it("maps addon/session failures for every operation without disclosing native errors", async () => {
  const native = makeMacosKeychain(async () => {
    throw new Error("native-private-sentinel")
  })
  for (const operation of [native.read("key"), native.save("key", Redacted.make("secret")), native.remove("key")]) {
    const result = await Effect.runPromise(operation.pipe(Effect.result))
    expect(Result.isFailure(result)).toBe(true)
    expect(JSON.stringify(result)).toContain("macOS controls access prompts")
    expect(JSON.stringify(result)).not.toContain("native-private-sentinel")
  }
})
