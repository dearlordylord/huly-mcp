import { strict as assert } from "node:assert"
import { execFile, spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { once } from "node:events"
import * as fs from "node:fs/promises"
import { join } from "node:path"
import { createInterface } from "node:readline"
import { promisify } from "node:util"
import { Client } from "@modelcontextprotocol/client"
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio"
import { Deferred, Effect, Schema } from "effect"

import { GetHulyContextResultSchema } from "../../../src/domain/schemas/huly-context.js"
import { ResidentPackagePath, ResidentRegistryEnvelope } from "../../../src/resident/managed-contract.js"
import { ResidentStopReport } from "../../../src/resident/operator-stop.js"
import { HostMessage } from "../../../src/resident/request-headers.js"
import { ResidentDirectory, ResidentFilePath } from "../../../src/resident/protected-path.js"
import { openKernelReapedEvents, ReapedEventsFd } from "../../helpers/kernel-reaped-events.js"
import { residentSelectionEnvironment } from "../../helpers/resident-selection-environment.js"
import { testStdioEnvironment } from "../../helpers/stdio-environment.js"
import {
  StopFaultCommand,
  StopFaultEvent,
  StopFaultMode,
  StopFaultObservation,
  StopFaultState
} from "../stop-fault-observation.js"

const RESPONSE_BOUND = 5_000
const runFile = promisify(execFile)
const Input = Schema.Struct({
  bundle: ResidentPackagePath,
  cli: ResidentPackagePath,
  backend: ResidentPackagePath,
  directory: ResidentDirectory,
  state: ResidentFilePath,
  mode: StopFaultMode,
  reapedFd: ReapedEventsFd
})
const bounded = <A>(promise: Promise<A>) =>
  Effect.runPromise(Effect.promise(() => promise).pipe(Effect.timeout(RESPONSE_BOUND)))
const connect = (input: Schema.Schema.Type<typeof Input>) => {
  const client = new Client(
    { name: "claude-code", version: "1" },
    { versionNegotiation: { mode: { pin: "2026-07-28" } } }
  )
  const closed = Effect.runSync(Deferred.make<void>())
  client.onclose = () => Effect.runSync(Deferred.succeed(closed, undefined))
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [input.bundle],
    stderr: "pipe",
    env: {
      ...residentSelectionEnvironment(),
      MCP_TRANSPORT: "stdio-resident",
      MCP_RESIDENT_STATE_DIRECTORY: input.directory
    }
  })
  const diagnostics: Array<Buffer> = []
  transport.stderr?.on("data", (chunk: Buffer) => diagnostics.push(chunk))
  return {
    client,
    transport,
    diagnostics,
    close: async () => {
      const owned = transport.pid !== null
      await transport.close()
      if (owned) await Effect.runPromise(Deferred.await(closed).pipe(Effect.timeout(RESPONSE_BOUND)))
    }
  }
}

const observeRefusedStart = async (input: Schema.Schema.Type<typeof Input>) => {
  const child = spawn(process.execPath, [input.bundle], {
    env: {
      ...residentSelectionEnvironment(),
      MCP_TRANSPORT: "stdio-resident",
      MCP_RESIDENT_STATE_DIRECTORY: input.directory
    }
  })
  const closed = once(child, "close")
  void closed.catch(() => {})
  const output: Array<Buffer> = []
  const diagnostics: Array<Buffer> = []
  child.stdout.on("data", (chunk: Buffer) => output.push(chunk))
  child.stderr.on("data", (chunk: Buffer) => diagnostics.push(chunk))
  child.stdin.on("error", () => {})
  try {
    child.stdin.end(
      `${Schema.encodeSync(Schema.fromJsonString(HostMessage))(HostMessage.make({ jsonrpc: "2.0", id: 1, method: "ping" }))}\n`
    )
    assert.deepEqual(await bounded(closed), [1, null])
    assert.equal(Buffer.concat(output).length, 0)
    return Buffer.concat(diagnostics)
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL")
      await bounded(closed)
    }
  }
}

const main = async () => {
  const input = Schema.decodeUnknownSync(Input)({
    bundle: process.argv[2],
    cli: process.argv[3],
    backend: process.argv[4],
    directory: process.argv[5],
    state: process.argv[6],
    mode: process.argv[7],
    reapedFd: process.env.HULY_TEST_REAPED_FD
  })
  const kernel = openKernelReapedEvents(input.reapedFd)
  const backend = spawn(process.execPath, [input.backend, input.directory, input.state, input.mode], {
    env: residentSelectionEnvironment(),
    stdio: ["ignore", "pipe", "pipe", "ipc"]
  })
  const exited = once(backend, "close")
  void exited.catch(() => {})
  assert.ok(backend.stderr !== null && backend.stdout !== null)
  const errors: Array<Buffer> = []
  backend.stderr.on("data", (chunk: Buffer) => errors.push(chunk))
  const lines = createInterface({ input: backend.stdout })
  const incoming = lines[Symbol.asyncIterator]()
  const next = async () => {
    const line = await bounded(incoming.next())
    if (line.done) throw new Error("Fault backend ended before expected event")
    return Schema.decodeUnknownSync(Schema.fromJsonString(StopFaultEvent))(line.value)
  }
  const original = connect(input)
  const replacement = connect(input)
  const refusedDiagnostics: Array<Buffer> = []
  const release = () => {
    if (backend.connected) backend.send(Schema.encodeSync(StopFaultCommand)({ kind: "release-cleanup" }), () => {})
  }
  try {
    process.stderr.write(`Managed stop fault: ${input.mode} await ready\n`)
    const ready = await next()
    assert.ok(ready.kind === "ready")
    const recordFile = join(input.directory, "generations", `${ready.generation}.json`)
    const originalRecord = await fs.readFile(recordFile, "utf8")
    await original.client.connect(original.transport, { timeout: RESPONSE_BOUND })
    assert.ok(
      (await original.client.listTools(undefined, { timeout: RESPONSE_BOUND })).tools.some(
        (tool) => tool.name === "fixture_increment"
      )
    )
    const abort = new AbortController()
    const operation = original.client.callTool(
      { name: "fixture_increment", arguments: {} },
      { timeout: RESPONSE_BOUND, signal: abort.signal }
    )
    void operation.catch(() => {})
    assert.equal((await next()).kind, "committed")
    process.stderr.write("Managed stop fault: committed once; request stop through packaged CLI\n")
    const stop = await runFile(
      process.execPath,
      [input.cli, "resident", "stop", "--generation", ready.generation, "--state-directory", input.directory, "--json"],
      { env: testStdioEnvironment(), timeout: RESPONSE_BOUND }
    )
    const acknowledgment = Schema.decodeUnknownSync(Schema.fromJsonString(ResidentStopReport))(stop.stdout)
    assert.equal(acknowledgment.kind, "accepted")
    assert.equal(acknowledgment.retirement, "unconfirmed")
    abort.abort(new Error("Fixture host cancelled after commit"))
    await assert.rejects(operation)
    assert.equal((await next()).kind, "cleaning")
    assert.equal(await fs.readFile(recordFile, "utf8"), originalRecord)
    assert.deepEqual(
      Schema.decodeUnknownSync(Schema.fromJsonString(StopFaultState))(await fs.readFile(input.state, "utf8")),
      { writes: 1 }
    )
    process.stderr.write("Managed stop fault: retained during held cleanup; release owned finalizer\n")
    release()
    const terminal = await next()
    assert.ok(terminal.kind === "retired" || terminal.kind === "retained")
    process.stderr.write(`Managed stop fault: terminal ${terminal.kind}\n`)
    assert.equal(terminal.dispatches, 1)
    const backendExitCode = input.mode === "normal-cleanup" ? 0 : 1
    assert.deepEqual(await bounded(exited), [backendExitCode, null])
    process.stderr.write("Managed stop fault: joined owned backend exit\n")
    await original.close()
    const replacementOutcome = input.mode === "normal-cleanup" ? "started" : "refused"
    if (input.mode === "normal-cleanup") {
      assert.equal(terminal.kind, "retired")
      assert.deepEqual(await fs.readdir(input.directory), [])
      await replacement.client.connect(replacement.transport, { timeout: RESPONSE_BOUND })
      const result = await replacement.client.callTool(
        { name: "get_huly_context", arguments: {} },
        { timeout: RESPONSE_BOUND }
      )
      assert.equal(result.isError ?? false, false)
      const context = Schema.decodeUnknownSync(Schema.Struct({ result: GetHulyContextResultSchema }))(
        result.structuredContent
      )
      assert.equal(context.result.huly.workspace.value, "fixture")
      const [name] = await fs.readdir(join(input.directory, "generations"))
      assert.ok(name !== undefined)
      const record = Schema.decodeUnknownSync(Schema.fromJsonString(ResidentRegistryEnvelope))(
        await fs.readFile(join(input.directory, "generations", name), "utf8")
      )
      assert.notEqual(record.generation, ready.generation)
      await replacement.close()
      assert.equal((await kernel.wait(record.diagnostics.processId)).exitCode, 0)
      assert.deepEqual(await fs.readdir(input.directory), [])
    } else {
      assert.equal(terminal.kind, "retained")
      assert.equal(await fs.readFile(recordFile, "utf8"), originalRecord)
      await assert.rejects(replacement.client.connect(replacement.transport, { timeout: RESPONSE_BOUND }))
      process.stderr.write("Managed stop fault: replacement connect refused\n")
      await replacement.close()
      assert.equal(await fs.readFile(recordFile, "utf8"), originalRecord)
      const refusal = await observeRefusedStart(input)
      refusedDiagnostics.push(refusal)
      const diagnostic = refusal.toString("utf8")
      assert.ok(diagnostic.includes("no Huly request was dispatched"))
      assert.ok(diagnostic.includes("No request was replayed"))
      assert.deepEqual(await fs.readdir(join(input.directory, "generations")), [`${ready.generation}.json`])
    }
    const diagnostics = Buffer.concat([
      ...errors,
      ...original.diagnostics,
      ...replacement.diagnostics,
      ...refusedDiagnostics
    ]).toString("utf8")
    assert.ok(!diagnostics.includes("fixture-private-close-cause"))
    assert.deepEqual(
      Schema.decodeUnknownSync(Schema.fromJsonString(StopFaultState))(await fs.readFile(input.state, "utf8")),
      { writes: 1 }
    )
    const observation = Schema.decodeUnknownSync(StopFaultObservation)({
      artifacts: {
        mcpSha256: createHash("sha256")
          .update(await fs.readFile(input.bundle))
          .digest("hex"),
        cliSha256: createHash("sha256")
          .update(await fs.readFile(input.cli))
          .digest("hex"),
        backendFixtureSha256: createHash("sha256")
          .update(await fs.readFile(input.backend))
          .digest("hex")
      },
      mode: input.mode,
      generation: ready.generation,
      writes: 1,
      dispatches: 1,
      hostCancelledAfterCommit: true,
      heldCleanupRetainedRecord: true,
      backendExitCode,
      registry: terminal.kind,
      replacement: replacementOutcome,
      privateCauseRedacted: true
    })
    process.stdout.write(Schema.encodeSync(Schema.fromJsonString(StopFaultObservation))(observation))
  } finally {
    release()
    try {
      await Promise.all([original.close(), replacement.close()])
    } finally {
      if (backend.exitCode === null && backend.signalCode === null) {
        backend.kill("SIGKILL")
        await bounded(exited)
      }
      lines.close()
      kernel.close()
    }
  }
}
void main().catch(() => {
  process.stderr.write("Managed stop fault fixture failed\n")
  process.exitCode = 1
})
