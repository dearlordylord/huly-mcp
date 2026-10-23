import { strict as assert } from "node:assert"
import { spawn } from "node:child_process"
import { once } from "node:events"
import * as fs from "node:fs/promises"
import { join } from "node:path"
import { createInterface } from "node:readline"
import { Effect, Schema } from "effect"
import { McpSchema } from "effect/ai"

import { DEFAULT_LEASE_POLICY } from "../../../src/resident/admission-contract.js"
import { ResidentPackagePath, ResidentRegistryEnvelope } from "../../../src/resident/managed-contract.js"
import { ResidentDirectory } from "../../../src/resident/protected-path.js"
import { HostMessage } from "../../../src/resident/request-headers.js"
import { openKernelReapedEvents, ReapedEventsFd } from "../../helpers/kernel-reaped-events.js"
import { residentSelectionEnvironment } from "../../helpers/resident-selection-environment.js"
import { ManagedExpiryObservation } from "../managed-expiry-observation.js"

const RESPONSE_BOUND = 5_000
const ADMISSION_REQUEST_ID = 2
const Input = Schema.Struct({ bundle: ResidentPackagePath, directory: ResidentDirectory, reapedFd: ReapedEventsFd })
const InitializeReply = Schema.fromJsonString(
  Schema.Struct({ jsonrpc: Schema.Literal("2.0"), id: Schema.Literal(1), result: McpSchema.InitializeResult })
)
const bounded = <A>(promise: Promise<A>) =>
  Effect.runPromise(Effect.promise(() => promise).pipe(Effect.timeout(RESPONSE_BOUND)))

const main = async () => {
  const input = Schema.decodeUnknownSync(Input)({
    bundle: process.argv[2],
    directory: process.argv[3],
    reapedFd: process.env.HULY_TEST_REAPED_FD
  })
  const kernel = openKernelReapedEvents(input.reapedFd)
  const adapter = spawn(process.execPath, [input.bundle], {
    env: {
      ...residentSelectionEnvironment(),
      MCP_TRANSPORT: "stdio-resident",
      MCP_RESIDENT_STATE_DIRECTORY: input.directory
    }
  })
  const exited = once(adapter, "exit")
  void exited.catch(() => {})
  adapter.stderr.on("data", (chunk: Buffer) => process.stderr.write(chunk))
  adapter.stdin.on("error", () => {})
  const lines = createInterface({ input: adapter.stdout })
  try {
    const output = lines[Symbol.asyncIterator]()
    adapter.stdin.write(
      `${Schema.encodeSync(Schema.fromJsonString(HostMessage))({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "abrupt-owned-host", version: "1" }
        }
      })}\n`
    )
    const first = await bounded(output.next())
    assert.equal(first.done, false)
    Schema.decodeUnknownSync(InitializeReply)(first.value)
    // Initialization is protocol readiness; a backend-owned reply proves admission.
    adapter.stdin.write(
      `${Schema.encodeSync(Schema.fromJsonString(HostMessage))({
        jsonrpc: "2.0",
        method: "notifications/initialized"
      })}\n${Schema.encodeSync(Schema.fromJsonString(HostMessage))({
        jsonrpc: "2.0",
        id: ADMISSION_REQUEST_ID,
        method: "resources/templates/list",
        params: {}
      })}\n`
    )
    const admitted = await bounded(output.next())
    assert.equal(admitted.done, false)
    Schema.decodeUnknownSync(
      Schema.fromJsonString(
        Schema.Struct({
          jsonrpc: Schema.Literal("2.0"),
          id: Schema.Literal(ADMISSION_REQUEST_ID),
          result: McpSchema.ListResourceTemplatesResult
        })
      )
    )(admitted.value)
    const records = await fs.readdir(join(input.directory, "generations"))
    assert.equal(records.length, 1)
    const [filename] = records
    if (filename === undefined) throw new Error("Managed generation was not published")
    const record = Schema.decodeUnknownSync(Schema.fromJsonString(ResidentRegistryEnvelope))(
      await fs.readFile(join(input.directory, "generations", filename), "utf8")
    )
    const adapterPid = Schema.decodeUnknownSync(ManagedExpiryObservation.fields.adapterPid)(adapter.pid)
    assert.notEqual(record.diagnostics.parentProcessId, adapterPid)
    assert.throws(() => process.kill(record.diagnostics.parentProcessId, 0), { code: "ESRCH" })
    process.stderr.write("Managed expiry: killing the owned admitted last adapter\n")
    adapter.kill("SIGKILL")
    assert.deepEqual(await bounded(exited), [null, "SIGKILL"])
    process.stderr.write("Managed expiry: waiting for the unchanged lease duration\n")
    await Effect.runPromise(Effect.sleep(DEFAULT_LEASE_POLICY.durationMillis))
    const backendExit = await kernel.wait(record.diagnostics.processId)
    assert.equal(backendExit.exitCode, 0)
    assert.deepEqual(await fs.readdir(input.directory), [])
    process.stdout.write(
      Schema.encodeSync(Schema.fromJsonString(ManagedExpiryObservation))({
        adapterPid,
        adapterExitSignal: "SIGKILL",
        backendExit,
        privateStateRemoved: true
      })
    )
  } finally {
    if (adapter.exitCode === null && adapter.signalCode === null) {
      adapter.kill("SIGKILL")
      await bounded(exited)
    }
    lines.close()
    kernel.close()
  }
}

void main().catch(() => {
  process.stderr.write("Managed last-adapter expiry fixture failed\n")
  process.exitCode = 1
})
