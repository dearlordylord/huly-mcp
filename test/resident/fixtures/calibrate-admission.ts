import { execFile, spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { createHash } from "node:crypto"
import { once } from "node:events"
import * as fs from "node:fs/promises"
import { dirname, join } from "node:path"
import { createInterface } from "node:readline"
import { promisify } from "node:util"
import { NodeRuntime } from "@effect/platform-node"
import { Clock, Config, Effect, Schema } from "effect"

import { buildIsolatedStdioServer } from "../../helpers/stdio-build.js"
import { residentSelectionEnvironment } from "../../helpers/resident-selection-environment.js"
import { NativeHostObservation } from "../native-host-observation.js"

const PROCESS_BOUND = 30_000
const RESPONSE_BOUND = 5_000
const NANOS_PER_MILLISECOND = 1_000_000
const ALTERNATION_PERIOD = 2
const PRIVATE_DIRECTORY_MODE = 0o700
const READY_PREFIX = "Resident attachment: "
const runFile = promisify(execFile)
const Input = Schema.Struct({
  directory: Schema.NonEmptyString,
  profile: Schema.Boolean,
  rounds: Schema.Int.check(Schema.isGreaterThan(0)),
  parents: Schema.Int.check(Schema.isGreaterThan(0))
})
const ParentMeasurement = Schema.Struct({ elapsedMillis: Schema.Finite, observation: NativeHostObservation })
const RoundMeasurement = Schema.Struct({ elapsedMillis: Schema.Finite, parents: Schema.Array(ParentMeasurement) })
const Report = Schema.Struct({
  node: Schema.String,
  backendPid: Schema.Int,
  bundleSha256: Schema.String,
  profiled: Schema.Boolean,
  rounds: Schema.Array(RoundMeasurement)
})
class CalibrationFailed extends Schema.TaggedError<CalibrationFailed>()("CalibrationFailed", {
  stage: Schema.String
}) {}
const attempt = <A>(stage: string, run: (signal: AbortSignal) => Promise<A>) =>
  Effect.tryPromise({ try: run, catch: () => new CalibrationFailed({ stage }) })

const stop = (backend: ChildProcessWithoutNullStreams) =>
  attempt("owned backend stop", async () => {
    if (backend.exitCode !== null || backend.signalCode !== null) return
    const ended = once(backend, "exit", { signal: AbortSignal.timeout(RESPONSE_BOUND) })
    backend.kill("SIGTERM")
    try {
      await ended
    } finally {
      if (backend.exitCode === null && backend.signalCode === null) {
        const forced = once(backend, "exit", { signal: AbortSignal.timeout(RESPONSE_BOUND) })
        backend.kill("SIGKILL")
        await forced
      }
    }
  })

const main = Effect.gen(function* () {
  const input = yield* Config.schema(Schema.fromJsonString(Input), "RESIDENT_CALIBRATION_INPUT")
  yield* attempt("artifact directory", () =>
    fs.mkdir(input.directory, { recursive: true, mode: PRIVATE_DIRECTORY_MODE })
  )
  const state = yield* attempt("private state directory", () => fs.mkdtemp(join(input.directory, "state-")))
  const bundle = yield* attempt("package build", () => buildIsolatedStdioServer(PROCESS_BOUND))
  yield* Effect.acquireUseRelease(
    Effect.succeed(bundle),
    (ownedBundle) =>
      Effect.gen(function* () {
        const hostBundle = join(dirname(ownedBundle.path), "native-host.cjs")
        yield* attempt("host fixture build", () =>
          runFile(
            "pnpm",
            [
              "exec",
              "esbuild",
              "test/resident/fixtures/native-host.ts",
              "--bundle",
              "--platform=node",
              "--format=cjs",
              `--outfile=${hostBundle}`
            ],
            { timeout: PROCESS_BOUND }
          )
        )
        const backend = spawn(
          process.execPath,
          [...(input.profile ? ["--cpu-prof", `--cpu-prof-dir=${input.directory}`] : []), ownedBundle.path],
          {
            env: {
              ...residentSelectionEnvironment(),
              MCP_TRANSPORT: "resident-http",
              MCP_RESIDENT_STATE_DIRECTORY: state,
              MCP_RESIDENT_ATTACHMENT_CAPACITY: String(input.parents)
            }
          }
        )
        yield* Effect.acquireUseRelease(
          Effect.succeed(backend),
          (ownedBackend) =>
            Effect.gen(function* () {
              const lines = createInterface({ input: ownedBackend.stderr })
              const file = yield* attempt("backend readiness", async () => {
                try {
                  for await (const line of lines)
                    if (line.startsWith(READY_PREFIX))
                      return Schema.decodeUnknownSync(Schema.NonEmptyString)(line.slice(READY_PREFIX.length))
                  throw new Error("No ready generation")
                } finally {
                  lines.close()
                }
              }).pipe(Effect.timeout(RESPONSE_BOUND))
              const rounds: Array<Schema.Schema.Type<typeof RoundMeasurement>> = []
              for (let round = 0; round < input.rounds; round++) {
                const roundStart = yield* Clock.monotonicTimeNanos
                const parents = yield* Effect.forEach(
                  Array.from({ length: input.parents }, (_, index) => index),
                  (index) =>
                    Effect.gen(function* () {
                      const host = index % ALTERNATION_PERIOD === 0 ? "claude-code" : "codex-mcp-client"
                      const mode = round % ALTERNATION_PERIOD === 0 ? "modern" : "legacy"
                      const started = yield* Clock.monotonicTimeNanos
                      const output = yield* attempt("independent host", (signal) =>
                        runFile(process.execPath, [hostBundle, ownedBundle.path, file, host, mode], {
                          timeout: PROCESS_BOUND,
                          signal,
                          env: residentSelectionEnvironment()
                        })
                      )
                      const elapsedMillis = Number((yield* Clock.monotonicTimeNanos) - started) / NANOS_PER_MILLISECOND
                      const observation = yield* Schema.decodeUnknownEffect(
                        Schema.fromJsonString(NativeHostObservation)
                      )(output.stdout)
                      if (
                        observation.contextIsError ||
                        observation.tools.length === 0 ||
                        observation.resourceTemplates.length === 0 ||
                        observation.host !== host ||
                        observation.mode !== mode
                      )
                        return yield* new CalibrationFailed({ stage: "catalog/context correctness" })
                      return ParentMeasurement.make({ elapsedMillis, observation })
                    }),
                  { concurrency: "unbounded" }
                )
                if (
                  new Set(parents.map((parent) => parent.observation.parentPid)).size !== input.parents ||
                  new Set(parents.map((parent) => parent.observation.adapterPid)).size !== input.parents
                )
                  return yield* new CalibrationFailed({ stage: "independent process ownership" })
                rounds.push(
                  RoundMeasurement.make({
                    elapsedMillis: Number((yield* Clock.monotonicTimeNanos) - roundStart) / NANOS_PER_MILLISECOND,
                    parents
                  })
                )
              }
              const bytes = yield* attempt("bundle hash", () => fs.readFile(ownedBundle.path))
              const backendPid = yield* Schema.decodeUnknownEffect(Schema.Int.check(Schema.isGreaterThan(0)))(
                ownedBackend.pid
              )
              const report = Report.make({
                node: process.version,
                backendPid,
                bundleSha256: createHash("sha256").update(bytes).digest("hex"),
                profiled: input.profile,
                rounds
              })
              yield* attempt("report", () =>
                fs.writeFile(
                  join(input.directory, "report.json"),
                  Schema.encodeSync(Schema.fromJsonString(Report))(report)
                )
              )
            }),
          stop
        )
      }),
    (ownedBundle) => attempt("bundle cleanup", ownedBundle.cleanup)
  )
  const remaining = yield* attempt("state cleanup evidence", () => fs.readdir(state))
  if (remaining.length !== 0) return yield* new CalibrationFailed({ stage: "generation descriptor cleanup" })
  yield* attempt("state directory cleanup", () => fs.rmdir(state))
})

NodeRuntime.runMain(main)
