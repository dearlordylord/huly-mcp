import { it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { expect } from "vitest"
import { parseMoveIssueParams } from "../../../src/domain/schemas/issue-movement.js"
import { MoveIssueResultSchema } from "../../../src/domain/schemas/issues-results.js"
import { moveIssue } from "../../../src/huly/operations/issue-movement.js"
import { transferTreeFixture } from "../../helpers/transfer-tree.js"
import { sdkFixture } from "../../helpers/huly-sdk.js"

const call = (f: ReturnType<typeof transferTreeFixture>, input: unknown = f.input) =>
  parseMoveIssueParams(input).pipe(Effect.flatMap(moveIssue), Effect.provide(f.layer))
const parseResult = (input: unknown) => Schema.decodeUnknownSync(MoveIssueResultSchema)(input)

it.effect("moves a three-level tree in one call, retaining identity, edges, payload and both ancestor chains", () =>
  Effect.gen(function* () {
    const f = transferTreeFixture()
    const before = [f.root, f.child, f.grandchild].map((issue) => ({
      id: issue._id,
      identifier: issue.identifier,
      description: issue.description,
      relations: issue.relations
    }))
    const result = parseResult(yield* call(f))
    expect(result.outcome).toBe("completed")
    if (result.outcome !== "completed") return
    expect(result.tasks.map((task) => task.issueId)).toEqual(before.map((issue) => issue.id))
    expect(new Set(result.tasks.map((task) => task.identifier)).size).toBe(3)
    expect(result.tasks.map((task) => task.previousIdentifier)).toEqual(before.map((issue) => issue.identifier))
    expect(f.root.attachedTo).toBe(f.parent._id)
    expect(f.child.attachedTo).toBe(f.root._id)
    expect(f.grandchild.attachedTo).toBe(f.child._id)
    expect(f.grandchild.parents.map((parent) => parent.parentId)).toEqual([f.child._id, f.root._id, f.parent._id])
    expect(f.old.subIssues).toBe(0)
    expect(f.old.childInfo).toEqual([])
    expect(f.parent.subIssues).toBe(2)
    expect(f.parent.childInfo.map((child) => child.childId)).toContain(f.grandchild._id)
    expect(f.state.allocated).toBe(3)
    expect(f.state.sent).toBe(1)
    for (const [index, issue] of [f.root, f.child, f.grandchild].entries()) {
      expect(issue.description).toEqual(before[index]?.description)
      expect(issue.relations).toEqual(before[index]?.relations)
      expect(issue.space).toBe(f.destination._id)
    }
    expect(yield* call(f)).toMatchObject({ outcome: "no-op", changed: false })
    expect(f.state.allocated).toBe(3)
  })
)

it.effect(
  "same source attribute requires independent consent for each descendant and a returned retry preserves valid decisions",
  () =>
    Effect.gen(function* () {
      const f = transferTreeFixture()
      for (const issue of [f.root, f.child, f.grandchild]) issue.component = sdkFixture("missing-component")
      const input = {
        ...f.input,
        resolutions: [{ issueId: f.child._id, field: "component", from: "missing-component", to: null }]
      }
      const blocked = parseResult(yield* call(f, input))
      expect(blocked.outcome).toBe("blocked")
      if (blocked.outcome !== "blocked") return
      expect(blocked.conflicts?.filter((conflict) => "field" in conflict).map((conflict) => conflict.issueId)).toEqual([
        f.root._id,
        f.grandchild._id
      ])
      expect(blocked.nextCall?.resolutions).toEqual(input.resolutions)
      expect(f.state.allocated).toBe(0)
      const retry = {
        ...blocked.nextCall,
        resolutions: [f.root, f.child, f.grandchild].map((issue) => ({
          issueId: issue._id,
          field: "component",
          from: "missing-component",
          to: null
        }))
      }
      expect(yield* call(f, retry)).toMatchObject({
        outcome: "completed",
        attributeChanges: [{ issueId: f.root._id }, { issueId: f.child._id }, { issueId: f.grandchild._id }]
      })
    })
)

it.effect("uncertain allocation or commit reports every inspected task without fabricated mappings", () =>
  Effect.gen(function* () {
    for (const failure of ["failAllocation", "failCommit", "refuseCommit"] satisfies Array<
      "failAllocation" | "failCommit" | "refuseCommit"
    >) {
      const f = transferTreeFixture()
      f.state[failure] = true
      const result = yield* call(f)
      expect(result).toMatchObject({
        outcome: failure === "refuseCommit" ? "incomplete" : "indeterminate",
        issueIds: [f.root._id, f.child._id, f.grandchild._id]
      })
      expect(result).not.toHaveProperty("tasks")
    }
  })
)
