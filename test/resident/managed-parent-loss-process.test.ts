import { execFile } from "node:child_process"
import * as fs from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { promisify } from "node:util"
import { Schema } from "effect"
import { expect, it } from "vitest"

import { buildIsolatedStdioServer, ESBUILD_EXECUTABLE, NATIVE_RUNTIME_EXTERNALS } from "../helpers/stdio-build.js"
import { testStdioEnvironment } from "../helpers/stdio-environment.js"
import { ParentLossObservation } from "./parent-loss-observation.js"

const PROCESS_BOUND = 30_000
const runFile = promisify(execFile)

it.skipIf(process.platform !== "linux")(
  "retires the real detached child when its owned parent dies before Start",
  { timeout: PROCESS_BOUND },
  async () => {
    const bundle = await buildIsolatedStdioServer(PROCESS_BOUND)
    const directory = await fs.mkdtemp(join(await fs.realpath(tmpdir()), "resident-parent-loss-"))
    const fixture = join(dirname(bundle.path), "managed-parent-loss.cjs")
    const preload = join(dirname(bundle.path), "hold-resident-child-entry.mjs")
    let passed = false
    try {
      await runFile(
        ESBUILD_EXECUTABLE,
        [
          "test/resident/fixtures/managed-parent-loss.ts",
          "--bundle",
          "--platform=node",
          "--format=cjs",
          ...NATIVE_RUNTIME_EXTERNALS,
          `--outfile=${fixture}`
        ],
        { timeout: PROCESS_BOUND }
      )
      await runFile(
        ESBUILD_EXECUTABLE,
        [
          "test/resident/fixtures/hold-resident-child-entry.ts",
          "--bundle",
          "--platform=node",
          "--format=esm",
          `--outfile=${preload}`
        ],
        { timeout: PROCESS_BOUND }
      )
      const { stderr, stdout } = await runFile(
        "python3",
        ["test/resident/fixtures/reap-descendants.py", process.execPath, fixture, bundle.path, directory, preload],
        { timeout: PROCESS_BOUND, env: testStdioEnvironment() }
      )
      const observation = Schema.decodeUnknownSync(Schema.fromJsonString(ParentLossObservation))(stdout)
      expect(observation.privateFrames).toBe(0)
      expect(observation.childExited).toBe(true)
      expect(observation.retainedClaim).toBe(true)
      expect(observation.publishedRecords).toBe(0)
      await fs.writeFile(
        `${directory}.receipt.json`,
        Schema.encodeSync(Schema.fromJsonString(ParentLossObservation))(observation),
        { flag: "wx", mode: 0o600 }
      )
      await fs.writeFile(`${directory}.phases.log`, stderr, { flag: "wx", mode: 0o600 })
      passed = true
    } finally {
      if (passed) {
        await bundle.cleanup()
        await fs.rm(directory, { recursive: true })
      }
    }
  }
)
