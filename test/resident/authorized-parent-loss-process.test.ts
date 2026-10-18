import { execFile } from "node:child_process"
import * as fs from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { promisify } from "node:util"
import { Schema } from "effect"
import { expect, it } from "vitest"

import { buildIsolatedStdioServer } from "../helpers/stdio-build.js"
import { testStdioEnvironment } from "../helpers/stdio-environment.js"
import { AuthorizedParentLossObservation } from "./authorized-parent-loss-contract.js"

const BUILD_BOUND = 30_000
const PROCESS_BOUND = 25_000
const runFile = promisify(execFile)
const FixtureFailure = Schema.Struct({ stderr: Schema.String })

it.skipIf(process.platform !== "linux")(
  "preserves authorized startup after parent loss before ownership claim and publication",
  { timeout: BUILD_BOUND },
  async () => {
    const bundle = await buildIsolatedStdioServer(BUILD_BOUND)
    const directory = await fs.mkdtemp(join(await fs.realpath(tmpdir()), "resident-authorized-parent-loss-"))
    const fixture = join(dirname(bundle.path), "authorized-parent-loss.cjs")
    const parent = join(dirname(bundle.path), "authorized-launch-parent.cjs")
    const child = join(dirname(bundle.path), "authorized-launch-child.cjs")
    const version = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Struct({ version: Schema.NonEmptyString })))(
      await fs.readFile("package.json", "utf8")
    ).version
    let passed = false
    try {
      for (const [source, output] of [
        ["authorized-parent-loss", fixture],
        ["authorized-launch-child", child],
        ["authorized-launch-parent", parent]
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
          process.execPath,
          fixture,
          parent,
          child,
          directory
        ],
        { timeout: PROCESS_BOUND, env: testStdioEnvironment() }
      ).catch(async (error: unknown) => {
        if (Schema.is(FixtureFailure)(error))
          await fs.writeFile(`${directory}.phases.log`, error.stderr, { flag: "wx", mode: 0o600 }).catch(() => {
            process.stderr.write("Authorized parent loss failure phases could not be saved\n")
          })
        throw error
      })
      await fs.writeFile(`${directory}.phases.log`, result.stderr, { flag: "wx", mode: 0o600 })
      const receipt = Schema.decodeUnknownSync(Schema.fromJsonString(AuthorizedParentLossObservation))(result.stdout)
      expect(receipt.parentExitSignal).toBe("SIGKILL")
      expect(receipt.privateFrames).toBe(1)
      expect(receipt.childExit).toEqual({ processId: receipt.childPid, exitCode: 0 })
      expect(receipt.privateStateRemoved).toBe(true)
      expect(await fs.readdir(join(directory, "state"))).toEqual([])
      await fs.writeFile(
        `${directory}.receipt.json`,
        Schema.encodeSync(Schema.fromJsonString(AuthorizedParentLossObservation))(receipt),
        { flag: "wx", mode: 0o600 }
      )
      passed = true
    } finally {
      if (passed) {
        await bundle.cleanup()
        await fs.rm(directory, { recursive: true })
      }
    }
  }
)
