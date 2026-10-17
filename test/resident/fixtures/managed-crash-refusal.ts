import { strict as assert } from "node:assert"
import { spawn } from "node:child_process"
import { once } from "node:events"
import * as fs from "node:fs/promises"
import { createServer, type Socket } from "node:net"
import { dirname, join } from "node:path"
import { createInterface } from "node:readline"
import { Effect, Redacted, Schema } from "effect"

import { ResidentAttachment } from "../../../src/resident/attachment-file.js"
import { ResidentPackagePath, ResidentRegistryEnvelope } from "../../../src/resident/managed-contract.js"
import { ResidentDirectory, ResidentFilePath } from "../../../src/resident/protected-path.js"
import { HostMessage } from "../../../src/resident/request-headers.js"
import { makeByteDisclosureDetector } from "../../helpers/byte-disclosure.js"
import { residentSelectionEnvironment } from "../../helpers/resident-selection-environment.js"
import { CrashRefusalObservation } from "../crash-refusal-observation.js"

const RESPONSE_BOUND = 5_000
const ANNOUNCEMENT = "Resident attachment: "
const Input = Schema.Struct({ bundle: ResidentPackagePath, directory: ResidentDirectory })
const discovery = Schema.encodeSync(Schema.fromJsonString(HostMessage))({
  jsonrpc: "2.0",
  id: 1,
  method: "server/discover",
  params: {
    _meta: {
      "io.modelcontextprotocol/protocolVersion": "2026-07-28",
      "io.modelcontextprotocol/clientCapabilities": {},
      "io.modelcontextprotocol/clientInfo": { name: "crash-refusal-fixture", version: "1" }
    }
  }
})
const bounded = <A>(promise: Promise<A>) =>
  Effect.runPromise(Effect.promise(() => promise).pipe(Effect.timeout(RESPONSE_BOUND)))

const main = async () => {
  const input = Schema.decodeUnknownSync(Input)({ bundle: process.argv[2], directory: process.argv[3] })
  const environment = {
    ...residentSelectionEnvironment(),
    LAZY_ENVS: "true",
    HULY_MCP_TELEMETRY: "0",
    MCP_RESIDENT_STATE_DIRECTORY: input.directory
  }
  const backend = spawn(process.execPath, [input.bundle], {
    env: { ...environment, MCP_TRANSPORT: "resident-http" },
    stdio: ["ignore", "ignore", "pipe"]
  })
  const backendClosed = once(backend, "close")
  void backendClosed.catch(() => {})
  const lines = createInterface({ input: backend.stderr })
  const announced = new Promise<ResidentFilePath>((resolve) =>
    lines.on("line", (line) => {
      if (line.startsWith(ANNOUNCEMENT))
        resolve(Schema.decodeUnknownSync(ResidentFilePath)(line.slice(ANNOUNCEMENT.length)))
    })
  )
  const sockets = new Set<Socket>()
  const foreign = createServer((socket) => {
    sockets.add(socket)
    socket.once("close", () => sockets.delete(socket))
  })
  let disclosure = false
  let stdoutBytes = 0
  try {
    process.stderr.write("Crash refusal: waiting for owned publication\n")
    const attachmentFile = await bounded(announced)
    assert.equal(dirname(attachmentFile), input.directory)
    if (backend.pid === undefined) throw new Error("Owned backend did not spawn")
    const taskDirectory = `/proc/${backend.pid}/task`
    const tasks = await fs.readdir(taskDirectory)
    assert.ok(tasks.length > 0)
    const children = await Promise.all(tasks.map((task) => fs.readFile(join(taskDirectory, task, "children"), "utf8")))
    for (const childList of children) assert.equal(childList.trim(), "")
    const records = await fs.readdir(join(input.directory, "generations"))
    assert.equal(records.length, 1)
    const originalRegistryInventory = [...records].sort()
    const [name] = records
    if (name === undefined) throw new Error("Owned publication was absent")
    const registryFile = join(input.directory, "generations", name)
    const original = await fs.readFile(registryFile, "utf8")
    const originalInventory = (await fs.readdir(input.directory)).sort()
    const envelope = Schema.decodeUnknownSync(Schema.fromJsonString(ResidentRegistryEnvelope))(original)
    const descriptor = Schema.decodeUnknownSync(ResidentAttachment)(Redacted.value(envelope.descriptor))
    assert.equal(envelope.diagnostics.processId, backend.pid)
    process.stderr.write("Crash refusal: killing the owned backend handle\n")
    backend.kill("SIGKILL")
    assert.deepEqual(await bounded(backendClosed), [null, "SIGKILL"])
    const recover = async () => {
      const adapter = spawn(process.execPath, [input.bundle], {
        env: { ...environment, MCP_TRANSPORT: "stdio-resident" }
      })
      const closed = once(adapter, "close", { signal: AbortSignal.timeout(RESPONSE_BOUND) })
      const output: Array<Buffer> = []
      const diagnostics: Array<Buffer> = []
      adapter.stdout.on("data", (chunk: Buffer) => output.push(chunk))
      adapter.stderr.on("data", (chunk: Buffer) => diagnostics.push(chunk))
      adapter.stdin.on("error", () => {})
      try {
        adapter.stdin.end(`${discovery}\n`)
        assert.deepEqual(await closed, [1, null])
        process.stderr.write("Crash refusal: adapter refusal exit confirmed\n")
        stdoutBytes += Buffer.concat(output).length
        assert.equal(stdoutBytes, 0)
        process.stderr.write("Crash refusal: no adapter reply confirmed\n")
        assert.ok(Buffer.concat(diagnostics).toString("utf8").includes("No request was replayed"))
        assert.ok(Buffer.concat(diagnostics).toString("utf8").includes("no Huly request was dispatched"))
        process.stderr.write("Crash refusal: no-replay diagnostic confirmed\n")
        assert.equal(await fs.readFile(registryFile, "utf8"), original)
        process.stderr.write("Crash refusal: original record confirmed\n")
        assert.deepEqual((await fs.readdir(input.directory)).sort(), originalInventory)
        assert.deepEqual((await fs.readdir(join(input.directory, "generations"))).sort(), originalRegistryInventory)
      } finally {
        if (adapter.exitCode === null && adapter.signalCode === null) {
          adapter.kill("SIGKILL")
          await bounded(once(adapter, "close"))
        }
      }
    }
    process.stderr.write("Crash refusal: refusing the unavailable current owner\n")
    await recover()
    foreign.on("connection", (socket) => {
      const detectsDisclosure = makeByteDisclosureDetector([
        Buffer.from(Redacted.value(descriptor.authorization)),
        Buffer.from(environment.HULY_TOKEN),
        Buffer.from(Redacted.value(descriptor.identity.key), "hex"),
        Buffer.from(Redacted.value(descriptor.identity.key))
      ])
      socket.on("data", (bytes: Buffer) => {
        disclosure = detectsDisclosure(bytes) || disclosure
        if (!socket.writableEnded) socket.end("HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\n{}")
      })
    })
    foreign.listen(Number(descriptor.endpoint.port), "127.0.0.1")
    await bounded(once(foreign, "listening"))
    process.stderr.write("Crash refusal: refusing the foreign plaintext listener\n")
    await recover()
    assert.equal(foreign.listening, true)
    assert.equal(disclosure, false)
    process.stdout.write(
      Schema.encodeSync(Schema.fromJsonString(CrashRefusalObservation))({
        backendPid: backend.pid,
        backendChildrenBeforeKill: 0,
        backendExitSignal: "SIGKILL",
        recoveringExitCodes: [1, 1],
        originalRecordRetained: true,
        foreignListenerSurvived: true,
        credentialDisclosure: false,
        stdoutBytes: 0
      })
    )
  } finally {
    lines.close()
    for (const socket of sockets) socket.destroy()
    if (foreign.listening)
      await bounded(
        new Promise<void>((resolve, reject) => foreign.close((error) => (error ? reject(error) : resolve())))
      )
    if (backend.exitCode === null && backend.signalCode === null) {
      backend.kill("SIGKILL")
      await bounded(backendClosed)
    }
  }
}

void main().catch(() => {
  process.stderr.write("Managed crash refusal fixture failed\n")
  process.exitCode = 1
})
