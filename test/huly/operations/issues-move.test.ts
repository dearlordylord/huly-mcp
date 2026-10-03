import { describe, it } from "@effect/vitest"
import { Effect, Fiber, Schema } from "effect"
import { TestClock } from "effect/testing"
import { expect } from "vitest"

import { parseMoveIssueParams } from "../../../src/domain/schemas/issue-movement.js"
import { MoveIssueResultSchema } from "../../../src/domain/schemas/issues-results.js"
import { tracker } from "../../../src/huly/huly-plugins.js"
import { moveIssue } from "../../../src/huly/operations/issues-move.js"
import { issueIdentifier } from "../../helpers/brands.js"
import {
  initializeHierarchy,
  movementFixture,
  movementIssue,
  movementProject,
  threeLevelMovementFixture
} from "../../helpers/movement.js"

const call = (input: unknown, fixture: ReturnType<typeof movementFixture>) =>
  parseMoveIssueParams(input).pipe(Effect.flatMap(moveIssue), Effect.provide(fixture.layer))

const expectBlocked = (
  result: Effect.Success<ReturnType<typeof moveIssue>>,
  fixture: ReturnType<typeof movementFixture>
) => {
  expect(result).toMatchObject({ outcome: "blocked", changed: false })
  expect(fixture.writes).toEqual([])
  expect(Schema.decodeUnknownSync(MoveIssueResultSchema)(result)).toEqual(result)
}

describe("destination movement", () => {
  it.effect("moves a three-level tree, preserves data and lets triggers maintain ancestry and aggregates", () =>
    Effect.gen(function* () {
      const tree = threeLevelMovementFixture()
      const fixture = movementFixture(tree.issues)
      const before = tree.issues.map((issue) => ({ ...issue }))
      const result = yield* call(
        { issue: tree.root.identifier, destination: { parent: tree.destination.identifier } },
        fixture
      )
      expect(result).toMatchObject({
        outcome: "completed",
        changed: true,
        issueId: tree.root._id,
        parentId: tree.destination._id
      })
      expect(tree.root.parents.map((info) => info.parentId)).toEqual([
        tree.destination._id,
        tree.destinationAncestor._id
      ])
      expect(tree.leaf.parents.map((info) => info.parentId)).toEqual([
        tree.child._id,
        tree.root._id,
        tree.destination._id,
        tree.destinationAncestor._id
      ])
      expect(tree.old.subIssues).toBe(0)
      expect(tree.old.childInfo).toEqual([])
      expect(tree.destination.subIssues).toBe(1)
      expect(tree.destination.childInfo.map((info) => info.childId)).toEqual([
        tree.root._id,
        tree.child._id,
        tree.leaf._id
      ])
      for (const previous of before) {
        const current = fixture.issues.find((issue) => issue._id === previous._id)
        expect(current).toMatchObject({
          identifier: previous.identifier,
          kind: previous.kind,
          status: previous.status,
          description: previous.description,
          component: previous.component,
          milestone: previous.milestone,
          space: previous.space
        })
      }
      expect(Schema.decodeUnknownSync(MoveIssueResultSchema)(result)).toEqual(result)
    })
  )

  for (const destination of [{ parent: null }, { project: "TEST" }, { project: "project-1", parent: null }]) {
    it.effect(`detaches with ${JSON.stringify(destination)} and verifies repeat no-op`, () =>
      Effect.gen(function* () {
        const tree = threeLevelMovementFixture()
        const fixture = movementFixture(tree.issues)
        const result = yield* call({ issue: tree.root._id, destination }, fixture)
        expect(result.outcome).toBe("completed")
        expect(tree.root.attachedTo).toBe(tracker.ids.NoParent)
        expect(tree.leaf.parents.map((info) => info.parentId)).toEqual([tree.child._id, tree.root._id])
        const written = fixture.writes.length
        const repeat = yield* call({ issue: tree.root._id, destination }, fixture)
        expect(repeat).toMatchObject({ outcome: "no-op", changed: false })
        expect(fixture.writes).toHaveLength(written)
      })
    )
  }

  it.effect("accepts explicit agreeing stable project and parent IDs", () =>
    Effect.gen(function* () {
      const tree = threeLevelMovementFixture()
      const result = yield* call(
        { issue: tree.root._id, destination: { project: "project-1", parent: tree.destination._id } },
        movementFixture(tree.issues)
      )
      expect(result.outcome).toBe("completed")
    })
  )

  for (const target of ["root", "child", "leaf"]) {
    it.effect(`refuses ${target} parenting before writes`, () =>
      Effect.gen(function* () {
        const tree = threeLevelMovementFixture()
        const fixture = movementFixture(tree.issues)
        expectBlocked(yield* call({ issue: tree.root._id, destination: { parent: target } }, fixture), fixture)
      })
    )
  }

  for (const destination of [
    { project: "OTHER" },
    { parent: "OTHER-foreign" },
    { project: "TEST", parent: "OTHER-foreign" }
  ]) {
    it.effect(`refuses cross-project/disagreeing destination ${JSON.stringify(destination)}`, () =>
      Effect.gen(function* () {
        const foreignProject = movementProject("project-2", "OTHER")
        const foreign = movementIssue("foreign", { space: foreignProject._id, identifier: "OTHER-foreign" })
        const root = movementIssue("root")
        const fixture = movementFixture([root, foreign], { projects: [movementProject(), foreignProject] })
        expectBlocked(yield* call({ issue: root._id, destination }, fixture), fixture)
      })
    )
  }

  for (const input of [
    { issue: "missing", destination: { parent: null } },
    { issue: "root", destination: { parent: "missing" } },
    { issue: "root", destination: { project: "missing" } }
  ]) {
    it.effect(`refuses invalid selector ${JSON.stringify(input)}`, () =>
      Effect.gen(function* () {
        const fixture = movementFixture([movementIssue("root")])
        expectBlocked(yield* call(input, fixture), fixture)
      })
    )
  }

  it.effect("refuses missing source project", () =>
    Effect.gen(function* () {
      const fixture = movementFixture([movementIssue("root")], { projects: [] })
      expectBlocked(yield* call({ issue: "root", destination: { parent: null } }, fixture), fixture)
    })
  )

  it.effect("refuses ambiguous issue and project identifiers", () =>
    Effect.gen(function* () {
      const fixture = movementFixture([movementIssue("root"), movementIssue("other", { identifier: "TEST-root" })])
      expectBlocked(yield* call({ issue: "TEST-root", destination: { parent: null } }, fixture), fixture)
      const ambiguous = movementFixture([movementIssue("root")], {
        projects: [movementProject(), movementProject("other")]
      })
      expectBlocked(yield* call({ issue: "root", destination: { project: "TEST" } }, ambiguous), ambiguous)
    })
  )

  for (const input of [
    { issue: "root", destination: {} },
    { issue: "root", destination: { parent: 42 } },
    { issue: "root", destination: { project: null } },
    { issue: "root", destination: { parent: null, project: 42 } }
  ]) {
    it.effect(`rejects malformed input ${JSON.stringify(input)}`, () =>
      Effect.gen(function* () {
        const result = yield* Effect.result(parseMoveIssueParams(input))
        expect(result._tag).toBe("Failure")
      })
    )
  }

  for (const resolutions of [[], [{ issueId: "root", field: "component", from: "component-1", to: null }]]) {
    it.effect("refuses supplied same-project resolutions before no-op", () =>
      Effect.gen(function* () {
        const fixture = movementFixture([movementIssue("root")])
        const result = yield* call({ issue: "root", destination: { parent: null }, resolutions }, fixture)
        expectBlocked(result, fixture)
        expect(result).toHaveProperty("reason", expect.stringContaining("Omit resolutions"))
      })
    )
  }

  it.effect("reports failure during writes without claiming unchanged state", () =>
    Effect.gen(function* () {
      const tree = threeLevelMovementFixture()
      const fixture = movementFixture(tree.issues, { failWriteAt: 2 })
      const result = yield* call({ issue: "root", destination: { parent: "destination" } }, fixture)
      expect(result).toMatchObject({ outcome: "indeterminate", issueIds: ["root", "child", "leaf"] })
      expect(result).not.toHaveProperty("changed", false)
      expect(result).toHaveProperty("inspection", expect.stringContaining('"project":"TEST"'))
    })
  )

  it.effect("reports verification outage after writes", () =>
    Effect.gen(function* () {
      const fixture = movementFixture([movementIssue("root"), movementIssue("destination")], { failVerification: true })
      const result = yield* call({ issue: "root", destination: { parent: "destination" } }, fixture)
      expect(result.outcome).toBe("indeterminate")
      expect(result).not.toHaveProperty("changed", false)
    })
  )

  it.effect("reports observed incomplete execution rather than success", () =>
    Effect.gen(function* () {
      const fixture = movementFixture([movementIssue("root"), movementIssue("destination")], { ignoreWrites: true })
      const fiber = yield* Effect.forkChild(call({ issue: "root", destination: { parent: "destination" } }, fixture))
      yield* TestClock.adjust("2 seconds")
      const result = yield* Fiber.join(fiber)
      expect(result.outcome).toBe("incomplete")
    })
  )

  it.effect("continues to export moveIssue through the existing operation module", () =>
    Effect.gen(function* () {
      const fixture = movementFixture([movementIssue("root")])
      const result = yield* moveIssue({ issue: issueIdentifier("root"), destination: { parent: null } }).pipe(
        Effect.provide(fixture.layer)
      )
      expect(result.outcome).toBe("no-op")
    })
  )
})

for (const options of [
  { discoveryTotal: 100 },
  { closureTotal: 100 },
  { changeRootDuringRead: true },
  { invalidSelectorResult: true }
]) {
  it.effect(`refuses incomplete/changed/invalid discovery ${JSON.stringify(options)}`, () =>
    Effect.gen(function* () {
      const fixture = movementFixture([movementIssue("root")], options)
      expectBlocked(
        yield* call(
          { issue: options.invalidSelectorResult ? "missing" : "root", destination: { parent: null } },
          fixture
        ),
        fixture
      )
    })
  )
}

for (const corruption of [
  "ancestry",
  "count",
  "aggregate",
  "collection",
  "missing-parent",
  "cycle",
  "duplicate",
  "foreign-child"
]) {
  it.effect(`refuses inconsistent hierarchy ${corruption} including no-ops`, () =>
    Effect.gen(function* () {
      const tree = threeLevelMovementFixture()
      if (corruption === "ancestry") tree.leaf.parents = []
      if (corruption === "count") tree.root.subIssues = 0
      if (corruption === "aggregate") tree.old.childInfo = []
      if (corruption === "collection") tree.root.collection = "issues"
      if (corruption === "missing-parent") tree.issues.splice(tree.issues.indexOf(tree.old), 1)
      if (corruption === "cycle") tree.old.attachedTo = tree.leaf._id
      if (corruption === "duplicate") tree.issues.push(tree.root)
      if (corruption === "foreign-child")
        tree.issues.push(
          movementIssue("foreign", { space: movementProject("project-2")._id, attachedTo: tree.root._id })
        )
      const fixture = movementFixture(tree.issues)
      expectBlocked(yield* call({ issue: "root", destination: { parent: "old" } }, fixture), fixture)
    })
  )
}

for (const change of ["detach-descendant", "add-child"]) {
  it.effect(`does not complete an observed concurrently changed tree: ${change}`, () =>
    Effect.gen(function* () {
      const tree = threeLevelMovementFixture()
      const fixture = movementFixture(tree.issues, {
        onWrite: (issues) => {
          if (fixture.writes.length !== 5) return
          if (change === "detach-descendant") tree.leaf.attachedTo = tree.destination._id
          else issues.push(movementIssue("concurrent", { attachedTo: tree.root._id }))
          initializeHierarchy(issues)
        }
      })
      const fiber = yield* Effect.forkChild(call({ issue: "root", destination: { parent: "destination" } }, fixture))
      yield* TestClock.adjust("2 seconds")
      const result = yield* Fiber.join(fiber)
      expect(result.outcome).toBe("incomplete")
      expect(result).not.toHaveProperty("changed", false)
      expect(fixture.writes).toHaveLength(5)
    })
  )
}
