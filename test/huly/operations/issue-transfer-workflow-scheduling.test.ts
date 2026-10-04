import type { Doc, DocumentQuery } from "@hcengineering/core"
import { it } from "@effect/vitest"
import { Deferred, Effect, Fiber, Schema } from "effect"
import { expect } from "vitest"
import { MovementIssueSchema, MovementProjectSchema } from "../../../src/domain/schemas/issue-movement-state.js"
import { IssueId } from "../../../src/domain/schemas/shared.js"
import { parseMoveIssueParams } from "../../../src/domain/schemas/issue-movement.js"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import { HulyAuthError } from "../../../src/huly/errors-base.js"
import { tracker } from "../../../src/huly/huly-plugins.js"
import { inspectTransferPlan } from "../../../src/huly/operations/issue-transfer-preflight.js"
import { assertExists } from "../../../src/utils/assertions.js"
import { sdkFixture } from "../../helpers/huly-sdk.js"
import { initializeHierarchy, movementIssue } from "../../helpers/movement.js"
import { transferTreeFixture } from "../../helpers/transfer-tree.js"

for (const failSibling of [false, true]) {
  it.effect(`overlaps four protected workflows and retains ordered sibling observations (${failSibling})`, () =>
    Effect.gen(function* () {
      const f = transferTreeFixture()
      const sibling = movementIssue("workflow-sibling", { ...f.child, _id: movementIssue("workflow-sibling")._id })
      if (failSibling) f.grandchild.status = sdkFixture("unsupported-status")
      f.issues.push(sibling)
      initializeHierarchy(f.issues)
      const expected = [f.root, f.child, sibling, f.grandchild].map((issue) => issue._id)
      const ready = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      const state = { active: 0, maximum: 0 }
      const original = assertExists(f.operations.findOne)
      const findOne: HulyClientOperations["findOne"] = <T extends Doc>(cls: unknown, query: DocumentQuery<T>) =>
        Effect.gen(function* () {
          if (cls === tracker.class.Issue) {
            state.active++
            state.maximum = Math.max(state.maximum, state.active)
            if (state.active === expected.length) yield* Deferred.succeed(ready, undefined)
            yield* Deferred.await(release)
            state.active--
            if (
              failSibling &&
              Schema.decodeUnknownSync(Schema.Struct({ _id: IssueId }))(query)._id === IssueId.make(sibling._id)
            )
              return yield* Effect.fail(new HulyAuthError({ message: "Sibling observation unavailable" }))
          }
          return yield* original<T>(sdkFixture(cls), query)
        })
      const params = yield* parseMoveIssueParams(f.input)
      const root = yield* Schema.decodeUnknownEffect(MovementIssueSchema)(f.root)
      const parent = yield* Schema.decodeUnknownEffect(MovementIssueSchema)(f.parent)
      const source = yield* Schema.decodeUnknownEffect(MovementProjectSchema)(f.source)
      const destination = yield* Schema.decodeUnknownEffect(MovementProjectSchema)(f.destination)
      const fiber = yield* Effect.gen(function* () {
        const client = yield* HulyClient
        return yield* inspectTransferPlan(client, root, parent, source, destination, params)
      }).pipe(Effect.provide(HulyClient.testLayer({ ...f.operations, findOne })), Effect.forkChild)
      yield* Effect.addFinalizer(() =>
        Deferred.succeed(release, undefined).pipe(Effect.andThen(Fiber.interrupt(fiber)))
      )
      yield* Deferred.await(ready)
      expect(state.active).toBe(expected.length)
      yield* Deferred.succeed(release, undefined)
      const result = yield* Fiber.join(fiber)
      expect(state.maximum).toBe(expected.length)
      if (failSibling) {
        expect("conflicts" in result).toBe(true)
        if (!("conflicts" in result)) return
        expect(
          result.conflicts.some((entry) => entry.issueId === IssueId.make(sibling._id) && entry.code === "discovery")
        ).toBe(true)
        expect(
          result.conflicts.some(
            (entry) => entry.issueId === IssueId.make(f.grandchild._id) && entry.code === "workflow"
          )
        ).toBe(true)
      } else {
        expect("tasks" in result).toBe(true)
        if (!("tasks" in result)) return
        expect(result.tasks.map((task) => task.issue._id)).toEqual(expected)
      }
      expect(f.state.allocated).toBe(0)
      expect(f.state.sent).toBe(0)
    })
  )
}
