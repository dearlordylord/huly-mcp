import { it } from "@effect/vitest"
import { Effect, Fiber, Schema } from "effect"
import { TestClock } from "effect/testing"
import { expect } from "vitest"
import { DocId, ObjectClassName } from "../../../src/domain/schemas/shared-refs.js"
import { parseMoveIssueParams } from "../../../src/domain/schemas/issue-movement.js"
import { TransferSupportedRecordSchema } from "../../../src/domain/schemas/issue-transfer.js"
import { HulyClient } from "../../../src/huly/client.js"
import { moveIssue } from "../../../src/huly/operations/issues.js"
import { activity, attachment, chunter, tags, tracker } from "../../../src/huly/huly-plugins.js"
import { transferFixture } from "../../helpers/transfer.js"
import { ownedRecord, attachmentPayload } from "../../helpers/transfer-records.js"

const move = (input: unknown) => parseMoveIssueParams(input).pipe(Effect.flatMap(moveIssue))

const parseSupportedRecords = (input: unknown) =>
  Schema.decodeUnknownSync(Schema.Array(TransferSupportedRecordSchema))(input)

const richFixture = () => {
  const f = transferFixture()
  let extra = parseSupportedRecords(
    [
      ownedRecord("comment", String(chunter.class.ChatMessage), f.root._id, "comments", {
        message: "original",
        kind: "owned",
        ownerId: f.root._id,
        ownerClass: tracker.class.Issue,
        snapshot: "comment payload"
      }),
      ownedRecord("file", String(attachment.class.Attachment), "comment", "attachments", {
        ...attachmentPayload,
        kind: "owned",
        ownerId: "comment",
        ownerClass: chunter.class.ChatMessage,
        snapshot: "blob payload"
      }),
      ownedRecord("label", String(tags.class.TagReference), f.root._id, "labels", {
        kind: "owned",
        ownerId: f.root._id,
        ownerClass: tracker.class.Issue,
        snapshot: "tag payload"
      }),
      ownedRecord("report", String(tracker.class.TimeSpendReport), f.root._id, "reports", {
        kind: "owned",
        ownerId: f.root._id,
        ownerClass: tracker.class.Issue,
        snapshot: "time payload"
      }),
      ownedRecord("outgoing", String(activity.class.ActivityReference), "independent", "references", {
        kind: "owned",
        ownerId: f.root._id,
        ownerClass: tracker.class.Issue,
        snapshot: "independent link"
      })
    ].map((row) => ({ ...row, space: f.source._id }))
  )
  const state = { corrupt: false, unavailableAfterWrite: false }
  const layer = HulyClient.testLayer({
    ...f.operations,
    inspectTransferRecords: (issueId) => {
      const inspect = f.operations.inspectTransferRecords
      if (inspect === undefined) return Effect.die("Fixture inspection is required")
      return inspect(issueId).pipe(
        Effect.map((inspection) => ({
          ...inspection,
          discovery: state.unavailableAfterWrite && f.state.sent > 0 ? "incomplete" : inspection.discovery,
          classes: [...new Set([...inspection.classes, ...extra.map((record) => ObjectClassName.make(record._class))])],
          records: [...inspection.records, ...(issueId === f.input.issue ? extra : [])]
        }))
      )
    },
    commitTransferTree: (write) => {
      const commit = f.operations.commitTransferTree
      if (commit === undefined) return Effect.die("Fixture commit is required")
      return commit(write).pipe(
        Effect.map((result) => {
          if (result !== "applied") return result
          extra = extra.map((record) => ({
            ...record,
            space: write.destinationId,
            ...(state.corrupt ? { snapshot: "changed" } : {})
          }))
          return result
        })
      )
    }
  })
  return { f, state, layer, read: () => extra }
}

it.effect(
  "shared operation moves all owned stable IDs while preserving content and independent target references",
  () =>
    Effect.gen(function* () {
      const fixture = richFixture()
      const before = fixture.read()
      const result = yield* move(fixture.f.input).pipe(Effect.provide(fixture.layer))
      expect(result).toMatchObject({ outcome: "completed", changed: true })
      expect(fixture.read()).toEqual(before.map((record) => ({ ...record, space: fixture.f.destination._id })))
      expect(fixture.read().find((record) => record._id === "outgoing")?.attachedTo).toBe("independent")
    })
)

it.effect("post-write payload inconsistency reports stable records and valid published inspection calls", () =>
  Effect.gen(function* () {
    const fixture = richFixture()
    fixture.state.corrupt = true
    const task = yield* Effect.forkChild(move(fixture.f.input).pipe(Effect.provide(fixture.layer)))
    yield* TestClock.adjust("2 seconds")
    const result = yield* Fiber.join(task)
    expect(result).toMatchObject({
      outcome: "incomplete",
      recordIds: expect.arrayContaining(["comment", "file", "report", "outgoing"])
    })
    if (result.outcome === "incomplete") {
      expect(result.inspection).toContain("list_activity")
      expect(result.inspection).toContain("list_comments")
      expect(result.inspection).toContain("get_time_report")
    }
  })
)

it.effect("no-op rejects unknown semantic blockers before repeated writes", () =>
  Effect.gen(function* () {
    const f = transferFixture()
    yield* move(f.input).pipe(Effect.provide(f.layer))
    f.state.recordsBlockers.push("Unsupported collection edge on nested owned record")
    expect(yield* move(f.input).pipe(Effect.provide(f.layer))).toMatchObject({ outcome: "blocked", changed: false })
    expect(f.state.allocated).toBe(1)
    expect(f.state.sent).toBe(1)
  })
)

it.effect("no-op refuses unavailable ownership inspection instead of claiming verified success", () =>
  Effect.gen(function* () {
    const f = transferFixture()
    yield* move(f.input).pipe(Effect.provide(f.layer))
    const { inspectTransferRecords: _inspect, ...ports } = f.operations
    const layer = HulyClient.testLayer(ports)
    expect(yield* move(f.input).pipe(Effect.provide(layer))).toMatchObject({
      outcome: "blocked",
      changed: false,
      reason: expect.stringContaining("inspection unavailable")
    })
    expect(f.state.allocated).toBe(1)
    expect(f.state.sent).toBe(1)
  })
)

it.effect("unavailable post-write record totals report indeterminate while preserving known write effects", () =>
  Effect.gen(function* () {
    const fixture = richFixture()
    fixture.state.unavailableAfterWrite = true
    const task = yield* Effect.forkChild(move(fixture.f.input).pipe(Effect.provide(fixture.layer)))
    yield* TestClock.adjust("2 seconds")
    const result = yield* Fiber.join(task)
    expect(result).toMatchObject({ outcome: "indeterminate" })
    expect(result).not.toMatchObject({ changed: false })
    expect(fixture.f.state.sent).toBe(1)
    expect(fixture.read().every((record) => record.space === DocId.make(fixture.f.destination._id))).toBe(true)
  })
)
