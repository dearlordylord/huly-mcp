import { execFile } from "node:child_process"
import * as fs from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { promisify } from "node:util"
import { Schema } from "effect"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { buildIsolatedStdioServer, ESBUILD_EXECUTABLE, NATIVE_RUNTIME_EXTERNALS } from "../helpers/stdio-build.js"
import { testStdioEnvironment } from "../helpers/stdio-environment.js"
import { StopFaultObservation } from "./stop-fault-observation.js"

const PROCESS_BOUND = 30_000
const runFile = promisify(execFile)
describe.skipIf(process.platform !== "linux")("managed stop during committed fixture work", () => {
  let bundle: Awaited<ReturnType<typeof buildIsolatedStdioServer>>
  let cli: string
  let backend: string
  let fixture: string
  let passes = 0
  const SCENARIO_COUNT = 2
  beforeAll(async () => {
    bundle = await buildIsolatedStdioServer(PROCESS_BOUND)
    const workspace = dirname(bundle.path)
    cli = join(workspace, "huly-cli.cjs")
    backend = join(workspace, "managed-stop-fault-backend.cjs")
    fixture = join(workspace, "managed-stop-fault.cjs")
    const pkg = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Struct({ version: Schema.NonEmptyString })))(
      await fs.readFile("package.json", "utf8")
    )
    await runFile("pnpm", ["--filter", "@firfi/huly-cli", "build", `--outfile=${cli}`], { timeout: PROCESS_BOUND })
    for (const [source, output] of [
      ["managed-stop-fault-backend", backend],
      ["managed-stop-fault", fixture]
    ])
      await runFile(
        ESBUILD_EXECUTABLE,
        [
          `test/resident/fixtures/${source}.ts`,
          "--bundle",
          "--platform=node",
          "--format=cjs",
          ...NATIVE_RUNTIME_EXTERNALS,
          `--define:PKG_VERSION=${JSON.stringify(pkg.version)}`,
          `--outfile=${output}`
        ],
        { timeout: PROCESS_BOUND }
      )
  }, PROCESS_BOUND)
  afterAll(async () => {
    if (passes === SCENARIO_COUNT) await bundle.cleanup()
  })
  it.each(["normal-cleanup", "failed-cleanup"])(
    "preserves one committed write, held cleanup and %s ownership",
    { timeout: PROCESS_BOUND },
    async (mode) => {
      const root = await fs.mkdtemp(join(await fs.realpath(tmpdir()), "resident-stop-fault-"))
      const directory = join(root, "resident")
      const state = join(root, "write.json")
      await fs.mkdir(directory, { mode: 0o700 })
      const result = await runFile(
        "python3",
        [
          "test/resident/fixtures/reap-descendants.py",
          "--report-reaped",
          process.execPath,
          fixture,
          bundle.path,
          cli,
          backend,
          directory,
          state,
          mode
        ],
        { timeout: PROCESS_BOUND, env: testStdioEnvironment() }
      )
      await fs.writeFile(`${root}.phases.log`, result.stderr, { mode: 0o600, flag: "wx" })
      const receipt = Schema.decodeUnknownSync(Schema.fromJsonString(StopFaultObservation))(result.stdout)
      expect(receipt.dispatches).toBe(1)
      expect(receipt.writes).toBe(1)
      expect(receipt.registry).toBe(mode === "normal-cleanup" ? "retired" : "retained")
      expect(receipt.replacement).toBe(mode === "normal-cleanup" ? "started" : "stdio")
      await fs.writeFile(
        `${root}.receipt.json`,
        Schema.encodeSync(Schema.fromJsonString(StopFaultObservation))(receipt),
        { mode: 0o600, flag: "wx" }
      )
      await fs.rm(root, { recursive: true })
      passes++
    }
  )
})
