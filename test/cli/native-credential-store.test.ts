import { Effect, Redacted, Schema } from "effect"
import { expect, it } from "vitest"

import { getAuthStatus, logoutProfile, saveLogin } from "../../packages/huly-cli/src/profile-operations.js"
import { selectCredentialStore } from "../../src/profiles/credential-store.js"
import { type CliProfileStore } from "../../src/profiles/file-store.js"
import {
  CliProfileStoreError,
  parseProfileName,
  type CliProfilesFile,
  type CliCredentialsFile,
  CliProfilesFileSchema,
  CliCredentialsFileSchema
} from "../../src/profiles/model.js"
import type { NativeCredentialPort } from "../../src/profiles/native-credential-port.js"
import { resolveCliConfiguration } from "../../src/profiles/resolve.js"

it("reports complete environment configuration without reading saved credentials or native storage", async () => {
  const name = await Effect.runPromise(parseProfileName("work"))
  const store: CliProfileStore = {
    paths: {
      directory: "/environment-status",
      profiles: "/environment-status/profiles",
      credentials: "/environment-status/credentials"
    },
    readProfiles: () =>
      Effect.succeed({
        version: 1,
        activeProfile: name,
        profiles: {
          [name]: { url: "https://saved.example", workspace: "saved", credentialStorage: "linux-secret-service" }
        }
      }),
    readCredentials: () => Effect.die("Complete environment status must not read saved credentials"),
    writeProfiles: () => Effect.die("Status must not write"),
    writeCredentials: () => Effect.die("Status must not write")
  }
  expect(
    await Effect.runPromise(
      getAuthStatus(store, {
        HULY_URL: "https://environment.example",
        HULY_WORKSPACE: "environment",
        HULY_TOKEN: "environment-sentinel"
      })
    )
  ).toMatchObject({ configured: true, verified: false, sources: { authentication: "environment" } })
})

it("shares native credentials across entrypoints, keeps secrets out of serialized metadata, and inspects status without reading native storage", async () => {
  let profiles: CliProfilesFile = { version: 1, profiles: {} }
  let credentials: CliCredentialsFile = { version: 1, tokens: {} }
  const values = new Map<string, Redacted.Redacted<string>>()
  let reads = 0
  let denied = false
  let sequence = 0
  const native: NativeCredentialPort = {
    backend: "linux-secret-service",
    read: (key) =>
      Effect.sync(() => {
        reads++
        return values.get(key)
      }),
    save: (key, value) =>
      Effect.sync(() => {
        values.set(key, value)
      }).pipe(
        Effect.andThen(
          denied
            ? Effect.fail(
                new CliProfileStoreError({
                  kind: "integration",
                  message: "Native store denied replacement after an ambiguous write."
                })
              )
            : Effect.void
        )
      ),
    remove: (key) =>
      Effect.sync(() => {
        values.delete(key)
      })
  }
  const store: CliProfileStore = {
    nativeCredentials: native,
    newCredentialId: () => Effect.sync(() => `credential-${++sequence}`),
    paths: {
      directory: "/native-test",
      credentials: "/native-test/credentials.json",
      profiles: "/native-test/profiles.json"
    },
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
  const name = await Effect.runPromise(parseProfileName("work"))
  const profile = { url: "https://huly.example", workspace: "work", credentialStorage: native.backend }
  {
    await Effect.runPromise(saveLogin(store, name, profile, Redacted.make("native-original-sentinel")))
    const reader = { ...store }
    const resolved = await Effect.runPromise(resolveCliConfiguration(reader, {}, name))
    expect(resolved.auth.method).toBe("token")
    if (resolved.auth.method === "token") expect(Redacted.value(resolved.auth.token)).toBe("native-original-sentinel")
    const beforeStatus = reads
    expect(await Effect.runPromise(getAuthStatus(reader, {}, name))).toMatchObject({
      configured: true,
      verified: false,
      credentialStorage: "linux-secret-service"
    })
    expect(reads).toBe(beforeStatus)
    denied = true
    await expect(
      Effect.runPromise(saveLogin(store, name, profile, Redacted.make("native-replacement-sentinel")))
    ).rejects.toThrow("denied replacement")
    const preserved = await Effect.runPromise(selectCredentialStore(reader).read(name, profile))
    expect(preserved === undefined ? undefined : Redacted.value(preserved)).toBe("native-original-sentinel")
    expect(values.size).toBe(1)
    const serialized =
      JSON.stringify(Schema.encodeSync(CliCredentialsFileSchema)(credentials)) +
      JSON.stringify(Schema.encodeSync(CliProfilesFileSchema)(profiles))
    expect(serialized).not.toContain("native-original-sentinel")
    expect(serialized).not.toContain("native-replacement-sentinel")
    const metadata = profiles
    await Effect.runPromise(logoutProfile(reader, name))
    expect(profiles).toEqual(metadata)
    expect(values.size).toBe(0)
    expect(await Effect.runPromise(getAuthStatus(reader, {}, name))).toMatchObject({
      configured: false,
      verified: false
    })
  }
})
