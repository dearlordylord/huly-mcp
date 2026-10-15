import { Effect, Redacted, Result } from "effect"
import { expect, it } from "vitest"

import { selectCredentialStore } from "../../src/profiles/credential-store.js"
import type { CliProfileStore } from "../../src/profiles/file-store.js"
import {
  CliProfileStoreError,
  parseProfileName,
  type CliCredentialsFile,
  type CliProfilesFile,
  type NativeCredentialReference
} from "../../src/profiles/model.js"
import type { NativeCredentialPort } from "../../src/profiles/native-credential-port.js"
import { makeNativeCredentials } from "../../src/profiles/native-credentials.js"
import { getAuthStatus, getProfileSummaries, updateProfile } from "../../packages/huly-cli/src/profile-operations.js"

const destination = { url: "https://huly.example", workspace: "work" }

it("selects native facilities by platform without opening them", () => {
  expect(makeNativeCredentials("darwin", {})?.backend).toBe("macos-keychain")
  expect(makeNativeCredentials("linux", {})?.backend).toBe("linux-secret-service")
  expect(makeNativeCredentials("win32", {})).toBeUndefined()
})

it("reports an unconfigured offline status when no profile is selected", async () => {
  const f = await fixture()
  await Effect.runPromise(f.store.writeProfiles({ version: 1, profiles: {} }))
  expect(await Effect.runPromise(getAuthStatus(f.store, {}))).toMatchObject({ configured: false, verified: false })
})
const fixture = async () => {
  const name = await Effect.runPromise(parseProfileName("work"))
  let profiles: CliProfilesFile = {
    version: 1,
    profiles: { [name]: { ...destination, credentialStorage: "linux-secret-service" } }
  }
  let credentials: CliCredentialsFile = { version: 1, tokens: {} }
  const values = new Map<string, Redacted.Redacted<string>>()
  const removed: Array<string> = []
  const native: NativeCredentialPort = {
    backend: "linux-secret-service",
    read: (key) => Effect.sync(() => values.get(key)),
    save: (key, value) =>
      Effect.sync(() => {
        values.set(key, value)
      }),
    remove: (key) =>
      Effect.sync(() => {
        removed.push(key)
        values.delete(key)
      })
  }
  const store: CliProfileStore = {
    paths: {
      directory: "/native-guards",
      profiles: "/native-guards/profiles",
      credentials: "/native-guards/credentials"
    },
    nativeCredentials: native,
    readProfiles: () => Effect.succeed(profiles),
    readCredentials: () => Effect.succeed(credentials),
    writeProfiles: (value) =>
      Effect.sync(() => {
        profiles = value
      }),
    writeCredentials: (value) =>
      Effect.sync(() => {
        credentials = value
      })
  }
  const reference = { backend: native.backend, destination, key: "entry" }
  return {
    native,
    name,
    store,
    values,
    removed,
    reference,
    get credentials() {
      return credentials
    },
    setCredentials: (value: CliCredentialsFile) => {
      credentials = value
    }
  }
}

it("does not access absent native entries, and rejects unavailable and changed backends", async () => {
  const f = await fixture()
  const selected = selectCredentialStore(f.store)
  expect(await Effect.runPromise(selected.read(f.name, destination))).toBeUndefined()
  await Effect.runPromise(selected.remove(f.name))
  f.setCredentials({ version: 1, tokens: {}, native: { [f.name]: { ...f.reference, backend: "macos-keychain" } } })
  expect(Result.isFailure(await Effect.runPromise(selected.read(f.name, destination).pipe(Effect.result)))).toBe(true)
  expect(Result.isFailure(await Effect.runPromise(selected.remove(f.name).pipe(Effect.result)))).toBe(true)
  const { nativeCredentials: _native, ...withoutNative } = f.store
  expect(
    Result.isFailure(
      await Effect.runPromise(
        selectCredentialStore(withoutNative).save(f.name, destination, Redacted.make("secret")).pipe(Effect.result)
      )
    )
  ).toBe(true)
})

it("parses native payloads and binds both reference and payload destinations", async () => {
  const f = await fixture()
  const selected = selectCredentialStore(f.store)
  f.setCredentials({ version: 1, tokens: {}, native: { [f.name]: f.reference } })
  expect(await Effect.runPromise(selected.read(f.name, destination))).toBeUndefined()
  expect(
    Result.isFailure(
      await Effect.runPromise(selected.read(f.name, { ...destination, workspace: "other" }).pipe(Effect.result))
    )
  ).toBe(true)
  f.values.set("entry", Redacted.make("invalid-json-private-sentinel"))
  const invalid = await Effect.runPromise(selected.read(f.name, destination).pipe(Effect.result))
  expect(Result.isFailure(invalid)).toBe(true)
  expect(JSON.stringify(invalid)).not.toContain("invalid-json-private-sentinel")
  f.values.set(
    "entry",
    Redacted.make(JSON.stringify({ version: 1, destination: { ...destination, workspace: "other" }, token: "secret" }))
  )
  expect(Result.isFailure(await Effect.runPromise(selected.read(f.name, destination).pipe(Effect.result)))).toBe(true)
})

it("cleans all retired entries while preserving metadata if deletion fails", async () => {
  const f = await fixture()
  f.setCredentials({ version: 1, tokens: {}, native: { [f.name]: { ...f.reference, retiredKeys: ["old"] } } })
  await Effect.runPromise(selectCredentialStore(f.store).remove(f.name))
  expect(f.removed).toEqual(["entry", "old"])
  expect(f.credentials.native).toEqual({})
  f.setCredentials({ version: 1, tokens: {}, native: { [f.name]: f.reference } })
  const denied: CliProfileStore = {
    ...f.store,
    nativeCredentials: {
      ...f.native,
      remove: () => Effect.fail(new CliProfileStoreError({ kind: "integration", message: "Denied" }))
    }
  }
  expect(
    Result.isFailure(await Effect.runPromise(selectCredentialStore(denied).remove(f.name).pipe(Effect.result)))
  ).toBe(true)
  expect(f.credentials.native?.[f.name]).toEqual(f.reference)
})

it("preserves selection when metadata publication fails or a replacement changes backend", async () => {
  const f = await fixture()
  const failing: CliProfileStore = {
    ...f.store,
    writeCredentials: () =>
      Effect.fail(new CliProfileStoreError({ kind: "integration", message: "Publication denied" }))
  }
  expect(
    Result.isFailure(
      await Effect.runPromise(
        selectCredentialStore(failing).save(f.name, destination, Redacted.make("secret")).pipe(Effect.result)
      )
    )
  ).toBe(true)
  expect(f.values.size).toBe(0)
  expect(f.credentials.native).toBeUndefined()
  f.setCredentials({ version: 1, tokens: {}, native: { [f.name]: { ...f.reference, backend: "macos-keychain" } } })
  expect(
    Result.isFailure(
      await Effect.runPromise(
        selectCredentialStore(f.store).save(f.name, destination, Redacted.make("secret")).pipe(Effect.result)
      )
    )
  ).toBe(true)
})

it("rejects invalid native payloads and colliding entry IDs before publication", async () => {
  const f = await fixture()
  const store = { ...f.store, newCredentialId: () => Effect.succeed("fixed") }
  const selected = selectCredentialStore(store)
  expect(
    Result.isFailure(await Effect.runPromise(selected.save(f.name, destination, Redacted.make("")).pipe(Effect.result)))
  ).toBe(true)
  await Effect.runPromise(selected.save(f.name, destination, Redacted.make("original")))
  const before = f.credentials
  expect(
    Result.isFailure(
      await Effect.runPromise(selected.save(f.name, destination, Redacted.make("replacement")).pipe(Effect.result))
    )
  ).toBe(true)
  expect(f.credentials).toBe(before)
  const read = await Effect.runPromise(selected.read(f.name, destination))
  expect(read === undefined ? undefined : Redacted.value(read)).toBe("original")
})

it("publishes a successful replacement and deletes the prior immutable entry", async () => {
  const f = await fixture()
  const selected = selectCredentialStore(f.store)
  await Effect.runPromise(selected.save(f.name, destination, Redacted.make("original")))
  const previous = f.credentials.native?.[f.name]?.key
  await Effect.runPromise(selected.save(f.name, destination, Redacted.make("replacement")))
  expect(f.values.size).toBe(1)
  expect(f.removed).toContain(previous)
  const read = await Effect.runPromise(selected.read(f.name, destination))
  expect(read === undefined ? undefined : Redacted.value(read)).toBe("replacement")
  await Effect.runPromise(selected.remove(f.name))
  expect(f.values.size).toBe(0)
})

it("reports saved configuration only when its selected backend and destination match", async () => {
  const f = await fixture()
  await Effect.runPromise(updateProfile(f.store, f.name, { defaultProject: "HULY" }))
  expect((await Effect.runPromise(f.store.readProfiles())).profiles[f.name]?.credentialStorage).toBe(
    "linux-secret-service"
  )
  const references: ReadonlyArray<NativeCredentialReference | undefined> = [
    undefined,
    { ...f.reference, backend: "macos-keychain" },
    { ...f.reference, destination: { ...destination, workspace: "other" } },
    f.reference
  ]
  for (const reference of references) {
    f.setCredentials({
      version: 1,
      tokens: {},
      ...(reference === undefined ? {} : { native: { [f.name]: reference } })
    })
    const expected = reference === f.reference
    expect((await Effect.runPromise(getProfileSummaries(f.store)))[0]?.configured).toBe(expected)
    expect((await Effect.runPromise(getAuthStatus(f.store, {}, f.name))).configured).toBe(expected)
  }
  await Effect.runPromise(f.store.writeProfiles({ version: 1, profiles: { [f.name]: destination } }))
  for (const binding of [undefined, { ...destination, workspace: "other" }, destination]) {
    f.setCredentials({
      version: 1,
      tokens: { [f.name]: Redacted.make("secret") },
      ...(binding === undefined ? {} : { destinations: { [f.name]: binding } })
    })
    expect((await Effect.runPromise(getProfileSummaries(f.store)))[0]?.configured).toBe(binding === destination)
  }
})

it("replaces legacy native metadata without requiring a retired-key list", async () => {
  const f = await fixture()
  f.setCredentials({ version: 1, tokens: {}, native: { [f.name]: f.reference } })
  await Effect.runPromise(selectCredentialStore(f.store).save(f.name, destination, Redacted.make("replacement")))
  expect(f.removed).toContain("entry")
  f.setCredentials({ version: 1, tokens: {}, native: { [f.name]: f.reference } })
  await Effect.runPromise(selectCredentialStore(f.store).remove(f.name))
  expect(f.credentials.native).toEqual({})
})
