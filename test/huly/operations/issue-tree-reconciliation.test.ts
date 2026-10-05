import { describe, it } from "@effect/vitest"
import type { Issue } from "@hcengineering/tracker"
import { Effect, Fiber, Schema } from "effect"
import { TestClock } from "effect/testing"
import { expect } from "vitest"

import { parseMoveIssueParams } from "../../../src/domain/schemas/issue-movement.js"
import { MovementIssueSchema } from "../../../src/domain/schemas/issue-movement-state.js"
import type { TransferTreeWrite } from "../../../src/domain/schemas/issue-transfer-tree.js"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import { Diagnostics, makeDiagnosticsScope } from "../../../src/huly/diagnostics.js"
import { movementHierarchy } from "../../../src/huly/operations/issue-movement-hierarchy.js"
import { canonicalParents, reconcileIssueTree } from "../../../src/huly/operations/issue-tree-reconciliation.js"
import { updateIssue } from "../../../src/huly/operations/issues-update.js"
import { moveIssue } from "../../../src/huly/operations/issues-move.js"
import { issueIdentifier, projectIdentifier } from "../../helpers/brands.js"
import { movementFixture, movementIssue, threeLevelMovementFixture } from "../../helpers/movement.js"

const parseIssue = (input: Issue) => Schema.decodeUnknownSync(MovementIssueSchema)(input)

const staleTitles = (issue: Issue) => {
  issue.parents = issue.parents.map((parent) => ({ ...parent, parentTitle: "stale" }))
}

const expectedAncestry = (chain: ReadonlyArray<Issue>) =>
  chain.map((parent) => ({
    parentId: parent._id,
    identifier: parent.identifier,
    parentTitle: parent.title,
    space: parent.space
  }))

describe("canonical issue ancestry", () => {
  it("derives nearest-first parents from attachedTo with current titles", () => {
    const tree = threeLevelMovementFixture()
    staleTitles(tree.leaf)
    const hierarchy = movementHierarchy(tree.issues.map(parseIssue))
    expect(canonicalParents(hierarchy, parseIssue(tree.leaf))).toEqual(
      expectedAncestry([tree.child, tree.root, tree.old])
    )
  })

  it("repairs only drifted subtree members and skips unresolvable chains", () => {
    const tree = threeLevelMovementFixture()
    staleTitles(tree.leaf)
    tree.child.parents = []
    const hierarchy = movementHierarchy(tree.issues.map(parseIssue))
    expect(reconcileIssueTree(hierarchy, parseIssue(tree.root))).toEqual([
      { issueId: tree.child._id, space: tree.child.space, parents: expectedAncestry([tree.root, tree.old]) },
      { issueId: tree.leaf._id, space: tree.leaf.space, parents: expectedAncestry([tree.child, tree.root, tree.old]) }
    ])
    const orphan = movementIssue("orphan", { attachedTo: movementIssue("missing")._id })
    const orphanHierarchy = movementHierarchy([parseIssue(orphan)])
    expect(reconcileIssueTree(orphanHierarchy, parseIssue(orphan))).toEqual([])
  })
})

const capturingLayer = (fixture: ReturnType<typeof movementFixture>, writes: Array<TransferTreeWrite>) => {
  const commit = fixture.operations.commitTransferTree
  const commitTransferTree: NonNullable<HulyClientOperations["commitTransferTree"]> = (write, publish) => {
    writes.push(write)
    return commit(write, publish)
  }
  return HulyClient.testLayer({ ...fixture.operations, commitTransferTree })
}

describe("movement over a stale ancestry cache", () => {
  for (const destination of ["old", "destination"] as const) {
    for (const drift of ["titles", "missing"] as const) {
      it.effect(`moves to ${destination} and rewrites ${drift} ancestry`, () =>
        Effect.gen(function* () {
          const tree = threeLevelMovementFixture()
          if (drift === "titles") staleTitles(tree.leaf)
          else tree.leaf.parents = []
          const fixture = movementFixture(tree.issues)
          const writes: Array<TransferTreeWrite> = []
          const fiber = yield* Effect.forkChild(
            parseMoveIssueParams({ issue: "root", destination: { parent: destination } }).pipe(
              Effect.flatMap(moveIssue),
              Effect.provide(capturingLayer(fixture, writes))
            )
          )
          yield* TestClock.adjust("2 seconds")
          const result = yield* Fiber.join(fiber)
          expect(result).toMatchObject({ outcome: "completed", changed: true })
          const destinationChain = destination === "old" ? [tree.old] : [tree.destination, tree.destinationAncestor]
          expect(writes[0]?.tasks.find((task) => String(task.issueId) === String(tree.leaf._id))?.finalParents).toEqual(
            expectedAncestry([tree.child, tree.root, ...destinationChain])
          )
        })
      )
    }
  }

  it.effect("keeps a consistent same-parent request a write-free no-op", () =>
    Effect.gen(function* () {
      const tree = threeLevelMovementFixture()
      const fixture = movementFixture(tree.issues)
      const fiber = yield* Effect.forkChild(
        parseMoveIssueParams({ issue: "root", destination: { parent: "old" } }).pipe(
          Effect.flatMap(moveIssue),
          Effect.provide(fixture.layer)
        )
      )
      yield* TestClock.adjust("2 seconds")
      expect(yield* Fiber.join(fiber)).toMatchObject({ outcome: "no-op", changed: false })
      expect(fixture.writes).toEqual([])
    })
  )
})

const renameRoot = (fixture: ReturnType<typeof movementFixture>, tree: ReturnType<typeof threeLevelMovementFixture>) =>
  Effect.gen(function* () {
    const diagnostics = yield* makeDiagnosticsScope
    const result = yield* updateIssue({
      project: projectIdentifier("TEST"),
      identifier: issueIdentifier(tree.root.identifier),
      title: "Renamed root"
    }).pipe(Effect.provide(fixture.layer), Effect.provideService(Diagnostics, diagnostics.service))
    return { result, warnings: yield* diagnostics.drainWarnings }
  })

describe("update_issue rename", () => {
  it.effect("rewrites descendant ancestry with the new title", () =>
    Effect.gen(function* () {
      const tree = threeLevelMovementFixture()
      const fixture = movementFixture(tree.issues)
      const { result, warnings } = yield* renameRoot(fixture, tree)
      expect(result).toEqual({ identifier: tree.root.identifier, updated: true })
      expect(warnings).toEqual([])
      const renamed = { ...tree.root, title: "Renamed root" }
      expect(fixture.writes.slice(1)).toEqual([
        { id: tree.child._id, operations: { parents: expectedAncestry([renamed, tree.old]) } },
        { id: tree.leaf._id, operations: { parents: expectedAncestry([tree.child, renamed, tree.old]) } }
      ])
    })
  )

  it.effect("warns instead of failing when the subtree cannot be read completely", () =>
    Effect.gen(function* () {
      const tree = threeLevelMovementFixture()
      const fixture = movementFixture(tree.issues, { closureTotal: 100 })
      const { result, warnings } = yield* renameRoot(fixture, tree)
      expect(result.updated).toBe(true)
      expect(fixture.writes).toHaveLength(1)
      expect(warnings).toEqual([
        {
          code: "issue_descendant_ancestry_stale",
          message: expect.stringContaining("sub-issues may still show the previous parent title")
        }
      ])
    })
  )

  it.effect("does not touch descendants when the title is unchanged", () =>
    Effect.gen(function* () {
      const tree = threeLevelMovementFixture()
      tree.root.title = "Renamed root"
      const fixture = movementFixture(tree.issues)
      yield* renameRoot(fixture, tree)
      expect(fixture.writes).toHaveLength(1)
    })
  )
})
