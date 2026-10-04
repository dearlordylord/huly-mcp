import { it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { expect } from "vitest"
import { MovementIssueSchema, MovementProjectSchema } from "../../../src/domain/schemas/issue-movement-state.js"
import { parseMoveIssueParams } from "../../../src/domain/schemas/issue-movement.js"
import { TransferInspectionSchema } from "../../../src/domain/schemas/issue-transfer.js"
import { DocId, ObjectClassName } from "../../../src/domain/schemas/shared.js"
import { HulyClient } from "../../../src/huly/client.js"
import { moveIssue } from "../../../src/huly/operations/issue-movement.js"
import { inspectTransferPlan } from "../../../src/huly/operations/issue-transfer-preflight.js"
import { verifyTransferTree } from "../../../src/huly/operations/issue-transfer-tree-verification.js"
import type { TransferTreeWrite } from "../../../src/domain/schemas/issue-transfer-tree.js"
import { assertExists } from "../../../src/utils/assertions.js"
import { sdkFixture } from "../../helpers/huly-sdk.js"
import { transferFixture } from "../../helpers/transfer.js"

const issueSnapshot = (input: unknown) => Schema.decodeUnknownSync(MovementIssueSchema)(input)
const projectSnapshot = (input: unknown) => Schema.decodeUnknownSync(MovementProjectSchema)(input)

const mutations = [
  "missingRoot",
  "wrongProject",
  "wrongIdentifier",
  "wrongParent",
  "missingAncestor",
  "brokenAncestor",
  "invalidIdentity",
  "wrongRank",
  "changedKind",
  "changedTitle",
  "missingInspector",
  "incompleteRecords",
  "recordBlockers",
  "missingHistory",
  "foreignRecord",
  "incompleteSource",
  "incompleteTarget",
  "closureChange",
  "unsupportedRecord",
  "missingIdentity"
]

for (const mutation of mutations) {
  it.effect(`verification refuses completion after ${mutation}`, () =>
    Effect.gen(function* () {
      const f = transferFixture()
      const client = yield* HulyClient.pipe(Effect.provide(f.layer))
      const params = yield* parseMoveIssueParams(f.input)
      const destination = projectSnapshot(f.destination)
      const prepared = yield* inspectTransferPlan(
        client,
        issueSnapshot(f.root),
        issueSnapshot(f.parent),
        projectSnapshot(f.source),
        destination,
        params
      )
      expect("conflicts" in prepared).toBe(false)
      if ("conflicts" in prepared) return
      const committed: Array<TransferTreeWrite> = []
      const commit = assertExists(f.operations.commitTransferTree)
      const committing = HulyClient.testLayer({
        ...f.operations,
        commitTransferTree: (write) => {
          committed.push(write)
          return commit(write)
        }
      })
      const moved = yield* moveIssue(params).pipe(Effect.provide(committing))
      expect(moved.outcome).toBe("completed")
      expect(committed).toHaveLength(1)
      const write = assertExists(committed[0])
      if (mutation === "missingRoot") f.issues.splice(f.issues.indexOf(f.root), 1)
      if (mutation === "wrongProject") f.root.space = sdkFixture("third-project")
      if (mutation === "wrongIdentifier") f.root.identifier = "OTHER-wrong"
      if (mutation === "wrongParent") f.root.attachedTo = f.old._id
      if (mutation === "missingAncestor") f.issues.splice(f.issues.indexOf(f.old), 1)
      if (mutation === "brokenAncestor") f.old.subIssues++
      if (mutation === "invalidIdentity") f.root.number = Number.NaN
      if (mutation === "wrongRank") f.root.rank = "0|zzzzzz:"
      if (mutation === "changedKind") f.root.kind = sdkFixture("different-kind")
      if (mutation === "changedTitle") f.root.title = "Changed after commit"
      const currentRecords: Array<unknown> = mutation === "missingHistory" ? [] : [...f.records]
      if (mutation === "foreignRecord") {
        const old = f.records[0]
        expect(old).toBeDefined()
        if (old !== undefined)
          currentRecords.push({ ...old, _id: DocId.make("new-record"), space: DocId.make(f.source._id) })
      }
      if (mutation === "unsupportedRecord") {
        const old = f.records[0]
        if (old !== undefined)
          currentRecords.push({
            ...old,
            kind: "unsupported",
            _class: ObjectClassName.make("chunter:class:ChatMessage"),
            _id: DocId.make("unsupported-new-record")
          })
      }
      const originalFindOne = assertExists(f.operations.findOne)
      const inspection = Schema.decodeUnknownSync(TransferInspectionSchema)({
        discovery: mutation === "incompleteRecords" ? "incomplete" : "complete",
        records: currentRecords,
        classes: prepared.recordClasses,
        blockers: mutation === "recordBlockers" ? ["New unsupported record"] : [],
        limitation: "Test inventory"
      })
      const { inspectTransferRecords: _inspector, ...withoutInspector } = f.operations
      const originalFindAll = assertExists(f.operations.findAll)
      const observed = HulyClient.testLayer({
        ...withoutInspector,
        findOne: (cls, query, options) =>
          mutation === "missingIdentity" && Reflect.get(query, "_id") === f.root._id
            ? Effect.succeed(undefined)
            : originalFindOne(cls, query, options),
        findAll: (cls, query, options) =>
          originalFindAll(cls, query, options).pipe(
            Effect.map((rows) => {
              if (
                (mutation === "incompleteSource" && Reflect.get(query, "space") === f.source._id) ||
                (mutation === "incompleteTarget" && Reflect.get(query, "space") === f.destination._id) ||
                (mutation === "closureChange" && Reflect.get(query, "attachedTo") !== undefined)
              )
                rows.total = rows.length + 1
              return rows
            })
          ),
        ...(mutation === "missingInspector" ? {} : { inspectTransferRecords: () => Effect.succeed(inspection) })
      })
      const observedClient = yield* HulyClient.pipe(Effect.provide(observed))
      const verified = yield* Effect.result(verifyTransferTree(observedClient, prepared, destination, write))
      expect(verified._tag).toBe("Success")
      if (verified._tag === "Success") {
        if (["incompleteSource", "incompleteTarget"].includes(mutation))
          expect(verified.success).toMatchObject({ status: "unavailable" })
        else if (["invalidIdentity", "missingInspector", "incompleteRecords", "closureChange"].includes(mutation))
          expect(verified.success).toMatchObject({
            status: "observed",
            completeness: "incomplete",
            consistency: "undetermined"
          })
        else expect(verified.success).toMatchObject({ status: "observed", consistency: "inconsistent" })
      }

      expect(f.state.sent).toBe(1)
    })
  )
}
