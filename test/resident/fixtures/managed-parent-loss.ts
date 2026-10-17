import { strict as assert } from "node:assert"
import { spawn } from "node:child_process"
import { once } from "node:events"
import * as fs from "node:fs/promises"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { Effect, Schedule, Schema } from "effect"

import { ResidentPackagePath } from "../../../src/resident/managed-contract.js"
import { ResidentDirectory } from "../../../src/resident/protected-path.js"
import { residentSelectionEnvironment } from "../../helpers/resident-selection-environment.js"
import { ChildGateMarker, ParentLossObservation } from "../parent-loss-observation.js"

const RESPONSE_BOUND = 5_000
const POLL_MILLIS = 10
const Input = Schema.Struct({ bundle: ResidentPackagePath, directory: ResidentDirectory, preload: ResidentPackagePath })
const MissingFile = Schema.Struct({ code: Schema.Literal("ENOENT") })
const MissingProcess = Schema.Struct({ code: Schema.Literal("ESRCH") })
class MarkerReadError extends Schema.TaggedError<MarkerReadError>()("MarkerReadError", {
  reason: Schema.Literals(["missing", "unavailable"])
}) {}

const readGateMarker = (directory: ResidentDirectory, phase: Schema.Schema.Type<typeof ChildGateMarker>["phase"]) =>
  Effect.runPromise(
    Effect.tryPromise({
      try: () => fs.readFile(join(directory, `${phase}.json`), "utf8"),
      catch: (error) => new MarkerReadError({ reason: Schema.is(MissingFile)(error) ? "missing" : "unavailable" })
    }).pipe(
      Effect.retry({ while: (error) => error.reason === "missing", schedule: Schedule.spaced(POLL_MILLIS) }),
      Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(ChildGateMarker))),
      Effect.timeout(RESPONSE_BOUND)
    )
  )
const awaitAbsent = (pid: number) =>
  Effect.runPromise(
    Effect.sync(() => {
      try {
        process.kill(pid, 0)
        return false
      } catch (error) {
        if (Schema.is(MissingProcess)(error)) return true
        throw error
      }
    }).pipe(
      Effect.repeat({ until: (gone) => gone, schedule: Schedule.spaced(POLL_MILLIS) }),
      Effect.timeout(RESPONSE_BOUND)
    )
  )
const bounded = <A>(promise: Promise<A>) =>
  Effect.runPromise(Effect.promise(() => promise).pipe(Effect.timeout(RESPONSE_BOUND)))

const main = async () => {
  const input = Schema.decodeUnknownSync(Input)({
    bundle: process.argv[2],
    directory: process.argv[3],
    preload: process.argv[4]
  })
  const parent = spawn(process.execPath, [input.bundle], {
    env: {
      ...residentSelectionEnvironment(),
      MCP_TRANSPORT: "stdio-resident",
      LAZY_ENVS: "true",
      HULY_MCP_TELEMETRY: "0",
      MCP_RESIDENT_STATE_DIRECTORY: input.directory,
      RESIDENT_TEST_GATE_DIRECTORY: input.directory,
      NODE_OPTIONS: `--import=${pathToFileURL(input.preload).href}`
    },
    stdio: ["ignore", "ignore", "pipe"]
  })
  parent.stderr.on("data", () => {})
  const closed = once(parent, "close")
  void closed.catch(() => {})
  try {
    process.stderr.write("Parent loss: waiting for the real child entry gate\n")
    const held = await readGateMarker(input.directory, "held")
    assert.equal(held.phase, "held")
    assert.equal(held.parentPid, parent.pid)
    assert.equal(held.privateFrames, 0)
    if (parent.pid === undefined) throw new Error("Owned parent did not spawn")
    const tasks = await fs.readdir(`/proc/${parent.pid}/task`)
    const childLists = await Promise.all(
      tasks.map((task) => fs.readFile(`/proc/${parent.pid}/task/${task}/children`, "utf8"))
    )
    const children = childLists.flatMap((list) => (list.trim() === "" ? [] : list.trim().split(/\s+/)))
    assert.deepEqual(children, [String(held.childPid)])
    assert.equal((await fs.stat(join(input.directory, "selection.claim"))).isDirectory(), true)
    process.stderr.write("Parent loss: killing only the owned parent before authorization\n")
    parent.kill("SIGKILL")
    assert.deepEqual(await bounded(closed), [null, "SIGKILL"])
    const released = await readGateMarker(input.directory, "parent-disconnected")
    assert.equal(released.childPid, held.childPid)
    assert.equal(released.parentPid, held.parentPid)
    assert.equal(released.privateFrames, 0)
    await awaitAbsent(held.childPid)
    assert.deepEqual(await fs.readdir(join(input.directory, "generations")), [])
    assert.equal((await fs.stat(join(input.directory, "selection.claim"))).isDirectory(), true)
    process.stdout.write(
      Schema.encodeSync(Schema.fromJsonString(ParentLossObservation))({
        parentPid: parent.pid,
        childPid: held.childPid,
        parentExitSignal: "SIGKILL",
        privateFrames: 0,
        childExited: true,
        retainedClaim: true,
        publishedRecords: 0
      })
    )
  } finally {
    if (parent.exitCode === null && parent.signalCode === null) {
      parent.kill("SIGKILL")
      await bounded(closed)
    }
  }
}

void main().catch(() => {
  process.stderr.write("Managed parent loss fixture failed\n")
  process.exitCode = 1
})
