import { strict as assert } from "node:assert"
import { spawn } from "node:child_process"
import { once } from "node:events"
import * as fs from "node:fs/promises"
import { join } from "node:path"
import { createInterface } from "node:readline"
import { Effect, Schema } from "effect"

import { ResidentPackagePath, ResidentRegistryEnvelope } from "../../../src/resident/managed-contract.js"
import { ResidentDirectory } from "../../../src/resident/protected-path.js"
import { spawnManagedNativeParent } from "../../helpers/managed-native-parent.js"
import { residentSelectionEnvironment } from "../../helpers/resident-selection-environment.js"
import { IdleClockCommand, IdleClockEvent, IdleClockObservation } from "../idle-clock-observation.js"

const RESPONSE_BOUND = 5_000
const RETIREMENT_BOUND = 7_000
const Input = Schema.Struct({
  bundle: ResidentPackagePath,
  fixture: ResidentPackagePath,
  backend: ResidentPackagePath,
  directory: ResidentDirectory
})
const bounded = <A>(pending: Promise<A>, allowance = RESPONSE_BOUND) =>
  Effect.runPromise(Effect.promise(() => pending).pipe(Effect.timeout(allowance)))

const main = async () => {
  const input = Schema.decodeUnknownSync(Input)({
    bundle: process.argv[2],
    fixture: process.argv[3],
    backend: process.argv[4],
    directory: process.argv[5]
  })
  const backend = spawn(process.execPath, [input.backend, input.directory], {
    env: { ...residentSelectionEnvironment(), LAZY_ENVS: "true", HULY_MCP_TELEMETRY: "0" },
    stdio: ["ignore", "pipe", "pipe", "ipc"]
  })
  const closed = once(backend, "close")
  void closed.catch(() => {})
  if (backend.stdout === null || backend.stderr === null) {
    backend.kill("SIGKILL")
    await bounded(closed, RETIREMENT_BOUND)
    throw new Error("Idle clock backend observation pipes are absent")
  }
  backend.stderr.on("data", (bytes: Buffer) => process.stderr.write(bytes))
  const lines = createInterface({ input: backend.stdout })
  const incoming = lines[Symbol.asyncIterator]()
  const next = async () => {
    const line = await bounded(incoming.next())
    if (line.done) throw new Error("Idle clock backend closed before an event")
    return Schema.decodeUnknownSync(Schema.fromJsonString(IdleClockEvent))(line.value)
  }
  const advance = async (phase: Schema.Schema.Type<typeof IdleClockCommand>["phase"]) => {
    backend.send(Schema.encodeSync(IdleClockCommand)({ phase }))
    assert.deepEqual(await next(), { kind: "advanced", phase })
    process.stderr.write(`Managed idle clock: confirmed ${phase} advance\n`)
  }
  let parent: ReturnType<typeof spawnManagedNativeParent> | undefined
  let primary: { readonly error: unknown } | undefined
  try {
    const ready = await next()
    assert.equal(ready.kind, "ready")
    if (ready.kind !== "ready") throw new Error("Clock backend did not publish readiness")
    await advance("near")
    parent = spawnManagedNativeParent({ ...input, host: "claude-code", workspace: "fixture" })
    await parent.connected()
    const initial = await parent.read()
    assert.equal(initial.contextIsError, false)
    const record = join(input.directory, "generations", `${ready.generation}.json`)
    const original = await fs.readFile(record, "utf8")
    const envelope = Schema.decodeUnknownSync(Schema.fromJsonString(ResidentRegistryEnvelope))(original)
    assert.equal(envelope.diagnostics.processId, backend.pid)
    assert.deepEqual(await fs.readdir(join(input.directory, "generations")), [`${ready.generation}.json`])
    await advance("protected")
    parent.child.stdin.write("read\n")
    const continued = await parent.read()
    assert.equal(continued.contextIsError, false)
    assert.equal(continued.adapterPid, initial.adapterPid)
    assert.equal(continued.observedPort, initial.observedPort)
    assert.equal(await fs.readFile(record, "utf8"), original)
    assert.deepEqual(await parent.close(), [0, null])
    await advance("released")
    assert.equal(backend.exitCode, null)
    assert.equal(backend.signalCode, null)
    assert.equal(await fs.readFile(record, "utf8"), original)
    backend.send(Schema.encodeSync(IdleClockCommand)({ phase: "retire" }))
    assert.deepEqual(await bounded(closed, RETIREMENT_BOUND), [0, null])
    assert.deepEqual(await fs.readdir(input.directory), [])
    process.stderr.write("Managed idle clock: confirmed retired backend and empty state\n")
    process.stdout.write(
      Schema.encodeSync(Schema.fromJsonString(IdleClockObservation))({
        generation: ready.generation,
        initial,
        continued,
        backendExitCode: 0,
        parentExitCode: 0,
        privateStateRemoved: true
      })
    )
  } catch (error) {
    primary = { error }
  }
  const cleanup = await Promise.allSettled([
    parent?.close(),
    (async () => {
      if (backend.exitCode === null && backend.signalCode === null) backend.kill("SIGKILL")
      await bounded(closed, RETIREMENT_BOUND)
    })()
  ])
  lines.close()
  if (primary !== undefined) throw primary.error
  for (const outcome of cleanup) if (outcome.status === "rejected") throw outcome.reason
}

void main().catch(() => {
  process.stderr.write("Managed idle clock coordinator failed\n")
  process.exitCode = 1
})
