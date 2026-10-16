import { Effect, Redacted, Result } from "effect"
import { expect, it } from "vitest"
import { selectCredentialStore } from "../../src/profiles/credential-store.js"
import { cleanRetiredNativeCredentials } from "../../src/profiles/native-credential-cleanup.js"
import type { CliProfileStore } from "../../src/profiles/file-store.js"
import { CliProfileStoreError, type CliCredentialsFile } from "../../src/profiles/model.js"
import { makeNativeCredentialFixture } from "../helpers/native-credential-store.js"
it("cleans all retired entries while preserving metadata if deletion fails", async () => {
  const f = await makeNativeCredentialFixture()
  f.values.set("entry", Redacted.make("fixture-secret"))
  f.setCredentials({
    version: 1,
    tokens: {},
    native: { [f.name]: { ...f.reference, retiredKeys: ["old", "older", "old"] } }
  })
  await Effect.runPromise(selectCredentialStore(f.store).remove(f.name))
  expect(f.removed).toEqual(["old", "older", "entry"])
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

it("logs out a legacy native reference without retired-key metadata", async () => {
  const f = await makeNativeCredentialFixture()
  f.values.set("entry", Redacted.make("fixture-secret"))
  f.setCredentials({ version: 1, tokens: {}, native: { [f.name]: f.reference } })
  await Effect.runPromise(selectCredentialStore(f.store).remove(f.name))
  expect(f.removed).toEqual(["entry"])
  expect(f.credentials.native).toEqual({})
  await Effect.runPromise(selectCredentialStore(f.store).remove(f.name))
  expect(f.removed).toEqual(["entry"])
})

it("preserves the selected token when a retired entry cannot be removed", async () => {
  const f = await makeNativeCredentialFixture()
  f.values.set("entry", Redacted.make("selected-private-sentinel"))
  const metadata: CliCredentialsFile = {
    version: 1,
    tokens: {},
    native: { [f.name]: { ...f.reference, retiredKeys: ["unavailable-old"] } }
  }
  f.setCredentials(metadata)
  const store: CliProfileStore = {
    ...f.store,
    nativeCredentials: {
      ...f.native,
      remove: (key) =>
        key === "unavailable-old"
          ? Effect.fail(new CliProfileStoreError({ kind: "integration", message: "Cannot prove retired deletion" }))
          : f.native.remove(key)
    }
  }
  const result = await Effect.runPromise(selectCredentialStore(store).remove(f.name).pipe(Effect.result))
  expect(Result.isFailure(result)).toBe(true)
  expect(f.removed).toEqual([])
  expect(f.credentials).toEqual(metadata)
  expect(Redacted.value(f.values.get("entry") ?? Redacted.make("absent"))).toBe("selected-private-sentinel")
})

it("keeps the selected token when retirement receipt persistence fails", async () => {
  const f = await makeNativeCredentialFixture()
  f.values.set("entry", Redacted.make("selected-private-sentinel"))
  const metadata: CliCredentialsFile = {
    version: 1,
    tokens: {},
    native: { [f.name]: { ...f.reference, retiredKeys: ["old"] } }
  }
  f.setCredentials(metadata)
  const store: CliProfileStore = {
    ...f.store,
    writeCredentials: () =>
      Effect.fail(new CliProfileStoreError({ kind: "integration", message: "Receipt write failed" }))
  }
  expect(
    Result.isFailure(await Effect.runPromise(selectCredentialStore(store).remove(f.name).pipe(Effect.result)))
  ).toBe(true)
  expect(f.removed).toEqual(["old"])
  expect(f.credentials).toEqual(metadata)
  expect(f.values.has("entry")).toBe(true)
})

it.each([undefined, {}])("does not access native storage when retirement metadata is absent", async (native) => {
  const f = await makeNativeCredentialFixture()
  const metadata: CliCredentialsFile = { version: 1, tokens: {}, ...(native === undefined ? {} : { native }) }
  f.setCredentials(metadata)
  await Effect.runPromise(cleanRetiredNativeCredentials(f.store, f.name, metadata, f.native))
  expect(f.removed).toEqual([])
  expect(f.credentials).toBe(metadata)
})
