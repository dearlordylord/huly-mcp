import { builtinModules } from "node:module"
import { createReadStream } from "node:fs"
import { stat } from "node:fs/promises"
import { createGunzip, gzipSync } from "node:zlib"

import { Schema } from "effect"
import * as tar from "tar-stream"

const SupportedNodeRange = Schema.Literal(">=22.19.0")
const PackageManifestSchema = Schema.Struct({
  bin: Schema.Record(Schema.String, Schema.String),
  dependencies: Schema.Record(Schema.String, Schema.String),
  engines: Schema.Struct({ node: SupportedNodeRange }),
  main: Schema.Literal("./dist/index.cjs"),
  name: Schema.NonEmptyString,
  version: Schema.NonEmptyString
})
const TarHeaderSchema = Schema.Struct({ mode: Schema.Int, name: Schema.NonEmptyString })
const ArtifactByteCount = Schema.Int.pipe(
  Schema.check(Schema.isGreaterThanOrEqualTo(0)),
  Schema.brand("ArtifactByteCount")
)
export const PackedArtifactCertificationSchema = Schema.Struct({
  archiveBytes: ArtifactByteCount,
  bundleBytes: ArtifactByteCount,
  bundleGzipBytes: ArtifactByteCount,
  entryCount: Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0))),
  executableMode: Schema.Int,
  externalModules: Schema.Array(Schema.String),
  name: Schema.NonEmptyString,
  unpackedBytes: ArtifactByteCount,
  version: Schema.NonEmptyString
})

export type PackedArtifactCertification = Schema.Schema.Type<typeof PackedArtifactCertificationSchema>

export const packedArtifactEvidenceMismatchError = (
  expected: PackedArtifactCertification,
  actual: PackedArtifactCertification
): Error =>
  new Error(
    "Packed MCP artifact evidence is stale; run certify-packed-artifact with --write." +
      `\nExpected: ${JSON.stringify(expected)}` +
      `\nActual: ${JSON.stringify(actual)}`
  )

interface ExpectedPackedArtifact {
  readonly binName: string
  readonly expectedEntries: ReadonlyArray<string>
  readonly expectedExternalModules: ReadonlyArray<string>
  readonly name: string
  readonly version: string
}

interface ArchiveEntry {
  readonly body: Buffer
  readonly mode: number
  readonly name: string
}

const executableBits = 0o111
const executableMode = 0o755
const bundlePath = "package/dist/index.cjs"
const manifestPath = "package/package.json"
const parseManifest = Schema.decodeUnknownSync(Schema.fromJsonString(PackageManifestSchema))

const readArchive = (archivePath: string): Promise<ReadonlyArray<ArchiveEntry>> =>
  new Promise((resolve, reject) => {
    const entries: Array<ArchiveEntry> = []
    const extract = tar.extract()
    extract.on("entry", (header, stream, next) => {
      const parsedHeader = Schema.decodeUnknownSync(TarHeaderSchema)(header)
      const chunks: Array<Buffer> = []
      stream.on("data", (chunk) => chunks.push(Schema.decodeUnknownSync(Schema.instanceOf(Buffer))(chunk)))
      stream.on("end", () => {
        entries.push({ body: Buffer.concat(chunks), mode: parsedHeader.mode, name: parsedHeader.name })
        next()
      })
    })
    extract.on("finish", () => resolve(entries))
    extract.on("error", reject)
    createReadStream(archivePath).on("error", reject).pipe(createGunzip()).on("error", reject).pipe(extract)
  })

const externalModules = (bundle: string): ReadonlyArray<string> => {
  const requirePattern = /require\("([^".][^"]*)"\)/gu
  const builtins = new Set([...builtinModules, ...builtinModules.map((name) => `node:${name}`)])
  return [
    ...new Set(
      Array.from(bundle.matchAll(requirePattern), (match) => match[1]).filter(
        (name): name is string => name !== undefined && !name.startsWith("node:") && !builtins.has(name)
      )
    )
  ].sort()
}

const sameStrings = (actual: ReadonlyArray<string>, expected: ReadonlyArray<string>): boolean =>
  actual.length === expected.length && actual.every((value, index) => value === expected[index])

export const certifyPackedArtifact = async (
  archivePath: string,
  expected: ExpectedPackedArtifact
): Promise<PackedArtifactCertification> => {
  const entries = await readArchive(archivePath)
  const bundleEntry = entries.find((entry) => entry.name === bundlePath)
  const manifestEntry = entries.find((entry) => entry.name === manifestPath)
  if (bundleEntry === undefined || manifestEntry === undefined) {
    throw new Error("Packed artifact must contain package.json and dist/index.cjs.")
  }
  const entryNames = entries.map((entry) => entry.name).sort()
  if (!sameStrings(entryNames, [...expected.expectedEntries].sort())) {
    throw new Error(`Unexpected packed file closure: ${entryNames.join(", ")}.`)
  }
  if ((bundleEntry.mode & executableBits) === 0 || bundleEntry.mode !== executableMode) {
    throw new Error("Packed dist/index.cjs must have exact mode 0755.")
  }

  const manifest = parseManifest(manifestEntry.body.toString("utf8"))
  const expectedBin = `./dist/index.cjs`
  if (
    manifest.name !== expected.name ||
    manifest.version !== expected.version ||
    manifest.bin[expected.binName] !== expectedBin
  ) {
    throw new Error(`Packed manifest does not match ${expected.name}@${expected.version}.`)
  }
  const bundle = bundleEntry.body.toString("utf8")
  if (!bundle.includes("effect@4.0.0-rc.108/node_modules/effect/")) {
    throw new Error("Packed bundle does not contain the certified Effect 4.0.0-rc.108 cohort marker.")
  }
  if (/effect@(?!4\.0\.0-rc\.108(?:\/|_))[0-9]|require\("effect\//u.test(bundle)) {
    throw new Error("Packed bundle contains an unresolved Effect 3 dependency or import.")
  }
  const external = externalModules(bundle)
  if (!sameStrings(external, [...expected.expectedExternalModules].sort())) {
    throw new Error(`Unexpected packed external modules: ${external.join(", ") || "none"}.`)
  }

  return Schema.decodeUnknownSync(PackedArtifactCertificationSchema)({
    archiveBytes: (await stat(archivePath)).size,
    bundleBytes: bundleEntry.body.length,
    bundleGzipBytes: gzipSync(bundleEntry.body).length,
    entryCount: entries.length,
    executableMode: bundleEntry.mode,
    externalModules: external,
    name: manifest.name,
    unpackedBytes: entries.reduce((total, entry) => total + entry.body.length, 0),
    version: manifest.version
  })
}
