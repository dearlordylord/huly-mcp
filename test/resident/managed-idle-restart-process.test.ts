import { execFile } from "node:child_process"
import * as fs from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { promisify } from "node:util"
import { Schema } from "effect"
import { expect, it } from "vitest"

import { buildIsolatedStdioServer } from "../helpers/stdio-build.js"
import { testStdioEnvironment } from "../helpers/stdio-environment.js"
import { IdleRestartObservation } from "./idle-restart-observation.js"

const BUILD_BOUND = 30_000
const PROCESS_BOUND = 25_000
const runFile = promisify(execFile)
const FixtureFailure = Schema.Struct({ stderr: Schema.String })

it.skipIf(process.platform !== "linux")(
  "starts a fresh packaged generation after the previous parent's managed backend retires from idle",
  { timeout: BUILD_BOUND },
  async () => {
    const bundle = await buildIsolatedStdioServer(BUILD_BOUND)
    const directory = await fs.mkdtemp(join(await fs.realpath(tmpdir()), "resident-idle-restart-"))
    const fixture = join(dirname(bundle.path), "managed-idle-restart.cjs")
    const host = join(dirname(bundle.path), "managed-native-host.cjs")
    let passed = false
    try {
      for (const [source, output] of [
        ["managed-idle-restart", fixture],
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
            `--outfile=${output}`
          ],
          { timeout: BUILD_BOUND }
        )
      const result = await runFile(
        "python3",
        [
          "test/resident/fixtures/reap-descendants.py",
          "--report-reaped",
          process.execPath,
          fixture,
          bundle.path,
          host,
          directory
        ],
        { timeout: PROCESS_BOUND, env: testStdioEnvironment() }
      ).catch(async (error: unknown) => {
        if (Schema.is(FixtureFailure)(error))
          await fs.writeFile(`${directory}.phases.log`, error.stderr, { flag: "wx", mode: 0o600 }).catch(() => {
            process.stderr.write("Managed idle restart failure phases could not be saved\n")
          })
        throw error
      })
      await fs.writeFile(`${directory}.phases.log`, result.stderr, { flag: "wx", mode: 0o600 })
      const receipt = Schema.decodeUnknownSync(Schema.fromJsonString(IdleRestartObservation))(result.stdout)
      expect(new Set(receipt.cycles.map((item) => item.generation)).size).toBe(receipt.cycles.length)
      expect(receipt.cycles.map((item) => item.backendExit.exitCode)).toEqual([0, 0])
      expect(receipt.privateStateRemoved).toBe(true)
      expect(await fs.readdir(directory)).toEqual([])
      await fs.writeFile(
        `${directory}.receipt.json`,
        Schema.encodeSync(Schema.fromJsonString(IdleRestartObservation))(receipt),
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
