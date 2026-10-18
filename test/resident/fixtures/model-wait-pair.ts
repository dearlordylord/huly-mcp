import { strict as assert } from "node:assert"
import { createHash } from "node:crypto"
import * as fs from "node:fs/promises"
import { join } from "node:path"
import { Deferred, Effect, Result, Schema } from "effect"

import { readResidentNamespace } from "../../../src/resident/namespace-inventory.js"
import { readResidentLiveStatus } from "../../../src/resident/status-client.js"
import { type ResidentLiveStatus } from "../../../src/resident/status-contract.js"
import { openKernelReapedEvents, ReapedEventsFd } from "../../helpers/kernel-reaped-events.js"
import { boundModelWait, spawnModelWaitParent } from "../../helpers/model-wait-parent.js"
import { DisposableRestProject, startDisposableRestFixture } from "../disposable-rest-fixture.js"
import {
  MODEL_WAIT_PROJECT_READS,
  ModelWaitCommand,
  ModelWaitHostInput,
  ModelWaitPairInput,
  ModelWaitReceipt
} from "../model-wait-contract.js"

const TWO_PARENTS = 2
const POLL_MILLIS = 20
const RESPONSE_BOUND = 5_000
const phase = (value: string) => process.stderr.write(`Shared model waiter: ${value}\n`)
const projects = Schema.decodeUnknownSync(Schema.Array(DisposableRestProject))(
  ["CANCEL", "SURVIVE", "FRESH"].map((identifier) => ({
    _id: `fixture-${identifier}`,
    _class: "tracker:class:Project",
    space: "fixture-space",
    modifiedOn: 1,
    modifiedBy: "fixture-owner",
    identifier,
    name: `Project ${identifier}`,
    archived: false
  }))
)
const main = async () => {
  const input = Schema.decodeUnknownSync(Schema.fromJsonString(ModelWaitPairInput))(process.argv[2])
  const reaped = Schema.decodeUnknownSync(ReapedEventsFd)(process.env.HULY_TEST_REAPED_FD)
  const kernel = openKernelReapedEvents(reaped)
  const loaded = Effect.runSync(Deferred.make<void>())
  const release = Effect.runSync(Deferred.make<void>())
  const rest = await startDisposableRestFixture({
    projects,
    onModelLoad: async () => {
      Effect.runSync(Deferred.succeed(loaded, undefined))
      await Effect.runPromise(Deferred.await(release))
    }
  })
  const parents = ["creator", "joiner"].map((role) =>
    spawnModelWaitParent(
      input.host,
      Schema.decodeUnknownSync(ModelWaitHostInput)({ ...input, endpoint: rest.endpoint, role })
    )
  )
  const [creator, joiner] = parents
  assert.ok(creator !== undefined && joiner !== undefined)
  const readStatus = Effect.gen(function* () {
    const { statusDescriptors } = yield* readResidentNamespace(input.directory)
    assert.equal(statusDescriptors.length, 1)
    const descriptor = statusDescriptors[0]
    if (descriptor === undefined) return yield* Effect.die("Missing selected generation")
    const observation = yield* readResidentLiveStatus(descriptor)
    assert.equal(observation.kind, "authenticated")
    if (observation.kind !== "authenticated") return yield* Effect.die("Status authentication failed")
    return observation.status
  })
  const untilStatus = (predicate: (status: ResidentLiveStatus) => boolean) =>
    Effect.runPromise(
      Effect.gen(function* () {
        while (true) {
          const status = yield* readStatus
          if (predicate(status)) return status
          yield* Effect.sleep(POLL_MILLIS)
        }
      }).pipe(Effect.timeout(RESPONSE_BOUND))
    )
  const start = async (parent: typeof creator, identifier: string) => {
    const command = Schema.decodeUnknownSync(ModelWaitCommand.cases.read)({ _tag: "read", project: identifier })
    parent.send(command)
    assert.deepEqual(await parent.next(), { _tag: "started", project: identifier })
  }
  const result = async (parent: typeof creator, identifier: string) => {
    const reply = await parent.next()
    assert.ok(reply._tag === "result")
    assert.equal(reply.project, identifier)
    assert.equal(reply.result.identifier, identifier)
    assert.equal(reply.result.name, `Project ${identifier}`)
  }
  const run = async () => {
    phase("await two independent parents")
    const ready = await Promise.all(
      parents.map(async (parent) => {
        const event = await parent.next()
        assert.ok(event._tag === "ready")
        assert.equal(event.protocol, input.protocol)
        return event
      })
    )
    assert.equal(new Set(ready.map((event) => event.parentPid)).size, TWO_PARENTS)
    assert.equal(new Set(ready.map((event) => event.adapterPid)).size, TWO_PARENTS)
    assert.equal(new Set(ready.map((event) => event.port)).size, 1)
    const [first, second] = ready
    assert.ok(first !== undefined && second !== undefined)
    phase("await idle shared generation")
    const idle = await untilStatus(
      (status) => status.work.attachments === TWO_PARENTS && status.work.retainedRequests === 0
    )
    const inventory = await Effect.runPromise(readResidentNamespace(input.directory))
    const [record] = inventory.records
    assert.ok(record !== undefined)
    const [descriptor] = inventory.statusDescriptors
    assert.ok(descriptor !== undefined)
    assert.equal(first.port, Number(descriptor.endpoint.port))
    assert.equal(record.envelope.generation, idle.generation)
    assert.equal(descriptor.identity.generation, idle.generation)
    const recordFile = join(input.directory, "generations", `${idle.generation}.json`)
    const original = await fs.readFile(recordFile, "utf8")
    const cancelled = input.cancelledRole === "creator" ? creator : joiner
    const survivor = input.cancelledRole === "creator" ? joiner : creator
    await start(creator, cancelled === creator ? "CANCEL" : "SURVIVE")
    await boundModelWait(Effect.runPromise(Deferred.await(loaded)))
    phase("model response held; start second caller")
    await start(joiner, cancelled === joiner ? "CANCEL" : "SURVIVE")
    const waiting = await untilStatus((status) => status.work.retainedRequests === TWO_PARENTS)
    phase("both requests retained before cancellation")
    assert.equal(rest.observed.modelRequests, 1)
    assert.equal(rest.observed.projectReads, 0)
    cancelled.send({ _tag: "cancel" })
    assert.deepEqual(await cancelled.next(), { _tag: "cancelled", project: "CANCEL" })
    phase("client acknowledged cancellation; await backend cleanup")
    const afterCancel = await untilStatus((status) => status.work.retainedRequests === 1)
    assert.equal(afterCancel.work.attachments, TWO_PARENTS)
    assert.equal(rest.observed.projectReads, 0)
    assert.equal(rest.observed.modelRequests, 1)
    phase("only survivor retained; release model response")
    Effect.runSync(Deferred.succeed(release, undefined))
    await result(survivor, "SURVIVE")
    phase("survivor project result verified")
    await start(cancelled, "FRESH")
    await result(cancelled, "FRESH")
    phase("cancelled client fresh project result verified")
    await start(survivor, "SURVIVE")
    await result(survivor, "SURVIVE")
    phase("survivor continued project result verified")
    const final = await untilStatus((status) => status.work.retainedRequests === 0)
    assert.equal(final.work.attachments, TWO_PARENTS)
    for (const status of [waiting, afterCancel, final]) {
      assert.equal(status.generation, idle.generation)
      assert.equal(status.work.blockedRequests, 0)
      assert.equal(status.work.admission, "accepting")
    }
    assert.deepEqual(rest.observed.projectQueries, ["SURVIVE", "FRESH", "SURVIVE"])
    assert.equal(rest.observed.projectReads, MODEL_WAIT_PROJECT_READS)
    assert.equal(rest.observed.fullModelRequested, true)
    assert.equal(rest.observed.projectWrites, 0)
    assert.equal(rest.observed.modelRequests, 1)
    assert.equal(rest.observed.invalidRequests, 0)
    assert.equal(await fs.readFile(recordFile, "utf8"), original)
    const exits = await Promise.all(parents.map((parent) => parent.close()))
    phase("both parent exits joined")
    assert.deepEqual(exits, [
      [0, null],
      [0, null]
    ])
    const backendExit = await kernel.wait(record.envelope.diagnostics.processId)
    assert.equal(backendExit.exitCode, 0)
    phase("owned backend idle exit joined")
    assert.deepEqual(await fs.readdir(input.directory), [])
    const finalCounts = Schema.decodeUnknownSync(
      Schema.Struct({
        modelRequests: ModelWaitReceipt.fields.modelRequests,
        projectReads: ModelWaitReceipt.fields.projectReads,
        projectQueries: ModelWaitReceipt.fields.projectQueries,
        projectWrites: Schema.Literal(0),
        invalidRequests: Schema.Literal(0),
        fullModelRequested: Schema.Literal(true)
      })
    )(rest.observed)
    process.stdout.write(
      Schema.encodeSync(Schema.fromJsonString(ModelWaitReceipt))({
        mcpSha256: createHash("sha256")
          .update(await fs.readFile(input.bundle))
          .digest("hex"),
        protocol: input.protocol,
        cancelledRole: input.cancelledRole,
        generation: idle.generation,
        parents: [first, second],
        statuses: [waiting, afterCancel, final],
        modelRequests: finalCounts.modelRequests,
        projectReads: finalCounts.projectReads,
        projectQueries: finalCounts.projectQueries,
        parentExits: [0, 0],
        backendExit,
        registryUnchanged: true,
        privateStateRemoved: true
      })
    )
  }
  const outcome = await run().then(
    (value) => Result.succeed(value),
    (error: unknown) => Result.fail(error)
  )
  Effect.runSync(Deferred.succeed(release, undefined))
  const parentCleanup = await Promise.allSettled(parents.map((parent) => parent.close()))
  const resourceCleanup = await Promise.allSettled([rest.close(), Promise.resolve().then(() => kernel.close())])
  const cleanupFailure = [...parentCleanup, ...resourceCleanup].find((result) => result.status === "rejected")
  if (Result.isFailure(outcome)) throw outcome.failure
  if (cleanupFailure !== undefined) throw cleanupFailure.reason
}

void main().catch(() => {
  process.stderr.write("Shared model waiter fixture failed\n")
  process.exitCode = 1
})
