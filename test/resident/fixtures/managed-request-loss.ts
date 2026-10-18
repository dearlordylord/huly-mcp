import { AssertionError, strict as assert } from "node:assert"
import { spawn } from "node:child_process"
import { once } from "node:events"
import * as fs from "node:fs/promises"
import { join } from "node:path"
import { createInterface } from "node:readline"
import { Client } from "@modelcontextprotocol/client"
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio"
import { Deferred, Effect, Result, Schedule, Schema } from "effect"
import { HttpAdmissionObservationSchema } from "../../../src/mcp/http-admission-observations.js"

import { RESIDENT_PUBLICATION_FILENAME } from "../../../src/resident/attachment-file.js"
import { ResidentPackagePath, ResidentRegistryEnvelope } from "../../../src/resident/managed-contract.js"
import { requestResidentStop } from "../../../src/resident/operator-stop.js"
import { ResidentDirectory, ResidentFilePath } from "../../../src/resident/protected-path.js"
import { HostMessage } from "../../../src/resident/request-headers.js"
import { residentSelectionEnvironment } from "../../helpers/resident-selection-environment.js"
import { DisposableRestProject, startDisposableRestFixture } from "../disposable-rest-fixture.js"
import {
  ManagedRequestLossObservation,
  ManagedRequestLossPoint,
  RequestLossProjectName,
  RequestLossUpdatedName
} from "../managed-request-loss-observation.js"

const RESPONSE_BOUND = 5_000
const ANNOUNCEMENT = "Resident attachment: "
const PROC_FIELDS_SEPARATOR = ") "
const Input = Schema.Struct({
  bundle: ResidentPackagePath,
  directory: ResidentDirectory,
  backendProgram: ResidentPackagePath,
  point: ManagedRequestLossPoint
})
const bounded = <A>(promise: Promise<A>) =>
  Effect.runPromise(Effect.promise(() => promise).pipe(Effect.timeout(RESPONSE_BOUND)))

const main = async () => {
  const input = Schema.decodeUnknownSync(Input)({
    bundle: process.argv[2],
    directory: process.argv[3],
    point: process.argv[4],
    backendProgram: process.argv[5]
  })
  let stopAcknowledgment: Schema.Schema.Type<typeof ManagedRequestLossObservation>["stopAcknowledgment"] =
    "not-requested"
  const drainEntered = Effect.runSync(Deferred.make<void>())
  let drainEntry: Schema.Schema.Type<typeof ManagedRequestLossObservation>["drainEntry"] = "not-requested"
  let locatorAfterLoss: Schema.Schema.Type<typeof ManagedRequestLossObservation>["locatorAfterLoss"] = "retained"
  let publicationAfterLoss: Schema.Schema.Type<typeof ManagedRequestLossObservation>["publicationAfterLoss"] =
    "retained"
  let drainPausedBeforeKill = false
  const loseBackend = async () => {
    process.stderr.write(`Managed loss: reached ${input.point} boundary\n`)
    if (backend.pid === undefined) throw new Error("Owned backend did not spawn")
    if (input.point === "drain") {
      const [name] = await fs.readdir(join(input.directory, "generations"))
      if (name === undefined) throw new Error("Drain target registry absent")
      const envelope = Schema.decodeUnknownSync(Schema.fromJsonString(ResidentRegistryEnvelope))(
        await fs.readFile(join(input.directory, "generations", name), "utf8")
      )
      const stop = await Effect.runPromise(
        requestResidentStop({ directory: input.directory, generation: envelope.generation })
      )
      assert.equal(stop.kind, "accepted")
      stopAcknowledgment = "admission-fenced"
      await Effect.runPromise(Deferred.await(drainEntered).pipe(Effect.timeout(RESPONSE_BOUND)))
      await Effect.runPromise(
        Effect.tryPromise(() => fs.readFile(`/proc/${backend.pid}/stat`, "latin1")).pipe(
          Effect.map((stat) =>
            stat.slice(stat.lastIndexOf(PROC_FIELDS_SEPARATOR) + PROC_FIELDS_SEPARATOR.length).startsWith("T ")
          ),
          Effect.repeat({ until: (stopped) => stopped, schedule: Schedule.spaced(1) }),
          Effect.timeout(RESPONSE_BOUND)
        )
      )
      drainPausedBeforeKill = true
      drainEntry = "observed-with-attachment"
      process.stderr.write("Managed loss: authenticated drain accepted and owned backend stopped before kill\n")
    }
    const tasks = await fs.readdir(`/proc/${backend.pid}/task`)
    assert.ok(tasks.length > 0)
    const children = await Promise.all(
      tasks.map((task) => fs.readFile(`/proc/${backend.pid}/task/${task}/children`, "utf8"))
    )
    for (const list of children) assert.equal(list.trim(), "")
    assert.equal(backend.kill("SIGKILL"), true)
    assert.deepEqual(await bounded(backendClosed), [null, "SIGKILL"])
    process.stderr.write("Managed loss: owned backend SIGKILL exit joined\n")
  }
  const rest = await startDisposableRestFixture({
    projects: [
      Schema.decodeUnknownSync(DisposableRestProject)({
        _id: "fixture-loss-project",
        _class: "tracker:class:Project",
        space: "fixture-space",
        modifiedOn: 1,
        modifiedBy: "fixture-owner",
        identifier: "LOSS",
        name: RequestLossProjectName,
        archived: false
      })
    ],
    ...(input.point === "model"
      ? { onModelLoad: loseBackend }
      : input.point === "query"
        ? { onProjectRead: loseBackend }
        : { afterProjectWrite: loseBackend })
  })
  const environment = {
    ...residentSelectionEnvironment(),
    HULY_URL: rest.endpoint,
    MCP_RESIDENT_STATE_DIRECTORY: input.directory
  }
  const backend = spawn(process.execPath, [input.backendProgram], {
    env: { ...environment, MCP_TRANSPORT: "resident-http" },
    stdio: ["ignore", "ignore", "pipe"]
  })
  const backendClosed = once(backend, "close")
  void backendClosed.catch(() => {})
  const lines = createInterface({ input: backend.stderr })
  const ready = new Promise<ResidentFilePath>((resolve, reject) => {
    lines.on("line", (line) => {
      if (line.startsWith(ANNOUNCEMENT))
        resolve(Schema.decodeUnknownSync(ResidentFilePath)(line.slice(ANNOUNCEMENT.length)))
      const event = Schema.decodeUnknownResult(Schema.fromJsonString(HttpAdmissionObservationSchema))(line)
      if (
        Result.isSuccess(event) &&
        event.success._tag === "ResidentAdmissions_drainStarted" &&
        event.success.attachments > 0
      )
        Effect.runSync(Deferred.succeed(drainEntered, undefined))
    })
    backend.once("close", () => reject(new Error("Owned backend exited before publication")))
  })
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
    const descriptorFile = await bounded(ready)
    const [name] = await fs.readdir(join(input.directory, "generations"))
    if (name === undefined) throw new Error("Owned registry entry is absent")
    const registryFile = join(input.directory, "generations", name)
    const original = await fs.readFile(registryFile, "utf8")
    const originalEnvelope = Schema.decodeUnknownSync(Schema.fromJsonString(ResidentRegistryEnvelope))(original)
    assert.equal(originalEnvelope.diagnostics.processId, backend.pid)
    const originalInventory = (await fs.readdir(input.directory)).sort()
    const publications = originalInventory.filter((file) => file.startsWith(".attachment-"))
    assert.equal(publications.length, 1, "Owned fixture must have exactly one backing publication")
    const [publication] = publications
    assert.ok(publication)
    const descriptorStat = await fs.lstat(descriptorFile, { bigint: true })
    const publicationStat = await fs.lstat(join(input.directory, publication, RESIDENT_PUBLICATION_FILENAME), {
      bigint: true
    })
    assert.ok(descriptorStat.isFile() && publicationStat.isFile())
    assert.equal(publicationStat.dev, descriptorStat.dev)
    assert.equal(publicationStat.ino, descriptorStat.ino, "Backing publication must belong to the exact descriptor")
    process.stderr.write("Managed loss: connect adapter\n")
    await client.connect(transport, { timeout: RESPONSE_BOUND })
    assert.deepEqual(await fs.readdir(join(input.directory, "generations")), [name])
    process.stderr.write("Managed loss: discover tools\n")
    const writing = input.point === "write" || input.point === "drain"
    const toolName = writing ? "update_project" : "list_projects"
    const definition = (await client.listTools(undefined, { timeout: RESPONSE_BOUND })).tools.find(
      (tool) => tool.name === toolName
    )
    assert.ok(definition)
    process.stderr.write("Managed loss: begin request\n")
    await assert.rejects(
      client.callTool(
        { name: toolName, arguments: writing ? { project: "LOSS", name: RequestLossUpdatedName } : {} },
        { timeout: RESPONSE_BOUND, toolDefinition: definition }
      )
    )
    await Effect.runPromise(Deferred.await(adapterClosed).pipe(Effect.timeout(RESPONSE_BOUND)))
    process.stderr.write("Managed loss: original adapter closed\n")
    assert.deepEqual(await bounded(backendClosed), [null, "SIGKILL"], "Replacement must follow confirmed backend loss")
    process.stderr.write("Managed loss: owned backend death confirmed before replacement\n")
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
      const replacementExit = await bounded(replacementClosed)
      const diagnosticDirectory = `${input.directory}.diagnostics`
      await fs.mkdir(diagnosticDirectory, { mode: 0o700 })
      await fs.writeFile(join(diagnosticDirectory, "replacement.stderr"), Buffer.concat(replacementDiagnostics), {
        mode: 0o600,
        flag: "wx"
      })
      await fs.writeFile(join(diagnosticDirectory, "replacement.stdout"), Buffer.concat(replacementOutput), {
        mode: 0o600,
        flag: "wx"
      })
      assert.deepEqual(replacementExit, [1, null], "Fresh adapter did not refuse unresolved ownership")
      process.stderr.write("Managed loss: replacement refused\n")
      assert.equal(Buffer.concat(replacementOutput).length, 0, "Refused replacement emitted protocol output")
      assert.ok(
        Buffer.concat(replacementDiagnostics).toString("utf8").includes("no Huly request was dispatched"),
        "Refused replacement omitted the no-dispatch diagnostic"
      )
      const afterInventory = (await fs.readdir(input.directory)).sort()
      const locator = `${originalEnvelope.generation}.json`
      if (input.point === "drain") {
        assert.deepEqual(
          afterInventory.filter((file) => file !== locator && file !== publication),
          originalInventory.filter((file) => file !== locator && file !== publication),
          "Drain changed protected ownership inventory beyond its owned publication retirement"
        )
        locatorAfterLoss = afterInventory.includes(locator) ? "retained" : "removed-during-drain"
        publicationAfterLoss = afterInventory.includes(publication) ? "retained" : "removed-during-drain"
      } else assert.deepEqual(afterInventory, originalInventory)
      assert.deepEqual(
        await fs.readdir(join(input.directory, "generations")),
        [name],
        "Unresolved registry was changed"
      )
    } finally {
      if (replacement.exitCode === null && replacement.signalCode === null) {
        replacement.kill("SIGKILL")
        await bounded(replacementClosed)
      }
    }
    assert.equal(rest.observed.invalidRequests, 0)
    const observation = Schema.decodeUnknownSync(ManagedRequestLossObservation)({
      point: input.point,
      stopAcknowledgment,
      drainEntry,
      drainPausedBeforeKill,
      locatorAfterLoss,
      publicationAfterLoss,
      modelRequests: rest.observed.modelRequests,
      queryDispatches: rest.observed.projectReads,
      writeDispatches: rest.observed.projectWrites,
      committedWrites: rest.observed.committedProjectWrites,
      projectName: rest.projects()[0]?.name,
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

void main().catch((error: unknown) => {
  if (error instanceof AssertionError) process.stderr.write(`Managed request-loss assertion: ${error.message}\n`)
  process.stderr.write("Managed request-loss fixture failed\n")
  process.exitCode = 1
})
