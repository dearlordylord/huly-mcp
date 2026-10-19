import { execFile } from "node:child_process"
import * as fs from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { promisify } from "node:util"
import { Schema } from "effect"
import { expect, it } from "vitest"

import { buildIsolatedStdioServer, NATIVE_RUNTIME_EXTERNALS } from "../helpers/stdio-build.js"
import { testStdioEnvironment } from "../helpers/stdio-environment.js"
import { residentSelectionEnvironment } from "../helpers/resident-selection-environment.js"
import { ManagedAuthObservation } from "./managed-auth-observation.js"

const BUILD_BOUND = 30_000
const AUTH_PROCESS_BOUND = 30_000
const TEST_BOUND = BUILD_BOUND + AUTH_PROCESS_BOUND
const ProcessFailure = Schema.Struct({ stderr: Schema.String })
const runFile = promisify(execFile)

it.skipIf(process.platform !== "linux")(
  "shares equivalent tokens and isolates password authority and rotated profile tokens",
  { timeout: TEST_BOUND },
  async () => {
    const bundle = await buildIsolatedStdioServer(BUILD_BOUND)
    const root = await fs.mkdtemp(join(await fs.realpath(tmpdir()), "resident-managed-auth-"))
    const fixture = join(dirname(bundle.path), "managed-auth-paths.cjs")
    let passed = false
    try {
      await runFile(
        "pnpm",
        [
          "exec",
          "esbuild",
          "test/resident/fixtures/managed-auth-paths.ts",
          "--bundle",
          "--platform=node",
          "--format=cjs",
          ...NATIVE_RUNTIME_EXTERNALS,
          `--outfile=${fixture}`
        ],
        { timeout: BUILD_BOUND }
      )
      const { stderr, stdout } = await runFile(
        "python3",
        ["test/resident/fixtures/reap-descendants.py", "--report-reaped", process.execPath, fixture, bundle.path, root],
        { timeout: AUTH_PROCESS_BOUND, env: testStdioEnvironment() }
      ).catch(async (error: unknown) => {
        if (Schema.is(ProcessFailure)(error))
          await fs.writeFile(`${root}.phases.log`, error.stderr, { mode: 0o600, flag: "wx" }).catch(() => {
            process.stderr.write("Managed auth failure phases could not be saved\n")
          })
        throw error
      })
      await fs.writeFile(`${root}.phases.log`, stderr, { mode: 0o600, flag: "wx" })
      for (const secret of [
        residentSelectionEnvironment().HULY_TOKEN,
        "fixture-private-password",
        "fixture-rotated-profile-token"
      ])
        expect(`${stderr}${stdout}`.includes(secret)).toBe(false)
      const observation = Schema.decodeUnknownSync(Schema.fromJsonString(ManagedAuthObservation))(stdout)
      expect(observation.backendExits).toHaveLength(3)
      expect(observation.backendExits.every((exit) => exit.exitCode === 0)).toBe(true)
      expect(observation.profilePort).toBe(observation.environmentTokenPort)
      expect(observation.profilePort).not.toBe(observation.passwordPort)
      expect(observation.rotatedProfilePort).not.toBe(observation.profilePort)
      expect(observation.rotatedProfilePort).not.toBe(observation.passwordPort)
      expect(observation.logoutRefused).toBe(true)
      expect(observation.deletedProfileRefused).toBe(true)
      expect(await fs.readdir(join(root, "state"))).toEqual([])
      await fs.writeFile(
        `${root}.receipt.json`,
        Schema.encodeSync(Schema.fromJsonString(ManagedAuthObservation))(observation),
        { mode: 0o600, flag: "wx" }
      )
      passed = true
    } finally {
      if (passed) {
        await bundle.cleanup()
        await fs.rm(root, { recursive: true })
      }
    }
  }
)
