import { Effect, type Redacted } from "effect"
import type { CliProfileStore } from "../../src/profiles/file-store.js"
import { parseProfileName, type CliCredentialsFile, type CliProfilesFile } from "../../src/profiles/model.js"
import type { NativeCredentialPort } from "../../src/profiles/native-credential-port.js"
export const nativeTestDestination = { url: "https://huly.example", workspace: "work" }
export const makeNativeCredentialFixture = async () => {
  const name = await Effect.runPromise(parseProfileName("work"))
  let profiles: CliProfilesFile = {
    version: 1,
    profiles: { [name]: { ...nativeTestDestination, credentialStorage: "linux-secret-service" } }
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
  const reference = { backend: native.backend, destination: nativeTestDestination, key: "entry" }
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
