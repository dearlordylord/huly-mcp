import { strict as assert } from "node:assert"
import { spawn } from "node:child_process"
import { once } from "node:events"
import * as fs from "node:fs/promises"
import { createConnection } from "node:net"
import { join } from "node:path"
import { createInterface } from "node:readline"
import { pathToFileURL } from "node:url"
import { Client } from "@modelcontextprotocol/client"
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio"
import { Deferred, Effect, Schema } from "effect"

import { ListProjectsResultSchema } from "../../../src/domain/schemas/projects.js"
import { ResidentAttachment } from "../../../src/resident/attachment-file.js"
import { residentSelectionEnvironment } from "../../helpers/resident-selection-environment.js"
import { startDisposableRestFixture } from "../disposable-rest-fixture.js"
import { PROJECT_READS, RestrictedObservation, RestrictedProbe, RestrictionMode } from "../restricted-observation.js"

const RESPONSE_BOUND = 5_000
const READY_PREFIX = "Resident attachment: "
const RefusedConnection = Schema.Struct({ code: Schema.Literal("ECONNREFUSED") })
const Input = Schema.Struct({
  bundle: Schema.NonEmptyString,
  preload: Schema.NonEmptyString,
  directory: Schema.NonEmptyString,
  mode: RestrictionMode
})
const bounded = <A>(promise: Promise<A>) =>
  Effect.runPromise(Effect.promise(() => promise).pipe(Effect.timeout(RESPONSE_BOUND)))

const main = async () => {
  const input = Schema.decodeUnknownSync(Input)({
    bundle: process.argv[2],
    preload: process.argv[3],
    directory: process.argv[4],
    mode: process.argv[5]
  })
  const rest = await startDisposableRestFixture()
  const environment = {
    ...residentSelectionEnvironment(),
    HULY_URL: rest.endpoint,
    MCP_RESIDENT_STATE_DIRECTORY: input.directory
  }
  const probeFile = join(input.directory, "permission-probe.json")
  const backend = spawn(
    process.execPath,
    [
      ...(input.mode === "restricted" ? ["--permission", "--allow-fs-read=*", "--allow-fs-write=*"] : []),
      "--no-addons",
      "--import",
      pathToFileURL(input.preload).href,
      input.bundle
    ],
    {
      env: { ...environment, MCP_TRANSPORT: "resident-http", RESIDENT_CONTAINMENT_PROBE_FILE: probeFile },
      stdio: ["ignore", "ignore", "pipe"]
    }
  )
  const backendClosed = once(backend, "close")
  void backendClosed.catch(() => {})
  const lines = createInterface({ input: backend.stderr })
  const ready = (async () => {
    for await (const line of lines) if (line.startsWith(READY_PREFIX)) return line.slice(READY_PREFIX.length)
    throw new Error("Restricted backend exited before native readiness")
  })()
  let transport: StdioClientTransport | undefined
  const client = new Client(
    { name: "claude-code", version: "1.0" },
    { versionNegotiation: { mode: { pin: "2026-07-28" } } }
  )
  const adapterClosed = Effect.runSync(Deferred.make<void>())
  client.onclose = () => Effect.runSync(Deferred.succeed(adapterClosed, undefined))
  try {
    const attachmentFile = await bounded(ready)
    const probe = Schema.decodeUnknownSync(Schema.fromJsonString(RestrictedProbe))(await fs.readFile(probeFile, "utf8"))
    assert.equal(probe.processId, backend.pid)
    const descriptor = Schema.decodeUnknownSync(Schema.fromJsonString(ResidentAttachment))(
      await fs.readFile(attachmentFile, "utf8")
    )
    const records = await fs.readdir(join(input.directory, "generations"))
    assert.equal(records.length, 1)
    const record = records[0]
    if (record === undefined) throw new Error("Restricted publication is absent")
    const recordFile = join(input.directory, "generations", record)
    const original = await fs.readFile(recordFile, "utf8")
    transport = new StdioClientTransport({
      command: process.execPath,
      args: [input.bundle],
      stderr: "pipe",
      env: { ...environment, MCP_TRANSPORT: "stdio-http", MCP_RESIDENT_ATTACHMENT_FILE: attachmentFile }
    })
    transport.stderr?.on("data", () => {})
    await client.connect(transport, { timeout: RESPONSE_BOUND })
    assert.ok(
      (await client.listTools(undefined, { timeout: RESPONSE_BOUND })).tools.some(
        (tool) => tool.name === "list_projects"
      )
    )
    for (let read = 0; read < PROJECT_READS; read++) {
      const reply = await client.callTool({ name: "list_projects", arguments: {} }, { timeout: RESPONSE_BOUND })
      assert.equal(reply.isError ?? false, false)
      assert.deepEqual(
        Schema.decodeUnknownSync(Schema.Struct({ result: ListProjectsResultSchema }))(reply.structuredContent).result,
        { projects: [], total: 0 }
      )
    }
    assert.equal(rest.observed.invalidRequests, 0)
    const tasks = await fs.readdir(`/proc/${probe.processId}/task`)
    assert.ok(tasks.length > 0)
    for (const task of tasks)
      assert.equal((await fs.readFile(`/proc/${probe.processId}/task/${task}/children`, "utf8")).trim(), "")
    backend.kill("SIGKILL")
    assert.deepEqual(await bounded(backendClosed), [null, "SIGKILL"])
    const controller = new AbortController()
    try {
      const portClosed = await bounded(
        new Promise<boolean>((resolve, reject) => {
          const socket = createConnection({
            host: descriptor.endpoint.hostname,
            port: Number(descriptor.endpoint.port),
            signal: controller.signal
          })
          socket.once("connect", () => {
            socket.destroy()
            resolve(false)
          })
          socket.once("error", (error) => {
            socket.destroy()
            if (Schema.is(RefusedConnection)(error)) resolve(true)
            else reject(error)
          })
        })
      )
      assert.equal(portClosed, true)
    } finally {
      controller.abort()
    }
    assert.equal(await fs.readFile(recordFile, "utf8"), original)
    assert.equal(descriptor.endpoint.hostname, "127.0.0.1")
    const observation = Schema.decodeUnknownSync(RestrictedObservation)({
      probe,
      modelRequests: rest.observed.modelRequests,
      projectReads: rest.observed.projectReads,
      fullModelRequested: rest.observed.fullModelRequested,
      backendChildren: 0,
      backendJoined: true,
      backendPortClosed: true,
      staleRecordRetained: true
    })
    process.stdout.write(Schema.encodeSync(Schema.fromJsonString(RestrictedObservation))(observation))
  } finally {
    const ownsAdapter = transport !== undefined && transport.pid !== null
    await transport?.close()
    if (ownsAdapter) await Effect.runPromise(Deferred.await(adapterClosed).pipe(Effect.timeout(RESPONSE_BOUND)))
    if (backend.exitCode === null && backend.signalCode === null) {
      backend.kill("SIGKILL")
      await bounded(backendClosed)
    }
    lines.close()
    await rest.close()
  }
}

void main().catch(() => {
  process.stderr.write("Restricted native fixture failed\n")
  process.exitCode = 1
})
