import { strict as assert } from "node:assert"
import { createHash } from "node:crypto"
import * as fs from "node:fs/promises"
import { join } from "node:path"
import { Deferred, Effect, Result, Schema } from "effect"

import { readResidentNamespace } from "../../../src/resident/namespace-inventory.js"
import { readResidentLiveStatus } from "../../../src/resident/status-client.js"
import { type ResidentLiveStatus } from "../../../src/resident/status-contract.js"
import { openKernelReapedEvents, ReapedEventsFd } from "../../helpers/kernel-reaped-events.js"
import { boundActiveQuery, spawnActiveQueryParent } from "../../helpers/active-query-parent.js"
import { DisposableRestProject, startDisposableRestFixture } from "../disposable-rest-fixture.js"
import {
  ACTIVE_FIRST_ID,
  ACTIVE_CONTINUED_ID,
  ActiveQueryCommand,
  ActiveQueryHostInput,
  ActiveQueryPairInput,
  ActiveQueryReceipt
} from "../active-query-contract.js"

const POLL_MILLIS = 20
const RESPONSE_BOUND = 5_000
const TWO_PARENTS = 2
const phase = (value: string) => process.stderr.write(`Active query isolation: ${value}\n`)
const targets = Schema.decodeUnknownSync(
  Schema.Struct({
    departing: ActiveQueryCommand.cases.read.fields.project,
    survivor: ActiveQueryCommand.cases.read.fields.project
  })
)({ departing: "LEAVE", survivor: "SURVIVE" })
const projects = Schema.decodeUnknownSync(Schema.Array(DisposableRestProject))(
  ["LEAVE", "SURVIVE"].map((identifier) => ({
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
  const input = Schema.decodeUnknownSync(Schema.fromJsonString(ActiveQueryPairInput))(process.argv[2])
  const kernel = openKernelReapedEvents(Schema.decodeUnknownSync(ReapedEventsFd)(process.env.HULY_TEST_REAPED_FD))
  const departingArrived = Effect.runSync(Deferred.make<void>())
  const survivorArrived = Effect.runSync(Deferred.make<void>())
  const releaseDeparting = Effect.runSync(Deferred.make<void>())
  const releaseSurvivor = Effect.runSync(Deferred.make<void>())
  const rest = await startDisposableRestFixture({
    projects,
    onProjectRead: async (identifier) => {
      const departing = identifier === targets.departing
      Effect.runSync(Deferred.succeed(departing ? departingArrived : survivorArrived, undefined))
      await Effect.runPromise(Deferred.await(departing ? releaseDeparting : releaseSurvivor))
    }
  })
  const parents = ["departing", "survivor"].map((role) =>
    spawnActiveQueryParent(
      input.host,
      Schema.decodeUnknownSync(ActiveQueryHostInput)({ ...input, endpoint: rest.endpoint, role })
    )
  )
  const [departing, survivor] = parents
  assert.ok(departing !== undefined && survivor !== undefined)
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
  const start = async (parent: typeof departing, project: typeof targets.departing, id: number) => {
    parent.send({ _tag: "read", project })
    assert.deepEqual(await parent.next(), { _tag: "started", project, id })
  }
  const result = async (id: number) => {
    const reply = await survivor.next()
    assert.ok(reply._tag === "result")
    assert.equal(reply.id, id)
    assert.equal(reply.project, "SURVIVE")
    assert.equal(reply.result.identifier, "SURVIVE")
    assert.equal(reply.result.name, "Project SURVIVE")
  }
  const run = async () => {
    phase("await independent raw stdio parents")
    const ready = await Promise.all(
      parents.map(async (parent) => {
        const event = await parent.next()
        assert.ok(event._tag === "ready")
        return event
      })
    )
    const [first, second] = ready
    assert.ok(first !== undefined && second !== undefined)
    assert.equal(new Set(ready.map((p) => p.parentPid)).size, TWO_PARENTS)
    assert.equal(new Set(ready.map((p) => p.adapterPid)).size, TWO_PARENTS)
    assert.equal(new Set(ready.map((p) => p.port)).size, 1)
    const idle = await untilStatus((s) => s.work.attachments === TWO_PARENTS && s.work.retainedRequests === 0)
    const inventory = await Effect.runPromise(readResidentNamespace(input.directory))
    const [record] = inventory.records
    assert.ok(record !== undefined)
    const recordFile = join(input.directory, "generations", `${idle.generation}.json`)
    const original = await fs.readFile(recordFile, "utf8")
    await start(departing, targets.departing, ACTIVE_FIRST_ID)
    await boundActiveQuery(Effect.runPromise(Deferred.await(departingArrived)))
    await start(survivor, targets.survivor, ACTIVE_FIRST_ID)
    await boundActiveQuery(Effect.runPromise(Deferred.await(survivorArrived)))
    const held = await untilStatus((s) => s.work.retainedRequests === TWO_PARENTS)
    phase("two dispatched queries held; interrupt only departing adapter")
    departing.send({ _tag: "lose", mode: input.loss })
    const stopped = [await departing.next()]
    // A pipe ending may be observed before the driver's loss acknowledgement.
    while (!stopped.some((e) => e._tag === "loss")) stopped.push(await departing.next())
    while (!stopped.some((e) => e._tag === "exit")) stopped.push(await departing.next())
    Effect.runSync(Deferred.succeed(releaseDeparting, undefined))
    while (!stopped.some((e) => e._tag === "exit") || !stopped.some((e) => e._tag === "interrupted"))
      stopped.push(await departing.next())
    const exited = stopped.find((e) => e._tag === "exit")
    assert.ok(exited?._tag === "exit")
    assert.deepEqual(
      { code: exited.code, signal: exited.signal },
      input.loss === "eof" ? { code: 0, signal: null } : { code: null, signal: "SIGKILL" }
    )
    assert.equal(
      stopped.filter((e) => e._tag === "interrupted" && e.id === ACTIVE_FIRST_ID && e.project === "LEAVE").length,
      1
    )
    assert.ok(stopped.every((e) => e._tag !== "result"))
    const surviving = await untilStatus((s) => s.work.retainedRequests === 1)
    assert.equal(surviving.work.attachments, input.loss === "eof" ? 1 : TWO_PARENTS)
    phase("departing work cleaned; release survivor and continue")
    Effect.runSync(Deferred.succeed(releaseSurvivor, undefined))
    await result(ACTIVE_FIRST_ID)
    await start(survivor, targets.survivor, ACTIVE_CONTINUED_ID)
    await result(ACTIVE_CONTINUED_ID)
    const final = await untilStatus((s) => s.work.retainedRequests === 0)
    for (const status of [held, surviving, final]) {
      assert.equal(status.generation, idle.generation)
      assert.equal(status.work.admission, "accepting")
      assert.equal(status.work.blockedRequests, 0)
    }
    assert.equal(await fs.readFile(recordFile, "utf8"), original)
    const exits = await Promise.all(parents.map((parent) => parent.close()))
    assert.deepEqual(exits, [
      [0, null],
      [0, null]
    ])
    phase("both parent exits joined; await kernel backend retirement")
    const backendPid = record.envelope.diagnostics.processId
    const backendExit = await (input.loss === "kill" ? kernel.waitForLeaseExpiry(backendPid) : kernel.wait(backendPid))
    assert.equal(backendExit.exitCode, 0)
    assert.deepEqual(await fs.readdir(input.directory), [])
    const counts = Schema.decodeUnknownSync(
      Schema.Struct({
        modelRequests: ActiveQueryReceipt.fields.modelRequests,
        projectReads: ActiveQueryReceipt.fields.projectReads,
        projectQueries: ActiveQueryReceipt.fields.projectQueries,
        projectWrites: Schema.Literal(0),
        invalidRequests: Schema.Literal(0),
        fullModelRequested: Schema.Literal(true)
      })
    )(rest.observed)
    process.stdout.write(
      Schema.encodeSync(Schema.fromJsonString(ActiveQueryReceipt))({
        mcpSha256: createHash("sha256")
          .update(await fs.readFile(input.bundle))
          .digest("hex"),
        protocol: input.protocol,
        loss: input.loss,
        generation: idle.generation,
        parents: [first, second],
        statuses: [held, surviving, final],
        departed: { code: exited.code, signal: exited.signal },
        modelRequests: counts.modelRequests,
        projectReads: counts.projectReads,
        projectQueries: counts.projectQueries,
        parentExits: [0, 0],
        backendExit,
        registryUnchanged: true,
        privateStateRemoved: true,
        interruptedId: ACTIVE_FIRST_ID,
        survivingIds: [ACTIVE_FIRST_ID, ACTIVE_CONTINUED_ID]
      })
    )
    phase("retirement and final query counts verified")
  }
  const outcome = await run().then(
    (value) => Result.succeed(value),
    (error: unknown) => Result.fail(error)
  )
  Effect.runSync(Deferred.succeed(releaseDeparting, undefined))
  Effect.runSync(Deferred.succeed(releaseSurvivor, undefined))
  const parentsClosed = await Promise.allSettled(parents.map((parent) => parent.close()))
  const resourcesClosed = await Promise.allSettled([rest.close(), Promise.resolve().then(() => kernel.close())])
  if (Result.isFailure(outcome)) throw outcome.failure
  const failure = [...parentsClosed, ...resourcesClosed].find((r) => r.status === "rejected")
  if (failure !== undefined) throw failure.reason
}
void main().catch(() => {
  process.stderr.write("Active query pair failed\n")
  process.exitCode = 1
})
