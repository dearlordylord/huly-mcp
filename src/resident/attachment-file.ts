import { constants } from "node:fs"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import { Effect, Schema } from "effect"

import { readPrivateText } from "./private-text.js"
import { VERSION } from "../version.js"
import type { ResidentDirectory } from "./protected-path.js"
import {
  closePrivateFile,
  currentPosixOwner,
  fileFailure,
  inspectPrivateDirectory,
  inspectPrivateFile,
  PRIVATE_DIRECTORY_MODE,
  PRIVATE_FILE_MODE,
  ProtectedFileError,
  ResidentFilePath
} from "./protected-path.js"
import { ResidentEndpoint, ResidentTlsIdentity } from "./tls-channel.js"

const MAX_ATTACHMENT_BYTES = 65_536
const FILE_FORMAT = 1
export const RESIDENT_PUBLICATION_FILENAME = "attachment.json"
export const ResidentAttachment = Schema.Struct({
  version: Schema.Literal(FILE_FORMAT),
  transport: Schema.Literal("tls13-external-psk-v1"),
  implementation: Schema.Struct({ name: Schema.Literal("@firfi/huly-mcp"), version: Schema.NonEmptyString }),
  endpoint: ResidentEndpoint,
  identity: ResidentTlsIdentity,
  authorization: Schema.RedactedFromValue(Schema.NonEmptyString)
})
export type ResidentAttachment = Schema.Schema.Type<typeof ResidentAttachment>
const CompatibleResidentAttachment = ResidentAttachment.check(
  Schema.makeFilter((attachment) => attachment.implementation.version === VERSION)
)

const invalidAttachment = () =>
  new ProtectedFileError({ kind: "input", message: "Resident attachment is invalid or incompatible with this package" })
const conflict = () =>
  new ProtectedFileError({ kind: "conflict", message: "Resident attachment ownership changed; cleanup refused" })

export const readResidentAttachment = (selection: ResidentFilePath) =>
  Effect.gen(function* () {
    const text = yield* readPrivateText(selection, MAX_ATTACHMENT_BYTES)
    const descriptor = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(CompatibleResidentAttachment))(
      text
    ).pipe(Effect.mapError(invalidAttachment))
    if (path.basename(selection) !== `${descriptor.identity.generation}.json`) return yield* invalidAttachment()
    return descriptor
  })

export const withPublishedResidentAttachment = <A, E, R>(
  requestedDirectory: ResidentDirectory,
  descriptor: ResidentAttachment,
  use: (file: ResidentFilePath) => Effect.Effect<A, E, R>
) =>
  Effect.gen(function* () {
    const owner = yield* currentPosixOwner
    yield* Effect.tryPromise({
      try: () => fs.mkdir(path.resolve(requestedDirectory), { recursive: true, mode: PRIVATE_DIRECTORY_MODE }),
      catch: fileFailure
    })
    const directory = yield* inspectPrivateDirectory(requestedDirectory, owner)
    const encoded = yield* Schema.encodeEffect(Schema.fromJsonString(CompatibleResidentAttachment))(descriptor).pipe(
      Effect.mapError(invalidAttachment)
    )
    if (Buffer.byteLength(encoded, "utf8") > MAX_ATTACHMENT_BYTES) return yield* invalidAttachment()
    const destination = ResidentFilePath.make(path.join(directory, `${descriptor.identity.generation}.json`))
    return yield* Effect.acquireUseRelease(
      Effect.tryPromise({ try: () => fs.mkdtemp(path.join(directory, ".attachment-")), catch: fileFailure }),
      (temporaryDirectory) =>
        Effect.acquireUseRelease(
          Effect.tryPromise({
            try: () =>
              fs.open(
                path.join(temporaryDirectory, RESIDENT_PUBLICATION_FILENAME),
                constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
                PRIVATE_FILE_MODE
              ),
            catch: fileFailure
          }),
          (handle) =>
            Effect.gen(function* () {
              const original = yield* inspectPrivateFile(handle, owner)
              yield* Effect.tryPromise({
                try: async () => {
                  await handle.writeFile(encoded, "utf8")
                  await handle.sync()
                },
                catch: fileFailure
              })
              return yield* Effect.acquireUseRelease(
                Effect.tryPromise({
                  try: () => fs.link(path.join(temporaryDirectory, RESIDENT_PUBLICATION_FILENAME), destination),
                  catch: conflict
                }),
                () => use(destination),
                () =>
                  Effect.gen(function* () {
                    const current = yield* Effect.tryPromise({
                      try: () => fs.lstat(destination, { bigint: true }),
                      catch: fileFailure
                    })
                    if (current.dev !== original.dev || current.ino !== original.ino || !current.isFile())
                      return yield* conflict()
                    yield* Effect.tryPromise({ try: () => fs.unlink(destination), catch: fileFailure })
                  })
              )
            }),
          closePrivateFile
        ),
      (temporaryDirectory) =>
        Effect.tryPromise({
          try: () => fs.rm(temporaryDirectory, { recursive: true, force: true }),
          catch: fileFailure
        })
    )
  })
