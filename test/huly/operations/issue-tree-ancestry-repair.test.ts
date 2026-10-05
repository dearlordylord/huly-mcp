import { describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { expect } from "vitest"

import { HulyClient } from "../../../src/huly/client.js"
import { repairIssueTreeAncestry } from "../../../src/huly/operations/issue-tree-ancestry-repair.js"
import { movementFixture, movementIssue } from "../../helpers/movement.js"

describe("bounded issue ancestry repair", () => {
  it.effect("refuses an issue that is no longer readable without writing", () =>
    Effect.gen(function* () {
      const issue = movementIssue("deleted-root")
      const fixture = movementFixture([])
      const outcome = yield* Effect.gen(function* () {
        const client = yield* HulyClient
        return yield* repairIssueTreeAncestry(client, issue._id, { title: "Renamed" })
      }).pipe(Effect.provide(fixture.layer))
      expect(outcome).toEqual({ _tag: "Incomplete", reason: "Issue is not readable after update." })
      expect(fixture.writes).toEqual([])
    })
  )

  it.effect("refuses an unreadable ancestor without partially repairing descendants", () =>
    Effect.gen(function* () {
      const missing = movementIssue("missing-parent")
      const issue = movementIssue("root", { attachedTo: missing._id })
      const child = movementIssue("child", { attachedTo: issue._id })
      const fixture = movementFixture([issue, child])
      const outcome = yield* Effect.gen(function* () {
        const client = yield* HulyClient
        return yield* repairIssueTreeAncestry(client, issue._id, { title: "Renamed" })
      }).pipe(Effect.provide(fixture.layer))
      expect(outcome).toEqual({ _tag: "Incomplete", reason: "Ancestor chain is unreadable or cyclic." })
      expect(fixture.writes).toEqual([])
    })
  )

  it.effect("refuses a cycle in the ancestor chain before subtree writes", () =>
    Effect.gen(function* () {
      const issue = movementIssue("root")
      const parent = movementIssue("parent", { attachedTo: issue._id })
      issue.attachedTo = parent._id
      const fixture = movementFixture([issue, parent])
      const outcome = yield* Effect.gen(function* () {
        const client = yield* HulyClient
        return yield* repairIssueTreeAncestry(client, issue._id, { title: "Renamed" })
      }).pipe(Effect.provide(fixture.layer))
      expect(outcome).toEqual({ _tag: "Incomplete", reason: "Ancestor chain is unreadable or cyclic." })
      expect(fixture.writes).toEqual([])
    })
  )

  it.effect("returns a typed boundary failure for malformed ancestor metadata", () =>
    Effect.gen(function* () {
      const parent = movementIssue("malformed-parent")
      Reflect.set(parent, "title", 42)
      const issue = movementIssue("root", { attachedTo: parent._id })
      const fixture = movementFixture([issue, parent])
      const error = yield* Effect.gen(function* () {
        const client = yield* HulyClient
        return yield* repairIssueTreeAncestry(client, issue._id, { title: "Renamed" })
      }).pipe(Effect.provide(fixture.layer), Effect.flip)
      expect(error._tag).toBe("HulyDataInvalidError")
      expect(fixture.writes).toEqual([])
    })
  )

  it.effect("stops a readable ancestor chain at the qualification limit", () =>
    Effect.gen(function* () {
      const issue = movementIssue("root")
      const ancestors = Array.from({ length: 1_001 }, (_, index) => movementIssue(`ancestor-${index}`))
      let previous = issue
      for (const ancestor of ancestors) {
        previous.attachedTo = ancestor._id
        previous = ancestor
      }
      const fixture = movementFixture([issue, ...ancestors])
      const outcome = yield* Effect.gen(function* () {
        const client = yield* HulyClient
        return yield* repairIssueTreeAncestry(client, issue._id, { title: "Renamed" })
      }).pipe(Effect.provide(fixture.layer))
      expect(outcome).toEqual({ _tag: "Incomplete", reason: "Ancestor chain is unreadable or cyclic." })
      expect(fixture.writes).toEqual([])
    })
  )
})
