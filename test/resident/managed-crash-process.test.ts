import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import * as fs from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { promisify } from "node:util"
import { Schema } from "effect"
import { expect, it } from "vitest"

import { buildIsolatedStdioServer, ESBUILD_EXECUTABLE, NATIVE_RUNTIME_EXTERNALS } from "../helpers/stdio-build.js"
import { testStdioEnvironment } from "../helpers/stdio-environment.js"
import { CrashRefusalObservation } from "./crash-refusal-observation.js"

const PROCESS_BOUND = 30_000
const runFile = promisify(execFile)

it.skipIf(process.platform !== "linux")(
  "preserves crash uncertainty and refuses stale, foreign or corrupt ownership without takeover",
  { timeout: PROCESS_BOUND },
  async () => {
    const bundle = await buildIsolatedStdioServer(PROCESS_BOUND)
    const root = await fs.mkdtemp(join(await fs.realpath(tmpdir()), "resident-crash-refusal-"))
    const fixture = join(dirname(bundle.path), "managed-crash-refusal.cjs")
    let passed = false
    try {
      await runFile(
        ESBUILD_EXECUTABLE,
        [
          "test/resident/fixtures/managed-crash-refusal.ts",
          "--bundle",
          "--platform=node",
          "--format=cjs",
          ...NATIVE_RUNTIME_EXTERNALS,
          `--outfile=${fixture}`
        ],
        { timeout: PROCESS_BOUND }
      )
      const { stderr, stdout } = await runFile(
        "python3",
        ["test/resident/fixtures/reap-descendants.py", process.execPath, fixture, bundle.path, root],
        { timeout: PROCESS_BOUND, env: testStdioEnvironment() }
      )
      const receipt = Schema.decodeUnknownSync(Schema.fromJsonString(CrashRefusalObservation))(stdout)
      expect(receipt.artifacts).toEqual({
        mcpSha256: createHash("sha256")
          .update(await fs.readFile(bundle.path))
          .digest("hex"),
        fixtureSha256: createHash("sha256")
          .update(await fs.readFile(fixture))
          .digest("hex")
      })
      expect(receipt.backendChildrenBeforeKill).toBe(0)
      expect(receipt.recoveringExitCodes).toEqual([1, 1, 1, 1])
      expect(receipt.originalRecordRetained).toBe(true)
      expect(receipt.foreignListenerSurvived).toBe(true)
      expect(receipt.reusedDiagnosticPid).not.toBe(receipt.backendPid)
      expect(receipt.reusedPidRecordRetained).toBe(true)
      expect(receipt.unrelatedPidSurvived).toBe(true)
      expect(receipt.corruptRecordRetained).toBe(true)
      expect(receipt.credentialDisclosure).toBe(false)
      expect(receipt.stdoutBytes).toBe(0)
      await fs.writeFile(
        `${root}.receipt.json`,
        Schema.encodeSync(Schema.fromJsonString(CrashRefusalObservation))(receipt),
        { mode: 0o600, flag: "wx" }
      )
      await fs.writeFile(`${root}.phases.log`, stderr, { mode: 0o600, flag: "wx" })
      passed = true
    } finally {
      if (passed) {
        await bundle.cleanup()
        await fs.rm(root, { recursive: true })
      }
    }
  }
)
