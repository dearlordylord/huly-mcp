import { createHash } from "node:crypto"
import { Effect, Redacted, Schema } from "effect"

import type { CredentialStoreSelector } from "./credential-store.js"
import { selectFileCredentialStore } from "./file-credential-store.js"
import { CredentialDestinationSchema, CliProfileStoreError, type ProfileName } from "./model.js"

const NativeCredentialSchema = Schema.Struct({
  version: Schema.Literal(1),
  destination: CredentialDestinationSchema,
  token: Schema.RedactedFromValue(Schema.NonEmptyString)
})

const failure = (message: string) => new CliProfileStoreError({ kind: "integration", message })

export const selectCredentialStore: CredentialStoreSelector = (store) => {
  const file = selectFileCredentialStore(store)
  const key = (name: string) =>
    createHash("sha256")
      .update(JSON.stringify([store.paths.directory, name]))
      .digest("hex")
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
        const port = yield* nativePort(backend)
        const raw = yield* port.read(key(name))
        if (raw === undefined) return undefined
        const payload = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(NativeCredentialSchema))(
          Redacted.value(raw)
        ).pipe(
          Effect.mapError(() =>
            failure("Native credential payload is invalid. Replace the credential through auth login or import-token.")
          )
        )
        if (payload.destination.url !== destination.url || payload.destination.workspace !== destination.workspace) {
          return yield* failure("Saved Huly credential destination changed. Log in again for this profile.")
        }
        return payload.token
      }),
    save: (name, destination, token, requestedBackend) =>
      Effect.gen(function* () {
        const backend = requestedBackend ?? (yield* backendFor(name))
        if (backend === "file") return yield* file.save(name, destination, token)
        const port = yield* nativePort(backend)
        const previous = yield* port.read(key(name))
        const encoded = yield* Schema.encodeEffect(Schema.fromJsonString(NativeCredentialSchema))({
          version: 1,
          destination,
          token
        }).pipe(Effect.mapError(() => failure("Cannot encode native credential.")))
        const metadata = yield* store.readCredentials()
        yield* port.save(key(name), Redacted.make(encoded))
        yield* store
          .writeCredentials({ ...metadata, native: { ...metadata.native, [name]: { backend, destination } } })
          .pipe(
            Effect.catch((error) =>
              Effect.gen(function* () {
                if (previous === undefined) yield* port.remove(key(name))
                else yield* port.save(key(name), previous)
                return yield* error
              })
            )
          )
      }),
    remove: (name) =>
      Effect.gen(function* () {
        const backend = yield* backendFor(name)
        if (backend === "file") return yield* file.remove(name)
        const port = yield* nativePort(backend)
        yield* port.remove(key(name))
        const metadata = yield* store.readCredentials()
        const { [name]: _removed, ...native } = metadata.native ?? {}
        yield* store.writeCredentials({ ...metadata, native })
      })
  }
}
