import { Effect, Schema } from "effect"

import type { CliProfileStore } from "./file-store.js"
import {
  type CliProfile,
  CliProfileStoreError,
  type CredentialStorage,
  type NativeCredentialStorage,
  type ProfileName
} from "./model.js"

export const StoragePreferenceSchema = Schema.Literals(["file", "os"])
export type StoragePreference = Schema.Schema.Type<typeof StoragePreferenceSchema>

export const nativeBackendForPlatform = (platform: NodeJS.Platform): NativeCredentialStorage | undefined => {
  if (platform === "darwin") return "macos-keychain"
  if (platform === "linux") return "linux-secret-service"
  return undefined
}

const withSelectedStorage = (
  profile: CliProfile,
  backend: CredentialStorage,
  saved: boolean
): Effect.Effect<CliProfile, CliProfileStoreError> =>
  saved && backend !== (profile.credentialStorage ?? "file")
    ? Effect.fail(
        new CliProfileStoreError({
          kind: "input",
          message:
            "Replacement retains the selected credential backend. Use a new profile for a different backend; no credential migration is performed."
        })
      )
    : Effect.succeed({ ...profile, credentialStorage: backend })

export const selectProfileStorage = Effect.fn("Profiles.selectStorage")(function* (
  store: CliProfileStore,
  name: ProfileName,
  profile: CliProfile,
  preference: StoragePreference | undefined,
  nativeBackend: NativeCredentialStorage | undefined
) {
  if (preference === undefined) return profile
  const backend: CredentialStorage | undefined = preference === "file" ? "file" : nativeBackend
  if (backend === undefined)
    return yield* new CliProfileStoreError({
      kind: "input",
      message:
        "OS credential storage is supported on macOS and Linux. Use file storage or environment injection on this platform."
    })
  const credentials = yield* store.readCredentials()
  const saved = credentials.tokens[name] !== undefined || credentials.native?.[name] !== undefined
  return yield* withSelectedStorage(profile, backend, saved)
})
