import { strict as assert } from "node:assert"
import { spawn } from "node:child_process"
import { once } from "node:events"
import * as fs from "node:fs/promises"
import { join } from "node:path"
import { createInterface } from "node:readline"
import { Client } from "@modelcontextprotocol/client"
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio"
import { Deferred, Effect, Schema } from "effect"

import { ResidentPackagePath } from "../../../src/resident/managed-contract.js"
import { ResidentDirectory, ResidentFilePath } from "../../../src/resident/protected-path.js"
import { HostMessage } from "../../../src/resident/request-headers.js"
import { residentSelectionEnvironment } from "../../helpers/resident-selection-environment.js"
import { startDisposableRestFixture } from "../disposable-rest-fixture.js"
import { ManagedRequestLossObservation, ManagedRequestLossPoint } from "../managed-request-loss-observation.js"

const RESPONSE_BOUND = 5_000
const ANNOUNCEMENT = "Resident attachment: "
const Input = Schema.Struct({
  bundle: ResidentPackagePath,
  directory: ResidentDirectory,
  point: ManagedRequestLossPoint
})
const bounded = <A>(promise: Promise<A>) =>
  Effect.runPromise(Effect.promise(() => promise).pipe(Effect.timeout(RESPONSE_BOUND)))

const main = async () => {
  const input = Schema.decodeUnknownSync(Input)({
    bundle: process.argv[2],
    directory: process.argv[3],
    point: process.argv[4]
  })
  const loseBackend = async () => {
    process.stderr.write(`Managed loss: reached ${input.point} boundary\n`)
    if (backend.pid === undefined) throw new Error("Owned backend did not spawn")
    const tasks = await fs.readdir(`/proc/${backend.pid}/task`)
    assert.ok(tasks.length > 0)
    const children = await Promise.all(
      tasks.map((task) => fs.readFile(`/proc/${backend.pid}/task/${task}/children`, "utf8"))
    )
    for (const list of children) assert.equal(list.trim(), "")
    assert.equal(backend.kill("SIGKILL"), true)
    assert.deepEqual(await bounded(backendClosed), [null, "SIGKILL"])
  }
  const rest = await startDisposableRestFixture({
    ...(input.point === "model" ? { onModelLoad: loseBackend } : { onProjectRead: loseBackend })
  })
  const environment = {
    ...residentSelectionEnvironment(),
    HULY_URL: rest.endpoint,
    MCP_RESIDENT_STATE_DIRECTORY: input.directory
  }
  const backend = spawn(process.execPath, [input.bundle], {
    env: { ...environment, MCP_TRANSPORT: "resident-http" },
    stdio: ["ignore", "ignore", "pipe"]
  })
  const backendClosed = once(backend, "close")
  void backendClosed.catch(() => {})
  const lines = createInterface({ input: backend.stderr })
  const ready = (async () => {
    for await (const line of lines)
      if (line.startsWith(ANNOUNCEMENT))
        return Schema.decodeUnknownSync(ResidentFilePath)(line.slice(ANNOUNCEMENT.length))
    throw new Error("Owned backend exited before publication")
  })()
  const client = new Client(
    { name: "claude-code", version: "1" },
    { versionNegotiation: { mode: { pin: "2026-07-28" } } }
  )
  const adapterClosed = Effect.runSync(Deferred.make<void>())
  client.onclose = () => Effect.runSync(Deferred.succeed(adapterClosed, undefined))
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [input.bundle],
    stderr: "pipe",
    env: { ...environment, MCP_TRANSPORT: "stdio-resident" }
  })
  const diagnostics: Array<Buffer> = []
  transport.stderr?.on("data", (chunk: Buffer) => diagnostics.push(chunk))
  try {
    process.stderr.write("Managed loss: await publication\n")
    await bounded(ready)
    const [name] = await fs.readdir(join(input.directory, "generations"))
    if (name === undefined) throw new Error("Owned registry entry is absent")
    const registryFile = join(input.directory, "generations", name)
    const original = await fs.readFile(registryFile, "utf8")
    const originalInventory = (await fs.readdir(input.directory)).sort()
    process.stderr.write("Managed loss: connect adapter\n")
    await client.connect(transport, { timeout: RESPONSE_BOUND })
    process.stderr.write("Managed loss: discover tools\n")
    assert.ok(
      (await client.listTools(undefined, { timeout: RESPONSE_BOUND })).tools.some(
        (tool) => tool.name === "list_projects"
      )
    )
    process.stderr.write("Managed loss: begin request\n")
    await assert.rejects(client.callTool({ name: "list_projects", arguments: {} }, { timeout: RESPONSE_BOUND }))
    await Effect.runPromise(Deferred.await(adapterClosed).pipe(Effect.timeout(RESPONSE_BOUND)))
    const replacement = spawn(process.execPath, [input.bundle], {
      env: { ...environment, MCP_TRANSPORT: "stdio-resident" }
    })
    const replacementClosed = once(replacement, "close")
    void replacementClosed.catch(() => {})
    const replacementOutput: Array<Buffer> = []
    const replacementDiagnostics: Array<Buffer> = []
    replacement.stdout.on("data", (chunk: Buffer) => replacementOutput.push(chunk))
    replacement.stderr.on("data", (chunk: Buffer) => replacementDiagnostics.push(chunk))
    replacement.stdin.on("error", () => {})
    try {
      const discovery = Schema.encodeSync(Schema.fromJsonString(HostMessage))({
        jsonrpc: "2.0",
        id: 1,
        method: "server/discover",
        params: {
          _meta: {
            "io.modelcontextprotocol/protocolVersion": "2026-07-28",
            "io.modelcontextprotocol/clientCapabilities": {},
            "io.modelcontextprotocol/clientInfo": { name: "loss-refusal", version: "1" }
          }
        }
      })
      replacement.stdin.end(`${discovery}\n`)
      assert.deepEqual(await bounded(replacementClosed), [1, null])
      assert.equal(Buffer.concat(replacementOutput).length, 0)
      assert.ok(Buffer.concat(replacementDiagnostics).toString("utf8").includes("no Huly request was dispatched"))
      assert.deepEqual((await fs.readdir(input.directory)).sort(), originalInventory)
      assert.deepEqual(await fs.readdir(join(input.directory, "generations")), [name])
    } finally {
      if (replacement.exitCode === null && replacement.signalCode === null) {
        replacement.kill("SIGKILL")
        await bounded(replacementClosed)
      }
    }
    assert.equal(rest.observed.invalidRequests, 0)
    const observation = Schema.decodeUnknownSync(ManagedRequestLossObservation)({
      point: input.point,
      modelRequests: rest.observed.modelRequests,
      queryDispatches: rest.observed.projectReads,
      backendClosed: true,
      adapterClosed: true,
      unknownOutcome: /operation outcome may be unknown/iu.test(Buffer.concat(diagnostics).toString("utf8")),
      registryRetained: (await fs.readFile(registryFile, "utf8")) === original,
      replacementExitCode: replacement.exitCode,
      replacementStdoutBytes: Buffer.concat(replacementOutput).length
    })
    process.stdout.write(Schema.encodeSync(Schema.fromJsonString(ManagedRequestLossObservation))(observation))
  } finally {
    await transport.close()
    if (backend.exitCode === null && backend.signalCode === null) {
      backend.kill("SIGKILL")
      await bounded(backendClosed)
    }
    lines.close()
    await rest.close()
  }
}

void main().catch(() => {
  process.stderr.write("Managed request-loss fixture failed\n")
  process.exitCode = 1
})
