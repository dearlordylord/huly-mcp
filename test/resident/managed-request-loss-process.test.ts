import { execFile } from "node:child_process"
import * as fs from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { promisify } from "node:util"
import { Schema } from "effect"
import { expect, it } from "vitest"

import { buildIsolatedStdioServer } from "../helpers/stdio-build.js"
import { testStdioEnvironment } from "../helpers/stdio-environment.js"
import { ManagedRequestLossObservation, ManagedRequestLossPoint } from "./managed-request-loss-observation.js"

const PROCESS_BOUND = 30_000
const runFile = promisify(execFile)

it.skipIf(process.platform !== "linux").each(ManagedRequestLossPoint.literals)(
  "keeps managed request outcome uncertainty after backend loss at %s without replay or registry retirement",
  { timeout: PROCESS_BOUND },
  async (point) => {
    const bundle = await buildIsolatedStdioServer(PROCESS_BOUND)
    const root = await fs.mkdtemp(join(await fs.realpath(tmpdir()), "resident-managed-request-loss-"))
    const fixture = join(dirname(bundle.path), "managed-request-loss.cjs")
    let passed = false
    try {
      await runFile(
        "pnpm",
        [
          "exec",
          "esbuild",
          "test/resident/fixtures/managed-request-loss.ts",
          "--bundle",
          "--platform=node",
          "--format=cjs",
          `--outfile=${fixture}`
        ],
        { timeout: PROCESS_BOUND }
      )
      const { stderr, stdout } = await runFile(
        "python3",
        ["test/resident/fixtures/reap-descendants.py", process.execPath, fixture, bundle.path, root, point],
        { timeout: PROCESS_BOUND, env: testStdioEnvironment() }
      )
      const receipt = Schema.decodeUnknownSync(Schema.fromJsonString(ManagedRequestLossObservation))(stdout)
      await fs.writeFile(
        `${root}.receipt.json`,
        Schema.encodeSync(Schema.fromJsonString(ManagedRequestLossObservation))(receipt),
        { mode: 0o600, flag: "wx" }
      )
      await fs.writeFile(`${root}.phases.log`, stderr, { mode: 0o600, flag: "wx" })
      expect(receipt.point).toBe(point)
      expect(receipt.modelRequests).toBe(1)
      expect(receipt.queryDispatches).toBe(point === "model" ? 0 : 1)
      expect(receipt.replacementExitCode).toBe(1)
      expect(receipt.replacementStdoutBytes).toBe(0)
      expect(receipt.registryRetained).toBe(true)
      expect(receipt.unknownOutcome).toBe(true)
      passed = true
    } finally {
      if (passed) {
        await bundle.cleanup()
        await fs.rm(root, { recursive: true })
      }
    }
  }
)
