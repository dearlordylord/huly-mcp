import { Effect, Redacted, Schema } from "effect"

import { NativeCredentialPayloadSchema, publishNativeCredential } from "./native-credential-publication.js"
import type { CredentialStoreSelector } from "./credential-store.js"
import { matchesCredentialDestination } from "./credential-destination.js"
import { selectFileCredentialStore } from "./file-credential-store.js"
import { CliProfileStoreError, type ProfileName } from "./model.js"

const failure = (message: string) => new CliProfileStoreError({ kind: "integration", message })

export const selectCredentialStore: CredentialStoreSelector = (store) => {
  const file = selectFileCredentialStore(store)
  const nativePort = (backend: string) => {
    const port = store.nativeCredentials
    return port !== undefined && port.backend === backend
      ? Effect.succeed(port)
      : Effect.fail(
          failure(
            `Credential backend ${backend} is unavailable. Use the same OS user/session with native storage access, or inject complete environment credentials explicitly.`
          )
        )
  }
  const backendFor = (name: ProfileName) =>
    store.readProfiles().pipe(Effect.map((profiles) => profiles.profiles[name]?.credentialStorage ?? "file"))

  return {
    read: (name, destination) =>
      Effect.gen(function* () {
        const backend = yield* backendFor(name)
        if (backend === "file") return yield* file.read(name, destination)
        const metadata = yield* store.readCredentials()
        const reference = metadata.native?.[name]
        if (reference === undefined) return undefined
        if (reference.backend !== backend)
          return yield* failure(
            "Saved credential backend changed. Restore the selected profile backend before using it."
          )
        if (!matchesCredentialDestination(reference.destination, destination))
          return yield* failure("Saved Huly credential destination changed. Log in again for this profile.")
        const port = yield* nativePort(backend)
        const raw = yield* port.read(reference.key)
        if (raw === undefined) return undefined
        const payload = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(NativeCredentialPayloadSchema))(
          Redacted.value(raw)
        ).pipe(
          Effect.mapError(() =>
            failure("Native credential payload is invalid. Replace the credential through auth login or import-token.")
          )
        )
        if (!matchesCredentialDestination(payload.destination, destination)) {
          return yield* failure("Saved Huly credential destination changed. Log in again for this profile.")
        }
        return payload.token
      }),
    save: (name, destination, token, requestedBackend) =>
      Effect.gen(function* () {
        const backend = requestedBackend ?? (yield* backendFor(name))
        if (backend === "file") return yield* file.save(name, destination, token)
        const port = yield* nativePort(backend)
        yield* publishNativeCredential(store, name, { version: 1, destination, token }, port)
      }),
    remove: (name) =>
      Effect.gen(function* () {
        const backend = yield* backendFor(name)
        if (backend === "file") return yield* file.remove(name)
        const metadata = yield* store.readCredentials()
        const reference = metadata.native?.[name]
        if (reference === undefined) return
        if (reference.backend !== backend)
          return yield* failure(
            "Saved credential backend changed. Restore the selected profile backend before deleting it."
          )
        const port = yield* nativePort(backend)
        yield* port.remove(reference.key)
        yield* Effect.forEach(reference.retiredKeys ?? [], (retired) => port.remove(retired), { discard: true })
        const { [name]: _removed, ...native } = metadata.native ?? {}
        yield* store.writeCredentials({ ...metadata, native })
      })
  }
}
