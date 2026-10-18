import { strict as assert } from "node:assert"
import { execFile, spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { once } from "node:events"
import * as fs from "node:fs/promises"
import { join } from "node:path"
import { createInterface } from "node:readline"
import { promisify } from "node:util"
import { Effect, Schema } from "effect"

import { LiveReadProtocol, LiveReadProbeError } from "../../../scripts/resident-live-read-contract.js"
import { discoverLiveReadProtocol, liveReadMetadata } from "../../../scripts/resident-live-protocol.js"

import { ResidentPackagePath, ResidentRegistryEnvelope } from "../../../src/resident/managed-contract.js"
import { ResidentDirectory, ResidentFilePath } from "../../../src/resident/protected-path.js"
import { ResidentStopReport } from "../../../src/resident/operator-stop.js"
import { HostMessage } from "../../../src/resident/request-headers.js"
import { BackendMessage } from "../../../src/resident/response-stream.js"
import { KernelOwnedExit } from "../../helpers/kernel-reaped-events.js"
import { residentSelectionEnvironment } from "../../helpers/resident-selection-environment.js"
import { testStdioEnvironment } from "../../helpers/stdio-environment.js"
import { startRetiredCommitCounter } from "../retired-commit-remote.js"
import {
  RetiredCommitEvent,
  RetiredCommitObservation,
  RetiredCommitState,
  retiredCommitToolName
} from "../retired-commit-observation.js"

const FIRST_CALL_ID = 41
const CONTINUED_CALL_ID = 42
const MAX_INTERLEAVED_NOTIFICATIONS = 64
const RESPONSE_BOUND = 5_000
const runFile = promisify(execFile)
const Input = Schema.Struct({
  bundle: ResidentPackagePath,
  cli: ResidentPackagePath,
  backend: ResidentPackagePath,
  coordinator: ResidentPackagePath,
  root: ResidentDirectory,
  protocol: LiveReadProtocol
})
const CallResult = Schema.Struct({
  isError: Schema.optionalKey(Schema.Literal(false)),
  structuredContent: Schema.Struct({ result: RetiredCommitState })
})
const bounded = <A>(promise: Promise<A>) =>
  Effect.runPromise(Effect.promise(() => promise).pipe(Effect.timeout(RESPONSE_BOUND)))

const main = async () => {
  const input = Schema.decodeUnknownSync(Input)({
    bundle: process.argv[2],
    cli: process.argv[3],
    backend: process.argv[4],
    root: process.argv[5],
    coordinator: process.argv[1],
    protocol: process.argv[6]
  })
  const negotiation = { protocol: input.protocol, host: "first" } satisfies Parameters<typeof liveReadMetadata>[0]
  const directory = ResidentDirectory.make(join(input.root, "resident"))
  await fs.mkdir(directory, { mode: 0o700 })
  const remote = await startRetiredCommitCounter(ResidentFilePath.make(join(input.root, "counter.json")))
  const environment = { ...residentSelectionEnvironment(), MCP_RESIDENT_STATE_DIRECTORY: directory }
  const backends: ReturnType<typeof startBackend>[] = []
  const adapters: ReturnType<typeof startAdapter>[] = []
  function startBackend() {
    const child = spawn(process.execPath, [input.backend, directory, remote.endpoint.href], { env: environment })
    const closed = once(child, "close")
    void closed.catch(() => {})
    child.stderr.on("data", (bytes: Buffer) => process.stderr.write(bytes))
    child.stdin.on("error", () => {})
    const lines = createInterface({ input: child.stdout })
    const incoming = lines[Symbol.asyncIterator]()
    const owned = {
      child,
      processId: Schema.decodeUnknownSync(KernelOwnedExit.fields.processId)(child.pid),
      closed,
      lines,
      next: async () => {
        const line = await bounded(incoming.next())
        assert.equal(line.done, false)
        return Schema.decodeUnknownSync(Schema.fromJsonString(RetiredCommitEvent))(line.value)
      }
    }
    return owned
  }
  function startAdapter() {
    const child = spawn(process.execPath, [input.bundle], { env: { ...environment, MCP_TRANSPORT: "stdio-resident" } })
    const closed = once(child, "close")
    void closed.catch(() => {})
    child.stderr.on("data", (bytes: Buffer) => process.stderr.write(bytes))
    child.stdin.on("error", () => {})
    const lines = createInterface({ input: child.stdout })
    const incoming = lines[Symbol.asyncIterator]()
    const send = (message: HostMessage) =>
      child.stdin.write(`${Schema.encodeSync(Schema.fromJsonString(HostMessage))(message)}\n`)
    const request = (
      id: NonNullable<HostMessage["id"]>,
      method: string,
      params: Readonly<Record<string, Schema.Json>>
    ) =>
      bounded(
        (async () => {
          send({ jsonrpc: "2.0", id, method, params: { ...params, ...liveReadMetadata(negotiation) } })
          for (let count = 0; count < MAX_INTERLEAVED_NOTIFICATIONS; count++) {
            const next = await incoming.next()
            assert.equal(next.done, false)
            const message = Schema.decodeUnknownSync(Schema.fromJsonString(BackendMessage))(next.value)
            if (!("id" in message)) continue
            assert.equal(message.id, id)
            assert.ok("result" in message)
            return message.result
          }
          throw new Error("Too many fixture notifications")
        })()
      )
    const owned = {
      child,
      closed,
      lines,
      send,
      discover: () =>
        Effect.runPromise(
          discoverLiveReadProtocol(
            negotiation,
            (id, method, params) =>
              Effect.tryPromise({
                try: () => request(id, method, params),
                catch: () => new LiveReadProbeError({ phase: "discover" })
              }),
            (frame) =>
              Effect.tryPromise({
                try: () =>
                  bounded(
                    new Promise<void>((resolve, reject) =>
                      child.stdin.write(`${frame}\n`, (error) => (error ? reject(error) : resolve()))
                    )
                  ),
                catch: () => new LiveReadProbeError({ phase: "send" })
              })
          )
        ),
      read: async (id: Extract<NonNullable<HostMessage["id"]>, number>) =>
        Schema.decodeUnknownSync(CallResult)(
          await request(id, "tools/call", { name: retiredCommitToolName("read"), arguments: {} })
        ).structuredContent.result.writes
    }
    return owned
  }
  const stop = async (generation: Schema.Schema.Type<typeof ResidentRegistryEnvelope>["generation"]) => {
    const result = await runFile(
      process.execPath,
      [input.cli, "resident", "stop", "--generation", generation, "--state-directory", directory, "--json"],
      { env: testStdioEnvironment(), timeout: RESPONSE_BOUND }
    )
    const report = Schema.decodeUnknownSync(Schema.fromJsonString(ResidentStopReport))(result.stdout)
    assert.equal(report.kind, "accepted")
    assert.equal(report.retirement, "unconfirmed")
  }
  const checkRecord = async (
    generation: Schema.Schema.Type<typeof ResidentRegistryEnvelope>["generation"],
    pid: KernelOwnedExit["processId"]
  ) => {
    const record = Schema.decodeUnknownSync(Schema.fromJsonString(ResidentRegistryEnvelope))(
      await fs.readFile(join(directory, "generations", `${generation}.json`), "utf8")
    )
    assert.equal(record.generation, generation)
    assert.equal(record.diagnostics.processId, pid)
  }
  const exit = async (owned: ReturnType<typeof startBackend>) => {
    assert.deepEqual(
      Schema.decodeUnknownSync(Schema.Tuple([Schema.Literal(0), Schema.Null]))(await bounded(owned.closed)),
      [0, null]
    )
    return KernelOwnedExit.make({ processId: owned.processId, exitCode: 0 })
  }
  try {
    process.stderr.write("Retired commit: start original owner\n")
    const original = startBackend()
    backends.push(original)
    const ready = await original.next()
    assert.ok(ready.kind === "ready")
    await checkRecord(ready.generation, original.processId)
    const caller = startAdapter()
    adapters.push(caller)
    await caller.discover()
    caller.send({
      jsonrpc: "2.0",
      id: FIRST_CALL_ID,
      method: "tools/call",
      params: { name: retiredCommitToolName("increment"), arguments: {}, ...liveReadMetadata(negotiation) }
    })
    await Effect.runPromise(remote.entered.pipe(Effect.timeout(RESPONSE_BOUND)))
    process.stderr.write("Retired commit: remote dispatched; stop and cancel local invocation\n")
    await stop(ready.generation)
    caller.send({ jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: FIRST_CALL_ID } })
    const retired = await original.next()
    assert.deepEqual(retired, { kind: "retired", writes: 1, reads: 0 })
    const originalBackendExit = await exit(original)
    await Effect.runPromise(remote.disconnected.pipe(Effect.timeout(RESPONSE_BOUND)))
    assert.deepEqual(await fs.readdir(directory), [])
    caller.child.stdin.end()
    const [originalAdapterExit] = Schema.decodeUnknownSync(Schema.Tuple([Schema.Literals([0, 1]), Schema.Null]))(
      await bounded(caller.closed)
    )
    process.stderr.write("Retired commit: original exit confirmed; start replacement\n")
    const replacement = startBackend()
    backends.push(replacement)
    const fresh = await replacement.next()
    assert.ok(fresh.kind === "ready")
    assert.notEqual(fresh.generation, ready.generation)
    await checkRecord(fresh.generation, replacement.processId)
    const reader = startAdapter()
    adapters.push(reader)
    await reader.discover()
    const before = await reader.read(FIRST_CALL_ID)
    assert.equal(before, 0)
    process.stderr.write("Retired commit: fresh read still zero; permit old remote commit\n")
    await Effect.runPromise(remote.commit)
    await Effect.runPromise(remote.committed.pipe(Effect.timeout(RESPONSE_BOUND)))
    const after = await reader.read(CONTINUED_CALL_ID)
    assert.equal(after, 1)
    reader.child.stdin.end()
    assert.deepEqual(
      Schema.decodeUnknownSync(Schema.Tuple([Schema.Literal(0), Schema.Null]))(await bounded(reader.closed)),
      [0, null]
    )
    await stop(fresh.generation)
    assert.deepEqual(await replacement.next(), { kind: "retired", writes: 0, reads: 2 })
    const replacementBackendExit = await exit(replacement)
    await bounded(remote.settle())
    assert.deepEqual(remote.dispatches, { writes: 1, reads: 2 })
    assert.deepEqual(remote.failures, [])
    assert.deepEqual(await fs.readdir(directory), [])
    const hash = async (file: Schema.Schema.Type<typeof ResidentPackagePath>) =>
      createHash("sha256")
        .update(await fs.readFile(file))
        .digest("hex")
    const receipt = Schema.decodeUnknownSync(RetiredCommitObservation)({
      protocol: input.protocol,
      artifacts: {
        mcpSha256: await hash(input.bundle),
        cliSha256: await hash(input.cli),
        backendSha256: await hash(input.backend),
        coordinatorSha256: await hash(input.coordinator)
      },
      originalGeneration: ready.generation,
      replacementGeneration: fresh.generation,
      originalBackendExit,
      replacementBackendExit,
      originalAdapterExit,
      replacementAdapterExit: 0,
      writeDispatches: remote.dispatches.writes,
      readDispatches: remote.dispatches.reads,
      freshReadBeforeCommit: before,
      freshReadAfterCommit: after,
      privateStateRemoved: true
    })
    process.stdout.write(Schema.encodeSync(Schema.fromJsonString(RetiredCommitObservation))(receipt))
  } finally {
    Effect.runSync(remote.commit)
    try {
      for (const owned of [...adapters, ...backends]) {
        if (owned.child.exitCode === null && owned.child.signalCode === null) {
          owned.child.kill("SIGKILL")
          await bounded(owned.closed)
        }
        owned.lines.close()
      }
    } finally {
      await remote.close()
    }
  }
}
void main().catch(() => {
  process.stderr.write("Retired-commit fixture failed\n")
  process.exitCode = 1
})
