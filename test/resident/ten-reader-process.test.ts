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
import { TEN_READERS, TEN_READER_READS, TenReaderInput, TenReaderReceipt } from "./ten-reader-contract.js"

const PROCESS_BOUND = 30_000
const runFile = promisify(execFile)
const protocols = ["2026-07-28", "2025-06-18"]

describe.skipIf(process.platform !== "linux")("ten packaged independent SDK readers", () => {
  let bundle: Awaited<ReturnType<typeof buildIsolatedStdioServer>>
  let host: string
  let driver: string
  let failed = false
  beforeAll(async () => {
    bundle = await buildIsolatedStdioServer(PROCESS_BOUND)
    host = join(dirname(bundle.path), "active-query-host.cjs")
    driver = join(dirname(bundle.path), "ten-reader-race.cjs")
    for (const [source, output] of [
      ["active-query-host", host],
      ["ten-reader-race", driver]
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
    "shares one held full model and continues all ten readers with %s",
    { timeout: PROCESS_BOUND },
    async (protocol) => {
      const root = await fs.mkdtemp(join(await fs.realpath(tmpdir()), "resident-ten-readers-"))
      const directory = join(root, "state")
      await fs.mkdir(directory, { mode: 0o700 })
      const input = Schema.decodeUnknownSync(TenReaderInput)({ bundle: bundle.path, host, directory, protocol })
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
            Schema.encodeSync(Schema.fromJsonString(TenReaderInput))(input)
          ],
          { timeout: PROCESS_BOUND, env: residentSelectionEnvironment() }
        )
        await fs.writeFile(join(root, "phases.log"), result.stderr, { mode: 0o600, flag: "wx" })
        await fs.writeFile(join(root, "receipt.json"), result.stdout, { mode: 0o600, flag: "wx" })
        const receipt = Schema.decodeUnknownSync(Schema.fromJsonString(TenReaderReceipt))(result.stdout)
        expect(receipt.mcpSha256).toBe(
          createHash("sha256")
            .update(await fs.readFile(bundle.path))
            .digest("hex")
        )
        expect(receipt.protocol).toBe(protocol)
        expect(new Set(receipt.parents.map((p) => p.parentPid)).size).toBe(TEN_READERS)
        expect(new Set(receipt.parents.map((p) => p.adapterPid)).size).toBe(TEN_READERS)
        expect(new Set(receipt.parents.map((p) => p.port)).size).toBe(1)
        expect(receipt.statuses.map((s) => s.work.retainedRequests)).toEqual([TEN_READERS, 0])
        expect(
          receipt.statuses.every((s) => s.generation === receipt.generation && s.work.attachments === TEN_READERS)
        ).toBe(true)
        const targets = Array.from({ length: TEN_READERS }, (_, index) => `P${index}`)
        for (const [index, round] of receipt.rounds.entries()) {
          expect(round.map((r) => r.id)).toEqual(targets.map(() => 41 + index))
          expect(round.map((r) => r.project)).toEqual(targets)
          expect(round.map((r) => r.result.identifier)).toEqual(targets)
          expect(round.map((r) => r.result.name)).toEqual(targets.map((project) => `Project ${project}`))
        }
        expect(receipt.modelRequests).toBe(1)
        expect(receipt.projectReads).toBe(TEN_READER_READS)
        expect([...receipt.projectQueries.slice(0, TEN_READERS)].sort()).toEqual([...targets].sort())
        expect([...receipt.projectQueries.slice(TEN_READERS)].sort()).toEqual([...targets].sort())
        expect(receipt.parentExits).toEqual(targets.map(() => 0))
        expect(receipt.adapterExits).toEqual(targets.map(() => 0))
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
