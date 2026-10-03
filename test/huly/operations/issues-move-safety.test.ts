import { describe, it } from "@effect/vitest"
import { Effect, Fiber } from "effect"
import { TestClock } from "effect/testing"
import { expect } from "vitest"

import { parseMoveIssueParams } from "../../../src/domain/schemas/issue-movement.js"
import { moveIssue } from "../../../src/huly/operations/issues-move.js"
import { movementFixture, movementProject, threeLevelMovementFixture } from "../../helpers/movement.js"

const call = (fixture: ReturnType<typeof movementFixture>) =>
  parseMoveIssueParams({ issue: "root", destination: { parent: "destination" } }).pipe(
    Effect.flatMap(moveIssue),
    Effect.provide(fixture.layer)
  )

const refused = (result: Effect.Success<ReturnType<typeof moveIssue>>, fixture: ReturnType<typeof movementFixture>) => {
  expect(result).toMatchObject({ outcome: "blocked", changed: false })
  expect(fixture.writes).toEqual([])
  expect(result).toHaveProperty("inspection", expect.any(String))
}

describe("movement safety under changing reads", () => {
  for (const selector of ["issue", "project"]) {
    it.effect(`refuses incomplete ${selector} selector discovery`, () =>
      Effect.gen(function* () {
        const tree = threeLevelMovementFixture()
        const fixture = movementFixture(tree.issues, {
          ...(selector === "issue" ? { selectorTotal: 100 } : { projectSelectorTotal: 100 })
        })
        refused(yield* call(fixture), fixture)
      })
    )
  }

  for (const change of ["root-missing", "parent-missing", "parent-changed", "root-ancestor-missing", "parent-cycle"]) {
    it.effect(`refuses inspection after ${change}`, () =>
      Effect.gen(function* () {
        const tree = threeLevelMovementFixture()
        const fixture = movementFixture(tree.issues, {
          onRead: (query, issues) => {
            if (query.space === undefined) return
            if (change === "root-missing") issues.splice(issues.indexOf(tree.root), 1)
            if (change === "parent-missing") issues.splice(issues.indexOf(tree.destination), 1)
            if (change === "parent-changed") tree.destination.modifiedOn++
            if (change === "root-ancestor-missing") issues.splice(issues.indexOf(tree.old), 1)
            if (change === "parent-cycle") tree.destinationAncestor.attachedTo = tree.destination._id
          }
        })
        refused(yield* call(fixture), fixture)
      })
    )
  }

  it.effect("refuses child closure changes even when the number of children is unchanged", () =>
    Effect.gen(function* () {
      const tree = threeLevelMovementFixture()
      const fixture = movementFixture(tree.issues, {
        onRead: (query) => {
          if (query.attachedTo !== undefined) tree.child.modifiedOn++
        }
      })
      refused(yield* call(fixture), fixture)
    })
  )

  for (const change of [
    "root-missing",
    "identifier-changed",
    "project-changed",
    "closure-changed",
    "incomplete-project"
  ]) {
    it.effect(`reports incomplete verification after ${change} without resuming writes`, () =>
      Effect.gen(function* () {
        const tree = threeLevelMovementFixture()
        const fixture = movementFixture(tree.issues, {
          onRead: (query, issues, written) => {
            if (!written) return
            if (query.space !== undefined) {
              if (change === "root-missing") {
                const index = issues.indexOf(tree.root)
                if (index >= 0) issues.splice(index, 1)
              }
              if (change === "identifier-changed") tree.root.identifier = "TEST-renamed"
              if (change === "project-changed") tree.child.space = movementProject("foreign")._id
              if (change === "incomplete-project") issues.push(tree.root)
            }
            if (query.attachedTo !== undefined && change === "closure-changed") tree.child.modifiedOn++
          }
        })
        const fiber = yield* Effect.forkChild(call(fixture))
        yield* TestClock.adjust("2 seconds")
        const result = yield* Fiber.join(fiber)
        expect(result.outcome).toBe("incomplete")
        expect(result).not.toHaveProperty("changed", false)
        expect(fixture.writes).toHaveLength(5)
        expect(result).toHaveProperty("inspection", expect.stringContaining("Do not automatically repeat"))
      })
    )
  }
})
