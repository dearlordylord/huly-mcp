import { strict as assert } from "node:assert"
import { spawn } from "node:child_process"
import { once } from "node:events"
import * as fs from "node:fs/promises"
import { join } from "node:path"
import { Effect, Schedule, Schema } from "effect"

import { ResidentPackagePath } from "../../../src/resident/managed-contract.js"
import { ResidentDirectory } from "../../../src/resident/protected-path.js"
import { openKernelReapedEvents, ReapedEventsFd } from "../../helpers/kernel-reaped-events.js"
import { residentSelectionEnvironment } from "../../helpers/resident-selection-environment.js"
import { AuthorizedOwnerMarker, AuthorizedParentLossObservation } from "../authorized-parent-loss-contract.js"

const RESPONSE_BOUND = 5_000
const POLL_MILLIS = 10
const Input = Schema.Struct({
  parent: ResidentPackagePath,
  child: ResidentPackagePath,
  root: ResidentDirectory,
  reapedFd: ReapedEventsFd
})
const MissingFile = Schema.Struct({ code: Schema.Literal("ENOENT") })
class MarkerReadError extends Schema.TaggedError<MarkerReadError>()("MarkerReadError", {
  reason: Schema.Literals(["missing", "unavailable"])
}) {}
const marker = (root: ResidentDirectory, phase: Schema.Schema.Type<typeof AuthorizedOwnerMarker>["phase"]) =>
  Effect.runPromise(
    Effect.tryPromise({
      try: () => fs.readFile(join(root, `${phase}.json`), "utf8"),
      catch: (error) => new MarkerReadError({ reason: Schema.is(MissingFile)(error) ? "missing" : "unavailable" })
    }).pipe(
      Effect.retry({ while: (error) => error.reason === "missing", schedule: Schedule.spaced(POLL_MILLIS) }),
      Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(AuthorizedOwnerMarker))),
      Effect.timeout(RESPONSE_BOUND)
    )
  )
const bounded = <A>(pending: Promise<A>) =>
  Effect.runPromise(Effect.promise(() => pending).pipe(Effect.timeout(RESPONSE_BOUND)))
const main = async () => {
  const input = Schema.decodeUnknownSync(Input)({
    parent: process.argv[2],
    child: process.argv[3],
    root: process.argv[4],
    reapedFd: process.env.HULY_TEST_REAPED_FD
  })
  const directory = ResidentDirectory.make(join(input.root, "state"))
  await fs.mkdir(directory, { mode: 0o700 })
  const kernel = openKernelReapedEvents(input.reapedFd)
  const parent = spawn(process.execPath, [input.parent, input.child, directory, input.root], {
    env: { ...residentSelectionEnvironment(), LAZY_ENVS: "true", HULY_MCP_TELEMETRY: "0" },
    stdio: ["ignore", "ignore", "pipe"]
  })
  const closed = once(parent, "close")
  void closed.catch(() => {})
  parent.stderr.on("data", (bytes: Buffer) => process.stderr.write(bytes))
  let primary: { readonly error: unknown } | undefined
  try {
    const authorized = await marker(input.root, "authorized")
    assert.equal(authorized.phase, "authorized")
    assert.equal(authorized.parentPid, parent.pid)
    assert.equal(authorized.privateFrames, 1)
    const tasks = await fs.readdir(`/proc/${authorized.parentPid}/task`)
    const childLists = await Promise.all(
      tasks.map((task) => fs.readFile(`/proc/${authorized.parentPid}/task/${task}/children`, "utf8"))
    )
    const children = childLists.flatMap((line) => (line.trim() === "" ? [] : line.trim().split(/\s+/)))
    assert.deepEqual(children, [String(authorized.childPid)])
    assert.equal((await fs.readdir(directory)).includes("selection.claim"), false)
    assert.deepEqual(await fs.readdir(join(directory, "generations")), [])
    process.stderr.write("Authorized parent loss: Start accepted, claim released, publication not begun\n")
    assert.equal(parent.kill("SIGKILL"), true)
    assert.deepEqual(await bounded(closed), [null, "SIGKILL"])
    const published = await marker(input.root, "published")
    if (published.phase !== "published") throw new Error("Authorized child did not publish after parent loss")
    assert.equal(published.childPid, authorized.childPid)
    assert.equal(published.parentPid, authorized.parentPid)
    assert.equal(published.privateFrames, 1)
    process.stderr.write("Authorized parent loss: original authorized child published independently\n")
    const childExit = await kernel.wait(authorized.childPid)
    assert.equal(childExit.exitCode, 0)
    assert.deepEqual(await fs.readdir(directory), [])
    process.stdout.write(
      Schema.encodeSync(Schema.fromJsonString(AuthorizedParentLossObservation))({
        childPid: authorized.childPid,
        parentPid: authorized.parentPid,
        parentExitSignal: "SIGKILL",
        privateFrames: 1,
        generation: published.generation,
        childExit,
        privateStateRemoved: true
      })
    )
  } catch (error) {
    primary = { error }
  }
  const cleanup = await Promise.allSettled([
    (async () => {
      if (parent.exitCode === null && parent.signalCode === null) parent.kill("SIGKILL")
      await bounded(closed)
    })()
  ])
  kernel.close()
  if (primary !== undefined) throw primary.error
  for (const outcome of cleanup) if (outcome.status === "rejected") throw outcome.reason
}
void main().catch(() => {
  process.stderr.write("Authorized parent loss fixture failed\n")
  process.exitCode = 1
})
