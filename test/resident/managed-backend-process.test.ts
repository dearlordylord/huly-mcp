import { execFile } from "node:child_process"
import * as fs from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { promisify } from "node:util"
import { Schema } from "effect"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { buildIsolatedStdioServer } from "../helpers/stdio-build.js"
import { testStdioEnvironment } from "../helpers/stdio-environment.js"
import { ManagedParentObservation } from "./managed-observation.js"

const PROCESS_BOUND = 30_000
const runFile = promisify(execFile)

describe.skipIf(process.platform !== "linux")("managed native backend", () => {
  let bundle: Awaited<ReturnType<typeof buildIsolatedStdioServer>>
  let root: string
  let host: string
  let race: string
  let passed = false
  beforeAll(async () => {
    bundle = await buildIsolatedStdioServer(PROCESS_BOUND)
    root = await fs.mkdtemp(join(await fs.realpath(tmpdir()), "resident-managed-parents-"))
    host = join(dirname(bundle.path), "managed-native-host.cjs")
    race = join(dirname(bundle.path), "managed-ten-parents.cjs")
    await runFile(
      "pnpm",
      [
        "exec",
        "esbuild",
        "test/resident/fixtures/managed-native-host.ts",
        "--bundle",
        "--platform=node",
        "--format=cjs",
        `--outfile=${host}`
      ],
      { timeout: PROCESS_BOUND }
    )
    await runFile(
      "pnpm",
      [
        "exec",
        "esbuild",
        "test/resident/fixtures/managed-ten-parents.ts",
        "--bundle",
        "--platform=node",
        "--format=cjs",
        `--outfile=${race}`
      ],
      { timeout: PROCESS_BOUND }
    )
  }, PROCESS_BOUND)
  afterAll(async () => {
    if (bundle !== undefined && passed) await bundle.cleanup()
    if (root !== undefined && (await fs.readdir(root)).length === 0) await fs.rmdir(root)
  })
  it(
    "converges ten independent parents and retires after their creator and survivors close",
    { timeout: PROCESS_BOUND },
    async () => {
      const { stderr, stdout } = await runFile(
        "python3",
        ["test/resident/fixtures/reap-descendants.py", process.execPath, race, bundle.path, host, root],
        { timeout: PROCESS_BOUND, env: testStdioEnvironment() }
      )
      await fs.writeFile(`${root}.phases.log`, stderr, { mode: 0o600, flag: "wx" })
      const observation = Schema.decodeUnknownSync(Schema.fromJsonString(ManagedParentObservation))(stdout)
      expect(observation.parents).toHaveLength(10)
      expect(observation.backendExited).toBe(true)
      expect(observation.creatorExited).toBe(true)
      expect(observation.privateStateRemoved).toBe(true)
      expect(observation.stoppedAdapterExited).toBe(true)
      expect(await fs.readdir(root)).toEqual([])
      const receipt = `${root}.receipt.json`
      await fs.writeFile(receipt, Schema.encodeSync(Schema.fromJsonString(ManagedParentObservation))(observation), {
        mode: 0o600,
        flag: "wx"
      })
      passed = true
    }
  )
})
