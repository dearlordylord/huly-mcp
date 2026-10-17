import * as fs from "node:fs/promises"
import type { Dirent } from "node:fs"
import { join } from "node:path"
import { Effect, Schema } from "effect"

import type { ResidentAttachment } from "./attachment-file.js"
import { MAX_REGISTRY_RECORDS, ResidentRegistryEnvelope } from "./managed-contract.js"
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
const ABSENT_GUIDANCE = "No state directory was observed. Absence does not prove previous resources retired."
const OBSERVED_GUIDANCE =
  "This snapshot proves neither readiness nor retirement. Preserve unresolved state and verify owned resources before recovery."
const Absent = Schema.Struct({ state: Schema.Literal("absent"), guidance: Schema.Literal(ABSENT_GUIDANCE) })
const Observed = Schema.Struct({
  state: Schema.Literal("observed"),
  claim: Schema.Literals(["absent", "present-unverified"]),
  generations: Schema.Array(
    Schema.Struct({
      implementation: ResidentRegistryEnvelope.fields.implementation,
      generation: ResidentRegistryEnvelope.fields.generation,
      diagnostics: ResidentRegistryEnvelope.fields.diagnostics,
      liveness: Schema.Literal("unverified")
    })
  ),
  guidance: Schema.Literal(OBSERVED_GUIDANCE)
})
export const ResidentStateStatus = Schema.Union([Absent, Observed])
export type ResidentStateStatus = Schema.Schema.Type<typeof ResidentStateStatus>

const exists = (directory: ResidentDirectory) =>
  Effect.tryPromise({
    try: async () => {
      try {
        await fs.lstat(directory)
        return true
      } catch (error) {
        if (Schema.is(Schema.Struct({ code: Schema.Literal("ENOENT") }))(error)) return false
        throw error
      }
    },
    catch: registryFailure
  })

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

export const inspectResidentState = Effect.fn("inspectResidentState")(function* (requested: ResidentDirectory) {
  const owner = yield* currentPosixOwner
  if (!(yield* exists(requested))) return Absent.make({ state: "absent", guidance: ABSENT_GUIDANCE })
  const directory = yield* inspectPrivateDirectory(requested, owner)
  const namespace = yield* inspectNamespace(directory)
  yield* Effect.forEach(namespace.publications, (publication) => inspectPrivateDirectory(publication, owner))
  yield* Effect.forEach(namespace.descriptors.values(), (descriptor) =>
    Effect.acquireUseRelease(
      openPrivateFile(descriptor),
      (handle) => inspectPrivateFile(handle, owner),
      closePrivateFile
    )
  )
  if (namespace.claimPresent)
    yield* inspectPrivateDirectory(ResidentDirectory.make(join(directory, "selection.claim")), owner)
  const records = namespace.registryPresent
    ? yield* openRegistryInventory(ResidentDirectory.make(join(directory, "generations"))).pipe(
        Effect.flatMap((registry) => registry.inventory)
      )
    : []
  if (
    namespace.descriptors.size !== records.length ||
    records.some(({ envelope }) => !namespace.descriptors.has(envelope.generation))
  )
    return yield* registryFailure()
  return Observed.make({
    state: "observed",
    claim: namespace.claimPresent ? "present-unverified" : "absent",
    generations: records.map(({ envelope }) => ({
      implementation: envelope.implementation,
      generation: envelope.generation,
      diagnostics: envelope.diagnostics,
      liveness: "unverified"
    })),
    guidance: OBSERVED_GUIDANCE
  })
})
