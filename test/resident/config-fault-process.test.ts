import { execFile } from "node:child_process"
import * as fs from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { promisify } from "node:util"
import { Schema } from "effect"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { buildIsolatedStdioServer } from "../helpers/stdio-build.js"
import { residentSelectionEnvironment } from "../helpers/resident-selection-environment.js"
import { ConfigFaultInput, ConfigFaultMode, ConfigFaultReceipt } from "./config-fault-contract.js"

const PROCESS_BOUND = 30_000
const runFile = promisify(execFile)
const protocols = ["2026-07-28", "2025-06-18"]

describe.skipIf(process.platform !== "linux")("packaged configuration fault isolation", () => {
  let bundle: Awaited<ReturnType<typeof buildIsolatedStdioServer>>
  let host: string
  let driver: string
  let failed = false
  beforeAll(async () => {
    bundle = await buildIsolatedStdioServer(PROCESS_BOUND)
    host = join(dirname(bundle.path), "active-query-host.cjs")
    driver = join(dirname(bundle.path), "config-fault-isolation.cjs")
    for (const [source, output] of [
      ["active-query-host", host],
      ["config-fault-isolation", driver]
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
          "--external:ws",
          `--outfile=${output}`
        ],
        { timeout: PROCESS_BOUND }
      )
  }, PROCESS_BOUND)
  afterAll(async () => {
    if (!failed) await bundle.cleanup()
  })
  it.each(protocols.flatMap((protocol) => ConfigFaultMode.literals.map((mode) => ({ protocol, mode }))))(
    "isolates a backend crash from an unrelated active configuration with $protocol / $mode",
    { timeout: PROCESS_BOUND },
    async ({ mode, protocol }) => {
      const root = await fs.mkdtemp(join(await fs.realpath(tmpdir()), "resident-config-faults-"))
      const directory = join(root, "state")
      await fs.mkdir(directory, { mode: 0o700 })
      const input = Schema.decodeUnknownSync(ConfigFaultInput)({ bundle: bundle.path, host, directory, protocol, mode })
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
            Schema.encodeSync(Schema.fromJsonString(ConfigFaultInput))(input)
          ],
          { timeout: PROCESS_BOUND, env: residentSelectionEnvironment() }
        )
        await fs.writeFile(join(root, "phases.log"), result.stderr, { mode: 0o600, flag: "wx" })
        await fs.writeFile(join(root, "receipt.json"), result.stdout, { mode: 0o600, flag: "wx" })
        const receipt = Schema.decodeUnknownSync(Schema.fromJsonString(ConfigFaultReceipt))(result.stdout)
        expect(receipt.protocol).toBe(protocol)
        expect(receipt.failed.parentPid).not.toBe(receipt.survivor.parentPid)
        expect(receipt.failed.adapterPid).not.toBe(receipt.survivor.adapterPid)
        expect(receipt.failed.port).not.toBe(receipt.survivor.port)
        expect(receipt.statuses.map((status) => status.work.retainedRequests)).toEqual([1, 1, 0])
        expect(new Set(receipt.statuses.map((status) => status.generation)).size).toBe(1)
        expect(receipt.results.map((reply) => [reply.id, reply.result.identifier, reply.result.name])).toEqual([
          [41, "SURVIVE", "Surviving configuration"],
          [42, "SURVIVE", "Surviving configuration"]
        ])
        expect(receipt.fault.kind).toBe(mode)
        if (receipt.fault.kind === "adapter-backend") {
          expect(receipt.fault.adapterExit.signal).toBe("SIGKILL")
          expect(receipt.fault.signal.processId).toBe(receipt.fault.backendExit.processId)
          expect(receipt.fault.backendExit.exitCode).toBe(-9)
        } else {
          expect(receipt.fault.signal.adapterPid).toBe(receipt.failed.adapterPid)
          expect(receipt.fault.adapterExit.code).toBe(1)
          expect(receipt.fault.adapterExit.signal).toBe(null)
        }
        expect(receipt.fault.signal.closed).toBe(true)
        expect(receipt.survivorBackendExit.exitCode).toBe(0)
        expect(receipt.survivorAdapterExit.code).toBe(0)
        expect(receipt.survivorRegistryUnchanged).toBe(true)
        expect(receipt.failedRegistryRetained).toBe(true)
      } catch (error) {
        failed = true
        await fs.writeFile(join(root, "failure.log"), String(error), { mode: 0o600, flag: "wx" })
        throw error
      }
    }
  )
})
