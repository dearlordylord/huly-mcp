import { createHash, randomUUID } from "node:crypto"
import { Effect, Redacted, Schema } from "effect"

import { cleanRetiredNativeCredentials } from "./native-credential-cleanup.js"
import type { CliProfileStore } from "./file-store.js"
import {
  CredentialDestinationSchema,
  CliProfileStoreError,
  type NativeCredentialReference,
  type ProfileName
} from "./model.js"
import type { NativeCredentialPort } from "./native-credential-port.js"

export const NativeCredentialPayloadSchema = Schema.Struct({
  version: Schema.Literal(1),
  destination: CredentialDestinationSchema,
  token: Schema.RedactedFromValue(Schema.NonEmptyString)
})
type NativeCredentialPayload = Schema.Schema.Type<typeof NativeCredentialPayloadSchema>

const failure = (message: string) => new CliProfileStoreError({ kind: "integration", message })
const retiredKeysFor = (previous: NativeCredentialReference | undefined) =>
  previous === undefined ? [] : [previous.key, ...(previous.retiredKeys ?? [])]

const allocateNativeKey = Effect.fn("Profiles.allocateNativeKey")(function* (
  store: CliProfileStore,
  name: ProfileName,
  retiredKeys: ReadonlyArray<string>
) {
  const prefix = createHash("sha256")
    .update(JSON.stringify([store.paths.directory, name]))
    .digest("hex")
  const identifier = yield* store.newCredentialId?.() ?? Effect.sync(randomUUID)
  const key = `${prefix}-${identifier}`
  if (retiredKeys.includes(key)) return yield* failure("Cannot allocate a distinct native credential entry.")
  return key
})

export const publishNativeCredential = Effect.fn("Profiles.publishNativeCredential")(function* (
  store: CliProfileStore,
  name: ProfileName,
  payload: NativeCredentialPayload,
  port: NativeCredentialPort
) {
  const encoded = yield* Schema.encodeEffect(Schema.fromJsonString(NativeCredentialPayloadSchema))(payload).pipe(
    Effect.mapError(() => failure("Cannot encode native credential."))
  )
  const metadata = yield* store.readCredentials()
  const previous = metadata.native?.[name]
  if (previous !== undefined && previous.backend !== port.backend)
    return yield* failure("Replacing a credential cannot change its native backend.")
  const retiredKeys = retiredKeysFor(previous)
  const stagedKey = yield* allocateNativeKey(store, name, retiredKeys)
  // The active entry is immutable. An ambiguous native write failure cannot replace it.
  const selected = {
    ...metadata,
    native: {
      ...metadata.native,
      [name]: { backend: port.backend, destination: payload.destination, key: stagedKey, retiredKeys }
    }
  }
  yield* port.save(stagedKey, Redacted.make(encoded)).pipe(
    Effect.andThen(store.writeCredentials(selected)),
    Effect.catch((error) => Effect.ignore(port.remove(stagedKey)).pipe(Effect.andThen(Effect.fail(error))))
  )
  // Selection has committed. Retained nonsecret IDs let logout retry cleanup without
  // misreporting a successful replacement as a failure after its active pointer changed.
  yield* Effect.ignore(cleanRetiredNativeCredentials(store, name, selected, port))
})
