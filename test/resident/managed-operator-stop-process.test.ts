import { execFile } from "node:child_process"
import * as fs from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { promisify } from "node:util"
import { Schema } from "effect"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { buildIsolatedStdioServer, ESBUILD_EXECUTABLE, NATIVE_RUNTIME_EXTERNALS } from "../helpers/stdio-build.js"
import { testStdioEnvironment } from "../helpers/stdio-environment.js"
import { ManagedStopObservation } from "./managed-stop-observation.js"

const PROCESS_BOUND = 30_000
const runFile = promisify(execFile)
describe.skipIf(process.platform !== "linux")("packaged managed operator stop", () => {
  let bundle: Awaited<ReturnType<typeof buildIsolatedStdioServer>>
  let root: string
  let cli: string
  let host: string
  let fixture: string
  let passed = false
  beforeAll(async () => {
    bundle = await buildIsolatedStdioServer(PROCESS_BOUND)
    root = await fs.mkdtemp(join(await fs.realpath(tmpdir()), "resident-managed-stop-"))
    const workspace = dirname(bundle.path)
    cli = join(workspace, "huly-cli.cjs")
    host = join(workspace, "managed-native-host.cjs")
    fixture = join(workspace, "managed-operator-stop.cjs")
    await runFile("pnpm", ["--filter", "@firfi/huly-cli", "build", `--outfile=${cli}`], { timeout: PROCESS_BOUND })
    for (const [source, output] of [
      ["managed-native-host", host],
      ["managed-operator-stop", fixture]
    ])
      await runFile(
        ESBUILD_EXECUTABLE,
        [
          `test/resident/fixtures/${source}.ts`,
          "--bundle",
          "--platform=node",
          "--format=cjs",
          ...NATIVE_RUNTIME_EXTERNALS,
          `--outfile=${output}`
        ],
        { timeout: PROCESS_BOUND }
      )
  }, PROCESS_BOUND)
  afterAll(async () => {
    if (passed) {
      await bundle.cleanup()
      await fs.rmdir(root)
    }
  })
  it(
    "stops an attached generation, preserves another configuration and replaces after actual owned exit",
    { timeout: PROCESS_BOUND },
    async () => {
      const result = await runFile(
        "python3",
        [
          "test/resident/fixtures/reap-descendants.py",
          "--report-reaped",
          process.execPath,
          fixture,
          bundle.path,
          cli,
          host,
          root
        ],
        { timeout: PROCESS_BOUND, env: testStdioEnvironment() }
      )
      await fs.writeFile(`${root}.phases.log`, result.stderr, { mode: 0o600, flag: "wx" })
      const receipt = Schema.decodeUnknownSync(Schema.fromJsonString(ManagedStopObservation))(result.stdout)
      expect(
        new Set([receipt.originalGeneration, receipt.replacementGeneration, receipt.unrelatedGeneration]).size
      ).toBe(3)
      expect([receipt.originalExit.exitCode, receipt.replacementExit.exitCode, receipt.unrelatedExit.exitCode]).toEqual(
        [0, 0, 0]
      )
      expect(
        new Set([receipt.originalExit.processId, receipt.replacementExit.processId, receipt.unrelatedExit.processId])
          .size
      ).toBe(3)
      expect(receipt.unrelatedRecordUnchanged).toBe(true)
      expect(receipt.liveStatuses.map((status) => status.work.attachments)).toEqual([2, 1])
      expect(receipt.liveStatuses.every((status) => status.generation === receipt.originalGeneration)).toBe(true)
      expect(new Set(receipt.replacementCallers.map((caller) => caller.adapterPid)).size).toBe(2)
      expect(new Set(receipt.replacementCallers.map((caller) => caller.parentPid)).size).toBe(2)
      expect(receipt.privateStateRemoved).toBe(true)
      await fs.writeFile(
        `${root}.receipt.json`,
        Schema.encodeSync(Schema.fromJsonString(ManagedStopObservation))(receipt),
        { mode: 0o600, flag: "wx" }
      )
      passed = true
    }
  )
})
