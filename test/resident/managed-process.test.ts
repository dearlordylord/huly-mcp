import { ESBUILD_EXECUTABLE, NATIVE_RUNTIME_EXTERNALS } from "../helpers/stdio-build.js"
import { execFile } from "node:child_process"
import * as fs from "node:fs/promises"
import { join } from "node:path"
import { promisify } from "node:util"
import { Effect, Redacted, Schedule, Schema } from "effect"
import { afterAll, beforeAll, expect, it } from "vitest"

import {
  ManagedExecutable,
  ManagedLaunchError,
  MAX_BOOTSTRAP_BYTES,
  ResidentStartupCapture
} from "../../src/resident/managed-contract.js"
import { launchManagedChild } from "../../src/resident/managed-process.js"
import { captureResidentSelection } from "../../src/resident/selection-config.js"
import { acquireSelectionClaim } from "../../src/resident/selection-claim.js"
import { makeStartupBudget, type StartupBudget } from "../../src/resident/startup-budget.js"
import { withRegistryDirectory } from "../helpers/resident-registry-fixture.js"
import { type PeerMode, PeerObservation } from "./managed-peer-observation.js"

const PROCESS_BOUND = 30_000
const OBSERVATION_BOUND = 5_000
const POLL_MILLIS = 10
const runFile = promisify(execFile)
const MissingFile = Schema.Struct({ code: Schema.Literal("ENOENT") })
const MissingProcess = Schema.Struct({ code: Schema.Literal("ESRCH") })
let fixtureDirectory: string
let executable: ManagedExecutable
let completed = 0
const EXPECTED_CASES = 12
beforeAll(async () => {
  await fs.mkdir(join(process.cwd(), "dist"), { recursive: true })
  fixtureDirectory = await fs.mkdtemp(join(process.cwd(), "dist", "managed-bootstrap-peer-"))
  const file = join(fixtureDirectory, "peer.cjs")
  await runFile(
    ESBUILD_EXECUTABLE,
    [
      "test/resident/fixtures/managed-bootstrap-peer.ts",
      "--bundle",
      "--platform=node",
      "--format=cjs",
      ...NATIVE_RUNTIME_EXTERNALS,
      `--outfile=${file}`
    ],
    { timeout: PROCESS_BOUND }
  )
  executable = Schema.decodeUnknownSync(ManagedExecutable)({ executable: process.execPath, packageFile: file })
}, PROCESS_BOUND)
afterAll(async () => {
  if (completed === EXPECTED_CASES) await fs.rm(fixtureDirectory, { recursive: true })
})

const exists = async (file: string) => {
  try {
    await fs.access(file)
    return true
  } catch (error) {
    if (Schema.is(MissingFile)(error)) return false
    throw error
  }
}
const absent = (pid: number) => {
  try {
    process.kill(pid, 0)
    return false
  } catch (error) {
    if (Schema.is(MissingProcess)(error)) return true
    throw error
  }
}
const awaitCondition = (condition: Effect.Effect<boolean>) =>
  condition.pipe(
    Effect.repeat({ until: (ready) => ready, schedule: Schedule.spaced(POLL_MILLIS) }),
    Effect.timeout(OBSERVATION_BOUND)
  )
const read = (file: string) =>
  Effect.promise(async () =>
    Schema.decodeUnknownSync(Schema.fromJsonString(PeerObservation))(await fs.readFile(file, "utf8"))
  )
const withPeer = async <E>(
  mode: Schema.Schema.Type<typeof PeerMode>,
  use: (options: Parameters<typeof launchManagedChild>[0]) => Effect.Effect<void, E>
) =>
  withRegistryDirectory(async (directory) => {
    try {
      await Effect.runPromise(
        Effect.gen(function* () {
          const capture = yield* captureResidentSelection({
            HULY_URL: "https://peer.invalid",
            HULY_WORKSPACE: "managed-peer",
            HULY_TOKEN: "captured-fixture-token"
          })
          const startup = yield* makeStartupBudget
          yield* Effect.acquireUseRelease(
            acquireSelectionClaim(directory),
            (claim) =>
              use({
                executable,
                capture,
                claim,
                startup,
                environment: {
                  RESIDENT_TEST_CHILD_MODE: mode,
                  RESIDENT_TEST_DIRECTORY: directory,
                  HULY_TOKEN: "raw-env-secret",
                  HULY_PROFILE: "raw-profile",
                  MCP_AUTH_TOKEN: "raw-authorization"
                }
              }),
            (claim) => claim.release
          )
        })
      )
    } finally {
      const prepared = join(directory, "prepared.json")
      if (await exists(prepared))
        await Effect.runPromise(
          read(prepared).pipe(
            Effect.flatMap((observation) => awaitCondition(Effect.sync(() => absent(observation.pid))))
          )
        )
    }
    completed++
  })

it("refuses a prepared child that has already exited before control admission", { timeout: PROCESS_BOUND }, async () =>
  withPeer("exit-before-prepared", (options) =>
    Effect.gen(function* () {
      const prepared = join(options.claim.directory, "prepared.json")
      const beforeControl = awaitCondition(Effect.promise(() => exists(prepared))).pipe(
        Effect.andThen(read(prepared)),
        Effect.flatMap((observation) => awaitCondition(Effect.sync(() => absent(observation.pid)))),
        Effect.mapError(
          () => new ManagedLaunchError({ reason: "ipc", message: "Owned fixture exit was not confirmed" })
        )
      )
      const startup: StartupBudget = {
        within: (operation) => options.startup.within(beforeControl.pipe(Effect.andThen(operation)))
      }
      expect((yield* launchManagedChild({ ...options, startup }).pipe(Effect.flip))._tag).toBe("ManagedLaunchError")
      expect(yield* Effect.promise(() => exists(join(options.claim.directory, "started.json")))).toBe(false)
    })
  )
)

it("disconnects instead of killing when an authorized child refuses readiness", { timeout: PROCESS_BOUND }, async () =>
  withPeer("refuse-after-start", (options) =>
    Effect.gen(function* () {
      expect((yield* launchManagedChild(options).pipe(Effect.flip))._tag).toBe("ManagedLaunchError")
      yield* awaitCondition(Effect.promise(() => exists(join(options.claim.directory, "disconnected.json"))))
      expect((yield* read(join(options.claim.directory, "started.json"))).workspace).toBe("managed-peer")
    })
  )
)

it(
  "hands off parsed authority after preparation and disconnects without killing the authorized child",
  { timeout: PROCESS_BOUND },
  async () =>
    withPeer("ready", (options) =>
      Effect.gen(function* () {
        const file = yield* launchManagedChild(options)
        expect(file).toBe(join(options.claim.directory, "application.json"))
        yield* awaitCondition(Effect.promise(() => exists(join(options.claim.directory, "disconnected.json"))))
        const prepared = yield* read(join(options.claim.directory, "prepared.json"))
        const started = yield* read(join(options.claim.directory, "started.json"))
        expect(prepared.rawHulyEnvironmentPresent).toBe(false)
        expect(started.workspace).toBe("managed-peer")
        yield* awaitCondition(Effect.sync(() => absent(prepared.pid)))
      })
    )
)

for (const mode of ["wrong-version", "wrong-nonce", "premature-ready", "malformed", "refused"] satisfies Array<
  Schema.Schema.Type<typeof PeerMode>
>) {
  it(
    `terminates only its prepared child after ${mode}, without transferring authority`,
    { timeout: PROCESS_BOUND },
    async () =>
      withPeer(mode, (options) =>
        Effect.gen(function* () {
          expect((yield* launchManagedChild(options).pipe(Effect.flip))._tag).toBe("ManagedLaunchError")
          const prepared = yield* read(join(options.claim.directory, "prepared.json"))
          expect(prepared.rawHulyEnvironmentPresent).toBe(false)
          expect(yield* Effect.promise(() => exists(join(options.claim.directory, "started.json")))).toBe(false)
          yield* awaitCondition(Effect.sync(() => absent(prepared.pid)))
        })
      )
  )
}

it("joins its owned prepared child when claim authorization fails before Start", { timeout: PROCESS_BOUND }, async () =>
  withPeer("ready", (options) =>
    Effect.gen(function* () {
      yield* options.claim.release
      const error = yield* launchManagedChild(options).pipe(Effect.flip)
      expect(error._tag).toBe("SelectionClaimError")
      const prepared = yield* read(join(options.claim.directory, "prepared.json"))
      expect(absent(prepared.pid)).toBe(true)
      expect(yield* Effect.promise(() => exists(join(options.claim.directory, "started.json")))).toBe(false)
    })
  )
)

it("reports lost readiness after Start and confirms the child exits", { timeout: PROCESS_BOUND }, async () =>
  withPeer("exit-before-ready", (options) =>
    Effect.gen(function* () {
      expect((yield* launchManagedChild(options).pipe(Effect.flip))._tag).toBe("ManagedLaunchError")
      const started = yield* read(join(options.claim.directory, "started.json"))
      expect(started.workspace).toBe("managed-peer")
      yield* awaitCondition(Effect.sync(() => absent(started.pid)))
    })
  )
)

it("reports failure to spawn its exact executable without creating child state", { timeout: PROCESS_BOUND }, async () =>
  withPeer("ready", (options) =>
    Effect.gen(function* () {
      const missing = Schema.decodeUnknownSync(ManagedExecutable)({
        ...options.executable,
        executable: join(options.claim.directory, "missing-node")
      })
      expect((yield* launchManagedChild({ ...options, executable: missing }).pipe(Effect.flip))._tag).toBe(
        "ManagedLaunchError"
      )
      expect(yield* Effect.promise(() => fs.readdir(options.claim.directory))).toEqual(["selection.claim"])
    })
  )
)

it("refuses oversized private authority before creating a child", { timeout: PROCESS_BOUND }, async () =>
  withPeer("ready", (options) =>
    Effect.gen(function* () {
      const capture = ResidentStartupCapture.make({
        ...options.capture,
        selection: {
          ...options.capture.selection,
          huly: {
            ...options.capture.selection.huly,
            auth: { _tag: "token", token: Redacted.make("x".repeat(MAX_BOOTSTRAP_BYTES)) }
          }
        }
      })
      expect((yield* launchManagedChild({ ...options, capture }).pipe(Effect.flip))._tag).toBe("ManagedLaunchError")
      expect(yield* Effect.promise(() => fs.readdir(options.claim.directory))).toEqual(["selection.claim"])
    })
  )
)
