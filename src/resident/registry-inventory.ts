import * as fs from "node:fs/promises"
import { join } from "node:path"
import { Effect, Schema } from "effect"

import type { ResidentAttachment } from "./attachment-file.js"
import {
  ManagedLaunchError,
  MAX_REGISTRY_BYTES,
  MAX_REGISTRY_RECORDS,
  ResidentRegistryEnvelope,
  registryCapacityFailure
} from "./managed-contract.js"
import {
  currentPosixOwner,
  inspectPrivateDirectory,
  type ResidentDirectory,
  ResidentFilePath
} from "./protected-path.js"
import { readPrivateText } from "./private-text.js"
import { ResidentTlsIdentity } from "./tls-channel.js"

const RECORD_SUFFIX = ".json"

export const registryFailure = () =>
  new ManagedLaunchError({
    reason: "ownership",
    message: "Resident registry is unresolved; inspect its private state before retrying"
  })
export const registryIo = <A>(operation: () => Promise<A>) =>
  Effect.tryPromise({ try: operation, catch: registryFailure })

export const openRegistryInventory = Effect.fn("openRegistryInventory")(function* (requested: ResidentDirectory) {
  const owner = yield* currentPosixOwner
  const directory = yield* inspectPrivateDirectory(requested, owner)
  const listRecords = Effect.acquireUseRelease(
    registryIo(() => fs.opendir(directory)),
    (entries) =>
      Effect.gen(function* () {
        const files: Array<{
          readonly file: ResidentFilePath
          readonly generation: ResidentAttachment["identity"]["generation"]
        }> = []
        for (let count = 0; ; count++) {
          const entry = yield* registryIo(() => entries.read())
          if (entry === null) return files
          if (count === MAX_REGISTRY_RECORDS) return yield* registryCapacityFailure()
          if (!entry.isFile() || !entry.name.endsWith(RECORD_SUFFIX)) return yield* registryFailure()
          const generation = yield* Schema.decodeUnknownEffect(ResidentTlsIdentity.fields.generation)(
            entry.name.slice(0, -RECORD_SUFFIX.length)
          ).pipe(Effect.mapError(registryFailure))
          files.push({ file: ResidentFilePath.make(join(directory, entry.name)), generation })
        }
      }),
    (entries) => registryIo(() => entries.close())
  )
  const inventory = listRecords.pipe(
    Effect.flatMap((files) =>
      Effect.forEach(files, ({ file, generation }) =>
        Effect.gen(function* () {
          const text = yield* readPrivateText(file, MAX_REGISTRY_BYTES)
          const envelope = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(ResidentRegistryEnvelope))(
            text
          ).pipe(Effect.mapError(registryFailure))
          if (envelope.generation !== generation || envelope.format !== 1) return yield* registryFailure()
          return { file, envelope }
        })
      )
    )
  )

  return { listRecords, inventory }
})
