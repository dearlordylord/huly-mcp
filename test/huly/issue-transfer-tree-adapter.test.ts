import { TxOperations, type Client, type Tx, type Hierarchy } from "@hcengineering/core"
import { corePersonId, sdkFixture } from "../helpers/huly-sdk.js"
import { type MovementTransactions } from "../../src/huly/issue-movement-transactions.js"
import { HulyDataInvalidError } from "../../src/huly/errors-base.js"
import { MovementTransportError } from "../../src/huly/movement-transaction-transport.js"
import { it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { expect } from "vitest"
import {
  MovementIssueSchema,
  MovementProjectSchema,
  type MovementIssue
} from "../../src/domain/schemas/issue-movement-state.js"
import {
  DocId,
  IssueId,
  IssueIdentifier,
  Count,
  PositiveInteger,
  NonEmptyString
} from "../../src/domain/schemas/shared.js"
import { commitTransferTree } from "../../src/huly/issue-transfer-tree-adapter.js"
import { HulyClient } from "../../src/huly/client.js"
import { inspectTransferPlan } from "../../src/huly/operations/issue-transfer-preflight.js"
import { parseMoveIssueParams } from "../../src/domain/schemas/issue-movement.js"
import { planTransferTreeWrites } from "../../src/huly/operations/issue-transfer-tree-planning.js"
import { movementNoParent } from "../../src/huly/operations/issue-movement-hierarchy.js"
import { recordAdapterFixture } from "../helpers/transfer-records.js"
import { transferTreeFixture } from "../helpers/transfer-tree.js"

const TaskUpdateSchema = Schema.Struct({
  id: DocId,
  update: Schema.Struct({
    space: Schema.optionalKey(DocId),
    attachedTo: Schema.optionalKey(IssueId),
    identifier: Schema.optionalKey(IssueIdentifier),
    parents: Schema.optionalKey(MovementIssueSchema.fields.parents),
    $inc: Schema.optionalKey(Schema.Struct({ subIssues: Schema.Number })),
    $pull: Schema.optionalKey(Schema.Struct({ childInfo: Schema.Struct({ childId: IssueId }) }))
  })
})
type TaskUpdate = Schema.Schema.Type<typeof TaskUpdateSchema>
const parseUpdate = (input: unknown) => Schema.decodeUnknownSync(TaskUpdateSchema)(input)
const parseIssue = (input: unknown) => Schema.decodeUnknownSync(MovementIssueSchema)(input)
const parseProject = (input: unknown) => Schema.decodeUnknownSync(MovementProjectSchema)(input)

// Pinned server semantics: persist the complete initial batch, compute all
// attachedTo-trigger ancestry/childInfo deltas from that state, then persist derived deltas.
const applyPersistedBatch = (
  issues: ReadonlyArray<MovementIssue>,
  updates: ReadonlyArray<TaskUpdate>,
  includeParents: boolean
) => {
  const stored = new Map<string, MovementIssue>(issues.map((issue) => [issue._id, issue]))
  for (const { id, update } of updates) {
    const current = stored.get(id)
    if (current === undefined) continue
    const removed = update.$pull?.childInfo.childId
    stored.set(id, {
      ...current,
      space: update.space ?? current.space,
      attachedTo: update.attachedTo ?? current.attachedTo,
      identifier: update.identifier ?? current.identifier,
      parents: includeParents ? (update.parents ?? current.parents) : current.parents,
      subIssues: Count.make(current.subIssues + (update.$inc?.subIssues ?? 0)),
      childInfo: current.childInfo.filter((child) => removed !== child.childId)
    })
  }
  const derived: Array<{ issue: MovementIssue; parents: MovementIssue["parents"] }> = []
  for (const { id, update } of updates.filter((entry) => entry.update.attachedTo !== undefined)) {
    const issue = stored.get(id)
    if (issue === undefined) continue
    const parent = stored.get(update.attachedTo ?? movementNoParent)
    const parents =
      parent === undefined
        ? []
        : [
            { parentId: parent._id, identifier: parent.identifier, parentTitle: parent.title, space: parent.space },
            ...parent.parents
          ]
    derived.push({ issue, parents })
  }
  for (const { issue, parents } of derived) {
    stored.set(issue._id, { ...issue, parents })
    for (const ancestor of [...issue.parents, ...parents]) {
      const current = stored.get(ancestor.parentId)
      if (current !== undefined)
        stored.set(current._id, {
          ...current,
          childInfo: current.childInfo.filter((child) => child.childId !== issue._id)
        })
    }
    for (const ancestor of parents) {
      const current = stored.get(ancestor.parentId)
      if (current !== undefined)
        stored.set(current._id, {
          ...current,
          childInfo: [
            ...current.childInfo,
            { childId: issue._id, estimation: issue.estimation, reportedTime: issue.reportedTime }
          ]
        })
    }
  }
  return stored
}

it.effect(
  "initial batch projects all ancestry and removes only old external ancestor entries before deferred server triggers",
  () =>
    Effect.gen(function* () {
      const f = transferTreeFixture()
      const client = yield* HulyClient.pipe(Effect.provide(f.layer))
      const params = yield* parseMoveIssueParams(f.input)
      const source = parseProject(f.source)
      const destination = parseProject(f.destination)
      const prepared = yield* inspectTransferPlan(
        client,
        parseIssue(f.root),
        parseIssue(f.parent),
        source,
        destination,
        params
      )
      expect("conflicts" in prepared).toBe(false)
      if ("conflicts" in prepared) return
      const write = planTransferTreeWrites(
        prepared,
        destination,
        [4, 5, 6].map((number) => PositiveInteger.make(number)),
        undefined
      )
      expect(write).toBeDefined()
      if (write === undefined) return
      const adapter = recordAdapterFixture(true)
      adapter.docs.splice(
        0,
        adapter.docs.length,
        ...f.issues.map((issue) => ({ ...issue })),
        ...f.records.map((record) => ({ ...record }))
      )
      expect(
        yield* Effect.promise(() => commitTransferTree(adapter.client, write)).pipe(Effect.flatMap(Effect.fromResult))
      ).toBe("applied")
      const updates = adapter.updates.map((args) => parseUpdate({ id: args[2], update: args[3] }))
      const previous = f.issues.map((issue) => parseIssue(issue))
      const observed = applyPersistedBatch(previous, updates, true)
      for (const task of write.tasks) expect(observed.get(task.issueId)?.parents).toEqual(task.finalParents)
      expect(observed.get(f.old._id)?.childInfo).toEqual([])
      expect(observed.get(f.old._id)?.subIssues).toBe(0)
      expect(observed.get(f.parent._id)?.subIssues).toBe(2)
      expect(observed.get(f.parent._id)?.childInfo.map((child) => child.childId)).toEqual(
        expect.arrayContaining(write.tasks.map((task) => task.issueId))
      )
      // Without prewritten parents, a child's trigger reads its parent's stale source chain.
      expect(applyPersistedBatch(previous, updates, false).get(f.grandchild._id)?.parents).not.toEqual(
        write.tasks[2]?.finalParents
      )
      // Conditional refusal is evaluated from the actual source snapshots.
      const changed = adapter.docs.find((doc) => doc._id === f.grandchild._id)
      expect(changed).toBeDefined()
      if (changed !== undefined) changed.modifiedOn = f.grandchild.modifiedOn + 1
      expect(
        yield* Effect.promise(() => commitTransferTree(adapter.client, write)).pipe(Effect.flatMap(Effect.fromResult))
      ).toBe("condition-not-met")
      const countUpdates = updates.filter((entry) => entry.update.$inc !== undefined)
      expect(countUpdates.map((entry) => entry.id)).toEqual([f.old._id, f.parent._id])
    })
)

for (const lostReply of [false, true]) {
  it.effect("publishes actual queued issue transactions before send and retains intent through a lost reply", () =>
    Effect.gen(function* () {
      const f = transferTreeFixture()
      const client = yield* HulyClient.pipe(Effect.provide(f.layer))
      const prepared = yield* inspectTransferPlan(
        client,
        parseIssue(f.root),
        parseIssue(f.parent),
        parseProject(f.source),
        parseProject(f.destination),
        yield* parseMoveIssueParams(f.input)
      )
      expect("conflicts" in prepared).toBe(false)
      if ("conflicts" in prepared) return
      const write = planTransferTreeWrites(
        prepared,
        parseProject(f.destination),
        [4, 5, 6].map((number) => PositiveInteger.make(number)),
        undefined
      )
      expect(write).toBeDefined()
      if (write === undefined) return
      let receipts: MovementTransactions = []
      const sends: Tx[] = []
      const failure = new MovementTransportError({ phase: "after-send", reason: NonEmptyString.make("Lost reply") })
      const ordinary = new TxOperations(
        sdkFixture<Client>({
          getHierarchy: () =>
            sdkFixture<Hierarchy>({
              findAttribute: (_class: unknown, key: string) => ({
                type: { _class: "core:class:TypeString" },
                hidden: key === "childInfo"
              }),
              isDerived: () => false
            }),
          tx: async (tx: Tx) => {
            expect(receipts.length).toBeGreaterThan(write.tasks.length)
            sends.push(tx)
            if (lostReply) throw failure
            return { success: true, serverTime: 1 }
          }
        }),
        corePersonId("person")
      )
      const result = yield* Effect.tryPromise({
        try: () =>
          commitTransferTree(ordinary, write, async (queued) => {
            receipts = queued
          }),
        catch: (error) =>
          error instanceof MovementTransportError
            ? error
            : new HulyDataInvalidError({ operation: "move_issue", entity: "test queued transaction" })
      }).pipe(Effect.flatMap(Effect.fromResult), Effect.result)
      expect(sends).toHaveLength(1)
      expect(receipts.map((receipt) => receipt.objectId)).toEqual(
        expect.arrayContaining(write.tasks.map((task) => task.issueId))
      )
      expect(new Set(receipts.map((receipt) => receipt.txId)).size).toBe(receipts.length)
      const beforeRejectedCallback = sends.length
      const callbackFailure = new HulyDataInvalidError({ operation: "move_issue", entity: "receipt observer" })
      const rejected = yield* Effect.tryPromise({
        try: () =>
          commitTransferTree(ordinary, write, async () => {
            throw callbackFailure
          }),
        catch: (error) =>
          error instanceof HulyDataInvalidError
            ? error
            : new HulyDataInvalidError({ operation: "move_issue", entity: "unexpected callback failure" })
      }).pipe(Effect.result)
      expect(rejected._tag).toBe("Failure")
      if (rejected._tag === "Failure") expect(rejected.failure).toBe(callbackFailure)
      expect(sends).toHaveLength(beforeRejectedCallback)
      const rawBatch: unknown = sends[0]
      const batch = Schema.decodeUnknownSync(
        Schema.Struct({
          txes: Schema.Array(
            Schema.Struct({
              _id: DocId,
              objectId: DocId,
              operations: Schema.JsonObject,
              modifiedOn: Count,
              modifiedBy: NonEmptyString
            })
          )
        })
      )(rawBatch)
      for (const receipt of receipts) {
        const actual = batch.txes.find((tx) => tx._id === receipt.txId)
        expect(actual).toBeDefined()
        expect(actual?.objectId).toBe(receipt.objectId)
        expect(actual?.operations).toEqual(receipt.operations)
        expect(actual?.modifiedOn).toBe(receipt.modifiedOn)
        expect(actual?.modifiedBy).toBe(receipt.modifiedBy)
        expect(receipt.historyAttributes.every((attribute) => attribute.attrClass === "core:class:TypeString")).toBe(
          true
        )
      }
      if (lostReply) {
        expect(result._tag).toBe("Failure")
        if (result._tag === "Failure") expect(result.failure).toBe(failure)
      } else expect(result).toEqual(expect.objectContaining({ _tag: "Success", success: "applied" }))
    })
  )
}
