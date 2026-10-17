import { execFile } from "node:child_process"
import * as fs from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { promisify } from "node:util"
import { Result, Schema } from "effect"
import { expect, it } from "vitest"

import { buildIsolatedStdioServer } from "../helpers/stdio-build.js"
import { testStdioEnvironment } from "../helpers/stdio-environment.js"
import {
  PROJECT_READS,
  RestrictedObservation,
  RestrictedProbeAttempt,
  type RestrictionMode
} from "./restricted-observation.js"

const PROCESS_BOUND = 30_000
const runFile = promisify(execFile)
const RefusedProcess = Schema.Struct({
  code: Schema.Literal(1),
  killed: Schema.Literal(false),
  signal: Schema.Null,
  stdout: Schema.String
})

it
  .skipIf(process.platform !== "linux")
  .each(["restricted", "unrestricted"] satisfies ReadonlyArray<Schema.Schema.Type<typeof RestrictionMode>>)(
  "checks %s packaged native startup against its actual descendant API restrictions",
  { timeout: PROCESS_BOUND },
  async (mode) => {
    const bundle = await buildIsolatedStdioServer(PROCESS_BOUND)
    const root = await fs.mkdtemp(join(await fs.realpath(tmpdir()), "resident-restricted-native-"))
    const fixture = join(dirname(bundle.path), "restricted-native.cjs")
    const preload = join(dirname(bundle.path), "restricted-preload.mjs")
    let passed = false
    try {
      await runFile(
        "pnpm",
        [
          "exec",
          "esbuild",
          "test/resident/fixtures/restricted-native.ts",
          "--bundle",
          "--platform=node",
          "--format=cjs",
          `--outfile=${fixture}`
        ],
        { timeout: PROCESS_BOUND }
      )
      await runFile(
        "pnpm",
        [
          "exec",
          "esbuild",
          "test/resident/fixtures/restricted-preload.ts",
          "--bundle",
          "--platform=node",
          "--format=esm",
          `--outfile=${preload}`
        ],
        { timeout: PROCESS_BOUND }
      )
      const running = runFile(
        "python3",
        ["test/resident/fixtures/reap-descendants.py", process.execPath, fixture, bundle.path, preload, root, mode],
        { timeout: PROCESS_BOUND, env: testStdioEnvironment() }
      )
      if (mode === "unrestricted") {
        const failed = await running.then(
          () => undefined,
          (error: unknown) => error
        )
        const parsed = Schema.decodeUnknownResult(RefusedProcess)(failed)
        expect(Result.isSuccess(parsed)).toBe(true)
        if (Result.isFailure(parsed)) throw new Error("Expected policy control to refuse before startup")
        expect(parsed.success.stdout).toBe("")
        const attempt = Schema.decodeUnknownSync(Schema.fromJsonString(RestrictedProbeAttempt))(
          await fs.readFile(join(root, "permission-probe.json"), "utf8")
        )
        expect(attempt.nodeVersion).toBe(process.versions.node)
        expect(attempt.denied).toEqual({ child: false, worker: false, addon: true, wasi: false, inspector: false })
        expect(await fs.readdir(root)).toEqual(["permission-probe.json"])
        await fs.writeFile(
          `${root}.refused-probe.json`,
          Schema.encodeSync(Schema.fromJsonString(RestrictedProbeAttempt))(attempt),
          { mode: 0o600, flag: "wx" }
        )
        passed = true
        return
      }
      const { stderr, stdout } = await running
      const receipt = Schema.decodeUnknownSync(Schema.fromJsonString(RestrictedObservation))(stdout)
      expect(receipt.probe.nodeVersion).toBe(process.versions.node)
      expect(receipt.modelRequests).toBe(1)
      expect(receipt.projectReads).toBe(PROJECT_READS)
      expect(receipt.backendJoined).toBe(true)
      await fs.writeFile(
        `${root}.receipt.json`,
        Schema.encodeSync(Schema.fromJsonString(RestrictedObservation))(receipt),
        { mode: 0o600, flag: "wx" }
      )
      await fs.writeFile(`${root}.phases.log`, stderr, { mode: 0o600, flag: "wx" })
      passed = true
    } finally {
      if (passed) {
        await bundle.cleanup()
        await fs.rm(root, { recursive: true })
      }
    }
  }
)
