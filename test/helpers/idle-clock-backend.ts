import { strict as assert } from "node:assert"
import { spawn } from "node:child_process"
import { once } from "node:events"
import { createInterface } from "node:readline"
import { Effect, Redacted, Schema } from "effect"

import type { LiveProbeEnvironment } from "../../scripts/resident-live-read-contract.js"

import type { ResidentPackagePath } from "../../src/resident/managed-contract.js"
import type { ResidentDirectory } from "../../src/resident/protected-path.js"
import { IdleClockCommand, IdleClockEvent } from "../resident/idle-clock-observation.js"

const RESPONSE_BOUND = 5_000
const RETIREMENT_BOUND = 7_000
const bounded = <A>(pending: Promise<A>, allowance = RESPONSE_BOUND) =>
  Effect.runPromise(Effect.promise(() => pending).pipe(Effect.timeout(allowance)))

// Internal owned-process port; the backend entrypoint parses argv/configuration.
export const spawnIdleClockBackend = async (options: {
  readonly backend: Schema.Schema.Type<typeof ResidentPackagePath>
  readonly directory: ResidentDirectory
  readonly environment: LiveProbeEnvironment
}) => {
  const child = spawn(process.execPath, [options.backend, options.directory], {
    env: Object.fromEntries(Object.entries(options.environment).map(([key, value]) => [key, Redacted.value(value)])),
    stdio: ["ignore", "pipe", "pipe", "ipc"]
  })
  const closed = once(child, "close")
  void closed.catch(() => {})
  if (child.stdout === null || child.stderr === null) {
    child.kill("SIGKILL")
    await bounded(closed, RETIREMENT_BOUND)
    throw new Error("Idle clock backend observation pipes are absent")
  }
  child.stderr.on("data", (bytes: Buffer) => process.stderr.write(bytes))
  const lines = createInterface({ input: child.stdout })
  const incoming = lines[Symbol.asyncIterator]()
  const next = async () => {
    const line = await bounded(incoming.next())
    if (line.done) throw new Error("Idle clock backend closed before an event")
    return Schema.decodeUnknownSync(Schema.fromJsonString(IdleClockEvent))(line.value)
  }
  const send = (phase: Schema.Schema.Type<typeof IdleClockCommand>["phase"]) =>
    child.send(Schema.encodeSync(IdleClockCommand)({ phase }))
  return {
    child,
    ready: async () => {
      const event = await next()
      if (event.kind !== "ready") throw new Error("Clock backend did not publish readiness")
      return event
    },
    advance: async (phase: Exclude<Schema.Schema.Type<typeof IdleClockCommand>["phase"], "retire">) => {
      send(phase)
      assert.deepEqual(await next(), { kind: "advanced", phase })
      process.stderr.write(`Managed idle clock: confirmed ${phase} advance\n`)
    },
    retire: async () => {
      send("retire")
      return bounded(closed, RETIREMENT_BOUND)
    },
    cleanup: async () => {
      try {
        if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL")
        await bounded(closed, RETIREMENT_BOUND)
      } finally {
        lines.close()
      }
    }
  }
}
