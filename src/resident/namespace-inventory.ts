import * as fs from "node:fs/promises"
import type { Dirent } from "node:fs"
import { join } from "node:path"
import { Effect, Schema } from "effect"

import { RESIDENT_PUBLICATION_FILENAME, ResidentAttachment, readResidentAttachment } from "./attachment-file.js"
import { decodeCurrentRegistryAttachment } from "./generation-registry.js"
import { MAX_REGISTRY_RECORDS } from "./managed-contract.js"
import {
  closePrivateFile,
  currentPosixOwner,
  inspectPrivateDirectory,
  inspectPrivateFile,
  openPrivateFile,
  ResidentDirectory,
  ResidentFilePath
} from "./protected-path.js"
import { openRegistryInventory, registryFailure, registryIo } from "./registry-inventory.js"
import { ResidentTlsIdentity } from "./tls-channel.js"

const GENERATION_ROOT_ENTRIES = 2
const SHARED_ROOT_ENTRIES = 2
const MAX_ROOT_ENTRIES = MAX_REGISTRY_RECORDS * GENERATION_ROOT_ENTRIES + SHARED_ROOT_ENTRIES

const sameDescriptorFields = Schema.toEquivalence(
  Schema.Struct({ ...ResidentAttachment.fields, endpoint: Schema.String })
)

// Internal parsed directory entries, never serialized.
type NamespaceEntry =
  | { readonly kind: "registry" }
  | { readonly kind: "claim" }
  | { readonly kind: "publication"; readonly directory: ResidentDirectory }
  | {
      readonly kind: "descriptor"
      readonly generation: ResidentAttachment["identity"]["generation"]
      readonly file: ResidentFilePath
    }

const parseDirectoryEntry = Effect.fn("parseDirectoryEntry")(function* (
  directory: ResidentDirectory,
  entry: Dirent
): Effect.fn.Return<NamespaceEntry, ReturnType<typeof registryFailure>> {
  if (entry.name === "generations") return { kind: "registry" }
  if (entry.name === "selection.claim") return { kind: "claim" }
  if (entry.name.startsWith(".attachment-"))
    return { kind: "publication", directory: ResidentDirectory.make(join(directory, entry.name)) }
  return yield* registryFailure()
})

const parseNamespaceEntry = Effect.fn("parseNamespaceEntry")(function* (
  directory: ResidentDirectory,
  entry: Dirent
): Effect.fn.Return<NamespaceEntry, ReturnType<typeof registryFailure>> {
  if (entry.isDirectory()) return yield* parseDirectoryEntry(directory, entry)
  if (!entry.isFile() || !entry.name.endsWith(".json")) return yield* registryFailure()
  const generation = yield* Schema.decodeUnknownEffect(ResidentTlsIdentity.fields.generation)(
    entry.name.slice(0, -".json".length)
  ).pipe(Effect.mapError(registryFailure))
  return { kind: "descriptor", generation, file: ResidentFilePath.make(join(directory, entry.name)) }
})

const inspectNamespace = (directory: ResidentDirectory) =>
  Effect.acquireUseRelease(
    registryIo(() => fs.opendir(directory)),
    (entries) =>
      Effect.gen(function* () {
        const descriptors = new Map<ResidentAttachment["identity"]["generation"], ResidentFilePath>()
        const publications: Array<ResidentDirectory> = []
        let registryPresent = false
        let claimPresent = false
        for (let count = 0; ; count++) {
          const entry = yield* registryIo(() => entries.read())
          if (entry === null) return { descriptors, publications, registryPresent, claimPresent }
          if (count === MAX_ROOT_ENTRIES) return yield* registryFailure()
          const parsed = yield* parseNamespaceEntry(directory, entry)
          if (parsed.kind === "registry") registryPresent = true
          else if (parsed.kind === "claim") claimPresent = true
          else if (parsed.kind === "publication") publications.push(parsed.directory)
          else descriptors.set(parsed.generation, parsed.file)
        }
      }),
    (entries) => registryIo(() => entries.close())
  )

export const readResidentNamespace = Effect.fn("readResidentNamespace")(function* (requested: ResidentDirectory) {
  const owner = yield* currentPosixOwner
  const directory = yield* inspectPrivateDirectory(requested, owner)
  const namespace = yield* inspectNamespace(directory)
  const inspectFile = (file: ResidentFilePath) =>
    Effect.acquireUseRelease(openPrivateFile(file), (handle) => inspectPrivateFile(handle, owner), closePrivateFile)
  const descriptors = yield* Effect.forEach(namespace.descriptors.values(), inspectFile)
  yield* Effect.forEach(namespace.publications, (publication) =>
    Effect.gen(function* () {
      yield* inspectPrivateDirectory(publication, owner)
      const published = yield* inspectFile(ResidentFilePath.make(join(publication, RESIDENT_PUBLICATION_FILENAME)))
      if (!descriptors.some((descriptor) => descriptor.dev === published.dev && descriptor.ino === published.ino))
        return yield* registryFailure()
    })
  )
  if (namespace.claimPresent)
    yield* inspectPrivateDirectory(ResidentDirectory.make(join(directory, "selection.claim")), owner)
  const records = namespace.registryPresent
    ? yield* openRegistryInventory(ResidentDirectory.make(join(directory, "generations"))).pipe(
        Effect.flatMap((registry) => registry.inventory)
      )
    : []
  if (namespace.descriptors.size !== records.length) return yield* registryFailure()
  const currentDescriptors: ResidentAttachment[] = []
  for (const { envelope } of records) {
    const file = namespace.descriptors.get(envelope.generation)
    if (file === undefined) return yield* registryFailure()
    const registered = yield* decodeCurrentRegistryAttachment(envelope)
    if (registered === undefined) continue
    const published = yield* readResidentAttachment(file).pipe(Effect.mapError(registryFailure))
    if (
      !sameDescriptorFields(
        { ...registered, endpoint: registered.endpoint.href },
        { ...published, endpoint: published.endpoint.href }
      )
    )
      return yield* registryFailure()
    currentDescriptors.push(published)
  }
  return { claimPresent: namespace.claimPresent, records, currentDescriptors }
})
