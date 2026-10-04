import { IssueId } from "../../src/domain/schemas/shared.js"
import { it } from "@effect/vitest"
import { Effect, Fiber } from "effect"
import { TestClock } from "effect/testing"
import { TRANSFER_DISCOVERY_BUDGET } from "../../src/huly/operations/issue-transfer-tree.js"
import { expect } from "vitest"
import { HulyClient } from "../../src/huly/client.js"
import { HulyAuthError } from "../../src/huly/errors-base.js"
import { observeTransferForest } from "../../src/huly/issue-transfer-forest-observation.js"
import type { TransferForestEntry } from "../../src/huly/issue-transfer-forest-state.js"
import { assertExists } from "../../src/utils/assertions.js"
import { transferTreeFixture } from "../helpers/transfer-tree.js"

it.effect("legacy owner inspection retains ordered independent failures", () =>
  Effect.gen(function* () {
    const f = transferTreeFixture()
    const inspect = assertExists(f.operations.inspectTransferRecords)
    const client = yield* HulyClient.pipe(
      Effect.provide(
        HulyClient.testLayer({
          ...f.operations,
          inspectTransferRecords: (ownerId, tree) =>
            ownerId === IssueId.make(f.child._id)
              ? Effect.fail(new HulyAuthError({ message: "Unavailable" }))
              : inspect(ownerId, tree)
        })
      )
    )
    const published: Array<TransferForestEntry> = []
    const roots = [IssueId.make(f.root._id), IssueId.make(f.child._id), IssueId.make(f.grandchild._id)]
    const result = yield* observeTransferForest(client, roots, [], (entry) =>
      Effect.sync(() => {
        published.push(entry)
      })
    )
    expect(result.map((entry) => entry.ownerId)).toEqual(roots)
    expect(result.map((entry) => entry.status)).toEqual(["observed", "unavailable", "observed"])
    expect(published).toEqual(result)
  })
)

it.effect("forest progress survives a later batch failure without repeating completed owners", () =>
  Effect.gen(function* () {
    const f = transferTreeFixture()
    const inspect = assertExists(f.operations.inspectTransferRecords)
    const inspection = yield* inspect(IssueId.make(f.root._id), [])
    const roots = [IssueId.make(f.root._id), IssueId.make(f.child._id)]
    const client = yield* HulyClient.pipe(
      Effect.provide(
        HulyClient.testLayer({
          ...f.operations,
          inspectTransferForest: (_roots, tree, publish) =>
            Effect.gen(function* () {
              expect(tree).toEqual([])
              yield* assertExists(publish)({ status: "observed", ownerId: IssueId.make(f.root._id), inspection })
              return yield* Effect.fail(new HulyAuthError({ message: "Later batch unavailable" }))
            })
        })
      )
    )
    const published: Array<TransferForestEntry> = []
    const result = yield* observeTransferForest(client, roots, [], (entry) =>
      Effect.sync(() => {
        published.push(entry)
      })
    )
    expect(result.map((entry) => entry.status)).toEqual(["observed", "unavailable"])
    expect(published).toEqual(result)
    expect(f.state.inspected).toBe(1)
  })
)

it.effect("terminal forest entries preserve requested order and publish each owner once", () =>
  Effect.gen(function* () {
    const f = transferTreeFixture()
    const inspection = yield* assertExists(f.operations.inspectTransferRecords)(IssueId.make(f.root._id), [])
    const root: TransferForestEntry = { status: "observed", ownerId: IssueId.make(f.root._id), inspection }
    const child: TransferForestEntry = {
      status: "unavailable",
      ownerId: IssueId.make(f.child._id),
      reason: "owner-unavailable"
    }
    const client = yield* HulyClient.pipe(
      Effect.provide(
        HulyClient.testLayer({
          ...f.operations,
          inspectTransferForest: (_roots, _tree, publish) =>
            Effect.gen(function* () {
              yield* assertExists(publish)(root)
              return [child, root]
            })
        })
      )
    )
    const published: Array<TransferForestEntry> = []
    const result = yield* observeTransferForest(
      client,
      [IssueId.make(f.root._id), IssueId.make(f.child._id)],
      [],
      (entry) =>
        Effect.sync(() => {
          published.push(entry)
        })
    )
    expect(result).toEqual([root, child])
    expect(published).toEqual([root, child])
  })
)

it.effect("an observed owner is published before a later forest read exceeds its deadline", () =>
  Effect.gen(function* () {
    const f = transferTreeFixture()
    const inspection = yield* assertExists(f.operations.inspectTransferRecords)(IssueId.make(f.root._id), [])
    const root: TransferForestEntry = { status: "observed", ownerId: IssueId.make(f.root._id), inspection }
    const client = yield* HulyClient.pipe(
      Effect.provide(
        HulyClient.testLayer({
          ...f.operations,
          inspectTransferForest: (_roots, _tree, publish) =>
            Effect.gen(function* () {
              yield* assertExists(publish)(root)
              return yield* Effect.never
            })
        })
      )
    )
    const published: Array<TransferForestEntry> = []
    const fiber = yield* observeTransferForest(
      client,
      [IssueId.make(f.root._id), IssueId.make(f.child._id)],
      [],
      (entry) =>
        Effect.sync(() => {
          published.push(entry)
        })
    ).pipe(Effect.timeout(TRANSFER_DISCOVERY_BUDGET), Effect.result, Effect.forkChild)
    yield* TestClock.adjust(TRANSFER_DISCOVERY_BUDGET)
    expect((yield* Fiber.join(fiber))._tag).toBe("Failure")
    expect(published).toEqual([root])
  })
)
