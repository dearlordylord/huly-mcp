import { execFile } from "node:child_process"
import * as fs from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { promisify } from "node:util"
import { Schema } from "effect"
import { expect, it } from "vitest"

import { buildIsolatedStdioServer, ESBUILD_EXECUTABLE, NATIVE_RUNTIME_EXTERNALS } from "../helpers/stdio-build.js"
import { testStdioEnvironment } from "../helpers/stdio-environment.js"
import { ManagedExpiryObservation } from "./managed-expiry-observation.js"

const BUILD_BOUND = 30_000
const EXPIRY_PROCESS_BOUND = 50_000
const TEST_BOUND = BUILD_BOUND + EXPIRY_PROCESS_BOUND
const ProcessFailure = Schema.Struct({ stderr: Schema.String })
const runFile = promisify(execFile)

it.skipIf(process.platform !== "linux")(
  "retires the managed backend after its last admitted adapter is killed and its lease expires",
  { timeout: TEST_BOUND },
  async () => {
    const bundle = await buildIsolatedStdioServer(BUILD_BOUND)
    const root = await fs.mkdtemp(join(await fs.realpath(tmpdir()), "resident-last-adapter-expiry-"))
    const fixture = join(dirname(bundle.path), "managed-last-adapter-expiry.cjs")
    let passed = false
    try {
      await runFile(
        ESBUILD_EXECUTABLE,
        [
          "test/resident/fixtures/managed-last-adapter-expiry.ts",
          "--bundle",
          "--platform=node",
          "--format=cjs",
          ...NATIVE_RUNTIME_EXTERNALS,
          `--outfile=${fixture}`
        ],
        { timeout: BUILD_BOUND }
      )
      const { stderr, stdout } = await runFile(
        "python3",
        [
          "test/resident/fixtures/reap-descendants.py",
          "--lease-expiry",
          "--report-reaped",
          process.execPath,
          fixture,
          bundle.path,
          root
        ],
        { timeout: EXPIRY_PROCESS_BOUND, env: testStdioEnvironment() }
      ).catch(async (error: unknown) => {
        if (Schema.is(ProcessFailure)(error))
          await fs.writeFile(`${root}.phases.log`, error.stderr, { mode: 0o600, flag: "wx" }).catch(() => {
            process.stderr.write("Managed expiry failure phases could not be saved\n")
          })
        throw error
      })
      await fs.writeFile(`${root}.phases.log`, stderr, { mode: 0o600, flag: "wx" })
      const observation = Schema.decodeUnknownSync(Schema.fromJsonString(ManagedExpiryObservation))(stdout)
      expect(observation.backendExit.exitCode).toBe(0)
      expect(observation.adapterExitSignal).toBe("SIGKILL")
      expect(await fs.readdir(root)).toEqual([])
      await fs.writeFile(
        `${root}.receipt.json`,
        Schema.encodeSync(Schema.fromJsonString(ManagedExpiryObservation))(observation),
        { mode: 0o600, flag: "wx" }
      )
      passed = true
    } finally {
      if (passed) {
        await bundle.cleanup()
        await fs.rmdir(root)
      }
    }
  }
)
