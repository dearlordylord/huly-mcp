import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import * as fs from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { promisify } from "node:util"
import { Schema } from "effect"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { buildIsolatedStdioServer } from "../helpers/stdio-build.js"
import { residentSelectionEnvironment } from "../helpers/resident-selection-environment.js"
import { MAX_ADAPTER_REQUESTS } from "../../src/resident/adapter-limits.js"
import { ACTIVE_FIRST_ID } from "./active-query-contract.js"
import { BurstIsolationInput, BurstIsolationReceipt } from "./burst-isolation-contract.js"

const PROCESS_BOUND = 30_000
const TWO_PARENTS = 2
const runFile = promisify(execFile)
const scenarios = ["2026-07-28", "2025-06-18"]

describe.skipIf(process.platform !== "linux")("packaged managed adapter request budget isolation", () => {
  let bundle: Awaited<ReturnType<typeof buildIsolatedStdioServer>>
  let host: string
  let driver: string
  let failed = false
  beforeAll(async () => {
    bundle = await buildIsolatedStdioServer(PROCESS_BOUND)
    const directory = dirname(bundle.path)
    host = join(directory, "active-query-host.cjs")
    driver = join(directory, "burst-isolation-pair.cjs")
    for (const [source, output] of [
      ["active-query-host", host],
      ["burst-isolation-pair", driver]
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

  it.each(scenarios)("isolates per-adapter request overflow with %s", { timeout: PROCESS_BOUND }, async (protocol) => {
    const root = await fs.mkdtemp(join(await fs.realpath(tmpdir()), "resident-burst-isolation-"))
    const directory = join(root, "state")
    await fs.mkdir(directory, { mode: 0o700 })
    const input = Schema.decodeUnknownSync(BurstIsolationInput)({ bundle: bundle.path, host, directory, protocol })
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
          Schema.encodeSync(Schema.fromJsonString(BurstIsolationInput))(input)
        ],
        { timeout: PROCESS_BOUND, env: residentSelectionEnvironment() }
      )
      await fs.writeFile(join(root, "phases.log"), result.stderr, { mode: 0o600, flag: "wx" })
      await fs.writeFile(join(root, "receipt.json"), result.stdout, { mode: 0o600, flag: "wx" })
      const receipt = Schema.decodeUnknownSync(Schema.fromJsonString(BurstIsolationReceipt))(result.stdout)
      expect(receipt.mcpSha256).toBe(
        createHash("sha256")
          .update(await fs.readFile(bundle.path))
          .digest("hex")
      )
      expect(receipt.protocol).toBe(protocol)
      expect(new Set(receipt.parents.map((parent) => parent.parentPid)).size).toBe(TWO_PARENTS)
      expect(new Set(receipt.parents.map((parent) => parent.adapterPid)).size).toBe(TWO_PARENTS)
      expect(new Set(receipt.parents.map((parent) => parent.port)).size).toBe(1)
      expect(receipt.statuses.map((status) => status.work.retainedRequests)).toEqual([MAX_ADAPTER_REQUESTS + 1, 1, 0])
      expect(receipt.statuses.every((status) => status.generation === receipt.generation)).toBe(true)
      expect(receipt.statuses[0].work.attachments).toBe(TWO_PARENTS)
      expect(receipt.statuses[1].work.attachments).toBe(1)
      expect(receipt.saturatedExit).toEqual({ code: 1, signal: null })
      expect(receipt.admissionFailure).toBe(true)
      expect(receipt.filledIds).toEqual(
        Array.from({ length: MAX_ADAPTER_REQUESTS }, (_, index) => ACTIVE_FIRST_ID + index)
      )
      expect(receipt.rejectedId).toBe(ACTIVE_FIRST_ID + MAX_ADAPTER_REQUESTS)
      expect(receipt.survivingIds).toEqual([41, 42])
      expect(receipt.modelRequests).toBe(1)
      expect(receipt.projectReads).toBe(receipt.projectQueries.length)
      expect([...receipt.projectQueries.slice(0, MAX_ADAPTER_REQUESTS)].sort()).toEqual(
        Array.from({ length: MAX_ADAPTER_REQUESTS }, (_, index) => `B${index}`).sort()
      )
      expect(receipt.projectQueries.slice(MAX_ADAPTER_REQUESTS)).toEqual(["SURVIVE", "SURVIVE"])
      expect(receipt.projectQueries).not.toContain("OVERFLOW")
      expect(receipt.backendExit.exitCode).toBe(0)
      expect(receipt.parentExits).toEqual([0, 0])
      expect(receipt.registryUnchanged).toBe(true)
      expect(receipt.privateStateRemoved).toBe(true)
    } catch (error) {
      failed = true
      await fs.writeFile(join(root, "failure.log"), String(error), { mode: 0o600, flag: "wx" })
      throw error
    }
  })
})
