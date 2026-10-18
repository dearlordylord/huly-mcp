import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import * as fs from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { promisify } from "node:util"
import { Schema } from "effect"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { fixturePackageVersion } from "../helpers/resident-fixture.js"
import { buildIsolatedStdioServer } from "../helpers/stdio-build.js"
import { residentSelectionEnvironment } from "../helpers/resident-selection-environment.js"
import { ModelWaitPairInput, ModelWaitReceipt } from "./model-wait-contract.js"

const PROCESS_BOUND = 30_000
const TWO_PARENTS = 2
const runFile = promisify(execFile)
const scenarios = ["2026-07-28", "2025-06-18"].flatMap((protocol) =>
  ["creator", "joiner"].flatMap((cancelledRole) =>
    [false, true].map((clockControlled) => ({ protocol, cancelledRole, clockControlled }))
  )
)

describe.skipIf(process.platform !== "linux")("packaged shared model waiter isolation", () => {
  let bundle: Awaited<ReturnType<typeof buildIsolatedStdioServer>>
  let host: string
  let driver: string
  let clockBackend: string
  let failed = false
  beforeAll(async () => {
    bundle = await buildIsolatedStdioServer(PROCESS_BOUND)
    const directory = dirname(bundle.path)
    host = join(directory, "model-wait-host.cjs")
    driver = join(directory, "model-wait-pair.cjs")
    clockBackend = join(directory, "managed-idle-clock-backend.cjs")
    const version = await fixturePackageVersion()
    for (const [source, output] of [
      ["model-wait-host", host],
      ["model-wait-pair", driver],
      ["managed-idle-clock-backend", clockBackend]
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
          `--define:PKG_VERSION=${JSON.stringify(version)}`,
          `--outfile=${output}`
        ],
        { timeout: PROCESS_BOUND }
      )
  }, PROCESS_BOUND)
  afterAll(async () => {
    if (!failed) await bundle.cleanup()
  })

  it.each(scenarios)(
    "cancels $cancelledRole while preserving shared initialization with $protocol (clock=$clockControlled)",
    { timeout: PROCESS_BOUND },
    async ({ cancelledRole, clockControlled, protocol }) => {
      const root = await fs.mkdtemp(join(await fs.realpath(tmpdir()), "resident-model-wait-"))
      const directory = join(root, "state")
      await fs.mkdir(directory, { mode: 0o700 })
      const input = Schema.decodeUnknownSync(ModelWaitPairInput)({
        bundle: bundle.path,
        host,
        directory,
        protocol,
        cancelledRole,
        ...(clockControlled ? { clockBackend } : {})
      })
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
            Schema.encodeSync(Schema.fromJsonString(ModelWaitPairInput))(input)
          ],
          { timeout: PROCESS_BOUND, env: residentSelectionEnvironment() }
        )
        await fs.writeFile(join(root, "phases.log"), result.stderr, { mode: 0o600, flag: "wx" })
        await fs.writeFile(join(root, "receipt.json"), result.stdout, { mode: 0o600, flag: "wx" })
        const receipt = Schema.decodeUnknownSync(Schema.fromJsonString(ModelWaitReceipt))(result.stdout)
        expect(receipt.mcpSha256).toBe(
          createHash("sha256")
            .update(await fs.readFile(bundle.path))
            .digest("hex")
        )
        expect(receipt.clockControlled).toBe(clockControlled)
        expect(receipt.protocol).toBe(protocol)
        expect(receipt.cancelledRole).toBe(cancelledRole)
        expect(new Set(receipt.parents.map((parent) => parent.parentPid)).size).toBe(TWO_PARENTS)
        expect(new Set(receipt.parents.map((parent) => parent.adapterPid)).size).toBe(TWO_PARENTS)
        expect(new Set(receipt.parents.map((parent) => parent.port)).size).toBe(1)
        expect(receipt.statuses.map((status) => status.work.retainedRequests)).toEqual([2, 1, 0])
        expect(receipt.statuses.every((status) => status.generation === receipt.generation)).toBe(true)
        expect(receipt.statuses.every((status) => status.work.attachments === TWO_PARENTS)).toBe(true)
        expect(receipt.modelRequests).toBe(1)
        expect(receipt.projectReads).toBe(receipt.projectQueries.length)
        expect(receipt.projectQueries).toEqual(["SURVIVE", "FRESH", "SURVIVE"])
        expect(receipt.backendExit.exitCode).toBe(0)
        expect(receipt.parentExits).toEqual([0, 0])
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
