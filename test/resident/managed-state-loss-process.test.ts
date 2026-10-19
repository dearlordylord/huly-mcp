import { execFile } from "node:child_process"
import * as fs from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { promisify } from "node:util"
import { Schema } from "effect"
import { afterAll, beforeAll, expect, it } from "vitest"

import { buildIsolatedStdioServer, NATIVE_RUNTIME_EXTERNALS } from "../helpers/stdio-build.js"
import { testStdioEnvironment } from "../helpers/stdio-environment.js"
import { StateLossObservation } from "./state-loss-observation.js"

const PROCESS_BOUND = 30_000
const runFile = promisify(execFile)
let bundle: Awaited<ReturnType<typeof buildIsolatedStdioServer>>
let fixture: string
let host: string
let passed = false
beforeAll(async () => {
  if (process.platform !== "linux") return
  bundle = await buildIsolatedStdioServer(PROCESS_BOUND)
  fixture = join(dirname(bundle.path), "managed-state-loss.cjs")
  host = join(dirname(bundle.path), "managed-native-host.cjs")
  for (const [source, output] of [
    ["managed-state-loss", fixture],
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
        `--outfile=${output}`
      ],
      { timeout: PROCESS_BOUND }
    )
}, PROCESS_BOUND)
afterAll(async () => {
  if (passed) await bundle.cleanup()
})
it.skipIf(process.platform !== "linux")(
  "refuses damaged ownership while an existing caller remains usable",
  { timeout: PROCESS_BOUND },
  async () => {
    const root = await fs.mkdtemp(join(await fs.realpath(tmpdir()), "resident-state-loss-"))
    const result = await runFile(
      "python3",
      [
        "test/resident/fixtures/reap-descendants.py",
        "--report-reaped",
        process.execPath,
        fixture,
        bundle.path,
        host,
        root
      ],
      { timeout: PROCESS_BOUND, env: testStdioEnvironment() }
    )
    await fs.writeFile(`${root}.phases.log`, result.stderr, { mode: 0o600, flag: "wx" })
    const receipt = Schema.decodeUnknownSync(Schema.fromJsonString(StateLossObservation))(result.stdout)
    expect(receipt.backendExit.exitCode).toBe(0)
    expect(receipt.existingCallerRetained).toBe(true)
    expect(receipt.credentialDisclosure).toBe(false)
    expect(receipt.privateStateRemoved).toBe(true)
    expect(await fs.readdir(root)).toEqual([])
    await fs.writeFile(
      `${root}.receipt.json`,
      Schema.encodeSync(Schema.fromJsonString(StateLossObservation))(receipt),
      { mode: 0o600, flag: "wx" }
    )
    await fs.rmdir(root)
    passed = true
  }
)
