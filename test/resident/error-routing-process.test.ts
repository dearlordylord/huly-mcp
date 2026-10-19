import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import * as fs from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { promisify } from "node:util"
import { Schema } from "effect"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { buildIsolatedStdioServer, NATIVE_RUNTIME_EXTERNALS } from "../helpers/stdio-build.js"
import { residentSelectionEnvironment } from "../helpers/resident-selection-environment.js"
import { ErrorRoutingInput, ErrorRoutingReceipt } from "./error-routing-contract.js"

const TWO_PARENTS = 2
const PROCESS_BOUND = 30_000
const runFile = promisify(execFile)
const protocols = ["2026-07-28", "2025-06-18"]

describe.skipIf(process.platform !== "linux")("packaged shared backend error routing", () => {
  let bundle: Awaited<ReturnType<typeof buildIsolatedStdioServer>>
  let host: string
  let driver: string
  let failed = false
  beforeAll(async () => {
    bundle = await buildIsolatedStdioServer(PROCESS_BOUND)
    host = join(dirname(bundle.path), "active-query-host.cjs")
    driver = join(dirname(bundle.path), "error-routing-pair.cjs")
    for (const [source, output] of [
      ["active-query-host", host],
      ["error-routing-pair", driver]
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
  it.each(protocols)(
    "isolates an operation error from an active peer with %s",
    { timeout: PROCESS_BOUND },
    async (protocol) => {
      const root = await fs.mkdtemp(join(await fs.realpath(tmpdir()), "resident-error-routings-"))
      const directory = join(root, "state")
      await fs.mkdir(directory, { mode: 0o700 })
      const input = Schema.decodeUnknownSync(ErrorRoutingInput)({ bundle: bundle.path, host, directory, protocol })
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
            Schema.encodeSync(Schema.fromJsonString(ErrorRoutingInput))(input)
          ],
          { timeout: PROCESS_BOUND, env: residentSelectionEnvironment() }
        )
        await fs.writeFile(join(root, "phases.log"), result.stderr, { mode: 0o600, flag: "wx" })
        await fs.writeFile(join(root, "receipt.json"), result.stdout, { mode: 0o600, flag: "wx" })
        const receipt = Schema.decodeUnknownSync(Schema.fromJsonString(ErrorRoutingReceipt))(result.stdout)
        expect(receipt.mcpSha256).toBe(
          createHash("sha256")
            .update(await fs.readFile(bundle.path))
            .digest("hex")
        )
        expect(receipt.protocol).toBe(protocol)
        expect(new Set(receipt.parents.map((p) => p.parentPid)).size).toBe(TWO_PARENTS)
        expect(new Set(receipt.parents.map((p) => p.adapterPid)).size).toBe(TWO_PARENTS)
        expect(new Set(receipt.parents.map((p) => p.port)).size).toBe(1)
        expect(receipt.statuses.map((s) => s.work.retainedRequests)).toEqual([2, 1, 0])
        expect(
          receipt.statuses.every((s) => s.generation === receipt.generation && s.work.attachments === TWO_PARENTS)
        ).toBe(true)
        expect(receipt.error.id).toBe(41)
        expect(receipt.error.project).toBe("MISSING")
        expect(receipt.error.reply.isError).toBe(true)
        expect(receipt.error.reply.content.some((item) => item.text.includes("Project 'MISSING' not found"))).toBe(true)
        expect(receipt.results.map((r) => [r.id, r.project, r.result.identifier, r.result.name])).toEqual([
          [42, "FRESH", "FRESH", "Project FRESH"],
          [41, "SURVIVE", "SURVIVE", "Project SURVIVE"],
          [42, "SURVIVE", "SURVIVE", "Project SURVIVE"]
        ])
        expect(receipt.projectQueries).toEqual(["SURVIVE", "MISSING", "FRESH", "SURVIVE"])
        expect(receipt.parentExits).toEqual([0, 0])
        expect(receipt.adapterExits).toEqual([0, 0])
        expect(receipt.backendExit.exitCode).toBe(0)
        expect(receipt.registryUnchanged).toBe(true)
        expect(receipt.privateStateRemoved).toBe(true)
      } catch (error) {
        failed = true
        await fs.writeFile(join(root, "failure.log"), String(error), { mode: 0o600, flag: "wx" })
        throw error
      }
    }
  )
})
