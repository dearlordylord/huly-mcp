import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import * as fs from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { promisify } from "node:util"
import { Schema } from "effect"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { ResidentPackagePath } from "../../src/resident/managed-contract.js"
import { buildIsolatedStdioServer, NATIVE_RUNTIME_EXTERNALS } from "../helpers/stdio-build.js"
import { residentSelectionEnvironment } from "../helpers/resident-selection-environment.js"
import { MixedLaunchInput, MixedLaunchReceipt } from "./mixed-launch-contract.js"

const PROCESS_BOUND = 30_000
const runFile = promisify(execFile)
const hash = async (file: Schema.Schema.Type<typeof ResidentPackagePath>) =>
  createHash("sha256")
    .update(await fs.readFile(file))
    .digest("hex")

describe.skipIf(process.platform !== "linux")("packaged mixed explicit/automatic launch", () => {
  let bundle: Awaited<ReturnType<typeof buildIsolatedStdioServer>>
  let host: string
  let driver: string
  let failed = false
  beforeAll(async () => {
    bundle = await buildIsolatedStdioServer(PROCESS_BOUND)
    host = join(dirname(bundle.path), "model-wait-host.cjs")
    driver = join(dirname(bundle.path), "mixed-launch.cjs")
    for (const [source, output] of [
      ["model-wait-host", host],
      ["mixed-launch", driver]
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
    if (!failed) await bundle.cleanup()
  })
  it.each(["2026-07-28", "2025-06-18"])(
    "converges on one owner with %s",
    { timeout: PROCESS_BOUND },
    async (protocol) => {
      const root = await fs.mkdtemp(join(await fs.realpath(tmpdir()), "resident-mixed-launch-"))
      const directory = join(root, "state")
      await fs.mkdir(directory, { mode: 0o700 })
      const input = Schema.decodeUnknownSync(MixedLaunchInput)({ bundle: bundle.path, host, directory, protocol })
      try {
        const result = await runFile(
          "python3",
          [
            "test/resident/fixtures/reap-descendants.py",
            "--report-reaped",
            "--resources",
            join(root, "resources.jsonl"),
            process.execPath,
            driver,
            Schema.encodeSync(Schema.fromJsonString(MixedLaunchInput))(input)
          ],
          { timeout: PROCESS_BOUND, env: residentSelectionEnvironment() }
        )
        await fs.writeFile(join(root, "phases.log"), result.stderr, { mode: 0o600, flag: "wx" })
        await fs.writeFile(join(root, "receipt.json"), result.stdout, { mode: 0o600, flag: "wx" })
        const receipt = Schema.decodeUnknownSync(Schema.fromJsonString(MixedLaunchReceipt))(result.stdout)
        expect(receipt.mcpSha256).toBe(await hash(input.bundle))
        expect(receipt.hostSha256).toBe(await hash(input.host))
        expect(receipt.driverSha256).toBe(await hash(ResidentPackagePath.make(driver)))
        expect(receipt.protocol).toBe(protocol)
        expect(receipt.readers[0].port).toBe(receipt.readers[1].port)
        expect(new Set(receipt.readers.map((reader) => reader.parentPid)).size).toBe(2)
        expect(new Set(receipt.readers.map((reader) => reader.adapterPid)).size).toBe(2)
        expect(receipt.backend.exitCode).toBe(receipt.backend.lifetime === "foreground" ? 130 : 0)
        expect(receipt.explicit.exitCode).toBe(receipt.backend.lifetime === "foreground" ? 130 : 0)
        expect(receipt.parentExits).toEqual([0, 0])
        expect(receipt.modelRequests).toBe(1)
        expect(receipt.projectReads).toBe(2)
        expect(receipt.privateStateRemoved).toBe(true)
        expect(await fs.readdir(directory)).toEqual([])
        const terminal = (await fs.readFile(join(root, "resources.jsonl"), "utf8")).trim().split("\n").at(-1)
        expect(
          Schema.decodeUnknownSync(
            Schema.fromJsonString(Schema.Struct({ kind: Schema.Literal("terminal"), exitCode: Schema.Literal(0) }))
          )(terminal)
        ).toEqual({ kind: "terminal", exitCode: 0 })
      } catch (error) {
        failed = true
        await fs.writeFile(join(root, "failure.log"), error instanceof Error ? error.message : "Mixed launch failed", {
          mode: 0o600
        })
        throw error
      }
    }
  )
})
