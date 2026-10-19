import { strict as assert } from "node:assert"
import { createHash } from "node:crypto"
import * as fs from "node:fs/promises"
import { join } from "node:path"
import { Deferred, Effect, Result, Schema } from "effect"

import { retireFunctionalResident } from "../../helpers/resident-retirement.js"
import { readResidentNamespace } from "../../../src/resident/namespace-inventory.js"
import { readResidentLiveStatus } from "../../../src/resident/status-client.js"
import type { ResidentLiveStatus } from "../../../src/resident/status-contract.js"
import { openKernelReapedEvents, ReapedEventsFd } from "../../helpers/kernel-reaped-events.js"
import { boundActiveQuery, spawnActiveQueryParent } from "../../helpers/active-query-parent.js"
import { DisposableRestProject, startDisposableRestFixture } from "../disposable-rest-fixture.js"
import {
  ACTIVE_FIRST_ID,
  ACTIVE_CONTINUED_ID,
  ActiveQueryCommand,
  ActiveQueryEvent,
  ActiveQueryHostInput
} from "../active-query-contract.js"
import { ErrorRoutingInput, ErrorRoutingReceipt } from "../error-routing-contract.js"

const POLL_MILLIS = 20
const RESPONSE_BOUND = 5_000
const TWO_PARENTS = 2
const phase = (value: string) => process.stderr.write(`Error routing: ${value}\n`)
const targets = Schema.decodeUnknownSync(
  Schema.Struct({
    missing: ActiveQueryCommand.cases.read.fields.project,
    survivor: ActiveQueryCommand.cases.read.fields.project,
    fresh: ActiveQueryCommand.cases.read.fields.project
  })
)({ missing: "MISSING", survivor: "SURVIVE", fresh: "FRESH" })
const projects = Schema.decodeUnknownSync(Schema.Array(DisposableRestProject))(
  [targets.survivor, targets.fresh].map((identifier) => ({
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
  const input = Schema.decodeUnknownSync(Schema.fromJsonString(ErrorRoutingInput))(process.argv[2])
  const kernel = openKernelReapedEvents(Schema.decodeUnknownSync(ReapedEventsFd)(process.env.HULY_TEST_REAPED_FD))
  const peerArrived = Effect.runSync(Deferred.make<void>())
  const missingArrived = Effect.runSync(Deferred.make<void>())
  const releasePeer = Effect.runSync(Deferred.make<void>())
  const releaseMissing = Effect.runSync(Deferred.make<void>())
  const rest = await startDisposableRestFixture({
    projects,
    onProjectRead: async (identifier) => {
      if (identifier === targets.survivor) {
        Effect.runSync(Deferred.succeed(peerArrived, undefined))
        await Effect.runPromise(Deferred.await(releasePeer))
      } else if (identifier === targets.missing) {
        Effect.runSync(Deferred.succeed(missingArrived, undefined))
        await Effect.runPromise(Deferred.await(releaseMissing))
      } else assert.equal(identifier, targets.fresh)
    }
  })
  const parents = ["departing", "survivor"].map((role) =>
    spawnActiveQueryParent(
      input.host,
      Schema.decodeUnknownSync(ActiveQueryHostInput)({ ...input, endpoint: rest.endpoint, role })
    )
  )
  const [errored, peer] = parents
  assert.ok(errored !== undefined && peer !== undefined)
  const untilStatus = (predicate: (status: ResidentLiveStatus) => boolean) =>
    Effect.runPromise(
      Effect.gen(function* () {
        while (true) {
          const { statusDescriptors } = yield* readResidentNamespace(input.directory)
          assert.equal(statusDescriptors.length, 1)
          const descriptor = statusDescriptors[0]
          assert.ok(descriptor !== undefined)
          const observation = yield* readResidentLiveStatus(descriptor)
          assert.ok(observation.kind === "authenticated")
          if (predicate(observation.status)) return observation.status
          yield* Effect.sleep(POLL_MILLIS)
        }
      }).pipe(Effect.timeout(RESPONSE_BOUND))
    )
  const start = async (parent: typeof peer, project: typeof targets.fresh, id: number, error = false) => {
    parent.send({ _tag: error ? "readError" : "read", project })
    assert.deepEqual(await parent.next(), { _tag: "started", project, id })
  }
  const result = async (parent: typeof peer, project: typeof targets.fresh, id: number) => {
    const reply = Schema.decodeUnknownSync(ActiveQueryEvent.cases.result)(await parent.next())
    assert.equal(reply.id, id)
    assert.equal(reply.project, project)
    assert.equal(reply.result.identifier, project)
    assert.equal(reply.result.name, `Project ${project}`)
    return reply
  }
  const run = async () => {
    phase("await two independent parents")
    const ready = await Promise.all(
      parents.map(async (parent) => Schema.decodeUnknownSync(ActiveQueryEvent.cases.ready)(await parent.next()))
    )
    const [first, second] = ready
    assert.ok(first !== undefined && second !== undefined)
    assert.equal(new Set(ready.map((p) => p.parentPid)).size, TWO_PARENTS)
    assert.equal(new Set(ready.map((p) => p.adapterPid)).size, TWO_PARENTS)
    assert.equal(new Set(ready.map((p) => p.port)).size, 1)
    const idle = await untilStatus((s) => s.work.attachments === TWO_PARENTS && s.work.retainedRequests === 0)
    const inventory = await Effect.runPromise(readResidentNamespace(input.directory))
    assert.equal(inventory.records.length, 1)
    const record = inventory.records[0]
    assert.ok(record !== undefined)
    const recordFile = join(input.directory, "generations", `${idle.generation}.json`)
    const original = await fs.readFile(recordFile, "utf8")
    await start(peer, targets.survivor, ACTIVE_FIRST_ID)
    await boundActiveQuery(Effect.runPromise(Deferred.await(peerArrived)))
    await start(errored, targets.missing, ACTIVE_FIRST_ID, true)
    await boundActiveQuery(Effect.runPromise(Deferred.await(missingArrived)))
    const held = await untilStatus((s) => s.work.retainedRequests === TWO_PARENTS)
    Effect.runSync(Deferred.succeed(releaseMissing, undefined))
    const error = Schema.decodeUnknownSync(ActiveQueryEvent.cases.toolError)(await errored.next())
    assert.equal(error.id, ACTIVE_FIRST_ID)
    assert.equal(error.project, targets.missing)
    assert.ok(error.reply.content.some((item) => item.text.includes("Project 'MISSING' not found")))
    const surviving = await untilStatus((s) => s.work.retainedRequests === 1)
    phase("only originating caller observed error; peer still retained")
    await start(errored, targets.fresh, ACTIVE_CONTINUED_ID)
    const fresh = await result(errored, targets.fresh, ACTIVE_CONTINUED_ID)
    assert.equal((await untilStatus((s) => s.work.retainedRequests === 1)).generation, idle.generation)
    Effect.runSync(Deferred.succeed(releasePeer, undefined))
    const survivor = await result(peer, targets.survivor, ACTIVE_FIRST_ID)
    await start(peer, targets.survivor, ACTIVE_CONTINUED_ID)
    const continued = await result(peer, targets.survivor, ACTIVE_CONTINUED_ID)
    const final = await untilStatus((s) => s.work.retainedRequests === 0)
    for (const status of [held, surviving, final]) {
      assert.equal(status.generation, idle.generation)
      assert.equal(status.work.attachments, TWO_PARENTS)
      assert.equal(status.work.admission, "accepting")
      assert.equal(status.work.blockedRequests, 0)
    }
    assert.equal(await fs.readFile(recordFile, "utf8"), original)
    const adapterExits = await Promise.all(
      parents.map(async (parent) => {
        parent.send({ _tag: "close" })
        parent.child.stdin.end()
        const exit = Schema.decodeUnknownSync(ActiveQueryEvent.cases.exit)(await parent.next())
        assert.equal(exit.signal, null)
        return Schema.decodeUnknownSync(Schema.Literal(0))(exit.code)
      })
    )
    assert.deepEqual(await Promise.all(parents.map((p) => p.close())), [
      [0, null],
      [0, null]
    ])
    const backendExit = await retireFunctionalResident(
      { directory: input.directory, generation: idle.generation },
      record.envelope.diagnostics.processId,
      kernel
    )
    assert.equal(backendExit.exitCode, 0)
    assert.deepEqual(await fs.readdir(input.directory), [])
    const counts = Schema.decodeUnknownSync(
      Schema.Struct({
        modelRequests: ErrorRoutingReceipt.fields.modelRequests,
        projectReads: ErrorRoutingReceipt.fields.projectReads,
        projectQueries: ErrorRoutingReceipt.fields.projectQueries,
        projectWrites: ErrorRoutingReceipt.fields.projectWrites,
        invalidRequests: ErrorRoutingReceipt.fields.invalidRequests
      })
    )(rest.observed)
    process.stdout.write(
      Schema.encodeSync(Schema.fromJsonString(ErrorRoutingReceipt))(
        Schema.decodeUnknownSync(ErrorRoutingReceipt)({
          mcpSha256: createHash("sha256")
            .update(await fs.readFile(input.bundle))
            .digest("hex"),
          protocol: input.protocol,
          generation: idle.generation,
          parents: [first, second],
          statuses: [held, surviving, final],
          error,
          results: [fresh, survivor, continued],
          ...counts,
          adapterExits,
          parentExits: [0, 0],
          backendExit,
          registryUnchanged: true,
          privateStateRemoved: true
        })
      )
    )
    phase("exact error/results and final owned retirement verified")
  }
  const outcome = await run().then(
    (value) => Result.succeed(value),
    (error: unknown) => Result.fail(error)
  )
  Effect.runSync(Deferred.succeed(releasePeer, undefined))
  Effect.runSync(Deferred.succeed(releaseMissing, undefined))
  const parentCleanup = await Promise.allSettled(parents.map((p) => p.close()))
  const resourceCleanup = await Promise.allSettled([rest.close(), Promise.resolve().then(() => kernel.close())])
  if (Result.isFailure(outcome)) throw outcome.failure
  const failure = [...parentCleanup, ...resourceCleanup].find((r) => r.status === "rejected")
  if (failure !== undefined) throw failure.reason
}
void main().catch(() => {
  process.stderr.write("Error routing fixture failed\n")
  process.exitCode = 1
})
