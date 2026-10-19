import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import * as fs from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { promisify } from "node:util"
import { Schema } from "effect"
import { expect, it } from "vitest"

import { ResidentPackagePath } from "../../src/resident/managed-contract.js"
import { buildIsolatedStdioServer, ESBUILD_EXECUTABLE, NATIVE_RUNTIME_EXTERNALS } from "../helpers/stdio-build.js"
import { testStdioEnvironment } from "../helpers/stdio-environment.js"
import {
  ManagedRequestLossObservation,
  ManagedRequestLossPoint,
  RequestLossProjectName,
  RequestLossUpdatedName
} from "./managed-request-loss-observation.js"

const PROCESS_BOUND = 30_000
const hash = async (file: Schema.Schema.Type<typeof ResidentPackagePath>) =>
  createHash("sha256")
    .update(await fs.readFile(file))
    .digest("hex")
const runFile = promisify(execFile)

it.skipIf(process.platform !== "linux").each(ManagedRequestLossPoint.literals)(
  "keeps managed request outcome uncertainty after backend loss at %s without replay or registry retirement",
  { timeout: PROCESS_BOUND },
  async (point) => {
    const bundle = await buildIsolatedStdioServer(PROCESS_BOUND)
    const root = await fs.mkdtemp(join(await fs.realpath(tmpdir()), "resident-managed-request-loss-"))
    const fixture = join(dirname(bundle.path), "managed-request-loss.cjs")
    const backendProgram = point === "drain" ? join(dirname(bundle.path), "managed-sdk-drain-backend.cjs") : bundle.path
    let passed = false
    try {
      const packageVersion = Schema.decodeUnknownSync(
        Schema.fromJsonString(Schema.Struct({ version: Schema.NonEmptyString }))
      )(await fs.readFile("package.json", "utf8")).version
      if (point === "drain")
        await runFile(
          ESBUILD_EXECUTABLE,
          [
            "test/resident/fixtures/managed-sdk-drain-backend.ts",
            "--bundle",
            "--platform=node",
            "--format=cjs",
            ...NATIVE_RUNTIME_EXTERNALS,
            `--define:PKG_VERSION=${JSON.stringify(packageVersion)}`,
            `--outfile=${backendProgram}`
          ],
          { timeout: PROCESS_BOUND }
        )
      await runFile(
        ESBUILD_EXECUTABLE,
        [
          "test/resident/fixtures/managed-request-loss.ts",
          "--bundle",
          "--platform=node",
          "--format=cjs",
          ...NATIVE_RUNTIME_EXTERNALS,
          `--outfile=${fixture}`
        ],
        { timeout: PROCESS_BOUND }
      )
      const { stderr, stdout } = await runFile(
        "python3",
        [
          "test/resident/fixtures/reap-descendants.py",
          process.execPath,
          fixture,
          bundle.path,
          root,
          point,
          backendProgram
        ],
        { timeout: PROCESS_BOUND, env: testStdioEnvironment() }
      )
      const receipt = Schema.decodeUnknownSync(Schema.fromJsonString(ManagedRequestLossObservation))(stdout)
      expect(receipt.mcpSha256).toBe(await hash(ResidentPackagePath.make(bundle.path)))
      expect(receipt.backendSha256).toBe(await hash(ResidentPackagePath.make(backendProgram)))
      expect(receipt.driverSha256).toBe(await hash(ResidentPackagePath.make(fixture)))
      await fs.writeFile(
        `${root}.receipt.json`,
        Schema.encodeSync(Schema.fromJsonString(ManagedRequestLossObservation))(receipt),
        { mode: 0o600, flag: "wx" }
      )
      await fs.writeFile(`${root}.phases.log`, stderr, { mode: 0o600, flag: "wx" })
      expect(receipt.point).toBe(point)
      const writing = point === "write" || point === "drain"
      expect(receipt.modelRequests).toBe(1)
      expect(receipt.queryDispatches).toBe(point === "model" ? 0 : 1)
      expect(receipt.writeDispatches).toBe(writing ? 1 : 0)
      expect(receipt.committedWrites).toBe(writing ? 1 : 0)
      expect(receipt.projectName).toBe(writing ? RequestLossUpdatedName : RequestLossProjectName)
      expect(receipt.stopAcknowledgment).toBe(point === "drain" ? "admission-fenced" : "not-requested")
      expect(receipt.drainEntry).toBe(point === "drain" ? "observed-with-attachment" : "not-requested")
      expect(receipt.drainPausedBeforeKill).toBe(point === "drain")
      expect(receipt.replacementExitCode).toBe(1)
      expect(receipt.replacementStdoutBytes).toBe(0)
      expect(receipt.registryRetained).toBe(true)
      expect(receipt.unknownOutcome).toBe(true)
      passed = true
    } finally {
      if (passed) {
        await bundle.cleanup()
        await fs.rm(root, { recursive: true })
      }
    }
  }
)
