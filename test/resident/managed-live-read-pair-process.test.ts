import { execFile } from "node:child_process"
import * as fs from "node:fs/promises"
import { dirname, join } from "node:path"
import { promisify } from "node:util"
import { Deferred, Effect, Result, Schema } from "effect"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"

import {
  LiveReadTargets,
  ManagedLiveReadPairInput,
  ManagedLiveReadPairReceipt,
  LiveReadProbeDiagnostic
} from "../../scripts/resident-live-read-contract.js"
import { withRegistryDirectory } from "../helpers/resident-registry-fixture.js"
import { buildIsolatedStdioServer } from "../helpers/stdio-build.js"
import { residentSelectionEnvironment } from "../helpers/resident-selection-environment.js"
import { DisposableRestProject, startDisposableRestFixture } from "./disposable-rest-fixture.js"

const PROCESS_BOUND = 30_000
const READERS = 2
const PROJECT_READS = 4
const runFile = promisify(execFile)
const targets = Schema.decodeUnknownSync(LiveReadTargets)([
  { project: "ONE", name: "First managed fixture project" },
  { project: "TWO", name: "Second managed fixture project" }
])
const projects = Schema.decodeUnknownSync(Schema.Array(DisposableRestProject))(
  targets.map((target) => ({
    _id: `fixture-${target.project}`,
    _class: "tracker:class:Project",
    space: "fixture-space",
    modifiedOn: 1,
    modifiedBy: "fixture-owner",
    identifier: target.project,
    name: target.name,
    archived: false
  }))
)
const CommandFailure = Schema.Struct({ stderr: Schema.String })

describe.skipIf(process.platform !== "linux")("managed live-read campaign probe", () => {
  let bundle: Awaited<ReturnType<typeof buildIsolatedStdioServer>>
  let probe: string
  let preserveFailedBundle = false
  beforeAll(async () => {
    bundle = await buildIsolatedStdioServer(PROCESS_BOUND)
    probe = join(dirname(bundle.path), "managed-live-read-probe.cjs")
    await runFile(
      "pnpm",
      [
        "exec",
        "esbuild",
        "scripts/integration-resident-read-pair.ts",
        "--bundle",
        "--platform=node",
        "--format=cjs",
        "--external:ws",
        `--outfile=${probe}`
      ],
      { timeout: PROCESS_BOUND }
    )
  }, PROCESS_BOUND)
  afterEach(({ task }) => {
    if (task.result?.state !== "pass") preserveFailedBundle = true
  })
  afterAll(async () => {
    if (!preserveFailedBundle) await bundle?.cleanup()
  })

  it.each(["2026-07-28", "2025-06-18"])(
    "shares a packaged backend for two %s parent readers and joins its idle exit",
    { timeout: PROCESS_BOUND },
    async (protocol) =>
      withRegistryDirectory(async (directory) => {
        const firstWave = Effect.runSync(Deferred.make<void>())
        let arrivals = 0
        const rest = await startDisposableRestFixture({
          projects,
          onProjectRead: async () => {
            arrivals++
            if (arrivals === READERS) Effect.runSync(Deferred.succeed(firstWave, undefined))
            if (arrivals <= READERS) await Effect.runPromise(Deferred.await(firstWave))
          }
        })
        try {
          const input = Schema.decodeUnknownSync(ManagedLiveReadPairInput)({
            bundle: bundle.path,
            directory,
            targets,
            protocol
          })
          const result = await runFile(
            "python3",
            [
              "test/resident/fixtures/reap-descendants.py",
              "--report-reaped",
              process.execPath,
              probe,
              "managed-pair",
              Schema.encodeSync(Schema.fromJsonString(ManagedLiveReadPairInput))(input)
            ],
            {
              timeout: PROCESS_BOUND,
              env: { ...residentSelectionEnvironment(), HULY_URL: rest.endpoint, HULY_TOOL_MODE: "native" }
            }
          )
          const receipt = Schema.decodeUnknownSync(Schema.fromJsonString(ManagedLiveReadPairReceipt))(result.stdout)
          expect(receipt.protocol).toBe(protocol)
          expect(receipt.readers.map((reader) => reader.target)).toEqual(targets)
          expect(receipt.readers[0].generation).toBe(receipt.readers[1].generation)
          expect(receipt.readers[0].backendProcessId).toBe(receipt.backendExit.processId)
          expect(receipt.readers[1].backendProcessId).toBe(receipt.backendExit.processId)
          expect(receipt.readers[0].parentPid === receipt.readers[1].parentPid).toBe(false)
          expect(receipt.readers[0].adapterPid === receipt.readers[1].adapterPid).toBe(false)
          expect(receipt.backendExit.exitCode).toBe(0)
          expect(rest.observed.projectReads).toBe(PROJECT_READS)
          expect(rest.observed.modelRequests).toBe(1)
          expect(rest.observed.fullModelRequested).toBe(true)
          expect(rest.observed.invalidRequests).toBe(0)
          expect(await fs.readdir(directory)).toEqual([])
          expect(result.stderr.includes("Fixture supervision deadline exceeded")).toBe(false)
        } finally {
          Effect.runSync(Deferred.succeed(firstWave, undefined))
          await rest.close()
        }
      })
  )

  it("refuses an occupied namespace before creating a managed backend", { timeout: PROCESS_BOUND }, async () =>
    withRegistryDirectory(async (directory) => {
      const marker = join(directory, "unresolved-owner")
      await fs.writeFile(marker, "Private fixture marker", { mode: 0o600, flag: "wx" })
      const input = Schema.decodeUnknownSync(ManagedLiveReadPairInput)({ bundle: bundle.path, directory, targets })
      const failure = await runFile(
        "python3",
        [
          "test/resident/fixtures/reap-descendants.py",
          "--report-reaped",
          process.execPath,
          probe,
          "managed-pair",
          Schema.encodeSync(Schema.fromJsonString(ManagedLiveReadPairInput))(input)
        ],
        { timeout: PROCESS_BOUND, env: { ...residentSelectionEnvironment(), HULY_TOOL_MODE: "native" } }
      ).then(
        () => undefined,
        (error: unknown) => error
      )
      const parsed = Schema.decodeUnknownSync(CommandFailure)(failure)
      const diagnostics = parsed.stderr
        .split("\n")
        .map((line) => Schema.decodeUnknownResult(Schema.fromJsonString(LiveReadProbeDiagnostic))(line))
      expect(diagnostics.some((value) => Result.isSuccess(value) && value.success.phase === "ownership")).toBe(true)
      expect(parsed.stderr.includes("Fixture supervision deadline exceeded")).toBe(false)
      expect(await fs.readdir(directory)).toEqual(["unresolved-owner"])
      expect((await fs.readFile(marker, "utf8")) === "Private fixture marker").toBe(true)
    })
  )

  it("rejects a real SDK project reply with the wrong expected name", { timeout: PROCESS_BOUND }, async () =>
    withRegistryDirectory(async (directory) => {
      const rest = await startDisposableRestFixture({
        projects: projects.map((project) => ({ ...project, name: "Unexpected fixture project" }))
      })
      try {
        const input = Schema.decodeUnknownSync(ManagedLiveReadPairInput)({ bundle: bundle.path, directory, targets })
        const failure = await runFile(
          "python3",
          [
            "test/resident/fixtures/reap-descendants.py",
            "--report-reaped",
            process.execPath,
            probe,
            "managed-pair",
            Schema.encodeSync(Schema.fromJsonString(ManagedLiveReadPairInput))(input)
          ],
          {
            timeout: PROCESS_BOUND,
            env: { ...residentSelectionEnvironment(), HULY_URL: rest.endpoint, HULY_TOOL_MODE: "native" }
          }
        ).then(
          () => undefined,
          (error: unknown) => error
        )
        const parsed = Schema.decodeUnknownSync(CommandFailure)(failure)
        const diagnostics = parsed.stderr
          .split("\n")
          .map((line) => Schema.decodeUnknownResult(Schema.fromJsonString(LiveReadProbeDiagnostic))(line))
        expect(diagnostics.some((value) => Result.isSuccess(value) && value.success.phase === "read")).toBe(true)
        expect(rest.observed.projectReads).toBeGreaterThan(0)
        expect(rest.observed.invalidRequests).toBe(0)
        expect(parsed.stderr.includes("Fixture supervision deadline exceeded")).toBe(false)
        expect(await fs.readdir(directory)).toEqual([])
      } finally {
        await rest.close()
      }
    })
  )
})
