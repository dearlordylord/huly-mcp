import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { createWriteStream } from "node:fs"
import { createGzip } from "node:zlib"

import { Schema } from "effect"
import * as tar from "tar-stream"
import { describe, expect, it } from "vitest"

import {
  certifyPackedArtifact,
  packedArtifactEvidenceMismatchError,
  PackedArtifactCertificationSchema
} from "../../scripts/package-artifact-certification.js"

interface TestArchiveEntry {
  readonly body: string
  readonly mode: number
  readonly name: string
}

const manifest = (overrides: Readonly<Record<string, unknown>> = {}): string =>
  JSON.stringify({
    bin: { "huly-mcp": "./dist/index.cjs" },
    dependencies: { ws: "1.0.0" },
    engines: { node: ">=22.19.0" },
    main: "./dist/index.cjs",
    name: "@firfi/huly-mcp",
    version: "1.2.3",
    ...overrides
  })

const writeArchiveEntries = async (archive: string, entries: ReadonlyArray<TestArchiveEntry>): Promise<void> => {
  const pack = tar.pack()
  const output = createWriteStream(archive)
  const finished = new Promise<void>((resolve, reject) => {
    output.on("close", resolve)
    output.on("error", reject)
  })
  pack.pipe(createGzip()).pipe(output)
  for (const entry of entries) pack.entry({ mode: entry.mode, name: entry.name }, entry.body)
  pack.finalize()
  await finished
}

const writeArchive = async (archive: string, bundleMode: number, bundle: string): Promise<void> =>
  writeArchiveEntries(archive, [
    { body: bundle, mode: bundleMode, name: "package/dist/index.cjs" },
    { body: manifest(), mode: 0o644, name: "package/package.json" }
  ])

const expectedArtifact = {
  binName: "huly-mcp",
  expectedEntries: ["package/dist/index.cjs", "package/package.json"],
  expectedExternalModules: ["ws"],
  name: "@firfi/huly-mcp",
  version: "1.2.3"
}

const validEffectCohortMarker =
  "effect@4.0.0-rc.117_patch_hash=48dd300ad8ca97ea41839a226dc716242015feab66fd050c1032725451ea8a06/node_modules/effect/dist/Effect.js"

describe("packed artifact certification", () => {
  it("reports both expected and actual certificates when evidence is stale", () => {
    const parseCertification = Schema.decodeUnknownSync(PackedArtifactCertificationSchema)
    const expected = parseCertification({
      archiveBytes: 100,
      bundleBytes: 200,
      bundleGzipBytes: 150,
      entryCount: 4,
      executableMode: 0o755,
      externalModules: ["ws"],
      name: "@firfi/huly-mcp",
      unpackedBytes: 300,
      version: "1.2.3"
    })
    const actual = parseCertification({ ...expected, archiveBytes: 101, bundleBytes: 201 })

    expect(packedArtifactEvidenceMismatchError(expected, actual).message).toBe(
      "Packed MCP artifact evidence is stale; run certify-packed-artifact with --write." +
        `\nExpected: ${JSON.stringify(expected)}` +
        `\nActual: ${JSON.stringify(actual)}`
    )
  })

  it("certifies executable bundle, manifest, closure, and Effect 4 composition", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "packed-artifact-certification-"))
    const archive = path.join(directory, "package.tgz")
    try {
      await writeArchive(archive, 0o755, `require("ws"); const cohort = "${validEffectCohortMarker}"`)
      await expect(certifyPackedArtifact(archive, expectedArtifact)).resolves.toMatchObject({
        executableMode: 0o755,
        externalModules: ["ws"],
        name: "@firfi/huly-mcp"
      })
    } finally {
      await fs.rm(directory, { force: true, recursive: true })
    }
  })

  it("rejects an unresolved or unexpected Effect composition", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "packed-artifact-certification-"))
    const archive = path.join(directory, "package.tgz")
    try {
      await writeArchive(archive, 0o755, 'require("effect/Effect"); const cohort = "effect@3.19.13"')
      await expect(certifyPackedArtifact(archive, expectedArtifact)).rejects.toThrow(/certified patched Effect/u)
    } finally {
      await fs.rm(directory, { force: true, recursive: true })
    }
  })

  it("rejects a non-executable bundle", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "packed-artifact-certification-"))
    const archive = path.join(directory, "package.tgz")
    try {
      await writeArchive(archive, 0o644, `require("ws"); const cohort = "${validEffectCohortMarker}"`)
      await expect(certifyPackedArtifact(archive, expectedArtifact)).rejects.toThrow(/exact mode/u)
    } finally {
      await fs.rm(directory, { force: true, recursive: true })
    }
  })

  it("rejects missing required entries and unexpected file closure", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "packed-artifact-certification-"))
    const archive = path.join(directory, "package.tgz")
    try {
      await writeArchiveEntries(archive, [{ body: manifest(), mode: 0o644, name: "package/package.json" }])
      await expect(certifyPackedArtifact(archive, expectedArtifact)).rejects.toThrow(/must contain/u)

      await writeArchiveEntries(archive, [
        {
          body: `require("ws"); const cohort = "${validEffectCohortMarker}"`,
          mode: 0o755,
          name: "package/dist/index.cjs"
        },
        { body: manifest(), mode: 0o644, name: "package/package.json" },
        { body: "unexpected", mode: 0o644, name: "package/unexpected.txt" }
      ])
      await expect(certifyPackedArtifact(archive, expectedArtifact)).rejects.toThrow(/file closure/u)
    } finally {
      await fs.rm(directory, { force: true, recursive: true })
    }
  })

  it("rejects manifest identity, cohort-prefix, and external-module drift independently", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "packed-artifact-certification-"))
    const archive = path.join(directory, "package.tgz")
    const validMarker = `const cohort = "${validEffectCohortMarker}";`
    try {
      await writeArchiveEntries(archive, [
        { body: `${validMarker} require("ws");`, mode: 0o755, name: "package/dist/index.cjs" },
        { body: manifest({ version: "9.9.9" }), mode: 0o644, name: "package/package.json" }
      ])
      await expect(certifyPackedArtifact(archive, expectedArtifact)).rejects.toThrow(/manifest does not match/u)

      await writeArchive(
        archive,
        0o755,
        `${validMarker} const other = "effect@4.0.0-rc.1170/node_modules/effect/dist/Effect.js"; require("ws");`
      )
      await expect(certifyPackedArtifact(archive, expectedArtifact)).rejects.toThrow(/unexpected Effect dependency/u)

      await writeArchive(archive, 0o755, `${validMarker} require("ws"); require("unexpected-runtime");`)
      await expect(certifyPackedArtifact(archive, expectedArtifact)).rejects.toThrow(/external modules/u)
    } finally {
      await fs.rm(directory, { force: true, recursive: true })
    }
  })

  it("certifies a self-contained bundle without external modules", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "packed-artifact-certification-"))
    const archive = path.join(directory, "package.tgz")
    try {
      await writeArchive(archive, 0o755, `const cohort = "${validEffectCohortMarker}";`)
      await expect(
        certifyPackedArtifact(archive, { ...expectedArtifact, expectedExternalModules: [] })
      ).resolves.toMatchObject({ externalModules: [] })
      await expect(certifyPackedArtifact(archive, expectedArtifact)).rejects.toThrow(/external modules: none/u)
    } finally {
      await fs.rm(directory, { force: true, recursive: true })
    }
  })
})
