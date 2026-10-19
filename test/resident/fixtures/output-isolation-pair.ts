import { strict as assert } from "node:assert"
import { createHash } from "node:crypto"
import * as fs from "node:fs/promises"
import { join } from "node:path"
import { Deferred, Effect, Result, Schema } from "effect"

import { retireFunctionalResident } from "../../helpers/resident-retirement.js"
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
  ActiveQueryHostInput
} from "../active-query-contract.js"
import { OutputIsolationInput, OutputIsolationReceipt } from "../output-isolation-contract.js"

const POLL_MILLIS = 20
const RESPONSE_BOUND = 5_000
const TWO_PARENTS = 2
const BODY_SIZE = 1024 * 1024
const phase = (value: string) => process.stderr.write(`Output isolation: ${value}\n`)
const targets = Schema.decodeUnknownSync(
  Schema.Struct({
    blocked: ActiveQueryCommand.cases.read.fields.project,
    survivor: ActiveQueryCommand.cases.read.fields.project
  })
)({ blocked: "BLOCKED", survivor: "SURVIVE" })
const projects = Schema.decodeUnknownSync(Schema.Array(DisposableRestProject))(
  ["BLOCKED", "SURVIVE"].map((identifier) => ({
    _id: `fixture-${identifier}`,
    _class: "tracker:class:Project",
    space: "fixture-space",
    modifiedOn: 1,
    modifiedBy: "fixture-owner",
    identifier,
    name: identifier === targets.blocked ? "x".repeat(BODY_SIZE) : `Project ${identifier}`,
    archived: false
  }))
)
const main = async () => {
  const input = Schema.decodeUnknownSync(Schema.fromJsonString(OutputIsolationInput))(process.argv[2])
  const kernel = openKernelReapedEvents(Schema.decodeUnknownSync(ReapedEventsFd)(process.env.HULY_TEST_REAPED_FD))
  const blockedArrived = Effect.runSync(Deferred.make<void>())
  const survivorArrived = Effect.runSync(Deferred.make<void>())
  const releaseBlocked = Effect.runSync(Deferred.make<void>())
  const releaseSurvivor = Effect.runSync(Deferred.make<void>())
  const rest = await startDisposableRestFixture({
    projects,
    onProjectRead: async (identifier) => {
      const blocked = identifier === targets.blocked
      Effect.runSync(Deferred.succeed(blocked ? blockedArrived : survivorArrived, undefined))
      await Effect.runPromise(Deferred.await(blocked ? releaseBlocked : releaseSurvivor))
    }
  })
  const parents = ["departing", "survivor"].map((role) =>
    spawnActiveQueryParent(
      input.host,
      Schema.decodeUnknownSync(ActiveQueryHostInput)({ ...input, endpoint: rest.endpoint, role })
    )
  )
  const [blocked, survivor] = parents
  assert.ok(blocked !== undefined && survivor !== undefined)
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
  const start = async (parent: typeof blocked, project: typeof targets.blocked, id: number) => {
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
    blocked.send({ _tag: "stall", project: targets.blocked, mode: input.mode })
    assert.deepEqual(await blocked.next(), {
      _tag: "stalled",
      project: targets.blocked,
      id: ACTIVE_FIRST_ID,
      mode: input.mode
    })
    await boundActiveQuery(Effect.runPromise(Deferred.await(blockedArrived)))
    await start(survivor, targets.survivor, ACTIVE_FIRST_ID)
    await boundActiveQuery(Effect.runPromise(Deferred.await(survivorArrived)))
    const held = await untilStatus((s) => s.work.retainedRequests === TWO_PARENTS)
    phase("both queries dispatched; release blocked output and survivor")
    Effect.runSync(Deferred.succeed(releaseBlocked, undefined))
    Effect.runSync(Deferred.succeed(releaseSurvivor, undefined))
    await result(ACTIVE_FIRST_ID)
    phase("first survivor result verified while blocked host owns unread output")
    const failed = await blocked.nextAfterOutputDeadline()
    assert.ok(failed._tag === "outputExit")
    assert.deepEqual({ code: failed.code, signal: failed.signal }, { code: 1, signal: null })
    assert.equal(failed.outputFailure, true)
    const blockedExit = Schema.decodeUnknownSync(OutputIsolationReceipt.fields.blockedExit)({
      code: failed.code,
      signal: failed.signal
    })
    const surviving = await untilStatus((s) => s.work.attachments === 1 && s.work.retainedRequests === 0)
    phase("output failure verified; continue survivor on same generation")
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
    phase("both parent exits joined; stop and join exact backend")
    const backendPid = record.envelope.diagnostics.processId
    const backendExit = await retireFunctionalResident(
      { directory: input.directory, generation: idle.generation },
      backendPid,
      kernel
    )
    assert.equal(backendExit.exitCode, 0)
    assert.deepEqual(await fs.readdir(input.directory), [])
    const counts = Schema.decodeUnknownSync(
      Schema.Struct({
        modelRequests: OutputIsolationReceipt.fields.modelRequests,
        projectReads: OutputIsolationReceipt.fields.projectReads,
        projectQueries: OutputIsolationReceipt.fields.projectQueries,
        projectWrites: Schema.Literal(0),
        invalidRequests: Schema.Literal(0),
        fullModelRequested: Schema.Literal(true)
      })
    )(rest.observed)
    process.stdout.write(
      Schema.encodeSync(Schema.fromJsonString(OutputIsolationReceipt))({
        mcpSha256: createHash("sha256")
          .update(await fs.readFile(input.bundle))
          .digest("hex"),
        protocol: input.protocol,
        mode: input.mode,
        generation: idle.generation,
        parents: [first, second],
        statuses: [held, surviving, final],
        blockedExit,
        outputFailure: failed.outputFailure,
        modelRequests: counts.modelRequests,
        projectReads: counts.projectReads,
        projectQueries: counts.projectQueries,
        parentExits: [0, 0],
        backendExit,
        registryUnchanged: true,
        privateStateRemoved: true,
        stalledId: ACTIVE_FIRST_ID,
        survivingIds: [ACTIVE_FIRST_ID, ACTIVE_CONTINUED_ID]
      })
    )
    phase("retirement and final query counts verified")
  }
  const outcome = await run().then(
    (value) => Result.succeed(value),
    (error: unknown) => Result.fail(error)
  )
  Effect.runSync(Deferred.succeed(releaseBlocked, undefined))
  Effect.runSync(Deferred.succeed(releaseSurvivor, undefined))
  const parentsClosed = await Promise.allSettled(parents.map((parent) => parent.close()))
  const resourcesClosed = await Promise.allSettled([rest.close(), Promise.resolve().then(() => kernel.close())])
  if (Result.isFailure(outcome)) throw outcome.failure
  const failure = [...parentsClosed, ...resourcesClosed].find((r) => r.status === "rejected")
  if (failure !== undefined) throw failure.reason
}
void main().catch(() => {
  process.stderr.write("Output isolation pair failed\n")
  process.exitCode = 1
})
