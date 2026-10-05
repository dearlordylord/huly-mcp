import { it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { expect } from "vitest"
import { MovementIssueSchema } from "../../src/domain/schemas/issue-movement-state.js"
import { IssueId } from "../../src/domain/schemas/shared.js"
import { inspectTransferRecords } from "../../src/huly/issue-transfer-adapter.js"
import { tracker } from "../../src/huly/huly-plugins.js"
import { recordAdapterFixture } from "../helpers/transfer-records.js"
import { transferFixture } from "../helpers/transfer.js"

const parseTask = (input: unknown) => Schema.decodeUnknownSync(MovementIssueSchema)(input)
const limits = { records: 100, queries: 1000, depth: 32, result: 101 }

it.effect(
  "model ownership skips only a fully inspected task edge and still preserves its parent's supporting records",
  () =>
    Effect.gen(function* () {
      const f = recordAdapterFixture()
      const template = transferFixture().root
      const child = {
        ...template,
        _id: "child",
        identifier: "TEST-3",
        space: "source",
        attachedTo: "root",
        attachedToClass: tracker.class.Issue,
        collection: "subIssues"
      }
      f.docs.push(child)
      const root = parseTask({ ...template, space: "source" })
      const task = parseTask(child)
      const result = yield* inspectTransferRecords(f.client, IssueId.make("root"), limits, [root, task])
      expect(result.discovery).toBe("complete")
      expect(result.blockers).toEqual([])
      expect(result.records.map((record) => record._id)).toEqual(["history"])
      expect(result.classes).toContain(String(tracker.class.Issue))
    })
)

it.effect("new, changed or wrongly owned task rows cannot be hidden by an approved tree ID", () =>
  Effect.gen(function* () {
    for (const mode of ["new", "changed", "collection", "class"]) {
      const f = recordAdapterFixture()
      const template = transferFixture().root
      const child = {
        ...template,
        _id: "child",
        identifier: "TEST-3",
        space: "source",
        attachedTo: "root",
        attachedToClass: tracker.class.Issue,
        collection: "subIssues"
      }
      const root = parseTask({ ...template, space: "source" })
      const task = parseTask(child)
      f.docs.push({
        ...child,
        ...(mode === "changed" ? { space: "another-space" } : {}),
        ...(mode === "collection" ? { collection: "comments" } : {}),
        ...(mode === "class" ? { attachedToClass: "document:class:Document" } : {})
      })
      const result = yield* inspectTransferRecords(
        f.client,
        IssueId.make("root"),
        limits,
        mode === "new" ? [root] : [root, task]
      )
      expect(result.discovery).toBe("incomplete")
      expect(result.blockers.length).toBeGreaterThan(0)
    }
  })
)
