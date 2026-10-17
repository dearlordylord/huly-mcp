import { constants } from "node:fs"
import * as fs from "node:fs/promises"
import { join } from "node:path"
import { Effect, Redacted, Schema } from "effect"

import { VERSION } from "../version.js"
import { ResidentAttachment } from "./attachment-file.js"
import {
  ManagedLaunchError,
  MANAGED_PACKAGE_NAME,
  MAX_REGISTRY_BYTES,
  MAX_REGISTRY_RECORDS,
  ResidentRegistryEnvelope,
  registryCapacityFailure
} from "./managed-contract.js"
import {
  currentPosixOwner,
  inspectPrivateDirectory,
  inspectPrivateFile,
  PRIVATE_DIRECTORY_MODE,
  PRIVATE_FILE_MODE,
  ResidentDirectory,
  ResidentFilePath
} from "./protected-path.js"
import { readPrivateText } from "./private-text.js"
import { ResidentTlsIdentity } from "./tls-channel.js"

const RECORD_SUFFIX = ".json"

class RegistryDirectoryOccupied extends Schema.TaggedError<RegistryDirectoryOccupied>()(
  "RegistryDirectoryOccupied",
  {}
) {}
const registryFailure = () =>
  new ManagedLaunchError({
    reason: "ownership",
    message: "Resident registry is unresolved; inspect its private state before retrying"
  })
const registryIo = <A>(operation: () => Promise<A>) => Effect.tryPromise({ try: operation, catch: registryFailure })

export const openGenerationRegistry = Effect.fn("openGenerationRegistry")(function* (root: ResidentDirectory) {
  const owner = yield* currentPosixOwner
  const parent = yield* inspectPrivateDirectory(root, owner)
  const requested = ResidentDirectory.make(join(parent, "generations"))
  yield* registryIo(() => fs.mkdir(requested, { mode: PRIVATE_DIRECTORY_MODE, recursive: true }))
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

  const publish = Effect.fn("GenerationRegistry.publish")(function* (descriptor: ResidentAttachment) {
    if ((yield* listRecords).length === MAX_REGISTRY_RECORDS) return yield* registryCapacityFailure()
    const envelope = ResidentRegistryEnvelope.make({
      format: 1,
      implementation: { name: MANAGED_PACKAGE_NAME, version: VERSION },
      generation: descriptor.identity.generation,
      diagnostics: { processId: process.pid, parentProcessId: process.ppid },
      descriptor: Redacted.make(
        yield* Schema.encodeEffect(ResidentAttachment)(descriptor).pipe(Effect.mapError(registryFailure))
      )
    })
    const encoded = yield* Schema.encodeEffect(Schema.fromJsonString(ResidentRegistryEnvelope))(envelope).pipe(
      Effect.mapError(registryFailure)
    )
    if (Buffer.byteLength(encoded, "utf8") > MAX_REGISTRY_BYTES) return yield* registryFailure()
    const file = ResidentFilePath.make(join(directory, `${envelope.generation}.json`))
    return yield* Effect.acquireUseRelease(
      registryIo(() => fs.mkdtemp(join(directory, ".publish-"))),
      (temporary) =>
        Effect.acquireUseRelease(
          registryIo(() =>
            fs.open(
              join(temporary, "record.json"),
              constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
              PRIVATE_FILE_MODE
            )
          ),
          (handle) =>
            Effect.gen(function* () {
              const original = yield* inspectPrivateFile(handle, owner)
              yield* registryIo(async () => {
                await handle.writeFile(encoded, "utf8")
                await handle.sync()
              })
              yield* registryIo(() => fs.link(join(temporary, "record.json"), file))
              let consumed = false
              const retire = Effect.uninterruptible(
                Effect.suspend(() => {
                  if (consumed) return Effect.void
                  consumed = true
                  return Effect.gen(function* () {
                    const current = yield* registryIo(() => fs.lstat(file, { bigint: true }))
                    if (!current.isFile() || current.dev !== original.dev || current.ino !== original.ino)
                      return yield* registryFailure()
                    yield* registryIo(() => fs.unlink(file))
                    yield* Effect.tryPromise({
                      try: () => fs.rmdir(directory),
                      catch: (error) =>
                        Schema.is(Schema.Struct({ code: Schema.Literal("ENOTEMPTY") }))(error)
                          ? new RegistryDirectoryOccupied({})
                          : registryFailure()
                    }).pipe(Effect.catchTag("RegistryDirectoryOccupied", () => Effect.void))
                  })
                })
              )
              return { file, retire }
            }),
          (handle) => registryIo(() => handle.close())
        ),
      (temporary) => registryIo(() => fs.rm(temporary, { recursive: true, force: true }))
    )
  }, Effect.uninterruptible)

  return { inventory, publish }
})

export const decodeCurrentRegistryAttachment = Effect.fn("decodeCurrentRegistryAttachment")(function* (
  envelope: ResidentRegistryEnvelope
) {
  if (envelope.implementation.version !== VERSION) return undefined
  const descriptor = yield* Schema.decodeUnknownEffect(ResidentAttachment)(Redacted.value(envelope.descriptor)).pipe(
    Effect.mapError(registryFailure)
  )
  if (descriptor.implementation.version !== VERSION || descriptor.identity.generation !== envelope.generation)
    return yield* registryFailure()
  return descriptor
})
