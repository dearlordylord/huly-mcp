import { it } from "@effect/vitest"
import type { Class, Doc, DocumentQuery, FindOptions, Ref, TxOperations } from "@hcengineering/core"
import { Effect, Schema } from "effect"
import { expect } from "vitest"
import { IssueId } from "../../src/domain/schemas/shared.js"
import { TransferWriteSchema } from "../../src/domain/schemas/issue-transfer.js"
import { activity, chunter } from "../../src/huly/huly-plugins.js"
import { commitTransfer, inspectTransferRecords } from "../../src/huly/issue-transfer-adapter.js"
import { findResult, sdkFixture } from "../helpers/huly-sdk.js"
import { ownedRecord, recordAdapterFixture } from "../helpers/transfer-records.js"

it.effect(
  "same-project reparenting conditions owned records without rewriting their route, authors or task number",
  () =>
    Effect.gen(function* () {
      const f = recordAdapterFixture()
      f.docs.push(
        ownedRecord("comment", String(chunter.class.ChatMessage), "root", "comments", { message: "Preserved" })
      )
      const inspection = yield* inspectTransferRecords(f.client, IssueId.make("root"))
      expect(inspection.blockers).toEqual([])
      const input: unknown = {
        issueId: "root",
        sourceId: "source",
        destinationId: "source",
        previousParent: "old",
        parentId: "new-parent",
        modifiedOn: 1,
        number: 2,
        identifier: "SRC-2",
        rank: "0|hzzzzz:",
        records: inspection.records,
        recordClasses: inspection.classes
      }
      const write = Schema.decodeUnknownSync(TransferWriteSchema)(input)
      expect(yield* Effect.promise(() => commitTransfer(f.client, write))).toBe("applied")
      expect(f.updates).toHaveLength(3)
      expect(f.updates.map((update) => update[2])).toEqual(["root", "old", "new-parent"])
      expect(f.updates[0]?.[3]).toEqual({ attachedTo: "new-parent" })
      expect(f.conditions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ _id: "comment", space: "source", attachedTo: "root", modifiedOn: 1 }),
          expect.objectContaining({ _id: "history", space: "source", attachedTo: "root", modifiedOn: 1 })
        ])
      )
      expect(f.docs.find((doc) => doc._id === "comment")).toMatchObject({
        space: "source",
        modifiedBy: "author",
        modifiedOn: 1,
        message: "Preserved"
      })
    })
)

it.effect("refuses an inherited outgoing reference class whose extra ownership semantics are unaudited", () =>
  Effect.gen(function* () {
    const customClass = "fixture:class:CustomReference"
    const f = recordAdapterFixture(false, new Map([[customClass, String(activity.class.ActivityReference)]]))
    f.docs.push(
      ownedRecord("custom-reference", customClass, "independent-target", "references", {
        attachedToClass: "document:class:Document",
        srcDocId: "root",
        srcDocClass: "tracker:class:Issue",
        message: "Independent target"
      })
    )
    const inspection = yield* inspectTransferRecords(f.client, IssueId.make("root"))
    expect(inspection.discovery).toBe("complete")
    expect(inspection.blockers).toContain(`Unsupported reference subclass ${customClass} (custom-reference).`)
    expect(inspection.records.some((record) => record._id === "custom-reference")).toBe(false)
    expect(f.updates).toEqual([])
    expect(f.scopes).toEqual([])
    expect(f.docs.find((doc) => doc._id === "custom-reference")?.attachedTo).toBe("independent-target")
  })
)

it.effect(
  "refuses an SDK response with ownership differing from its query instead of trusting the requested parent",
  () =>
    Effect.gen(function* () {
      const f = recordAdapterFixture()
      f.docs.push(
        ownedRecord("comment", String(chunter.class.ChatMessage), "root", "comments", { message: "Preserved" })
      )
      const client = sdkFixture<TxOperations>({
        findOne: (...args: Parameters<TxOperations["findOne"]>) => f.client.findOne(...args),
        getHierarchy: () => f.client.getHierarchy(),
        findAll: async (cls: Ref<Class<Doc>>, query: DocumentQuery<Doc>, options?: FindOptions<Doc>) => {
          const rows = await f.client.findAll(cls, query, options)
          return findResult(
            rows.map((row) => (row._id === "comment" ? sdkFixture<Doc>({ ...row, attachedTo: "other-owner" }) : row))
          )
        }
      })
      const inspection = yield* inspectTransferRecords(client, IssueId.make("root"))
      expect(inspection.blockers).toContain("Conflicting ownership parent on comment.")
      expect(f.updates).toEqual([])
      expect(f.scopes).toEqual([])
      expect(f.docs.find((doc) => doc._id === "comment")?.attachedTo).toBe("root")
    })
)
