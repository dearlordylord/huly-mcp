import { strict as assert } from "node:assert"
import { spawn } from "node:child_process"
import { once } from "node:events"
import * as fs from "node:fs/promises"
import { join } from "node:path"
import { createInterface } from "node:readline"
import { Clock, Effect, Schedule, Schema } from "effect"

import { ResidentPackagePath, ResidentRegistryEnvelope } from "../../../src/resident/managed-contract.js"
import { ResidentDirectory } from "../../../src/resident/protected-path.js"
import { residentSelectionEnvironment } from "../../helpers/resident-selection-environment.js"
import { ManagedParentConnected, ManagedParentObservation } from "../managed-observation.js"
import { NativeHostObservation } from "../native-host-observation.js"

const RESPONSE_BOUND = 5_000
const RETIREMENT_BOUND = 7_000
const PARENTS = 10
const ALTERNATION = 2
const EXIT_POLL_MILLIS = 25
const SESSION_HOLD_MILLIS = 11_000
const Input = Schema.Struct({ bundle: ResidentPackagePath, fixture: ResidentPackagePath, directory: ResidentDirectory })
const MissingProcess = Schema.Struct({ code: Schema.Literal("ESRCH") })
const ConnectionWait = Schema.Struct({
  phase: Schema.Literal("await-connections"),
  coordinatorPid: ManagedParentConnected.fields.parentPid,
  parentPids: Schema.Array(ManagedParentConnected.fields.parentPid),
  monotonicMillis: Schema.Number
})
const NANOS_PER_MILLISECOND = 1_000_000n
const absent = (pid: number) => {
  try {
    process.kill(pid, 0)
    return false
  } catch (error) {
    if (Schema.is(MissingProcess)(error)) return true
    throw error
  }
}
const awaitAbsent = (pid: number, allowance: number) =>
  Effect.runPromise(
    Effect.sync(() => absent(pid)).pipe(
      Effect.repeat({ until: (gone) => gone, schedule: Schedule.spaced(EXIT_POLL_MILLIS) }),
      Effect.timeout(allowance)
    )
  )

const main = async () => {
  const input = Schema.decodeUnknownSync(Input)({
    bundle: process.argv[2],
    fixture: process.argv[3],
    directory: process.argv[4]
  })
  const parents = Array.from({ length: PARENTS }, (_, index) => {
    const host = index % ALTERNATION === 0 ? "claude-code" : "codex-mcp-client"
    const child = spawn(process.execPath, [input.fixture, input.bundle, input.directory, host], {
      env: residentSelectionEnvironment()
    })
    child.stderr.on("data", (chunk: Buffer) => process.stderr.write(chunk))
    child.stdin.on("error", () => process.stderr.write("Managed race: owned command pipe closed; waiting for exit\n"))
    const exited = once(child, "exit")
    const lines = createInterface({ input: child.stdout })
    const output = lines[Symbol.asyncIterator]()
    const nextLine = async () => {
      const next = await Effect.runPromise(Effect.promise(() => output.next()).pipe(Effect.timeout(RESPONSE_BOUND)))
      if (next.done) throw new Error("Managed parent exited without an observation")
      return next.value
    }
    const connected = async () =>
      Schema.decodeUnknownSync(Schema.fromJsonString(ManagedParentConnected))(await nextLine())
    const read = async () => Schema.decodeUnknownSync(Schema.fromJsonString(NativeHostObservation))(await nextLine())
    return { child, exited, lines, connected, read }
  })
  let report: Schema.Schema.Type<typeof ManagedParentObservation> | undefined
  try {
    process.stderr.write("Managed race: waiting for ten connections\n")
    process.stderr.write(
      `${Schema.encodeSync(Schema.fromJsonString(ConnectionWait))({
        phase: "await-connections",
        coordinatorPid: process.pid,
        parentPids: parents.flatMap(({ child }) => (child.pid === undefined ? [] : [child.pid])),
        monotonicMillis: Number((await Effect.runPromise(Clock.monotonicTimeNanos)) / NANOS_PER_MILLISECOND)
      })}\n`
    )
    await Promise.all(parents.map((parent) => parent.connected()))
    process.stderr.write("Managed race: waiting for ten observations\n")
    const observations = await Promise.all(
      parents.map(async (parent) => ({ parent, observation: await parent.read() }))
    )
    assert.equal(new Set(observations.map(({ observation }) => observation.parentPid)).size, PARENTS)
    assert.equal(new Set(observations.map(({ observation }) => observation.adapterPid)).size, PARENTS)
    for (const { observation } of observations) {
      assert.equal(observation.contextIsError, false)
      assert.ok(observation.tools.includes(observation.host === "claude-code" ? "list_projects" : "invoke_tool"))
    }
    const records = await fs.readdir(join(input.directory, "generations"))
    assert.equal(records.length, 1)
    const [name] = records
    if (name === undefined) throw new Error("No managed generation")
    const record = Schema.decodeUnknownSync(Schema.fromJsonString(ResidentRegistryEnvelope))(
      await fs.readFile(join(input.directory, "generations", name), "utf8")
    )
    const creatorSession = observations.find(
      ({ observation }) => observation.adapterPid === record.diagnostics.parentProcessId
    )
    const stopped = creatorSession ?? observations[0]
    if (stopped === undefined) throw new Error("No owned caller")
    if (creatorSession === undefined) {
      process.stderr.write("Managed race: verifying the disposable creator probe exited\n")
      await awaitAbsent(record.diagnostics.parentProcessId, RESPONSE_BOUND)
      assert.equal(absent(record.diagnostics.processId), false)
    }
    process.stderr.write("Managed race: stopping an active caller parent\n")
    stopped.parent.child.kill("SIGKILL")
    await Effect.runPromise(Effect.promise(() => stopped.parent.exited).pipe(Effect.timeout(RESPONSE_BOUND)))
    process.stderr.write("Managed race: waiting for the stopped adapter to exit\n")
    await awaitAbsent(stopped.observation.adapterPid, RESPONSE_BOUND)
    assert.equal(absent(record.diagnostics.processId), false)
    const survivor = observations.find(({ parent }) => parent !== stopped.parent)
    if (survivor === undefined) throw new Error("No independent survivor")
    process.stderr.write("Managed race: retaining sessions beyond the startup acquisition deadline\n")
    await Effect.runPromise(Effect.sleep(SESSION_HOLD_MILLIS))
    process.stderr.write("Managed race: reading through survivor\n")
    survivor.parent.child.stdin.write("read\n")
    const second = await survivor.parent.read()
    assert.equal(second.adapterPid, survivor.observation.adapterPid)
    assert.equal(second.contextIsError, false)
    assert.deepEqual(await fs.readdir(join(input.directory, "generations")), records)
    report = Schema.decodeUnknownSync(ManagedParentObservation)({
      parents: observations.map(({ observation }) => observation),
      survivor: second,
      generation: record.generation,
      ownerProcessId: record.diagnostics.processId,
      creatorAdapterPid: record.diagnostics.parentProcessId,
      creatorKind: creatorSession === undefined ? "probe" : "session",
      stoppedAdapterPid: stopped.observation.adapterPid,
      stoppedAdapterExited: true,
      creatorExited: true,
      backendExited: true,
      privateStateRemoved: true
    })
  } finally {
    process.stderr.write("Managed race: closing remaining parents\n")
    for (const parent of parents)
      if (parent.child.exitCode === null && parent.child.signalCode === null) parent.child.stdin.end("close\n")
    try {
      await Promise.all(
        parents.map((parent) =>
          Effect.runPromise(Effect.promise(() => parent.exited).pipe(Effect.timeout(RESPONSE_BOUND)))
        )
      )
    } finally {
      for (const parent of parents) parent.lines.close()
    }
  }
  if (report === undefined) throw new Error("No managed observation")
  process.stderr.write("Managed race: waiting for idle backend exit\n")
  await awaitAbsent(report.ownerProcessId, RETIREMENT_BOUND)
  assert.deepEqual(await fs.readdir(input.directory), [])
  process.stdout.write(Schema.encodeSync(Schema.fromJsonString(ManagedParentObservation))(report))
}

void main().catch((error: unknown) => {
  process.stderr.write(
    error instanceof Error
      ? `${error.name}: managed race fixture failed\n${error.stack
          ?.split("\n")
          .filter((line) => /^\s+at /u.test(line))
          .join("\n")}\n`
      : "Managed race fixture failed\n"
  )
  process.exitCode = 1
})
