import { execFile } from "node:child_process"
import * as fs from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { promisify } from "node:util"
import { Schema } from "effect"
import { expect, it } from "vitest"

import { buildIsolatedStdioServer, NATIVE_RUNTIME_EXTERNALS } from "../helpers/stdio-build.js"
import { testStdioEnvironment } from "../helpers/stdio-environment.js"
import { IdleFenceObservation } from "./idle-fence-observation.js"

const BUILD_BOUND = 30_000
const PROCESS_BOUND = 25_000
const runFile = promisify(execFile)
const FixtureFailure = Schema.Struct({ stderr: Schema.String })

it.skipIf(process.platform !== "linux")(
  "refuses a fresh adapter after idle fencing then permits fresh startup after confirmed cleanup",
  { timeout: BUILD_BOUND },
  async () => {
    const bundle = await buildIsolatedStdioServer(BUILD_BOUND)
    const directory = await fs.mkdtemp(join(await fs.realpath(tmpdir()), "resident-idle-fence-"))
    const fixture = join(dirname(bundle.path), "managed-idle-fence.cjs")
    const host = join(dirname(bundle.path), "managed-native-host.cjs")
    const backend = join(dirname(bundle.path), "managed-idle-fence-backend.cjs")
    const version = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Struct({ version: Schema.NonEmptyString })))(
      await fs.readFile("package.json", "utf8")
    ).version
    let passed = false
    try {
      for (const [source, output] of [
        ["managed-idle-fence", fixture],
        ["managed-idle-fence-backend", backend],
        ["managed-native-host", host]
      ])
        await runFile(
          "pnpm",
          [
            "exec",
            "esbuild",
            `test/resident/fixtures/${source}.ts`,
            "--bundle",
            "--platform=node",
            "--format=cjs",
            ...NATIVE_RUNTIME_EXTERNALS,
            `--define:PKG_VERSION=${JSON.stringify(version)}`,
            `--outfile=${output}`
          ],
          { timeout: BUILD_BOUND }
        )
      const result = await runFile(
        "python3",
        [
          "test/resident/fixtures/reap-descendants.py",
          "--report-reaped",
          "--report-reaped",
          process.execPath,
          fixture,
          bundle.path,
          host,
          backend,
          directory
        ],
        { timeout: PROCESS_BOUND, env: testStdioEnvironment() }
      ).catch(async (error: unknown) => {
        if (Schema.is(FixtureFailure)(error))
          await fs.writeFile(`${directory}.phases.log`, error.stderr, { flag: "wx", mode: 0o600 }).catch(() => {
            process.stderr.write("Managed idle fence failure phases could not be saved\n")
          })
        throw error
      })
      await fs.writeFile(`${directory}.phases.log`, result.stderr, { flag: "wx", mode: 0o600 })
      const receipt = Schema.decodeUnknownSync(Schema.fromJsonString(IdleFenceObservation))(result.stdout)
      expect(receipt.refusedExitCode).toBe(1)
      expect(receipt.originalBackendExitCode).toBe(0)
      expect(receipt.replacement.contextIsError).toBe(false)
      expect(receipt.replacementGeneration).not.toBe(receipt.retiredGeneration)
      expect(receipt.replacementExit.exitCode).toBe(0)
      expect(receipt.privateStateRemoved).toBe(true)
      expect(await fs.readdir(directory)).toEqual([])
      await fs.writeFile(
        `${directory}.receipt.json`,
        Schema.encodeSync(Schema.fromJsonString(IdleFenceObservation))(receipt),
        { flag: "wx", mode: 0o600 }
      )
      passed = true
    } finally {
      if (passed) {
        await bundle.cleanup()
        await fs.rmdir(directory)
      }
    }
  }
)
