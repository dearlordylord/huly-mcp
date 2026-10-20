import { execFile } from "node:child_process"
import * as fs from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { promisify } from "node:util"
import { Schema } from "effect"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { buildIsolatedStdioServer, ESBUILD_EXECUTABLE, NATIVE_RUNTIME_EXTERNALS } from "../helpers/stdio-build.js"
import { testStdioEnvironment } from "../helpers/stdio-environment.js"
import { ManagedParentObservation } from "./managed-observation.js"
import { prepareSubprocessBytecode, runPreparationFile } from "../helpers/subprocess-bytecode.js"

const PROCESS_BOUND = 30_000
const runFile = promisify(execFile)
const ProcessFailure = Schema.Struct({ stderr: Schema.String })

describe.skipIf(process.platform !== "linux")("managed native backend", () => {
  let bundle: Awaited<ReturnType<typeof buildIsolatedStdioServer>>
  let root: string
  let host: string
  let race: string
  let passed = false
  let prepared = false
  let preparation: Promise<void> | undefined
  beforeAll(async () => {
    const signal = AbortSignal.timeout(PROCESS_BOUND)
    preparation = (async () => {
      bundle = await buildIsolatedStdioServer(PROCESS_BOUND, undefined, signal)
      root = await fs.mkdtemp(join(await fs.realpath(tmpdir()), "resident-managed-parents-"))
      host = join(dirname(bundle.path), "managed-native-host.cjs")
      race = join(dirname(bundle.path), "managed-ten-parents.cjs")
      await runPreparationFile(
        ESBUILD_EXECUTABLE,
        [
          "test/resident/fixtures/managed-native-host.ts",
          "--bundle",
          "--platform=node",
          "--format=cjs",
          ...NATIVE_RUNTIME_EXTERNALS,
          `--outfile=${host}`
        ],
        signal
      )
      await runPreparationFile(
        ESBUILD_EXECUTABLE,
        [
          "test/resident/fixtures/managed-ten-parents.ts",
          "--bundle",
          "--platform=node",
          "--format=cjs",
          ...NATIVE_RUNTIME_EXTERNALS,
          `--outfile=${race}`
        ],
        signal
      )
      await prepareSubprocessBytecode(host, signal)
      await prepareSubprocessBytecode(race, signal)
      prepared = true
    })()
    await preparation
  }, PROCESS_BOUND)
  afterAll(async () => {
    await preparation?.catch(() => {})
    if (bundle !== undefined && (passed || !prepared)) await bundle.cleanup()
    if (root !== undefined && (await fs.readdir(root)).length === 0) await fs.rmdir(root)
  })
  it(
    "converges ten independent parents and retires after their creator and survivors close",
    { timeout: PROCESS_BOUND },
    async () => {
      const { stderr, stdout } = await runFile(
        "python3",
        [
          "test/resident/fixtures/reap-descendants.py",
          "--report-reaped",
          process.execPath,
          race,
          bundle.path,
          host,
          root
        ],
        { timeout: PROCESS_BOUND, env: testStdioEnvironment() }
      ).catch(async (error: unknown) => {
        if (Schema.is(ProcessFailure)(error))
          await fs.writeFile(`${root}.phases.log`, error.stderr, { mode: 0o600, flag: "wx" }).catch(() => {
            process.stderr.write("Managed launch failure phases could not be saved\n")
          })
        throw error
      })
      await fs.writeFile(`${root}.phases.log`, stderr, { mode: 0o600, flag: "wx" })
      const observation = Schema.decodeUnknownSync(Schema.fromJsonString(ManagedParentObservation))(stdout)
      expect(observation.parents).toHaveLength(10)
      expect(observation.backendExited).toBe(true)
      expect(observation.backendExit).toEqual({ processId: observation.ownerProcessId, exitCode: 0 })
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
