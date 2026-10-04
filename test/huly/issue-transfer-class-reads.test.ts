import { it } from "@effect/vitest"
import type { Doc, DocumentQuery, FindOptions, FindResult, TxOperations } from "@hcengineering/core"
import { Deferred, Effect, Fiber, Schema } from "effect"
import { expect } from "vitest"
import { IssueId, ObjectClassName } from "../../src/domain/schemas/shared.js"
import { HulyConnectionError, HulyDataInvalidError } from "../../src/huly/errors-base.js"
import { attachment, chunter, tags, tracker } from "../../src/huly/huly-plugins.js"
import { inspectTransferRecords } from "../../src/huly/issue-transfer-discovery.js"
import { toClassRef } from "../../src/huly/operations/sdk-boundary.js"
import { sdkFixture } from "../helpers/huly-sdk.js"
import { attachmentPayload, ownedRecord, recordAdapterFixture } from "../helpers/transfer-records.js"

const limits = { records: 100, queries: 1000, depth: 32, result: 101 }
const fixture = () => {
  const f = recordAdapterFixture()
  f.docs.push(
    ownedRecord("comment", String(chunter.class.ChatMessage), "root", "comments", { message: "Preserved" }),
    ownedRecord("file", String(attachment.class.Attachment), "root", "attachments", attachmentPayload),
    ownedRecord("label", String(tags.class.TagReference), "root", "labels", {
      tag: "independent-tag",
      title: "Label",
      color: 1
    })
  )
  return f
}
// Internal SDK port: the fixture's schema/SDK adapter owns returned document DTOs.
const observedClient = (
  f: ReturnType<typeof fixture>,
  reply: (cls: ObjectClassName, rows: FindResult<Doc>) => Promise<FindResult<Doc>> = async (_cls, rows) => rows
) => {
  const calls: Array<ObjectClassName> = []
  const reads = new Set<Promise<FindResult<Doc>>>()
  const client = sdkFixture<TxOperations>({
    findOne: (...args: Parameters<TxOperations["findOne"]>) => f.client.findOne(...args),
    getHierarchy: () => f.client.getHierarchy(),
    findAll: (cls: unknown, query: DocumentQuery<Doc>, options?: FindOptions<Doc>) => {
      const parsedClass = Schema.decodeUnknownSync(ObjectClassName)(cls)
      calls.push(parsedClass)
      const read = f.client
        .findAll<Doc>(toClassRef<Doc>(parsedClass), query, options)
        .then((rows) => reply(parsedClass, rows))
      reads.add(read)
      return read
    }
  })
  return { client, calls, reads }
}

const closeWindow = (
  fiber: Fiber.Fiber<unknown, unknown>,
  gates: Iterable<Deferred.Deferred<void>>,
  reads: ReadonlySet<Promise<FindResult<Doc>>>
) =>
  Fiber.interrupt(fiber).pipe(
    Effect.andThen(Effect.forEach(gates, (gate) => Deferred.succeed(gate, undefined), { discard: true })),
    Effect.andThen(Effect.promise(() => Promise.allSettled([...reads]))),
    Effect.asVoid
  )

it.effect(
  "allows four reads per window, waits before admitting more and processes reverse replies in class order",
  () =>
    Effect.gen(function* () {
      const firstClasses = [
        tracker.class.Issue,
        chunter.class.ChatMessage,
        attachment.class.Attachment,
        tags.class.TagReference
      ].map((cls) => Schema.decodeUnknownSync(ObjectClassName)(String(cls)))
      const gates = new Map<ObjectClassName, Deferred.Deferred<void>>()
      const finished = new Map<ObjectClassName, Deferred.Deferred<void>>()
      for (const cls of firstClasses) {
        gates.set(cls, yield* Deferred.make<void>())
        finished.set(cls, yield* Deferred.make<void>())
      }
      const started = yield* Deferred.make<void>()
      const state = { active: 0, maximum: 0, firstStarted: 0 }
      const completions: Array<ObjectClassName> = []
      const f = fixture()
      const observed = observedClient(f, async (cls, rows) => {
        state.active++
        state.maximum = Math.max(state.maximum, state.active)
        const gate = gates.get(cls)
        if (gate !== undefined && state.firstStarted < firstClasses.length) {
          state.firstStarted++
          if (state.firstStarted === firstClasses.length) await Effect.runPromise(Deferred.succeed(started, undefined))
        }
        try {
          if (gate !== undefined) await Effect.runPromise(Deferred.await(gate))
          completions.push(cls)
          return rows
        } finally {
          state.active--
          const done = finished.get(cls)
          if (done !== undefined) await Effect.runPromise(Deferred.succeed(done, undefined))
        }
      })
      const fiber = yield* inspectTransferRecords(observed.client, IssueId.make("root"), limits).pipe(Effect.forkChild)
      yield* Effect.addFinalizer(() => closeWindow(fiber, gates.values(), observed.reads))
      yield* Deferred.await(started)
      expect(observed.calls).toEqual(firstClasses)
      for (const cls of firstClasses.toReversed()) {
        const gate = gates.get(cls)
        const done = finished.get(cls)
        if (gate !== undefined && done !== undefined) {
          yield* Deferred.succeed(gate, undefined)
          yield* Deferred.await(done)
        }
        if (cls !== firstClasses[0]) expect(observed.calls).toEqual(firstClasses)
      }
      const inspection = yield* Fiber.join(fiber)
      expect(state.maximum).toBe(4)
      expect(completions.slice(0, 4)).toEqual(firstClasses.toReversed())
      expect(inspection.discovery).toBe("complete")
      expect(inspection.blockers).toEqual([])
      expect(inspection.records.map((record) => record._id)).toEqual(["comment", "file", "label", "history"])
      expect(new Set(observed.calls)).toEqual(new Set(inspection.classes))
      expect(f.scopes).toEqual([])
      expect(f.updates).toEqual([])
    })
)

for (const queries of [0, 3, 4]) {
  it.effect(`admits at most ${queries} class queries and preserves its inspected prefix on exhaustion`, () =>
    Effect.gen(function* () {
      const f = fixture()
      const { calls, client } = observedClient(f)
      const inspection = yield* inspectTransferRecords(client, IssueId.make("root"), { ...limits, queries })
      expect(inspection.discovery).toBe("incomplete")
      expect(inspection.blockers).toContain("Owned-record query limit exhausted.")
      expect(calls).toHaveLength(queries)
      expect(inspection.records.map((record) => record._id)).toEqual(
        queries === 0 ? [] : queries === 3 ? ["comment", "file"] : ["comment", "file", "label"]
      )
      expect(f.scopes).toEqual([])
      expect(f.updates).toEqual([])
    })
  )
}

for (const policy of [
  { ...limits, records: 0 },
  { ...limits, records: 1 },
  { ...limits, depth: 1 },
  { ...limits, result: 1 }
]) {
  it.effect(`stops after the admitted window on record/depth/result limits ${JSON.stringify(policy)}`, () =>
    Effect.gen(function* () {
      const f = fixture()
      const { calls, client } = observedClient(f)
      const inspection = yield* inspectTransferRecords(client, IssueId.make("root"), policy)
      expect(inspection.discovery).toBe("incomplete")
      expect(calls).toHaveLength(4)
      expect(inspection.records.length).toBeLessThanOrEqual(policy.records)
      expect(inspection.blockers.length).toBeGreaterThan(0)
      expect(f.scopes).toEqual([])
      expect(f.updates).toEqual([])
    })
  )
}

it.effect("parses totals in class order and propagates malformed totals without launching another window", () =>
  Effect.gen(function* () {
    const f = fixture()
    f.state.invalidTotal = true
    const { calls, client } = observedClient(f)
    const result = yield* Effect.result(inspectTransferRecords(client, IssueId.make("root"), limits))
    expect(result._tag).toBe("Failure")
    if (result._tag === "Failure") expect(result.failure).toBeInstanceOf(HulyDataInvalidError)
    expect(calls).toHaveLength(4)
    expect(f.scopes).toEqual([])
    expect(f.updates).toEqual([])
  })
)

class SdkCollectionReadFailure extends Schema.TaggedError<SdkCollectionReadFailure>()("SdkCollectionReadFailure", {
  message: Schema.String
}) {}

it.effect("finishes the admitted window and retains typed sanitized read failure without admitting later classes", () =>
  Effect.gen(function* () {
    const f = fixture()
    const fourthStarted = yield* Deferred.make<void>()
    const fourthReleased = yield* Deferred.make<void>()
    const finished = yield* Deferred.make<void>()
    const completed: Array<ObjectClassName> = []
    const { calls, client, reads } = observedClient(f, async (cls, rows) => {
      if (cls === String(attachment.class.Attachment))
        throw new SdkCollectionReadFailure({ message: "HTTP error 503 private-token" })
      if (cls === String(tags.class.TagReference)) {
        await Effect.runPromise(Deferred.succeed(fourthStarted, undefined))
        await Effect.runPromise(Deferred.await(fourthReleased))
      }
      completed.push(cls)
      return rows
    })
    const fiber = yield* inspectTransferRecords(client, IssueId.make("root"), limits).pipe(
      Effect.result,
      Effect.tap(() => Deferred.succeed(finished, undefined)),
      Effect.forkChild
    )
    yield* Effect.addFinalizer(() => closeWindow(fiber, [fourthReleased], reads))
    yield* Deferred.await(fourthStarted)
    expect(yield* Deferred.isDone(finished)).toBe(false)
    yield* Deferred.succeed(fourthReleased, undefined)
    const result = yield* Fiber.join(fiber)
    expect(result._tag).toBe("Failure")
    if (result._tag === "Failure") {
      expect(result.failure).toBeInstanceOf(HulyConnectionError)
      expect(JSON.stringify(result.failure)).not.toContain("private-token")
    }
    expect(calls).toHaveLength(4)
    expect(completed).toContain(String(tags.class.TagReference))
    expect(f.scopes).toEqual([])
    expect(f.updates).toEqual([])
  })
)

it.effect("interruption admits no later window and scoped fixture cleanup drains non-abortable SDK promises", () =>
  Effect.gen(function* () {
    const f = fixture()
    const gate = yield* Deferred.make<void>()
    const started = yield* Deferred.make<void>()
    const state = { active: 0 }
    const observed = observedClient(f, async (_cls, rows) => {
      state.active++
      if (state.active === 4) await Effect.runPromise(Deferred.succeed(started, undefined))
      try {
        await Effect.runPromise(Deferred.await(gate))
        return rows
      } finally {
        state.active--
      }
    })
    const fiber = yield* inspectTransferRecords(observed.client, IssueId.make("root"), limits).pipe(Effect.forkChild)
    yield* Effect.addFinalizer(() => closeWindow(fiber, [gate], observed.reads))
    yield* Deferred.await(started)
    yield* Fiber.interrupt(fiber)
    expect(state.active).toBe(4)
    expect(observed.calls).toHaveLength(4)
    yield* closeWindow(fiber, [gate], observed.reads)
    expect(state.active).toBe(0)
    expect(observed.calls).toHaveLength(4)
    expect(f.scopes).toEqual([])
    expect(f.updates).toEqual([])
  })
)
