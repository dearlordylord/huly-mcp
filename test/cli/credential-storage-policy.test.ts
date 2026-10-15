import { Effect, Redacted, Result, Schema } from "effect"
import { expect, it } from "vitest"

import { nativeBackendForPlatform, selectProfileStorage } from "../../src/profiles/credential-storage-policy.js"
import type { CliProfileStore } from "../../src/profiles/file-store.js"
import { type CliCredentialsFile, CliCredentialsFileSchema, parseProfileName } from "../../src/profiles/model.js"

const storeFor = (credentials: CliCredentialsFile): CliProfileStore => ({
  paths: { directory: "/policy", profiles: "/policy/profiles", credentials: "/policy/credentials" },
  readProfiles: () => Effect.succeed({ version: 1, profiles: {} }),
  readCredentials: () => Effect.succeed(credentials),
  writeProfiles: () => Effect.die("selection must not write"),
  writeCredentials: () => Effect.die("selection must not write")
})

it("selects native storage explicitly and preserves the backend when replacement omits selection", async () => {
  const name = await Effect.runPromise(parseProfileName("work"))
  const profile = { url: "https://huly.example", workspace: "work" }
  const store = storeFor({ version: 1, tokens: {} })
  const selected = await Effect.runPromise(
    selectProfileStorage(store, name, profile, "os", nativeBackendForPlatform("linux"))
  )
  expect(selected.credentialStorage).toBe("linux-secret-service")
  expect(await Effect.runPromise(selectProfileStorage(store, name, selected, undefined, undefined))).toEqual(selected)
  expect(await Effect.runPromise(selectProfileStorage(store, name, profile, "file", undefined))).toMatchObject({
    credentialStorage: "file"
  })
  expect(nativeBackendForPlatform("darwin")).toBe("macos-keychain")
})

it("refuses a backend switch for an existing credential and refuses unavailable native storage", async () => {
  const name = await Effect.runPromise(parseProfileName("work"))
  const profile = { url: "https://huly.example", workspace: "work" }
  const store = storeFor({ version: 1, tokens: { [name]: Redacted.make("existing-sentinel") } })
  await expect(
    Effect.runPromise(selectProfileStorage(store, name, profile, "os", nativeBackendForPlatform("linux")))
  ).rejects.toThrow("retains the selected credential backend")
  await expect(
    Effect.runPromise(selectProfileStorage(store, name, profile, "os", nativeBackendForPlatform("win32")))
  ).rejects.toThrow("supported on macOS and Linux")
})

it("rejects file storage in a native credential reference", () => {
  const result = Schema.decodeUnknownResult(CliCredentialsFileSchema)({
    version: 1,
    tokens: {},
    native: {
      work: { backend: "file", key: "native-entry", destination: { url: "https://huly.example", workspace: "work" } }
    }
  })
  expect(Result.isFailure(result)).toBe(true)
})
