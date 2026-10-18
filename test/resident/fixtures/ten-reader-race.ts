import { strict as assert } from "node:assert"
import { createHash } from "node:crypto"
import * as fs from "node:fs/promises"
import { join } from "node:path"
import { Deferred, Effect, Result, Schema } from "effect"

import { readResidentNamespace } from "../../../src/resident/namespace-inventory.js"
import { readResidentLiveStatus } from "../../../src/resident/status-client.js"
import type { ResidentLiveStatus } from "../../../src/resident/status-contract.js"
import { openKernelReapedEvents, ReapedEventsFd } from "../../helpers/kernel-reaped-events.js"
import { boundActiveQuery, spawnActiveQueryParent } from "../../helpers/active-query-parent.js"
import { DisposableRestProject, startDisposableRestFixture } from "../disposable-rest-fixture.js"
import {
  ACTIVE_FIRST_ID,
  ACTIVE_CONTINUED_ID,
  ActiveQueryEvent,
  ActiveQueryHostInput
} from "../active-query-contract.js"
import { TEN_READERS, TenReaderInput, TenReaderReceipt } from "../ten-reader-contract.js"

const POLL_MILLIS = 20
const RESPONSE_BOUND = 5_000
const HOST_ALTERNATION = 2
const phase = (value: string) => process.stderr.write(`Ten SDK readers: ${value}\n`)
const projects = Schema.decodeUnknownSync(Schema.Array(DisposableRestProject))(
  Array.from({ length: TEN_READERS }, (_, index) => ({
    _id: `fixture-P${index}`,
    _class: "tracker:class:Project",
    space: "fixture-space",
    modifiedOn: 1,
    modifiedBy: "fixture-owner",
    identifier: `P${index}`,
    name: `Project P${index}`,
    archived: false
  }))
)
const main = async () => {
  const input = Schema.decodeUnknownSync(Schema.fromJsonString(TenReaderInput))(process.argv[2])
  const kernel = openKernelReapedEvents(Schema.decodeUnknownSync(ReapedEventsFd)(process.env.HULY_TEST_REAPED_FD))
  const modelArrived = Effect.runSync(Deferred.make<void>())
  const releaseModel = Effect.runSync(Deferred.make<void>())
  const rest = await startDisposableRestFixture({
    projects,
    onModelLoad: async () => {
      Effect.runSync(Deferred.succeed(modelArrived, undefined))
      await Effect.runPromise(Deferred.await(releaseModel))
    }
  })
  const parents = projects.map((project, index) => ({
    project,
    parent: spawnActiveQueryParent(
      input.host,
      Schema.decodeUnknownSync(ActiveQueryHostInput)({
        ...input,
        endpoint: rest.endpoint,
        role: index % HOST_ALTERNATION === 0 ? "departing" : "survivor"
      })
    )
  }))
  const untilStatus = (predicate: (status: ResidentLiveStatus) => boolean) =>
    Effect.runPromise(
      Effect.gen(function* () {
        while (true) {
          const inventory = yield* readResidentNamespace(input.directory)
          assert.equal(inventory.statusDescriptors.length, 1)
          const descriptor = inventory.statusDescriptors[0]
          assert.ok(descriptor !== undefined)
          const observation = yield* readResidentLiveStatus(descriptor)
          assert.ok(observation.kind === "authenticated")
          if (predicate(observation.status)) return observation.status
          yield* Effect.sleep(POLL_MILLIS)
        }
      }).pipe(Effect.timeout(RESPONSE_BOUND))
    )
  const startRound = (id: number) =>
    Promise.all(
      parents.map(async ({ parent, project }) => {
        parent.send({ _tag: "read", project: project.identifier })
        assert.deepEqual(await parent.next(), { _tag: "started", project: project.identifier, id })
      })
    )
  const finishRound = (id: number) =>
    Promise.all(
      parents.map(async ({ parent, project }) => {
        const reply = Schema.decodeUnknownSync(ActiveQueryEvent.cases.result)(await parent.next())
        assert.equal(reply.id, id)
        assert.equal(reply.project, project.identifier)
        assert.equal(reply.result.identifier, project.identifier)
        assert.equal(reply.result.name, project.name)
        return reply
      })
    )
  const run = async () => {
    phase("await ten independent parents and adapters")
    const ready = await Promise.all(
      parents.map(async ({ parent }, index) => {
        const event = Schema.decodeUnknownSync(ActiveQueryEvent.cases.ready)(await parent.next())
        assert.equal(event.protocol, input.protocol)
        phase(`parent ${index} ready`)
        return event
      })
    )
    assert.equal(new Set(ready.map((p) => p.parentPid)).size, TEN_READERS)
    assert.equal(new Set(ready.map((p) => p.adapterPid)).size, TEN_READERS)
    assert.equal(new Set(ready.map((p) => p.port)).size, 1)
    const idle = await untilStatus((s) => s.work.attachments === TEN_READERS && s.work.retainedRequests === 0)
    const inventory = await Effect.runPromise(readResidentNamespace(input.directory))
    assert.equal(inventory.records.length, 1)
    const record = inventory.records[0]
    const descriptor = inventory.statusDescriptors[0]
    assert.ok(record !== undefined && descriptor !== undefined)
    assert.equal(record.envelope.generation, idle.generation)
    assert.equal(descriptor.identity.generation, idle.generation)
    assert.equal(ready[0]?.port, Number(descriptor.endpoint.port))
    const recordFile = join(input.directory, "generations", `${idle.generation}.json`)
    const original = await fs.readFile(recordFile, "utf8")
    await startRound(ACTIVE_FIRST_ID)
    await boundActiveQuery(Effect.runPromise(Deferred.await(modelArrived)))
    const held = await untilStatus((s) => s.work.retainedRequests === TEN_READERS)
    assert.equal(rest.observed.modelRequests, 1)
    assert.equal(rest.observed.projectReads, 0)
    phase("ten colliding-id requests retained behind one held model response")
    Effect.runSync(Deferred.succeed(releaseModel, undefined))
    const first = await finishRound(ACTIVE_FIRST_ID)
    phase("ten distinct first results verified; continue through every adapter")
    await startRound(ACTIVE_CONTINUED_ID)
    const continued = await finishRound(ACTIVE_CONTINUED_ID)
    const final = await untilStatus((s) => s.work.retainedRequests === 0)
    for (const status of [held, final]) {
      assert.equal(status.generation, idle.generation)
      assert.equal(status.work.attachments, TEN_READERS)
      assert.equal(status.work.admission, "accepting")
      assert.equal(status.work.blockedRequests, 0)
    }
    assert.equal(await fs.readFile(recordFile, "utf8"), original)
    const adapterExits = await Promise.all(
      parents.map(async ({ parent }) => {
        parent.send({ _tag: "close" })
        parent.child.stdin.end()
        const exit = Schema.decodeUnknownSync(ActiveQueryEvent.cases.exit)(await parent.next())
        assert.equal(exit.code, 0)
        assert.equal(exit.signal, null)
        return Schema.decodeUnknownSync(Schema.Literal(0))(exit.code)
      })
    )
    const exits = await Promise.all(parents.map(({ parent }) => parent.close()))
    assert.deepEqual(
      exits,
      parents.map(() => [0, null])
    )
    phase("ten parent exits joined; await kernel backend retirement")
    const backendExit = await kernel.wait(record.envelope.diagnostics.processId)
    assert.equal(backendExit.exitCode, 0)
    assert.deepEqual(await fs.readdir(input.directory), [])
    const counts = Schema.decodeUnknownSync(
      Schema.Struct({
        modelRequests: TenReaderReceipt.fields.modelRequests,
        projectReads: TenReaderReceipt.fields.projectReads,
        projectQueries: TenReaderReceipt.fields.projectQueries,
        projectWrites: TenReaderReceipt.fields.projectWrites,
        invalidRequests: TenReaderReceipt.fields.invalidRequests,
        fullModelRequested: TenReaderReceipt.fields.fullModelRequested
      })
    )(rest.observed)
    const targets = projects.map((project) => project.identifier).sort()
    assert.deepEqual([...counts.projectQueries.slice(0, TEN_READERS)].sort(), targets)
    assert.deepEqual([...counts.projectQueries.slice(TEN_READERS)].sort(), targets)
    process.stdout.write(
      Schema.encodeSync(Schema.fromJsonString(TenReaderReceipt))({
        mcpSha256: createHash("sha256")
          .update(await fs.readFile(input.bundle))
          .digest("hex"),
        protocol: input.protocol,
        generation: idle.generation,
        parents: ready,
        statuses: [held, final],
        rounds: [first, continued],
        ...counts,
        parentExits: parents.map(() => 0),
        adapterExits,
        backendExit,
        registryUnchanged: true,
        privateStateRemoved: true
      })
    )
    phase("final model/query counts and owned retirement verified")
  }
  const outcome = await run().then(
    (value) => Result.succeed(value),
    (error: unknown) => Result.fail(error)
  )
  Effect.runSync(Deferred.succeed(releaseModel, undefined))
  const parentCleanup = await Promise.allSettled(parents.map(({ parent }) => parent.close()))
  const resourceCleanup = await Promise.allSettled([rest.close(), Promise.resolve().then(() => kernel.close())])
  if (Result.isFailure(outcome)) throw outcome.failure
  const failure = [...parentCleanup, ...resourceCleanup].find((result) => result.status === "rejected")
  if (failure !== undefined) throw failure.reason
}
void main().catch(() => {
  process.stderr.write("Ten SDK readers fixture failed\n")
  process.exitCode = 1
})
