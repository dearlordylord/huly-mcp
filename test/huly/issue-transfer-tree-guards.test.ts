import { it } from "@effect/vitest"
import { Effect } from "effect"
import { expect } from "vitest"
import { PositiveInteger, IssueId } from "../../src/domain/schemas/shared.js"
import { planTransferTreeWrites } from "../../src/huly/operations/issue-transfer-tree-planning.js"
import { commitTransferTree } from "../../src/huly/issue-transfer-tree-adapter.js"
import { tracker } from "../../src/huly/huly-plugins.js"
import { sdkFixture } from "../helpers/huly-sdk.js"
import { recordAdapterFixture } from "../helpers/transfer-records.js"
import { treePlanFixture } from "../helpers/tree-plan.js"
import { transferTreeFixture } from "../helpers/transfer-tree.js"

it.effect("a batch with no selected root refuses without queuing any document updates", () =>
  Effect.gen(function* () {
    const { destination, prepared } = treePlanFixture()
    const write = planTransferTreeWrites(
      prepared,
      destination,
      [4, 5, 6].map((n) => PositiveInteger.make(n)),
      undefined
    )
    expect(write).toBeDefined()
    if (write === undefined) return
    const adapter = recordAdapterFixture(true)
    const result = yield* Effect.promise(() =>
      commitTransferTree(adapter.client, { ...write, rootId: IssueId.make("missing-root") })
    ).pipe(Effect.flatMap(Effect.fromResult))
    expect(result).toBe("condition-not-met")
    expect(adapter.updates).toEqual([])
    expect(adapter.conditions).toEqual([])
  })
)

it.effect("guards absent and already-valid destination references independently for every task", () =>
  Effect.gen(function* () {
    const f = transferTreeFixture()
    Reflect.deleteProperty(f.root, "component")
    Reflect.deleteProperty(f.root, "milestone")
    f.child.component = sdkFixture("valid-component")
    f.grandchild.milestone = sdkFixture("valid-milestone")
    const { destination, prepared } = treePlanFixture(f)
    const write = planTransferTreeWrites(
      prepared,
      destination,
      [4, 5, 6].map((n) => PositiveInteger.make(n)),
      undefined
    )
    expect(write).toBeDefined()
    if (write === undefined) return
    const adapter = recordAdapterFixture(true)
    adapter.docs.splice(
      0,
      adapter.docs.length,
      ...f.issues.map((issue) => ({ ...issue })),
      { _id: "valid-component", _class: tracker.class.Component, space: destination._id },
      { _id: "valid-milestone", _class: tracker.class.Milestone, space: destination._id }
    )
    expect(
      yield* Effect.promise(() => commitTransferTree(adapter.client, write)).pipe(Effect.flatMap(Effect.fromResult))
    ).toBe("applied")
    expect(adapter.conditions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ _id: f.root._id, component: { $exists: false }, milestone: { $exists: false } }),
        expect.objectContaining({ _id: f.child._id, component: "valid-component", milestone: null }),
        expect.objectContaining({ _id: f.grandchild._id, component: null, milestone: "valid-milestone" })
      ])
    )
    const root = adapter.docs.find((doc) => doc._id === f.root._id)
    if (root !== undefined) root.component = null
    expect(
      yield* Effect.promise(() => commitTransferTree(adapter.client, write)).pipe(Effect.flatMap(Effect.fromResult))
    ).toBe("condition-not-met")
  })
)
