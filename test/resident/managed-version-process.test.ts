import { execFile } from "node:child_process"
import * as fs from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { promisify } from "node:util"
import { Schema } from "effect"
import { expect, it } from "vitest"

import { MANAGED_PACKAGE_NAME } from "../../src/resident/managed-contract.js"
import { buildIsolatedStdioServer, ESBUILD_EXECUTABLE, NATIVE_RUNTIME_EXTERNALS } from "../helpers/stdio-build.js"
import { testStdioEnvironment } from "../helpers/stdio-environment.js"
import { VersionCoexistenceObservation } from "./version-coexistence-observation.js"

const PROCESS_BOUND = 30_000
const runFile = promisify(execFile)
const InstalledPackage = Schema.Struct({
  name: Schema.Literal(MANAGED_PACKAGE_NAME),
  version: Schema.NonEmptyString,
  main: Schema.Literal("./dist/index.cjs")
})

it.skipIf(process.platform !== "linux")(
  "keeps two installed implementation versions independent through discovery and retirement",
  { timeout: PROCESS_BOUND },
  async () => {
    const installedPackage = Schema.decodeUnknownSync(Schema.fromJsonString(InstalledPackage))(
      await fs.readFile("package.json", "utf8")
    )
    const versions = [installedPackage.version, `${installedPackage.version}-coexistence.1`]
    const bundle = await buildIsolatedStdioServer(PROCESS_BOUND)
    const workspace = dirname(bundle.path)
    const root = await fs.mkdtemp(join(await fs.realpath(tmpdir()), "resident-version-coexistence-"))
    let passed = false
    try {
      const installations = await Promise.all(
        versions.map(async (version) => {
          const directory = join(workspace, version, "node_modules", "@firfi", "huly-mcp")
          await fs.mkdir(join(directory, "dist"), { recursive: true })
          await fs.writeFile(
            join(directory, "package.json"),
            Schema.encodeSync(Schema.fromJsonString(InstalledPackage))({
              name: MANAGED_PACKAGE_NAME,
              version,
              main: "./dist/index.cjs"
            })
          )
          return { path: join(directory, "dist", "index.cjs"), version }
        })
      )
      // The isolated bundle already prepared native assets and catalog verification for both layouts.
      await Promise.all(
        installations.map((installation) =>
          runFile(
            process.execPath,
            [
              "scripts/build-mcp.mjs",
              `--outfile=${installation.path}`,
              `--define:PKG_VERSION=${JSON.stringify(installation.version)}`
            ],
            { timeout: PROCESS_BOUND }
          )
        )
      )
      const host = join(workspace, "managed-native-host.cjs")
      const fixture = join(workspace, "managed-version-coexistence.cjs")
      for (const [source, destination] of [
        ["managed-native-host", host],
        ["managed-version-coexistence", fixture]
      ])
        await runFile(
          ESBUILD_EXECUTABLE,
          [
            `test/resident/fixtures/${source}.ts`,
            "--bundle",
            "--platform=node",
            "--format=cjs",
            ...NATIVE_RUNTIME_EXTERNALS,
            `--outfile=${destination}`
          ],
          { timeout: PROCESS_BOUND }
        )
      const first = installations[0]
      const second = installations[1]
      if (first === undefined || second === undefined) throw new Error("Missing version installation")
      const { stderr, stdout } = await runFile(
        "python3",
        [
          "test/resident/fixtures/reap-descendants.py",
          "--report-reaped",
          process.execPath,
          fixture,
          first.path,
          second.path,
          host,
          root
        ],
        { timeout: PROCESS_BOUND, env: testStdioEnvironment() }
      )
      const receipt = Schema.decodeUnknownSync(Schema.fromJsonString(VersionCoexistenceObservation))(stdout)
      expect(receipt.implementations.map((item) => item.version).sort()).toEqual([...versions].sort())
      expect(new Set(receipt.generations).size).toBe(2)
      expect(new Set(receipt.artifacts.map((artifact) => artifact.sha256)).size).toBe(2)
      expect(new Set(receipt.parents.map((item) => item.parentPid)).size).toBe(2)
      expect(receipt.survivorRecordUnchanged).toBe(true)
      expect(receipt.backendExits).toHaveLength(versions.length)
      expect(new Set(receipt.backendExits.map((item) => item.processId)).size).toBe(versions.length)
      for (const exited of receipt.backendExits) expect(exited.exitCode).toBe(0)
      expect(receipt.privateStateRemoved).toBe(true)
      await fs.writeFile(
        `${root}.receipt.json`,
        Schema.encodeSync(Schema.fromJsonString(VersionCoexistenceObservation))(receipt),
        { mode: 0o600, flag: "wx" }
      )
      await fs.writeFile(`${root}.phases.log`, stderr, { mode: 0o600, flag: "wx" })
      passed = true
    } finally {
      if (passed) {
        await bundle.cleanup()
        await fs.rmdir(root)
      }
    }
  }
)
