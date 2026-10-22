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
  "effect@4.0.0_patch_hash=8f77f9bbb337b5fb1f625e1a77aea5eb46cc094c1adb5fe9e657a6b053ec9e7b/node_modules/effect/dist/Effect.js"

describe("packed artifact certification", () => {
  it.each([
    { launcherMode: 0o755, nativeMode: 0o755, launcherVersion: "1.2.3", applicationVersion: "1.2.3", error: undefined },
    {
      launcherMode: 0o644,
      nativeMode: 0o755,
      launcherVersion: "1.2.3",
      applicationVersion: "1.2.3",
      error: "launcher must have exact mode"
    },
    {
      launcherMode: 0o755,
      nativeMode: 0o644,
      launcherVersion: "1.2.3",
      applicationVersion: "1.2.3",
      error: "native bridges must have exact mode"
    },
    {
      launcherMode: 0o755,
      nativeMode: 0o755,
      launcherVersion: "9.9.9",
      applicationVersion: "1.2.3",
      error: "versions must match"
    },
    {
      launcherMode: 0o755,
      nativeMode: 0o755,
      launcherVersion: "1.2.3",
      applicationVersion: "9.9.9",
      error: "versions must match"
    }
  ])("certifies the native closure or refuses its executable/version drift: %j", async (input) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "native-artifact-closure-"))
    const archive = path.join(directory, "package.tgz")
    const entries = [
      { body: JSON.stringify(input.launcherVersion), mode: input.launcherMode, name: "package/dist/index.cjs" },
      {
        body: `require("ws"); const version = ${JSON.stringify(input.applicationVersion)}; const cohort = "${validEffectCohortMarker}"`,
        mode: 0o755,
        name: "package/dist/application.cjs"
      },
      { body: "native executable", mode: input.nativeMode, name: "package/dist/native/huly-stdio-linux-x64" },
      { body: manifest(), mode: 0o644, name: "package/package.json" }
    ]
    try {
      await writeArchiveEntries(archive, entries)
      const certification = certifyPackedArtifact(archive, {
        ...expectedArtifact,
        runtimeEntry: "package/dist/application.cjs",
        expectedEntries: entries.map((entry) => entry.name)
      })
      if (input.error === undefined)
        await expect(certification).resolves.toMatchObject({ entryCount: 4, executableMode: 0o755, version: "1.2.3" })
      else await expect(certification).rejects.toThrow(input.error)
    } finally {
      await fs.rm(directory, { force: true, recursive: true })
    }
  })

  it("includes lazy native imports in the exact external dependency closure", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "native-artifact-certification-"))
    const archive = path.join(directory, "package.tgz")
    try {
      await writeArchive(
        archive,
        0o755,
        `require("ws"); import("dbus-next"); import("@napi-rs/keyring"); const cohort = "${validEffectCohortMarker}"`
      )
      await expect(certifyPackedArtifact(archive, expectedArtifact)).rejects.toThrow(
        "Unexpected packed external modules"
      )
      await expect(
        certifyPackedArtifact(archive, {
          ...expectedArtifact,
          expectedExternalModules: ["@napi-rs/keyring", "dbus-next", "ws"]
        })
      ).resolves.toMatchObject({ externalModules: ["@napi-rs/keyring", "dbus-next", "ws"] })
    } finally {
      await fs.rm(directory, { force: true, recursive: true })
    }
  })
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

  it.each([
    'require("effect/Effect"); const cohort = "effect@3.19.13"',
    'require("ws"); const cohort = "effect@4.0.0_patch_hash=583f1592041bd3cbff9dfc3f99b63c6f3a33410e4b22579e7d774074645a5755/node_modules/effect/dist/Effect.js"',
    'require("ws"); const cohort = "effect@4.0.0/node_modules/effect/dist/Effect.js"'
  ])("rejects an unresolved, stale-patched or unpatched Effect composition: %s", async (bundle) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "packed-artifact-certification-"))
    const archive = path.join(directory, "package.tgz")
    try {
      await writeArchive(archive, 0o755, bundle)
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
        `${validMarker} const other = "effect@4.0.00/node_modules/effect/dist/Effect.js"; require("ws");`
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
