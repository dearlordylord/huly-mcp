import { execFile } from "node:child_process"
import * as fs from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { promisify } from "node:util"
import { Schema } from "effect"
import { expect, it } from "vitest"

import { buildIsolatedStdioServer } from "../helpers/stdio-build.js"
import { testStdioEnvironment } from "../helpers/stdio-environment.js"
import { ManagedPolicyObservation, ManagedPolicyScenario } from "./managed-policy-observation.js"

const BUILD_BOUND = 30_000
const POLICY_PROCESS_BOUND = 30_000
const TEST_BOUND = BUILD_BOUND + POLICY_PROCESS_BOUND
const ProcessFailure = Schema.Struct({ stderr: Schema.String })
const runFile = promisify(execFile)

it.skipIf(process.platform !== "linux").each(ManagedPolicyScenario.literals)(
  "isolates managed %s tool policies in catalogs and actual cross-policy calls",
  { timeout: TEST_BOUND },
  async (scenario) => {
    const bundle = await buildIsolatedStdioServer(BUILD_BOUND)
    const root = await fs.mkdtemp(join(await fs.realpath(tmpdir()), `resident-managed-policy-${scenario}-`))
    const fixture = join(dirname(bundle.path), "managed-policy-isolation.cjs")
    let passed = false
    try {
      await runFile(
        "pnpm",
        [
          "exec",
          "esbuild",
          "test/resident/fixtures/managed-policy-isolation.ts",
          "--bundle",
          "--platform=node",
          "--format=cjs",
          `--outfile=${fixture}`
        ],
        { timeout: BUILD_BOUND }
      )
      const { stderr, stdout } = await runFile(
        "python3",
        [
          "test/resident/fixtures/reap-descendants.py",
          "--report-reaped",
          process.execPath,
          fixture,
          bundle.path,
          root,
          scenario
        ],
        { timeout: POLICY_PROCESS_BOUND, env: testStdioEnvironment() }
      ).catch(async (error: unknown) => {
        if (Schema.is(ProcessFailure)(error))
          await fs.writeFile(`${root}.phases.log`, error.stderr, { mode: 0o600, flag: "wx" }).catch(() => {
            process.stderr.write("Managed policy failure phases could not be saved\n")
          })
        throw error
      })
      await fs.writeFile(`${root}.phases.log`, stderr, { mode: 0o600, flag: "wx" })
      const observation = Schema.decodeUnknownSync(Schema.fromJsonString(ManagedPolicyObservation))(stdout)
      expect(observation.scenario).toBe(scenario)
      expect(observation.backendExits).toHaveLength(2)
      expect(observation.backendExits.every((exit) => exit.exitCode === 0)).toBe(true)
      expect(observation.projectPort).not.toBe(observation.issuePort)
      expect(observation.crossPolicyEvidence).toBe(scenario === "proxy-non-strict" ? "schema-visible" : "call-refused")
      expect(await fs.readdir(root)).toEqual([])
      await fs.writeFile(
        `${root}.receipt.json`,
        Schema.encodeSync(Schema.fromJsonString(ManagedPolicyObservation))(observation),
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
