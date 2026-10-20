import * as fs from "node:fs/promises"
import { join } from "node:path"
import { isMainThread } from "node:worker_threads"
import { Config, Deferred, Effect, Schema } from "effect"

import { ResidentDirectory } from "../../../src/resident/protected-path.js"
import { ChildGateMarker } from "../parent-loss-observation.js"

const GATE_ALLOWANCE = 5_000

class GateError extends Schema.TaggedError<GateError>()("GateError", {}) {}

const main = Effect.gen(function* () {
  const transport = yield* Config.schema(
    Schema.Literals(["stdio-resident", "resident-bootstrap", "resident-child"]),
    "MCP_TRANSPORT"
  )
  if (transport !== "resident-child" || !isMainThread) return
  const directory = yield* Config.schema(ResidentDirectory, "RESIDENT_TEST_GATE_DIRECTORY")
  const disconnected = yield* Deferred.make<void>()
  let privateFrames = 0
  const originalParentPid = process.ppid
  const write = Effect.fn("ChildGate.write")(function* (phase: Schema.Schema.Type<typeof ChildGateMarker>["phase"]) {
    const encoded = yield* Schema.encodeEffect(Schema.fromJsonString(ChildGateMarker))({
      phase,
      childPid: process.pid,
      parentPid: originalParentPid,
      privateFrames
    })
    yield* Effect.tryPromise({
      try: async () => {
        const temporary = join(directory, `${phase}.${process.pid}.pending`)
        await fs.writeFile(temporary, encoded, { mode: 0o600, flag: "wx" })
        await fs.rename(temporary, join(directory, `${phase}.json`))
      },
      catch: () => new GateError({})
    })
  })
  yield* Effect.acquireUseRelease(
    Effect.sync(() => {
      const received = (_frame: unknown) => {
        privateFrames++
      }
      const lost = () => {
        Deferred.doneUnsafe(disconnected, Effect.void)
      }
      process.on("message", received)
      process.on("disconnect", lost)
      if (!process.connected) lost()
      return () => {
        process.removeListener("message", received)
        process.removeListener("disconnect", lost)
      }
    }),
    () =>
      write("held").pipe(Effect.andThen(Deferred.await(disconnected)), Effect.andThen(write("parent-disconnected"))),
    (remove) => Effect.sync(remove)
  ).pipe(Effect.timeout(GATE_ALLOWANCE))
})

await Effect.runPromise(main).catch(() => {
  process.stderr.write("Resident child entry gate failed\n")
  process.exit(1)
})
