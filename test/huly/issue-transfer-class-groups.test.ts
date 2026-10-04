import { it } from "@effect/vitest"
import type { Doc, DocumentQuery, Domain, FindOptions, Hierarchy, TxOperations } from "@hcengineering/core"
import { Effect, Schema } from "effect"
import { expect } from "vitest"
import { IssueId, ObjectClassName } from "../../src/domain/schemas/shared.js"
import { groupTransferClassQueries, type ClassCoverageModel } from "../../src/huly/issue-transfer-class-groups.js"
import { inspectTransferRecords } from "../../src/huly/issue-transfer-discovery.js"
import { activity, chunter } from "../../src/huly/huly-plugins.js"
import { toClassRef } from "../../src/huly/operations/sdk-boundary.js"
import { sdkFixture } from "../helpers/huly-sdk.js"
import { ownedRecord, recordAdapterFixture } from "../helpers/transfer-records.js"

const cls = Schema.decodeUnknownSync(ObjectClassName)
const ancestor = cls("fixture:class:Ancestor")
const child = cls("fixture:class:Child")
const grandchild = cls("fixture:class:Grandchild")
const sibling = cls("fixture:class:Sibling")
const mixin = cls("fixture:class:Mixin")
const domain = sdkFixture<Domain>("fixture-domain")
const otherDomain = sdkFixture<Domain>("other-domain")
// Internal model port implements the same transitive parent relation as the SDK.
const model = (overrides: Partial<ClassCoverageModel> = {}): ClassCoverageModel => ({
  isMixin: (value) => value === mixin,
  findDomain: () => domain,
  isDerived: (value, parent) =>
    value === parent ||
    (parent === ancestor && [child, grandchild, mixin].includes(value)) ||
    (parent === child && value === grandchild),
  ...overrides
})

it.effect("uses only an existing highest ancestor and preserves first-covered query order", () =>
  Effect.sync(() => {
    expect(groupTransferClassQueries([grandchild, sibling, child, ancestor], model())).toEqual([ancestor, sibling])
    expect(groupTransferClassQueries([grandchild, sibling, child], model())).toEqual([child, sibling])
  })
)
it.effect("retains mixins even when their physical parent is covered", () =>
  Effect.sync(() => {
    expect(groupTransferClassQueries([child, mixin, ancestor], model())).toEqual([ancestor, mixin])
  })
)
it.effect("retains cross-domain descendants and unrelated same-domain siblings", () =>
  Effect.sync(() => {
    expect(
      groupTransferClassQueries(
        [child, sibling, ancestor],
        model({ findDomain: (value) => (value === child ? otherDomain : domain) })
      )
    ).toEqual([child, sibling, ancestor])
  })
)
it.effect("retains classes without a persisted domain", () =>
  Effect.sync(() => {
    expect(groupTransferClassQueries([child, ancestor], model({ findDomain: () => undefined }))).toEqual([
      child,
      ancestor
    ])
  })
)
it.effect("never uses a mixin as the representative of a concrete class", () =>
  Effect.sync(() => {
    expect(groupTransferClassQueries([child, mixin], model({ isDerived: () => true }))).toEqual([child, mixin])
  })
)

const policy = { records: 100, queries: 1000, depth: 32, result: 101 }
const groupedFixture = (retainMixin = false) => {
  const f = recordAdapterFixture()
  f.docs.push(ownedRecord("comment", String(chunter.class.ChatMessage), "root", "comments", { message: "Preserved" }))
  const calls: Array<ObjectClassName> = []
  const base = f.client.getHierarchy()
  const hierarchy = sdkFixture<Hierarchy>({
    getAllAttributes: (...args: Parameters<Hierarchy["getAllAttributes"]>) => base.getAllAttributes(...args),
    getDescendants: (...args: Parameters<Hierarchy["getDescendants"]>) => base.getDescendants(...args),
    findDomain: (...args: Parameters<Hierarchy["findDomain"]>) => base.findDomain(...args),
    isDerived: (...args: Parameters<Hierarchy["isDerived"]>) => base.isDerived(...args),
    isMixin: (value: unknown) => retainMixin && value === String(chunter.class.ThreadMessage)
  })
  const client = sdkFixture<TxOperations>({
    getHierarchy: () => hierarchy,
    findOne: (...args: Parameters<TxOperations["findOne"]>) => f.client.findOne(...args),
    findAll: (value: unknown, query: DocumentQuery<Doc>, options?: FindOptions<Doc>) => {
      const parsed = cls(value)
      calls.push(parsed)
      return f.client.findAll(toClassRef<Doc>(parsed), query, options)
    }
  })
  return { ...f, client, calls }
}
it.effect("preserves full guard inventory while removing concrete descendant requests", () =>
  Effect.gen(function* () {
    const f = groupedFixture()
    const result = yield* inspectTransferRecords(f.client, IssueId.make("root"), policy)
    expect(result.discovery).toBe("complete")
    expect(result.blockers).toEqual([])
    expect(result.records.map((row) => row._id)).toEqual(["history", "comment"])
    expect(result.classes).toContain(String(chunter.class.ThreadMessage))
    expect(f.calls).not.toContain(String(chunter.class.ThreadMessage))
    expect(f.calls).toContain(String(activity.class.ActivityMessage))
    expect(f.scopes).toEqual([])
    expect(f.updates).toEqual([])
  })
)
it.effect("continues querying a mixin class independently", () =>
  Effect.gen(function* () {
    const f = groupedFixture(true)
    const result = yield* inspectTransferRecords(f.client, IssueId.make("root"), policy)
    expect(result.discovery).toBe("complete")
    expect(f.calls).toContain(String(chunter.class.ThreadMessage))
  })
)
it.effect("representative incomplete totals still refuse without task writes", () =>
  Effect.gen(function* () {
    const f = groupedFixture()
    f.state.incomplete = true
    const result = yield* inspectTransferRecords(f.client, IssueId.make("root"), policy)
    expect(result.discovery).toBe("incomplete")
    expect(result.records).toEqual([])
    expect(f.updates).toEqual([])
    expect(f.scopes).toEqual([])
  })
)

it.effect("still discovers and refuses an unsupported concrete descendant through its representative", () =>
  Effect.gen(function* () {
    const unknown = cls("custom:class:UnknownComment")
    const f = recordAdapterFixture(false, new Map([[unknown, cls(String(chunter.class.ChatMessage))]]))
    f.docs.push(ownedRecord("unknown", unknown, "root", "comments", { message: "Unapproved payload" }))
    const result = yield* inspectTransferRecords(f.client, IssueId.make("root"), policy)
    expect(result.classes).toContain(unknown)
    expect(result.records.find((row) => row._id === "unknown")?.kind).toBe("unsupported")
    expect(result.blockers.some((reason) => reason.includes("Unsupported owned record"))).toBe(true)
    expect(f.updates).toEqual([])
    expect(f.scopes).toEqual([])
  })
)
