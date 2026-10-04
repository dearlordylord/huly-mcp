import { it } from "@effect/vitest"
import type { Doc, DocumentQuery, FindOptions, TxOperations } from "@hcengineering/core"
import { Deferred, Effect, Fiber, Schema } from "effect"
import { expect } from "vitest"
import { MovementIssueSchema } from "../../src/domain/schemas/issue-movement-state.js"
import { movementIssue } from "../helpers/movement.js"
import type { Issue } from "@hcengineering/tracker"
import { DocId, IssueId, ObjectClassName, UNKNOWN_TOTAL } from "../../src/domain/schemas/shared.js"
import { OWNER_CLASS_READ_CONCURRENCY } from "../../src/huly/issue-transfer-class-reads.js"
import { FOREST_OWNER_BATCH_SIZE, inspectTransferForest } from "../../src/huly/issue-transfer-forest.js"
import { inspectTransferRecords } from "../../src/huly/issue-transfer-discovery.js"
import type { TransferForestEntry } from "../../src/huly/issue-transfer-forest-state.js"
import { activity, attachment, chunter, tracker } from "../../src/huly/huly-plugins.js"
import { toClassRef, toRef } from "../../src/huly/operations/sdk-boundary.js"
import { findResult, sdkFixture } from "../helpers/huly-sdk.js"
import { attachmentPayload, ownedRecord, recordAdapterFixture } from "../helpers/transfer-records.js"

const OwnerQuerySchema = Schema.Union([DocId, Schema.Struct({ $in: Schema.Array(DocId) })])
const QuerySchema = Schema.Struct({
  attachedTo: Schema.optionalKey(OwnerQuerySchema),
  srcDocId: Schema.optionalKey(OwnerQuerySchema)
})
const RootQuerySchema = Schema.Struct({ _id: IssueId })
const policy = { records: 100, queries: 1000, depth: 32, result: 101 }
const roots = [IssueId.make("root"), IssueId.make("second")]
const forestFixture = () => {
  const f = recordAdapterFixture()
  f.docs.push(
    ownedRecord("comment-a", String(chunter.class.ChatMessage), "root", "comments", { message: "A" }),
    ownedRecord("comment-b", String(chunter.class.ChatMessage), "second", "comments", {
      message: "B",
      attachedToClass: tracker.class.Issue
    }),
    ownedRecord("file-a", String(attachment.class.Attachment), "comment-a", "attachments", attachmentPayload)
  )
  const calls: Array<{ cls: ObjectClassName; owners: ReadonlyArray<DocId>; outgoing: boolean }> = []
  const state = {
    truncateGrouped: false,
    unknownGroupedTotal: false,
    malformed: false,
    wrongOwner: false,
    failCollection: false,
    missing: false,
    wrongRoot: false,
    truncateIndividual: false
  }
  const reads = new Set<Promise<unknown>>()
  const rootIds = new Set(roots)
  const failedRoots = new Set<IssueId>()
  const hierarchy = f.client.getHierarchy()
  const client = sdkFixture<TxOperations>({
    getHierarchy: () => hierarchy,
    findOne: async (_cls: unknown, query: unknown) => {
      const id = Schema.decodeUnknownSync(RootQuerySchema)(query)._id
      if (failedRoots.has(id)) throw new ForestFixtureFailure({ reason: "private-token" })
      if (state.wrongRoot) return sdkFixture<Doc>({ _id: "unexpected-root", _class: tracker.class.Issue })
      return !state.missing && rootIds.has(id) ? sdkFixture<Doc>({ _id: id, _class: tracker.class.Issue }) : undefined
    },
    findAll: (cls: unknown, query: DocumentQuery<Doc>, _options?: FindOptions<Doc>) => {
      const rawQuery: unknown = query
      const parsed = Schema.decodeUnknownSync(QuerySchema)(rawQuery)
      const selector = parsed.attachedTo ?? parsed.srcDocId
      const owners = selector === undefined ? [] : typeof selector === "string" ? [selector] : selector.$in
      const objectClass = Schema.decodeUnknownSync(ObjectClassName)(cls)
      calls.push({ cls: objectClass, owners, outgoing: parsed.srcDocId !== undefined })
      const read = Promise.resolve().then(() => {
        if (state.failCollection) throw new ForestFixtureFailure({ reason: "private-token" })
        const rows = f.docs.filter(
          (row) =>
            hierarchy.isDerived(
              toClassRef<Doc>(Schema.decodeUnknownSync(ObjectClassName)(row._class)),
              toClassRef<Doc>(objectClass)
            ) &&
            typeof row[parsed.srcDocId === undefined ? "attachedTo" : "srcDocId"] === "string" &&
            owners.includes(
              Schema.decodeUnknownSync(DocId)(row[parsed.srcDocId === undefined ? "attachedTo" : "srcDocId"])
            )
        )
        const result = findResult(
          rows.map((row) =>
            sdkFixture<Doc>(
              state.malformed ? { ...row, collection: 1 } : state.wrongOwner ? { ...row, attachedTo: "foreign" } : row
            )
          )
        )
        if (owners.length === 1 && state.truncateIndividual) result.total = result.length + 1
        if (owners.length > 1 && state.truncateGrouped) result.total = result.length + 1
        if (owners.length > 1 && state.unknownGroupedTotal) result.total = UNKNOWN_TOTAL
        return result
      })
      reads.add(read)
      return read
    }
  })
  return { ...f, modelState: f.state, calls, client, failedRoots, rootIds, reads, state }
}
class ForestFixtureFailure extends Schema.TaggedError<ForestFixtureFailure>()("ForestFixtureFailure", {
  reason: Schema.String
}) {}
const observed = (entries: ReadonlyArray<TransferForestEntry>) =>
  entries.flatMap((entry) => (entry.status === "observed" ? [entry.inspection] : []))

it.effect("matches independent ownership closures while reducing requests and keeping ordered roots", () =>
  Effect.gen(function* () {
    const f = forestFixture()
    const original = yield* Effect.forEach(roots, (root) => inspectTransferRecords(f.client, root, policy))
    const originalCalls = f.calls.length
    f.calls.splice(0)
    const published: Array<TransferForestEntry> = []
    const result = yield* inspectTransferForest(
      f.client,
      roots,
      [],
      (entry) =>
        Effect.sync(() => {
          published.push(entry)
        }),
      policy
    )
    expect(result.map((entry) => entry.ownerId)).toEqual(roots)
    expect(observed(result)).toEqual(original)
    expect(f.calls.length).toBeLessThan(originalCalls)
    expect(f.calls.some((call) => call.owners.length > 1)).toBe(true)
    expect(new Set(published.map((entry) => entry.ownerId))).toEqual(new Set(roots))
    expect(new Set(published.map((entry) => entry.ownerId)).size).toBe(roots.length)
    expect(f.updates).toEqual([])
    expect(f.scopes).toEqual([])
  })
)

const groupedFailures: ReadonlyArray<"truncateGrouped" | "unknownGroupedTotal"> = [
  "truncateGrouped",
  "unknownGroupedTotal"
]
for (const flag of groupedFailures) {
  it.effect(`falls back per owner when ${flag} cannot prove a complete batch`, () =>
    Effect.gen(function* () {
      const f = forestFixture()
      f.state[flag] = true
      const result = yield* inspectTransferForest(f.client, roots, [], undefined, policy)
      expect(observed(result).every((inspection) => inspection.discovery === "complete")).toBe(true)
      expect(observed(result).map((inspection) => inspection.records.map((row) => row._id))).toEqual([
        ["comment-a", "history", "file-a"],
        ["comment-b"]
      ])
      expect(f.calls.some((call) => call.owners.length === 1)).toBe(true)
      expect(f.updates).toEqual([])
    })
  )
}

it.effect("charges grouped and fallback requests and refuses on exhausted query budgets", () =>
  Effect.gen(function* () {
    const f = forestFixture()
    f.state.truncateGrouped = true
    const result = yield* inspectTransferForest(f.client, roots, [], undefined, { ...policy, queries: 1 })
    expect(observed(result).every((inspection) => inspection.discovery === "incomplete")).toBe(true)
    expect(
      observed(result).every((inspection) => inspection.blockers.includes("Owned-record query limit exhausted."))
    ).toBe(true)
    expect(f.calls).toHaveLength(1)
    expect(f.updates).toEqual([])
  })
)

it.effect("returns missing requested owners as unavailable rather than empty complete closures", () =>
  Effect.gen(function* () {
    const f = forestFixture()
    const absent = IssueId.make("absent")
    const result = yield* inspectTransferForest(f.client, [IssueId.make("root"), absent], [], undefined, policy)
    expect(result[1]).toEqual({ status: "unavailable", ownerId: absent, reason: "owner-unavailable" })
    expect(result[0]?.status).toBe("observed")
  })
)

const readFailures: ReadonlyArray<"malformed" | "wrongOwner" | "failCollection"> = [
  "malformed",
  "wrongOwner",
  "failCollection"
]
for (const flag of readFailures) {
  it.effect(`refuses ${flag} without claiming complete absence or leaking raw errors`, () =>
    Effect.gen(function* () {
      const f = forestFixture()
      f.state[flag] = true
      const result = yield* inspectTransferForest(f.client, roots, [], undefined, policy)
      expect(observed(result).every((inspection) => inspection.discovery === "incomplete")).toBe(true)
      expect(JSON.stringify(result)).not.toContain("private-token")
      expect(f.updates).toEqual([])
      expect(f.scopes).toEqual([])
    })
  )
}

for (const limits of [
  { ...policy, records: 1 },
  { ...policy, depth: 1 }
]) {
  it.effect(`keeps per-root caps for ${JSON.stringify(limits)}`, () =>
    Effect.gen(function* () {
      const f = forestFixture()
      const result = yield* inspectTransferForest(f.client, roots, [], undefined, limits)
      expect(observed(result)[0]?.discovery).toBe("incomplete")
      expect(observed(result).every((inspection) => inspection.records.length <= limits.records)).toBe(true)
      expect(f.updates).toEqual([])
    })
  )
}

it.effect("validates protected child edges against the whole parsed tree", () =>
  Effect.gen(function* () {
    const f = forestFixture()
    const root = movementIssue("root")
    const child = movementIssue("second", { attachedTo: toRef<Issue>(IssueId.make("root")) })
    const input: unknown = [root, child]
    const tree = yield* Schema.decodeUnknownEffect(Schema.Array(MovementIssueSchema))(input)
    f.docs.push({ ...child, title: "Changed after the tree snapshot" })
    const result = yield* inspectTransferForest(f.client, roots, tree, undefined, policy)
    expect(observed(result)[0]?.discovery).toBe("incomplete")
    expect(
      observed(result)[0]?.blockers.some((reason) => reason.includes("Changed or invalid task ownership edge"))
    ).toBe(true)
    expect(observed(result)[1]?.discovery).toBe("complete")
    expect(f.updates).toEqual([])
  })
)

it.effect("retains outgoing source-owned references and unsupported nested records", () =>
  Effect.gen(function* () {
    const f = forestFixture()
    f.docs.push(
      ownedRecord("outgoing", String(activity.class.ActivityReference), "independent-target", "references", {
        attachedToClass: "document:class:Document",
        srcDocId: "second",
        srcDocClass: tracker.class.Issue,
        message: "Reference"
      }),
      ownedRecord("unknown", "unknown:class:Record", "comment-a", "unexpected")
    )
    const result = yield* inspectTransferForest(f.client, roots, [], undefined, policy)
    expect(observed(result)[0]?.records.find((row) => row._id === "unknown")?.kind).toBe("unsupported")
    expect(observed(result)[0]?.blockers.length).toBeGreaterThan(0)
    expect(observed(result)[1]?.records.some((row) => row._id === "outgoing")).toBe(true)
    expect(f.calls.some((call) => call.outgoing && call.owners.length > 1)).toBe(true)
    expect(f.updates).toEqual([])
  })
)

it.effect("keeps at most four SDK collection requests active for a multi-owner frontier", () =>
  Effect.gen(function* () {
    const f = forestFixture()
    const started = yield* Deferred.make<void>()
    const release = yield* Deferred.make<void>()
    const state = { active: 0, maximum: 0 }
    const pending = new Set<Promise<unknown>>()
    const client = sdkFixture<TxOperations>({
      getHierarchy: () => f.client.getHierarchy(),
      findOne: (...args: Parameters<TxOperations["findOne"]>) => f.client.findOne(...args),
      findAll: (...args: Parameters<TxOperations["findAll"]>) => {
        const read = f.client.findAll(...args).then(async (rows) => {
          state.active++
          state.maximum = Math.max(state.maximum, state.active)
          if (state.active === OWNER_CLASS_READ_CONCURRENCY)
            await Effect.runPromise(Deferred.succeed(started, undefined))
          try {
            await Effect.runPromise(Deferred.await(release))
            return rows
          } finally {
            state.active--
          }
        })
        pending.add(read)
        return read
      }
    })
    const fiber = yield* inspectTransferForest(client, roots, [], undefined, policy).pipe(Effect.forkChild)
    yield* Effect.addFinalizer(() =>
      Fiber.interrupt(fiber).pipe(
        Effect.andThen(Deferred.succeed(release, undefined)),
        Effect.andThen(Effect.promise(() => Promise.allSettled([...pending]))),
        Effect.asVoid
      )
    )
    yield* Deferred.await(started)
    expect(state.active).toBe(OWNER_CLASS_READ_CONCURRENCY)
    expect(f.calls).toHaveLength(OWNER_CLASS_READ_CONCURRENCY)
    expect(f.calls.every((call) => call.owners.length === roots.length)).toBe(true)
    yield* Deferred.succeed(release, undefined)
    yield* Fiber.join(fiber)
    expect(state.maximum).toBe(4)
    expect(state.active).toBe(0)
  })
)

it.effect("awaits terminal owner publication before a later root batch can hang", () =>
  Effect.gen(function* () {
    const f = forestFixture()
    const more = [IssueId.make("third"), IssueId.make("fourth"), IssueId.make("fifth")]
    for (const id of more) f.rootIds.add(id)
    const fifth = IssueId.make("fifth")
    const started = yield* Deferred.make<void>()
    const release = yield* Deferred.make<void>()
    const published: Array<TransferForestEntry> = []
    const pending = new Set<Promise<unknown>>()
    const client = sdkFixture<TxOperations>({
      getHierarchy: () => f.client.getHierarchy(),
      findAll: (...args: Parameters<TxOperations["findAll"]>) => f.client.findAll(...args),
      findOne: (...args: Parameters<TxOperations["findOne"]>) => {
        const read = f.client.findOne(...args).then(async (row) => {
          const rawRootQuery: unknown = args[1]
          if (Schema.decodeUnknownSync(RootQuerySchema)(rawRootQuery)._id === fifth) {
            await Effect.runPromise(Deferred.succeed(started, undefined))
            await Effect.runPromise(Deferred.await(release))
          }
          return row
        })
        pending.add(read)
        return read
      }
    })
    const requested = [...roots, ...more]
    const fiber = yield* inspectTransferForest(
      client,
      requested,
      [],
      (entry) =>
        Effect.sync(() => {
          published.push(entry)
        }),
      policy
    ).pipe(Effect.forkChild)
    yield* Effect.addFinalizer(() =>
      Fiber.interrupt(fiber).pipe(
        Effect.andThen(Deferred.succeed(release, undefined)),
        Effect.andThen(Effect.promise(() => Promise.allSettled([...pending]))),
        Effect.asVoid
      )
    )
    yield* Deferred.await(started)
    expect(new Set(published.map((entry) => entry.ownerId))).toEqual(
      new Set(requested.slice(0, FOREST_OWNER_BATCH_SIZE))
    )
    yield* Deferred.succeed(release, undefined)
    const result = yield* Fiber.join(fiber)
    expect(result.map((entry) => entry.ownerId)).toEqual(requested)
    expect(published).toHaveLength(requested.length)
  })
)

it.effect("detects cycles without recursing indefinitely or writing", () =>
  Effect.gen(function* () {
    const f = forestFixture()
    f.docs.push(
      ownedRecord("comment-a", String(chunter.class.ChatMessage), "comment-a", "comments", { message: "Cycle" })
    )
    const result = yield* inspectTransferForest(f.client, roots, [], undefined, policy)
    expect(observed(result)[0]?.blockers.some((reason) => reason.includes("Owned-record cycle"))).toBe(true)
    expect(observed(result)[0]?.records.filter((row) => row._id === "comment-a")).toHaveLength(1)
    expect(f.updates).toEqual([])
  })
)

it.effect("refuses contradictory ownership of one stable record across requested roots", () =>
  Effect.gen(function* () {
    const f = forestFixture()
    f.docs.push(
      ownedRecord("comment-a", String(chunter.class.ChatMessage), "second", "comments", {
        message: "Contradictory owner",
        attachedToClass: tracker.class.Issue
      })
    )
    const result = yield* inspectTransferForest(f.client, roots, [], undefined, policy)
    expect(
      observed(result).every((inspection) =>
        inspection.blockers.some((reason) => reason.includes("Ambiguous forest ownership"))
      )
    ).toBe(true)
    expect(f.updates).toEqual([])
  })
)

it.effect("refuses a root reply with a different stable identity", () =>
  Effect.gen(function* () {
    const f = forestFixture()
    f.state.wrongRoot = true
    const result = yield* inspectTransferForest(f.client, roots, [], undefined, policy)
    expect(result).toEqual(
      roots.map((ownerId) => ({ status: "unavailable", ownerId, reason: "inspection-unavailable" }))
    )
    expect(f.calls).toEqual([])
    expect(f.updates).toEqual([])
  })
)

it.effect("preserves an independently inspected root when another root read fails", () =>
  Effect.gen(function* () {
    const f = forestFixture()
    f.failedRoots.add(IssueId.make("second"))
    const published: Array<TransferForestEntry> = []
    const result = yield* inspectTransferForest(
      f.client,
      roots,
      [],
      (entry) =>
        Effect.sync(() => {
          published.push(entry)
        }),
      policy
    )
    expect(result[0]?.status).toBe("observed")
    expect(observed(result)[0]?.discovery).toBe("complete")
    expect(result[1]).toEqual({
      status: "unavailable",
      ownerId: IssueId.make("second"),
      reason: "inspection-unavailable"
    })
    expect(published).toHaveLength(roots.length)
    expect(JSON.stringify(result)).not.toContain("private-token")
    expect(f.updates).toEqual([])
  })
)

it.effect("refuses unavailable model metadata without declaring complete empty ownership", () =>
  Effect.gen(function* () {
    const f = forestFixture()
    f.modelState.failModel = true
    const result = yield* inspectTransferForest(f.client, roots, [], undefined, policy)
    expect(result.map((entry) => entry.ownerId)).toEqual(roots)
    expect(observed(result)).toHaveLength(roots.length)
    expect(observed(result).every((inspection) => inspection.discovery === "incomplete")).toBe(true)
    expect(
      observed(result).every((inspection) =>
        inspection.blockers.includes("Owned-record model observation is unavailable.")
      )
    ).toBe(true)
    expect(f.calls).toEqual([])
    expect(f.updates).toEqual([])
  })
)

it.effect("refuses incomplete individual collection totals without attempting batch fallback", () =>
  Effect.gen(function* () {
    const f = forestFixture()
    f.state.truncateIndividual = true
    const result = yield* inspectTransferForest(f.client, [IssueId.make("root")], [], undefined, policy)
    expect(observed(result)[0]?.discovery).toBe("incomplete")
    expect(observed(result)[0]?.blockers.some((reason) => reason.includes("Incomplete collection discovery"))).toBe(
      true
    )
    expect(f.calls.every((call) => call.owners.length === 1)).toBe(true)
    expect(f.updates).toEqual([])
  })
)

it.effect("retains parsed records and sibling observations when a later nested payload is malformed", () =>
  Effect.gen(function* () {
    const f = forestFixture()
    f.docs.push(
      ownedRecord("broken-file", String(attachment.class.Attachment), "comment-a", "attachments", {
        ...attachmentPayload,
        name: 1
      })
    )
    const result = yield* inspectTransferForest(f.client, roots, [], undefined, policy)
    expect(observed(result)[0]?.discovery).toBe("incomplete")
    expect(observed(result)[0]?.records.map((row) => row._id)).toEqual(["comment-a", "history", "file-a"])
    expect(observed(result)[0]?.blockers).toContain("Owned-record payload or ownership observation is unavailable.")
    expect(observed(result)[1]?.discovery).toBe("complete")
    expect(observed(result)[1]?.records.map((row) => row._id)).toEqual(["comment-b"])
    expect(f.updates).toEqual([])
  })
)
