import type { Doc, TxOperations } from "@hcengineering/core"
import { it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { expect } from "vitest"
import { inspectTransferRecords, commitTransfer } from "../../src/huly/issue-transfer-adapter.js"
import { TransferWriteSchema } from "../../src/domain/schemas/issue-transfer.js"
import { IssueId } from "../../src/domain/schemas/shared.js"
import { activity, attachment, core, tracker } from "../../src/huly/huly-plugins.js"
import { sdkFixture, findResult } from "../helpers/huly-sdk.js"

const adapterFixture = () => {
  const history = {
    _id: "history",
    _class: activity.class.DocUpdateMessage,
    space: "source",
    attachedTo: "root",
    modifiedOn: 1,
    modifiedBy: "author",
    objectId: "root",
    objectClass: tracker.class.Issue,
    action: "create",
    createdBy: "author",
    createdOn: 1
  }
  const docs: Array<Record<string, unknown>> = [history]
  const state = { refused: false, incomplete: false, failRead: false, invalidMetadata: false }
  const updates: Array<ReadonlyArray<unknown>> = []
  const conditions: Array<unknown> = []
  const scopes: Array<string | undefined> = []
  const metadata = new Map([
    ["history", { type: { _class: core.class.Collection, of: activity.class.DocUpdateMessage } }],
    ["scalar", { type: { _class: core.class.TypeString } }]
  ])
  const apply = {
    match: (_class: unknown, query: unknown) => {
      conditions.push(query)
    },
    updateDoc: async (...args: ReadonlyArray<unknown>) => {
      updates.push(args)
      return {}
    },
    commit: async () => ({ result: !state.refused || scopes.at(-1) === undefined })
  }
  const client = sdkFixture<TxOperations>({
    getHierarchy: () => ({
      getAllAttributes: () =>
        state.invalidMetadata ? new Map([["bad", { type: { _class: core.class.Collection } }]]) : metadata,
      isDerived: (cls: unknown, parent: unknown) => cls === parent,
      getDescendants: () => [activity.class.DocUpdateMessage, attachment.class.Attachment, "unpersisted"],
      findDomain: (cls: unknown) => (cls === "unpersisted" ? undefined : "test")
    }),
    findAll: async (cls: unknown, query: Record<string, unknown>) => {
      if (state.failRead) throw new Error("Unavailable read")
      const result = findResult(
        docs
          .filter((doc) => doc._class === cls && doc.attachedTo === query.attachedTo)
          .map((doc) => sdkFixture<Doc>(doc))
      )
      if (state.incomplete) result.total = 10_002
      return result
    },
    apply: (scope: string | undefined) => {
      scopes.push(scope)
      return apply
    }
  })
  return { client, docs, history, state, updates, conditions, scopes }
}
const writeInput = {
  issueId: "root",
  sourceId: "source",
  destinationId: "destination",
  previousParent: "old",
  parentId: "parent",
  modifiedOn: 1,
  number: 2,
  identifier: "NEW-2",
  rank: "0|hzzzzz:"
}

it.effect(
  "discovers inherited model-owned records, migrates automatic history preserving authors/timestamps and inspects SDK commit",
  () =>
    Effect.gen(function* () {
      const f = adapterFixture()
      const records = yield* inspectTransferRecords(f.client, IssueId.make("root"))
      expect(records.blockers).toEqual([])
      expect(records.records).toMatchObject([
        { _id: "history", kind: "history", history: { action: "create", createdBy: "author" } }
      ])
      const write = Schema.decodeUnknownSync(TransferWriteSchema)({ ...writeInput, records: records.records })
      expect(yield* Effect.promise(() => commitTransfer(f.client, write))).toBe("applied")
      expect(f.scopes.every((scope) => typeof scope === "string" && scope.length > 0)).toBe(true)
      expect(f.updates[0]?.slice(-2)).toEqual([1, "author"])
      expect(f.updates[1]?.[3]).toMatchObject({
        space: "destination",
        number: 2,
        identifier: "NEW-2",
        attachedTo: "parent"
      })
      expect(f.conditions).toMatchObject([
        { _id: "root", space: "source", attachedTo: "old", modifiedOn: 1 },
        { _id: "history", attachedTo: "root" }
      ])
      expect(f.updates).toHaveLength(4)
      f.state.refused = true
      expect(
        yield* Effect.promise(() =>
          commitTransfer(f.client, {
            ...write,
            previousParent: sdkFixture(tracker.ids.NoParent),
            parentId: sdkFixture(tracker.ids.NoParent)
          })
        )
      ).toBe("condition-not-met")
      expect(f.updates).toHaveLength(6)
      expect(new Set(f.scopes).size).toBe(1)
    })
)

it.effect("discovers unsupported attachments and nested history records; states incomplete discovery", () =>
  Effect.gen(function* () {
    const f = adapterFixture()
    f.docs.push(
      {
        _id: "attachment",
        _class: attachment.class.Attachment,
        space: "source",
        attachedTo: "root",
        modifiedOn: 1,
        modifiedBy: "author"
      },
      {
        _id: "reaction",
        _class: attachment.class.Attachment,
        space: "source",
        attachedTo: "history",
        modifiedOn: 1,
        modifiedBy: "author"
      }
    )
    f.state.incomplete = true
    const inspection = yield* inspectTransferRecords(f.client, IssueId.make("root"))
    expect(inspection.blockers.join(" ")).toContain("Incomplete")
    expect(inspection.blockers.join(" ")).toContain("Unsupported owned record attachment")
    expect(inspection.blockers.join(" ")).toContain("nested records on history")
    expect(f.updates).toEqual([])
  })
)

for (const mode of ["failRead", "invalidMetadata"] as const) {
  it.effect(`returns typed inspection failure for ${mode}`, () =>
    Effect.gen(function* () {
      const f = adapterFixture()
      f.state[mode] = true
      const result = yield* Effect.result(inspectTransferRecords(f.client, IssueId.make("root")))
      expect(result._tag).toBe("Failure")
      expect(f.updates).toEqual([])
    })
  )
}

it.effect("parses historical update payloads into immutable encoded snapshots and rejects non-JSON history", () =>
  Effect.gen(function* () {
    const f = adapterFixture()
    const updates = { title: { set: "Original title" } }
    Reflect.set(f.history, "attributeUpdates", updates)
    const inspection = yield* inspectTransferRecords(f.client, IssueId.make("root"))
    expect(inspection.records).toMatchObject([{ history: { attributeUpdates: JSON.stringify(updates) } }])
    Reflect.set(f.history, "attributeUpdates", () => "invalid")
    expect((yield* Effect.result(inspectTransferRecords(f.client, IssueId.make("root"))))._tag).toBe("Failure")
    expect(f.updates).toEqual([])
  })
)

it.effect("writes only planned attributes and conditions each replacement or clear on its expected reference", () =>
  Effect.gen(function* () {
    for (const field of ["component", "milestone"]) {
      for (const to of ["replacement", null]) {
        const f = adapterFixture()
        const write = Schema.decodeUnknownSync(TransferWriteSchema)({
          ...writeInput,
          records: [],
          attributeChanges: [
            {
              issueId: "root",
              field,
              from: "expected",
              to,
              reason: to === null ? "explicit-clear" : "explicit-replacement"
            }
          ]
        })
        expect(yield* Effect.promise(() => commitTransfer(f.client, write))).toBe("applied")
        expect(f.conditions).toContainEqual({ _id: "root", [field]: "expected" })
        if (to !== null) expect(f.conditions).toContainEqual({ _id: to, space: "destination" })
        expect(f.updates[0]?.[3]).toMatchObject({ [field]: to })
        const other = field === "component" ? "milestone" : "component"
        expect(f.updates[0]?.[3]).not.toHaveProperty(other)
      }
    }
  })
)
