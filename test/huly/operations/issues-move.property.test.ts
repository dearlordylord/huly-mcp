import { Effect } from "effect"
import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { parseMoveIssueParams } from "../../../src/domain/schemas/issue-movement.js"
import { moveIssue } from "../../../src/huly/operations/issues-move.js"
import { initializeHierarchy, movementFixture, movementIssue } from "../../helpers/movement.js"

const trees = fc.array(fc.nat(), { minLength: 1, maxLength: 12 })
const generatedTree = (branches: ReadonlyArray<number>) => {
  const nodes = [movementIssue("root")]
  for (const [index, branch] of branches.entries()) {
    const parent = nodes[branch % nodes.length]
    if (parent === undefined) throw new Error("Generated parent missing")
    nodes.push(movementIssue(`node-${index}`, { attachedTo: parent._id }))
  }
  const destination = movementIssue("destination")
  const issues = [...nodes, destination]
  initializeHierarchy(issues)
  return { destination, issues, nodes, root: nodes[0] }
}

describe("movement invariants", () => {
  it("preserves every stable ID, identifier and internal edge across generated trees and repeated moves", async () => {
    await fc.assert(
      fc.asyncProperty(trees, async (branches) => {
        const { destination, issues, nodes, root } = generatedTree(branches)
        if (root === undefined) throw new Error("Generated root missing")
        const before = nodes.map((issue) => ({ id: issue._id, identifier: issue.identifier, parent: issue.attachedTo }))
        const fixture = movementFixture(issues)
        const input = { issue: root._id, destination: { parent: destination._id } }
        const program = parseMoveIssueParams(input).pipe(Effect.flatMap(moveIssue), Effect.provide(fixture.layer))
        expect((await Effect.runPromise(program)).outcome).toBe("completed")
        for (const snapshot of before) {
          const current = nodes.find((issue) => issue._id === snapshot.id)
          expect(current?.identifier).toBe(snapshot.identifier)
          if (snapshot.id !== root._id) expect(current?.attachedTo).toBe(snapshot.parent)
        }
        expect(root.attachedTo).toBe(destination._id)
        expect(destination.childInfo).toHaveLength(nodes.length)
        const writeCount = fixture.writes.length
        expect((await Effect.runPromise(program)).outcome).toBe("no-op")
        expect(fixture.writes).toHaveLength(writeCount)
      }),
      { numRuns: 40 }
    )
  })

  it("refuses every generated descendant destination without mutating any record", async () => {
    await fc.assert(
      fc.asyncProperty(trees, fc.nat(), async (branches, selected) => {
        const { issues, nodes, root } = generatedTree(branches)
        const parent = nodes[selected % nodes.length]
        if (root === undefined || parent === undefined) throw new Error("Generated selector missing")
        const before = JSON.stringify(issues)
        const fixture = movementFixture(issues)
        const result = await Effect.runPromise(
          parseMoveIssueParams({ issue: root._id, destination: { parent: parent._id } }).pipe(
            Effect.flatMap(moveIssue),
            Effect.provide(fixture.layer)
          )
        )
        expect(result).toMatchObject({ outcome: "blocked", changed: false })
        expect(JSON.stringify(issues)).toBe(before)
        expect(fixture.writes).toEqual([])
      }),
      { numRuns: 40 }
    )
  })
})
