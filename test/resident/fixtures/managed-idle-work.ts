import { strict as assert } from "node:assert"
import { spawn } from "node:child_process"
import { once } from "node:events"
import * as fs from "node:fs/promises"
import { join } from "node:path"
import { createInterface } from "node:readline"
import { Effect, Schema } from "effect"

import { ResidentPackagePath, ResidentRegistryEnvelope } from "../../../src/resident/managed-contract.js"
import { ResidentDirectory } from "../../../src/resident/protected-path.js"
import { HostMessage } from "../../../src/resident/request-headers.js"
import { residentSelectionEnvironment } from "../../helpers/resident-selection-environment.js"
import { IDLE_WORK_TOOL, IdleWorkCommand, IdleWorkEvent, IdleWorkObservation } from "../idle-work-observation.js"

const RESPONSE_BOUND = 5_000
const RETIREMENT_BOUND = 7_000
const Input = Schema.Struct({ bundle: ResidentPackagePath, backend: ResidentPackagePath, directory: ResidentDirectory })
const bounded = <A>(pending: Promise<A>, allowance = RESPONSE_BOUND) =>
  Effect.runPromise(Effect.promise(() => pending).pipe(Effect.timeout(allowance)))
const main = async () => {
  const input = Schema.decodeUnknownSync(Input)({
    bundle: process.argv[2],
    backend: process.argv[3],
    directory: process.argv[4]
  })
  const environment = {
    ...residentSelectionEnvironment(),
    HULY_TOOL_MODE: "native",
    MCP_RESIDENT_STATE_DIRECTORY: input.directory
  }
  const backend = spawn(process.execPath, [input.backend, input.directory], {
    env: environment,
    stdio: ["ignore", "pipe", "pipe", "ipc"]
  })
  const closed = once(backend, "close")
  void closed.catch(() => {})
  if (backend.stdout === null || backend.stderr === null) {
    backend.kill("SIGKILL")
    await bounded(closed, RETIREMENT_BOUND)
    throw new Error("Idle work observation pipes are absent")
  }
  backend.stderr.on("data", (bytes: Buffer) => process.stderr.write(bytes))
  const lines = createInterface({ input: backend.stdout })
  const incoming = lines[Symbol.asyncIterator]()
  const next = async () => {
    const line = await bounded(incoming.next())
    if (line.done) throw new Error("Idle work backend ended before observation")
    return Schema.decodeUnknownSync(Schema.fromJsonString(IdleWorkEvent))(line.value)
  }
  let owned: { readonly child: ReturnType<typeof spawn>; readonly closed: Promise<unknown> } | undefined
  let primary: { readonly error: unknown } | undefined
  try {
    const ready = await next()
    if (ready.kind !== "ready") throw new Error("Idle work backend did not publish readiness")
    const record = join(input.directory, "generations", `${ready.generation}.json`)
    const original = await fs.readFile(record, "utf8")
    const envelope = Schema.decodeUnknownSync(Schema.fromJsonString(ResidentRegistryEnvelope))(original)
    assert.equal(envelope.diagnostics.processId, backend.pid)
    const adapter = spawn(process.execPath, [input.bundle], {
      env: { ...environment, MCP_TRANSPORT: "stdio-resident" }
    })
    const adapterClosed = once(adapter, "close")
    void adapterClosed.catch(() => {})
    owned = { child: adapter, closed: adapterClosed }
    let stdoutBytes = 0
    adapter.stdout.on("data", (bytes: Buffer) => {
      stdoutBytes += bytes.length
    })
    adapter.stderr.on("data", (bytes: Buffer) => process.stderr.write(bytes))
    adapter.stdin.on("error", () => {})
    adapter.stdin.write(
      `${Schema.encodeSync(Schema.fromJsonString(HostMessage))({ jsonrpc: "2.0", id: 41, method: "tools/call", params: { name: IDLE_WORK_TOOL, arguments: {}, _meta: { "io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientCapabilities": {}, "io.modelcontextprotocol/clientInfo": { name: "claude-code", version: "1" } } } })}\n`
    )
    assert.deepEqual(await next(), { kind: "started" })
    assert.equal(adapter.kill("SIGKILL"), true)
    assert.deepEqual(await bounded(adapterClosed), [null, "SIGKILL"])
    assert.equal(stdoutBytes, 0)
    assert.deepEqual(await next(), { kind: "cleaning" })
    backend.send(Schema.encodeSync(IdleWorkCommand)("expire"))
    assert.deepEqual(await next(), { kind: "advanced", phase: "expire" })
    assert.equal(backend.exitCode, null)
    assert.equal(backend.signalCode, null)
    assert.equal(await fs.readFile(record, "utf8"), original)
    process.stderr.write("Idle work: lease and two idle intervals elapsed while cleanup remains held\n")
    backend.send(Schema.encodeSync(IdleWorkCommand)("release"))
    assert.deepEqual(await next(), { kind: "cleaned" })
    backend.send(Schema.encodeSync(IdleWorkCommand)("almost-idle"))
    assert.deepEqual(await next(), { kind: "advanced", phase: "almost-idle" })
    assert.equal(backend.exitCode, null)
    assert.equal(await fs.readFile(record, "utf8"), original)
    backend.send(Schema.encodeSync(IdleWorkCommand)("retire"))
    assert.deepEqual(await next(), { kind: "retired", dispatches: 1 })
    assert.deepEqual(await bounded(closed, RETIREMENT_BOUND), [0, null])
    assert.deepEqual(await fs.readdir(input.directory), [])
    process.stdout.write(
      Schema.encodeSync(Schema.fromJsonString(IdleWorkObservation))({
        generation: ready.generation,
        adapterExitSignal: "SIGKILL",
        dispatches: 1,
        backendExitCode: 0,
        privateStateRemoved: true
      })
    )
  } catch (error) {
    primary = { error }
  }
  const cleanup = await Promise.allSettled([
    (async () => {
      if (owned !== undefined) {
        if (owned.child.exitCode === null && owned.child.signalCode === null) owned.child.kill("SIGKILL")
        await bounded(owned.closed)
      }
    })(),
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
  process.stderr.write("Managed idle work fixture failed\n")
  process.exitCode = 1
})
