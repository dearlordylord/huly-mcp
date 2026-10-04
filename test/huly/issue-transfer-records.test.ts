import type { Doc, DocumentQuery, FindOptions, TxOperations } from "@hcengineering/core"
import { sdkFixture } from "../helpers/huly-sdk.js"
import { it } from "@effect/vitest"
import { Effect } from "effect"
import { expect } from "vitest"
import { inspectTransferRecords } from "../../src/huly/issue-transfer-adapter.js"
import { IssueId } from "../../src/domain/schemas/shared.js"
import { activity, attachment, chunter, tags, tracker } from "../../src/huly/huly-plugins.js"
import { recordAdapterFixture, attachmentPayload, ownedRecord } from "../helpers/transfer-records.js"

const limits = { records: 100, queries: 1000, depth: 32, result: 101 }
const inspect = (fixture: ReturnType<typeof recordAdapterFixture>, policy = limits) =>
  inspectTransferRecords(fixture.client, IssueId.make("root"), policy)

it.effect("refuses when query budget ends before outgoing reference discovery without attempting writes", () =>
  Effect.gen(function* () {
    const f = recordAdapterFixture()
    f.docs.splice(0)
    const state = { requests: 0 }
    const client = sdkFixture<TxOperations>({
      getHierarchy: () => f.client.getHierarchy(),
      findOne: (...args: Parameters<TxOperations["findOne"]>) => f.client.findOne(...args),
      findAll: (cls: Parameters<TxOperations["findAll"]>[0], query: DocumentQuery<Doc>, options?: FindOptions<Doc>) => {
        state.requests++
        return f.client.findAll(cls, query, options)
      }
    })
    const complete = yield* inspectTransferRecords(client, IssueId.make("root"), limits)
    expect(complete.discovery).toBe("complete")
    const incomplete = yield* inspectTransferRecords(client, IssueId.make("root"), {
      ...limits,
      queries: state.requests - 1
    })
    expect(incomplete.discovery).toBe("incomplete")
    expect(incomplete.blockers.join(" ")).toContain("query limit exhausted")
    expect(f.scopes).toEqual([])
    expect(f.updates).toEqual([])
  })
)

it.effect("refuses truncated outgoing references even when attached collection queries completed", () =>
  Effect.gen(function* () {
    const f = recordAdapterFixture()
    f.docs.splice(0)
    f.docs.push(
      ownedRecord("outgoing", String(activity.class.ActivityReference), "independent-target", "references", {
        attachedToClass: "document:class:Document",
        srcDocId: "root",
        srcDocClass: String(tracker.class.Issue),
        message: "link"
      })
    )
    const incomplete = yield* inspect(f, { ...limits, result: 1 })
    expect(incomplete.discovery).toBe("incomplete")
    expect(incomplete.blockers.join(" ")).toContain(String(activity.class.ActivityReference))
    expect(f.scopes).toEqual([])
    expect(f.updates).toEqual([])
  })
)

it.effect(
  "preserves every standard class, nested files/thread references and historical/collaborative payloads with deduplication",
  () =>
    Effect.gen(function* () {
      const f = recordAdapterFixture()
      f.state.duplicate = true
      f.docs.push(
        ownedRecord("comment", String(chunter.class.ChatMessage), "root", "comments", {
          message: "content",
          attachments: 1
        }),
        ownedRecord("file", String(attachment.class.Attachment), "comment", "attachments", attachmentPayload),
        ownedRecord("issue-file", String(attachment.class.Photo), "root", "attachments", attachmentPayload),
        ownedRecord("label", String(tags.class.TagReference), "root", "labels", {
          tag: "independent-tag",
          title: "label",
          color: 1
        }),
        ownedRecord("time", String(tracker.class.TimeSpendReport), "root", "reports", {
          employee: null,
          date: null,
          value: 2,
          description: "time"
        }),
        ownedRecord("reply", String(chunter.class.ThreadMessage), "comment", "replies", {
          message: "reply",
          objectId: "root",
          objectClass: tracker.class.Issue
        }),
        ownedRecord("reply-file", String(attachment.class.Embedding), "reply", "attachments", {
          ...attachmentPayload,
          attachedToClass: chunter.class.ThreadMessage
        }),
        ownedRecord("reaction", String(activity.class.Reaction), "comment", "reactions", {
          emoji: ":smile:",
          createBy: "author"
        })
      )
      const result = yield* inspect(f)
      expect(result.discovery).toBe("complete")
      expect(result.blockers).toEqual([])
      expect(result.records).toHaveLength(f.docs.length)
      expect(result.records.find((record) => record._id === "reply")?.snapshot).toContain('"objectId":"root"')
      expect(result.records.find((record) => record._id === "file")?.snapshot).toContain("blob-stable")
    })
)

it.effect(
  "routes ActivityReference by source ownership, preserving independent and dangling targets and incoming references",
  () =>
    Effect.gen(function* () {
      const f = recordAdapterFixture()
      f.docs.push(
        ownedRecord("outgoing", String(activity.class.ActivityReference), "independent-document", "references", {
          attachedToClass: "document:class:Document",
          srcDocId: "root",
          srcDocClass: tracker.class.Issue,
          message: "link"
        }),
        ownedRecord("dangling", String(activity.class.ActivityReference), "missing-target", "references", {
          attachedToClass: "document:class:Document",
          srcDocId: "root",
          srcDocClass: tracker.class.Issue,
          message: "dangling"
        }),
        ownedRecord("incoming", String(activity.class.ActivityReference), "root", "references", {
          space: "independent-space",
          srcDocId: "independent-document",
          srcDocClass: "document:class:Document",
          message: "incoming"
        })
      )
      const result = yield* inspect(f)
      expect(result.blockers).toEqual([])
      expect(result.records.map((record) => record._id)).toEqual(["history", "outgoing", "dangling"])
      expect(result.records.find((record) => record._id === "outgoing")).toMatchObject({
        ownerId: "root",
        attachedTo: "independent-document"
      })
      expect(f.docs.find((record) => record._id === "incoming")?.space).toBe("independent-space")
    })
)

it.effect("refuses unknown classes, undeclared edges, ownership mismatch and conflicting snapshots", () =>
  Effect.gen(function* () {
    const f = recordAdapterFixture()
    f.docs.push(
      ownedRecord("unknown", "unknown:class:Record"),
      ownedRecord("edge", String(chunter.class.ChatMessage), "root", "undeclared", { message: "x" }),
      ownedRecord("wrong-class", String(chunter.class.ChatMessage), "root", "comments", {
        message: "x",
        attachedToClass: "document:class:Document"
      }),
      ownedRecord("wrong-source", String(activity.class.ActivityReference), "target", "references", {
        srcDocId: "root",
        srcDocClass: "document:class:Document",
        message: "x"
      })
    )
    f.state.duplicate = true
    f.state.conflict = true
    const result = yield* inspect(f)
    expect(result.blockers.join(" ")).toContain("Unsupported owned record unknown")
    expect(result.blockers.join(" ")).toContain("Unsupported collection edge undeclared")
    expect(result.blockers.join(" ")).toContain("Conflicting ownership class")
    expect(result.blockers.join(" ")).toContain("Inconsistent reference source class")
    expect(result.blockers.join(" ")).toContain("Conflicting snapshots")
    expect(f.updates).toEqual([])
  })
)

for (const policy of [
  { ...limits, records: 0 },
  { ...limits, queries: 0 },
  { ...limits, depth: 1 },
  { ...limits, result: 1 }
]) {
  it.effect(`refuses incomplete traversal for ${JSON.stringify(policy)}`, () =>
    Effect.gen(function* () {
      const f = recordAdapterFixture()
      expect((yield* inspect(f, policy)).discovery).toBe("incomplete")
      expect(f.updates).toEqual([])
    })
  )
}

it.effect("detects cycles, including a repeated stable id along a nested ownership path", () =>
  Effect.gen(function* () {
    const f = recordAdapterFixture()
    f.docs.push(
      ownedRecord("comment", String(chunter.class.ChatMessage), "root", "comments", { message: "x" }),
      ownedRecord("root", String(chunter.class.ThreadMessage), "comment", "replies", {
        message: "cycle",
        objectId: "root",
        objectClass: tracker.class.Issue
      })
    )
    expect((yield* inspect(f)).blockers.join(" ")).toContain("cycle")
  })
)

it.effect("includes supported generic activity and informational replies without changing their payload", () =>
  Effect.gen(function* () {
    const f = recordAdapterFixture()
    f.docs.push(
      ownedRecord("generic", String(activity.class.ActivityMessage), "history", "replies", {
        attachedToClass: activity.class.DocUpdateMessage
      }),
      ownedRecord("info", String(activity.class.ActivityInfoMessage), "history", "replies", {
        attachedToClass: activity.class.DocUpdateMessage,
        message: "activity:string:Update",
        props: { original: "text" }
      })
    )
    expect((yield* inspect(f)).blockers).toEqual([])
  })
)

it.effect("unknown totals refuse completion and invalid totals remain typed boundary failures", () =>
  Effect.gen(function* () {
    const f = recordAdapterFixture()
    f.state.unknownTotal = true
    expect((yield* inspect(f)).discovery).toBe("incomplete")
    f.state.unknownTotal = false
    f.state.invalidTotal = true
    expect((yield* Effect.result(inspect(f)))._tag).toBe("Failure")
    expect(f.updates).toEqual([])
  })
)

it.effect("reads the root runtime model and refuses a mismatched stable root identity", () =>
  Effect.gen(function* () {
    const f = recordAdapterFixture()
    f.state.rootClass = "tracker:class:CustomIssue"
    f.docs.push(
      ownedRecord("comment", String(chunter.class.ChatMessage), "root", "comments", {
        message: "inherited",
        attachedToClass: f.state.rootClass
      })
    )
    expect((yield* inspect(f)).blockers).toEqual([])
    f.state.rootId = "different-root"
    expect((yield* Effect.result(inspect(f)))._tag).toBe("Failure")
  })
)

it.effect("unknown nested counts refuse completion even when root records are visible", () =>
  Effect.gen(function* () {
    const f = recordAdapterFixture()
    f.state.unknownNestedTotal = true
    const result = yield* inspect(f)
    expect(result.discovery).toBe("incomplete")
    expect(result.blockers.join(" ")).toContain("Incomplete")
    expect(f.updates).toEqual([])
  })
)
