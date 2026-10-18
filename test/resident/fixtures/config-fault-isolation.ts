import { execFile } from "node:child_process"
import { promisify } from "node:util"

import { strict as assert } from "node:assert"
import * as fs from "node:fs/promises"
import { join } from "node:path"
import { Deferred, Effect, Result, Schema } from "effect"
import { readResidentNamespace } from "../../../src/resident/namespace-inventory.js"
import { readResidentLiveStatus } from "../../../src/resident/status-client.js"
import { openKernelReapedEvents, ReapedEventsFd } from "../../helpers/kernel-reaped-events.js"
import { boundActiveQuery, spawnActiveQueryParent } from "../../helpers/active-query-parent.js"
import { DisposableRestProject, startDisposableRestFixture } from "../disposable-rest-fixture.js"
import {
  ActiveQueryEvent,
  ActiveQueryHostInput,
  ACTIVE_FIRST_ID,
  ACTIVE_CONTINUED_ID
} from "../active-query-contract.js"
import {
  CONFIG_FAULT_READS,
  ConfigFaultInput,
  ConfigFaultReceipt,
  OwnedBackendSignal
} from "../config-fault-contract.js"

const CONFIGURATIONS = 2
const SIGKILL_EXIT = -9
const runFile = promisify(execFile)
let stage = "input"
const main = async () => {
  const input = Schema.decodeUnknownSync(Schema.fromJsonString(ConfigFaultInput))(process.argv[2])
  const kernel = openKernelReapedEvents(Schema.decodeUnknownSync(ReapedEventsFd)(process.env.HULY_TEST_REAPED_FD))
  const arrived = Effect.runSync(Deferred.make<void>())
  const resume = Effect.runSync(Deferred.make<void>())
  const project = Schema.decodeUnknownSync(DisposableRestProject)({
    _id: "fixture-SURVIVE",
    _class: "tracker:class:Project",
    space: "fixture-space",
    modifiedOn: 1,
    modifiedBy: "fixture-owner",
    identifier: "SURVIVE",
    name: "Surviving configuration",
    archived: false
  })
  const restA = await startDisposableRestFixture()
  const restB = await startDisposableRestFixture({
    projects: [project],
    onProjectRead: async () => {
      Effect.runSync(Deferred.succeed(arrived, undefined))
      await Effect.runPromise(Deferred.await(resume))
    }
  })
  const failed = spawnActiveQueryParent(
    input.host,
    Schema.decodeUnknownSync(ActiveQueryHostInput)({ ...input, endpoint: restA.endpoint, role: "departing" })
  )
  const startSurvivor = () =>
    spawnActiveQueryParent(
      input.host,
      Schema.decodeUnknownSync(ActiveQueryHostInput)({ ...input, endpoint: restB.endpoint, role: "survivor" })
    )
  const earlySurvivor = input.launch === "concurrent" ? startSurvivor() : undefined
  const parents = earlySurvivor === undefined ? [failed] : [failed, earlySurvivor]
  const run = async () => {
    stage = "ready"
    const first = Schema.decodeUnknownSync(ActiveQueryEvent.cases.ready)(await failed.next())
    const survivor = earlySurvivor ?? startSurvivor()
    if (earlySurvivor === undefined) parents.push(survivor)
    const second = Schema.decodeUnknownSync(ActiveQueryEvent.cases.ready)(await survivor.next())
    assert.notEqual(first.port, second.port)
    assert.notEqual(first.parentPid, second.parentPid)
    const inventory = await Effect.runPromise(readResidentNamespace(input.directory))
    assert.equal(inventory.records.length, CONFIGURATIONS)
    const descriptorB = inventory.statusDescriptors.find((d) => Number(d.endpoint.port) === second.port)
    const descriptorA = inventory.statusDescriptors.find((d) => Number(d.endpoint.port) === first.port)
    assert.ok(descriptorA !== undefined && descriptorB !== undefined)
    const ownerA = inventory.records.find((r) => r.envelope.generation === descriptorA.identity.generation)
    const ownerB = inventory.records.find((r) => r.envelope.generation === descriptorB.identity.generation)
    assert.ok(ownerA !== undefined && ownerB !== undefined)
    const pathA = join(input.directory, "generations", `${ownerA.envelope.generation}.json`)
    const pathB = join(input.directory, "generations", `${ownerB.envelope.generation}.json`)
    const originalA = await fs.readFile(pathA, "utf8")
    const originalB = await fs.readFile(pathB, "utf8")
    const status = async () => {
      const result = await Effect.runPromise(readResidentLiveStatus(descriptorB))
      assert.equal(result.kind, "authenticated")
      if (result.kind !== "authenticated") throw new Error("Survivor status unavailable")
      assert.equal(result.status.generation, ownerB.envelope.generation)
      assert.equal(result.status.work.attachments, 1)
      assert.equal(result.status.work.admission, "accepting")
      assert.equal(result.status.work.blockedRequests, 0)
      return result.status
    }
    survivor.send({ _tag: "read", project: project.identifier })
    assert.deepEqual(await survivor.next(), { _tag: "started", project: project.identifier, id: ACTIVE_FIRST_ID })
    await boundActiveQuery(Effect.runPromise(Deferred.await(arrived)))
    const before = await status()
    assert.equal(before.work.retainedRequests, 1)
    const authenticatedA = await Effect.runPromise(readResidentLiveStatus(descriptorA))
    assert.equal(authenticatedA.kind, "authenticated")
    process.stderr.write("Config fault: both owned generations authenticated; survivor query held\n")
    const signalBackend = async (
      adapterPid?: Schema.Schema.Type<typeof ActiveQueryEvent.cases.ready.fields.adapterPid>
    ) => {
      const output = await runFile(
        "python3",
        [
          "test/resident/fixtures/signal-owned-backend.py",
          String(ownerA.envelope.diagnostics.processId),
          String(process.ppid),
          input.bundle,
          ...(adapterPid === undefined ? [] : [String(adapterPid)])
        ],
        { timeout: 5_000 }
      )
      const signal = Schema.decodeUnknownSync(Schema.fromJsonString(OwnedBackendSignal))(output.stdout)
      assert.equal(signal.processId, ownerA.envelope.diagnostics.processId)
      return signal
    }
    const injected = await (async () => {
      if (input.mode === "adapter-backend") {
        failed.send({ _tag: "lose", mode: "kill" })
        assert.deepEqual(await failed.next(), { _tag: "loss", mode: "kill" })
        const adapterExit = Schema.decodeUnknownSync(ActiveQueryEvent.cases.exit)(await failed.next())
        assert.equal(adapterExit.signal, "SIGKILL")
        const signal = await signalBackend()
        stage = "crash-exit"
        const backendExit = await kernel.wait(ownerA.envelope.diagnostics.processId)
        assert.equal(backendExit.exitCode, SIGKILL_EXIT)
        return { kind: input.mode, adapterExit, backendExit, signal }
      }
      const signal = await signalBackend(first.adapterPid)
      assert.equal(signal.adapterPid, first.adapterPid)
      return { kind: input.mode, signal }
    })()
    stage = "post-crash-status"
    const after = await status()
    assert.equal(after.work.retainedRequests, 1)
    assert.equal(await fs.readFile(pathB, "utf8"), originalB)
    assert.equal(await fs.readFile(pathA, "utf8"), originalA)
    Effect.runSync(Deferred.succeed(resume, undefined))
    stage = "held-result"
    const result = Schema.decodeUnknownSync(ActiveQueryEvent.cases.result)(await survivor.next())
    survivor.send({ _tag: "read", project: project.identifier })
    assert.deepEqual(await survivor.next(), { _tag: "started", project: project.identifier, id: ACTIVE_CONTINUED_ID })
    stage = "continued-result"
    const continued = Schema.decodeUnknownSync(ActiveQueryEvent.cases.result)(await survivor.next())
    for (const [reply, id] of [
      [result, ACTIVE_FIRST_ID],
      [continued, ACTIVE_CONTINUED_ID]
    ]) {
      const parsed = Schema.decodeUnknownSync(ActiveQueryEvent.cases.result)(reply)
      assert.equal(parsed.id, id)
      assert.equal(parsed.result.identifier, project.identifier)
      assert.equal(parsed.result.name, project.name)
    }
    stage = "final-status"
    const final = await status()
    assert.equal(final.work.retainedRequests, 0)
    assert.equal(await fs.readFile(pathB, "utf8"), originalB)
    survivor.send({ _tag: "close" })
    survivor.child.stdin.end()
    stage = "survivor-adapter-close"
    const survivorAdapterExit = Schema.decodeUnknownSync(ActiveQueryEvent.cases.exit)(await survivor.next())
    assert.equal(survivorAdapterExit.code, 0)
    assert.equal(survivorAdapterExit.signal, null)
    assert.deepEqual(await survivor.close(), [0, null])
    stage = "survivor-backend-close"
    const survivorBackendExit = await kernel.wait(ownerB.envelope.diagnostics.processId)
    assert.equal(survivorBackendExit.exitCode, 0)
    stage = "failed-parent-close"
    const fault = await (async () => {
      if (injected.kind === "adapter-backend") return injected
      failed.send({ _tag: "close" })
      failed.child.stdin.end()
      const adapterExit = Schema.decodeUnknownSync(ActiveQueryEvent.cases.exit)(await failed.next())
      assert.equal(adapterExit.code, 1)
      assert.equal(adapterExit.signal, null)
      return { ...injected, adapterExit }
    })()
    assert.deepEqual(await failed.close(), [0, null])
    assert.equal(await fs.readFile(pathA, "utf8"), originalA)
    assert.equal(restB.observed.modelRequests, 1)
    assert.equal(restB.observed.projectReads, CONFIG_FAULT_READS)
    assert.deepEqual(restB.observed.projectQueries, [project.identifier, project.identifier])
    assert.equal(restB.observed.projectWrites, 0)
    assert.equal(restA.observed.projectReads, 0)
    assert.equal(restA.observed.modelRequests, 0)
    assert.equal(restA.observed.projectWrites, 0)
    assert.equal(restA.observed.invalidRequests + restB.observed.invalidRequests, 0)
    process.stdout.write(
      Schema.encodeSync(Schema.fromJsonString(ConfigFaultReceipt))(
        Schema.decodeUnknownSync(ConfigFaultReceipt)({
          protocol: input.protocol,
          launch: input.launch,
          failed: first,
          survivor: second,
          statuses: [before, after, final],
          results: [result, continued],
          fault,
          survivorBackendExit,
          survivorAdapterExit,
          survivorRegistryUnchanged: true,
          failedRegistryRetained: true,
          survivorModelRequests: restB.observed.modelRequests,
          survivorReads: restB.observed.projectReads,
          survivorWrites: restB.observed.projectWrites,
          failedReads: restA.observed.projectReads,
          invalidRequests: 0
        })
      )
    )
  }
  const outcome = await run().then(
    (value) => Result.succeed(value),
    (error: unknown) => Result.fail(error)
  )
  Effect.runSync(Deferred.succeed(resume, undefined))
  const cleanup = await Promise.allSettled(parents.map((p) => p.close()))
  const resources = await Promise.allSettled([
    restA.close(),
    restB.close(),
    Promise.resolve().then(() => kernel.close())
  ])
  if (Result.isFailure(outcome)) throw outcome.failure
  const failure = [...cleanup, ...resources].find((r) => r.status === "rejected")
  if (failure !== undefined) throw failure.reason
}
void main().catch(() => {
  process.stderr.write(`Config fault isolation fixture failed at ${stage}\n`)
  process.exitCode = 1
})
