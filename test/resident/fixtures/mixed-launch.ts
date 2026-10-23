import { strict as assert } from "node:assert"
import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { once } from "node:events"
import * as fs from "node:fs/promises"
import { createInterface } from "node:readline"
import { Effect, Result, Schema } from "effect"

import { ResidentPackagePath } from "../../../src/resident/managed-contract.js"
import { readResidentNamespace } from "../../../src/resident/namespace-inventory.js"
import { ResidentFilePath } from "../../../src/resident/protected-path.js"
import { readResidentLiveStatus } from "../../../src/resident/status-client.js"
import { openKernelReapedEvents, ReapedEventsFd } from "../../helpers/kernel-reaped-events.js"
import { boundModelWait, spawnModelWaitParent } from "../../helpers/model-wait-parent.js"
import { retireFunctionalResident } from "../../helpers/resident-retirement.js"
import { residentSelectionEnvironment } from "../../helpers/resident-selection-environment.js"
import { DisposableRestProject, startDisposableRestFixture } from "../disposable-rest-fixture.js"
import {
  FOREGROUND_INTERRUPT_EXIT,
  MIXED_READERS,
  MixedLaunchInput,
  MixedLaunchReceipt
} from "../mixed-launch-contract.js"
import { ModelWaitEvent, ModelWaitHostInput } from "../model-wait-contract.js"

const EXIT_BOUND = 7_000
const PREFIX = "Resident attachment: "
const project = Schema.decodeUnknownSync(DisposableRestProject)({
  _id: "mixed-project",
  _class: "tracker:class:Project",
  space: "fixture-space",
  modifiedOn: 1,
  modifiedBy: "fixture-owner",
  identifier: "MIXED",
  name: "Mixed launch project",
  archived: false
})
const hash = async (file: Schema.Schema.Type<typeof ResidentPackagePath>) =>
  createHash("sha256")
    .update(await fs.readFile(file))
    .digest("hex")
const main = async () => {
  const driver = Schema.decodeUnknownSync(ResidentPackagePath)(process.argv[1])
  const input = Schema.decodeUnknownSync(Schema.fromJsonString(MixedLaunchInput))(process.argv[2])
  const kernel = openKernelReapedEvents(Schema.decodeUnknownSync(ReapedEventsFd)(process.env.HULY_TEST_REAPED_FD))
  const rest = await startDisposableRestFixture({ projects: [project] })
  const explicit = spawn(process.execPath, [input.bundle], {
    env: {
      ...residentSelectionEnvironment(),
      HULY_URL: rest.endpoint,
      HULY_TOOL_MODE: "native",
      MCP_TRANSPORT: "resident-http",
      MCP_RESIDENT_STATE_DIRECTORY: input.directory
    }
  })
  const explicitExit = once(explicit, "exit")
  void explicitExit.catch(() => {})
  const lines = createInterface({ input: explicit.stderr })
  const announcement = (async () => {
    for await (const line of lines) {
      if (line.startsWith(PREFIX)) return Schema.decodeUnknownSync(ResidentFilePath)(line.slice(PREFIX.length))
      process.stderr.write(`${line}\n`)
    }
    throw new Error("Explicit launcher ended before authenticated readiness")
  })()
  void announcement.catch(() => {})
  const parentInput = Schema.decodeUnknownSync(ModelWaitHostInput)({
    ...input,
    endpoint: rest.endpoint,
    role: "creator"
  })
  const first = spawnModelWaitParent(input.host, parentInput)
  const parents = [first]
  const run = async () => {
    process.stderr.write("Mixed launch: await publication and first reader\n")
    const [file, firstReady] = await Promise.all([
      boundModelWait(announcement),
      first.next().then(Schema.decodeUnknownSync(ModelWaitEvent.cases.ready))
    ])
    process.stderr.write("Mixed launch: first reader ready; start joiner\n")
    const second = spawnModelWaitParent(input.host, { ...parentInput, role: "joiner" })
    parents.push(second)
    const secondReady = Schema.decodeUnknownSync(ModelWaitEvent.cases.ready)(await second.next())
    process.stderr.write("Mixed launch: both readers ready\n")
    assert.notEqual(firstReady.parentPid, secondReady.parentPid)
    assert.notEqual(firstReady.adapterPid, secondReady.adapterPid)
    assert.equal(firstReady.port, secondReady.port)
    const inventory = await Effect.runPromise(readResidentNamespace(input.directory))
    assert.equal(inventory.records.length, 1)
    const record = inventory.records[0]
    assert.ok(record !== undefined)
    assert.equal(file, `${input.directory}/${record.envelope.generation}.json`)
    const descriptor = inventory.statusDescriptors[0]
    assert.ok(descriptor !== undefined)
    assert.equal(descriptor.endpoint.port, String(firstReady.port))
    const status = await Effect.runPromise(readResidentLiveStatus(descriptor))
    assert.equal(status.kind, "authenticated")
    assert.ok(status.kind === "authenticated")
    assert.equal(status.status.work.attachments, MIXED_READERS)
    assert.equal(status.status.generation, record.envelope.generation)
    for (const parent of parents) {
      parent.send({ _tag: "read", project: project.identifier })
      assert.deepEqual(await parent.next(), { _tag: "started", project: project.identifier })
      const reply = Schema.decodeUnknownSync(ModelWaitEvent.cases.result)(await parent.next())
      assert.equal(reply.result.identifier, project.identifier)
      assert.equal(reply.result.name, project.name)
    }
    for (const parent of parents) assert.deepEqual(await parent.close(), [0, null])
    assert.ok(explicit.pid !== undefined)
    const backend = await (async () => {
      if (record.envelope.diagnostics.processId === explicit.pid) {
        assert.equal(explicit.kill("SIGTERM"), true)
        assert.deepEqual(await Effect.runPromise(Effect.promise(() => explicitExit).pipe(Effect.timeout(EXIT_BOUND))), [
          FOREGROUND_INTERRUPT_EXIT,
          null
        ])
        return {
          lifetime: "foreground",
          processId: record.envelope.diagnostics.processId,
          exitCode: FOREGROUND_INTERRUPT_EXIT
        }
      }
      assert.deepEqual(await boundModelWait(explicitExit), [0, null])
      const exit = await retireFunctionalResident(
        { directory: input.directory, generation: record.envelope.generation },
        record.envelope.diagnostics.processId,
        kernel
      )
      return { lifetime: "managed", processId: exit.processId, exitCode: exit.exitCode }
    })()
    assert.deepEqual(await fs.readdir(input.directory), [])
    assert.equal(rest.observed.modelRequests, 1)
    assert.equal(rest.observed.projectReads, MIXED_READERS)
    assert.equal(rest.observed.projectWrites, 0)
    assert.equal(rest.observed.invalidRequests, 0)
    process.stdout.write(
      Schema.encodeSync(Schema.fromJsonString(MixedLaunchReceipt))(
        Schema.decodeUnknownSync(MixedLaunchReceipt)({
          mcpSha256: await hash(input.bundle),
          hostSha256: await hash(input.host),
          driverSha256: await hash(driver),
          protocol: input.protocol,
          generation: record.envelope.generation,
          explicit: { processId: explicit.pid, file, exitCode: explicit.exitCode },
          readers: [firstReady, secondReady],
          backend,
          parentExits: [0, 0],
          modelRequests: rest.observed.modelRequests,
          projectReads: rest.observed.projectReads,
          privateStateRemoved: true
        })
      )
    )
  }
  const outcome = await run().then(
    (value) => Result.succeed(value),
    (error: unknown) => Result.fail(error)
  )
  const cleanupExplicit = async () => {
    if (explicit.exitCode !== null || explicit.signalCode !== null) return
    explicit.kill("SIGTERM")
    try {
      await Effect.runPromise(Effect.promise(() => explicitExit).pipe(Effect.timeout(EXIT_BOUND)))
    } catch (error) {
      if (explicit.exitCode === null && explicit.signalCode === null) {
        explicit.kill("SIGKILL")
        await boundModelWait(explicitExit)
      }
      throw error
    }
  }
  const cleanup = await Promise.allSettled([
    ...parents.map((parent) => parent.close()),
    cleanupExplicit(),
    rest.close()
  ])
  lines.close()
  kernel.close()
  if (Result.isFailure(outcome)) throw outcome.failure
  const failure = cleanup.find((result) => result.status === "rejected")
  if (failure !== undefined) throw failure.reason
}
void main().catch((error: unknown) => {
  const frames =
    error instanceof Error
      ? error.stack
          ?.split("\n")
          .filter((line) => line.trimStart().startsWith("at "))
          .join("\n")
      : undefined
  process.stderr.write(`Mixed explicit/automatic launch fixture failed\n${frames ?? ""}\n`)
  process.exitCode = 1
})
