import type { Hierarchy, TxOperations } from "@hcengineering/core"
import { it } from "@effect/vitest"
import { Effect, Result } from "effect"
import { expect } from "vitest"
import { PositiveInteger } from "../../src/domain/schemas/shared.js"
import { commitTransferTree } from "../../src/huly/issue-transfer-tree-adapter.js"
import { planTransferTreeWrites } from "../../src/huly/operations/issue-transfer-tree-planning.js"
import { sdkFixture } from "../helpers/huly-sdk.js"
import { treePlanFixture } from "../helpers/tree-plan.js"

for (const failure of ["operations", "author", "model", "attribute-key"]) {
  it.effect(`refuses invalid queued ${failure} evidence before publishing intent or sending a batch`, () =>
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
      let commits = 0
      let published = 0
      let queued = 0
      const txes: unknown[] = []
      const apply = {
        txes,
        match: () => undefined,
        notMatch: () => undefined,
        updateDoc: async () => {
          queued++
          txes.push({
            _id: `tx-${queued}`,
            _class: "core:class:TxUpdateDoc",
            objectClass: "tracker:class:Issue",
            objectId: write.rootId,
            objectSpace: write.tasks[0]?.sourceId,
            modifiedOn: 1,
            modifiedBy: failure === "author" ? "" : "person",
            operations:
              failure === "operations"
                ? undefined
                : failure === "attribute-key"
                  ? { "": "parent" }
                  : { attachedTo: "parent" }
          })
          return {}
        },
        commit: async () => {
          commits++
          return { result: true }
        }
      }
      const client = sdkFixture<TxOperations>({
        apply: () => apply,
        getHierarchy: () =>
          sdkFixture<Hierarchy>({
            findAttribute: () => ({ type: { _class: failure === "model" ? 42 : "core:class:TypeString" } }),
            isDerived: () => false
          })
      })
      const result = yield* Effect.promise(() =>
        commitTransferTree(client, write, async () => {
          published++
        })
      )
      expect(queued).toBeGreaterThan(0)
      expect(Result.isFailure(result)).toBe(true)
      if (Result.isFailure(result)) {
        expect(result.failure._tag).toBe("HulyDataInvalidError")
        expect(result.failure.operation).toBe("move_issue")
      }
      expect(published).toBe(0)
      expect(commits).toBe(0)
    })
  )
}
