import { it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { expect } from "vitest"
import { inspectTransferRecords, commitTransfer } from "../../src/huly/issue-transfer-adapter.js"
import { TransferWriteSchema } from "../../src/domain/schemas/issue-transfer.js"
import { IssueId } from "../../src/domain/schemas/shared.js"
import { attachment, tracker } from "../../src/huly/huly-plugins.js"
import { sdkFixture } from "../helpers/huly-sdk.js"
import { recordAdapterFixture as adapterFixture, attachmentPayload, ownedRecord } from "../helpers/transfer-records.js"

const writeInput = {
  issueId: "root",
  sourceId: "source",
  destinationId: "destination",
  previousParent: "old",
  parentId: "parent",
  modifiedOn: 1,
  number: 2,
  identifier: "NEW-2",
  rank: "0|hzzzzz:",
  recordClasses: []
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
      expect(f.conditions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ _id: "root", space: "source", attachedTo: "old", modifiedOn: 1 }),
          expect.objectContaining({ _id: "history", attachedTo: "root" })
        ])
      )
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

it.effect("discovers nested attachments and refuses incomplete model results before any writes", () =>
  Effect.gen(function* () {
    const f = adapterFixture()
    f.docs.push(
      ownedRecord("attachment", String(attachment.class.Attachment), "root", "attachments", attachmentPayload)
    )
    f.state.incomplete = true
    const inspection = yield* inspectTransferRecords(f.client, IssueId.make("root"))
    expect(inspection.discovery).toBe("incomplete")
    expect(inspection.blockers.join(" ")).toContain("Incomplete")
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

it.effect(
  "scoped closure conditions refuse concurrent owned-record additions without relying on issue modifiedOn",
  () =>
    Effect.gen(function* () {
      const f = adapterFixture()
      const inspection = yield* inspectTransferRecords(f.client, IssueId.make("root"))
      const write = Schema.decodeUnknownSync(TransferWriteSchema)({
        ...writeInput,
        records: inspection.records,
        recordClasses: inspection.classes
      })
      f.docs.push(
        ownedRecord("new-comment", "chunter:class:ChatMessage", "root", "comments", { message: "Concurrent write" })
      )
      expect(yield* Effect.promise(() => commitTransfer(f.client, write))).toBe("condition-not-met")
      expect(f.docs.find((row) => row._id === "new-comment")?.space).toBe("source")
    })
)

it.effect("incoming independent references do not invalidate ownership closure; outgoing source additions do", () =>
  Effect.gen(function* () {
    const f = adapterFixture()
    const inspection = yield* inspectTransferRecords(f.client, IssueId.make("root"))
    const write = Schema.decodeUnknownSync(TransferWriteSchema)({
      ...writeInput,
      records: inspection.records,
      recordClasses: inspection.classes
    })
    f.docs.push(
      ownedRecord("incoming", "activity:class:ActivityReference", "root", "references", {
        srcDocId: "independent",
        srcDocClass: "document:class:Document",
        message: "incoming"
      })
    )
    expect(yield* Effect.promise(() => commitTransfer(f.client, write))).toBe("applied")
    f.docs.push(
      ownedRecord("outgoing", "activity:class:ActivityReference", "independent", "references", {
        srcDocId: "root",
        srcDocClass: "tracker:class:Issue",
        message: "outgoing"
      })
    )
    expect(yield* Effect.promise(() => commitTransfer(f.client, write))).toBe("condition-not-met")
  })
)
