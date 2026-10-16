import { Effect } from "effect"
import type { CliProfileStore } from "./file-store.js"
import { CliProfileStoreError, type CliCredentialsFile, type ProfileName } from "./model.js"
import type { NativeCredentialPort } from "./native-credential-port.js"

export const requireNativeCredential = (port: NativeCredentialPort, key: string) =>
  port
    .read(key)
    .pipe(
      Effect.flatMap((raw) =>
        raw === undefined
          ? Effect.fail(
              new CliProfileStoreError({
                kind: "integration",
                message:
                  "Saved native credential is missing or its Keychain/Secret Service storage is unavailable. Restore access to the original OS storage and retry; the credential reference was retained. No file fallback was used."
              })
            )
          : Effect.succeed(raw)
      )
    )

export const cleanRetiredNativeCredentials = (
  store: CliProfileStore,
  name: ProfileName,
  metadata: CliCredentialsFile,
  port: NativeCredentialPort
) =>
  Effect.gen(function* () {
    const native = metadata.native
    const reference = native?.[name]
    if (native === undefined || reference === undefined) return
    let remaining = reference.retiredKeys ?? []
    for (const key of new Set(remaining)) {
      yield* port.remove(key)
      remaining = remaining.filter((candidate) => candidate !== key)
      const current = { ...metadata, native: { ...native, [name]: { ...reference, retiredKeys: remaining } } }
      yield* store.writeCredentials(current)
    }
  })
