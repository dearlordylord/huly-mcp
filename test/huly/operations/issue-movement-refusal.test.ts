import { it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { expect } from "vitest"
import { parseMoveIssueParams } from "../../../src/domain/schemas/issue-movement.js"
import { MoveIssueResultSchema } from "../../../src/domain/schemas/issues-results.js"
import { moveIssue } from "../../../src/huly/operations/issue-movement.js"
import { transferTreeFixture } from "../../helpers/transfer-tree.js"
import { sdkFixture } from "../../helpers/huly-sdk.js"
import { tracker } from "../../../src/huly/huly-plugins.js"

for (const target of ["root", "child", "grandchild"] as const) {
  for (const selector of ["stable-id", "identifier", "project-and-parent"] as const) {
    it.effect(`explains ${target} cycle selected by ${selector} before allocating or writing`, () =>
      Effect.gen(function* () {
        const f = transferTreeFixture()
        const parent = f[target]
        const destination = {
          parent: selector === "identifier" ? parent.identifier : parent._id,
          ...(selector === "project-and-parent" ? { project: f.source.identifier } : {})
        }
        const result = yield* parseMoveIssueParams({ issue: f.root._id, destination }).pipe(
          Effect.flatMap(moveIssue),
          Effect.provide(f.layer)
        )
        expect(Schema.decodeUnknownSync(MoveIssueResultSchema)(result)).toMatchObject({
          outcome: "blocked",
          changed: false,
          destinationParentId: parent._id,
          issueIds: [f.root._id, f.child._id, f.grandchild._id]
        })
        expect(result).toHaveProperty("reason", expect.stringContaining("inside the moved tree"))
        expect(result).toHaveProperty("reason", expect.stringContaining(parent.identifier))
        expect(result).toHaveProperty(
          "reason",
          expect.stringContaining('Choose a parent outside that tree, or {"parent": null}')
        )
        expect(result).not.toHaveProperty("nextCall")
        expect(JSON.stringify(result).toLowerCase()).not.toContain("gaps")
        expect(f.state.allocated).toBe(0)
        expect(f.state.sent).toBe(0)
        expect(f.writes).toEqual([])
      })
    )
  }
}

it.effect("blocked cross-project attribute conflicts inspect the source without claiming reservations", () =>
  Effect.gen(function* () {
    const f = transferTreeFixture()
    f.root.component = sdkFixture("source-component")
    f.attributeRows.push(
      sdkFixture({
        _id: "source-component",
        _class: tracker.class.Component,
        space: f.source._id,
        label: "Source only",
        lead: null
      })
    )
    const result = yield* parseMoveIssueParams(f.input).pipe(Effect.flatMap(moveIssue), Effect.provide(f.layer))
    expect(result.outcome).toBe("blocked")
    if (result.outcome !== "blocked") return
    expect(result.inspection).toContain(`"project":"${f.source.identifier}"`)
    expect(result.inspection).toContain(`CLI huly issues get ${f.source.identifier}`)
    expect(result.inspection.toLowerCase()).not.toContain("gaps")
    expect(result.inspection).not.toContain(`"project":"${f.destination.identifier}"`)
    expect(f.state.allocated).toBe(0)
    expect(f.state.sent).toBe(0)
  })
)

it.effect("a descendant already in the destination project still refuses cyclic parenting before allocation", () =>
  Effect.gen(function* () {
    const f = transferTreeFixture()
    f.grandchild.space = f.parent.space
    const result = yield* parseMoveIssueParams({
      issue: f.root._id,
      destination: { project: f.destination.identifier, parent: f.grandchild._id }
    }).pipe(Effect.flatMap(moveIssue), Effect.provide(f.layer))
    expect(result).toMatchObject({ outcome: "blocked", changed: false, destinationParentId: f.grandchild._id })
    expect(result).toHaveProperty("reason", expect.stringContaining("inside the moved tree"))
    expect(f.state.allocated).toBe(0)
    expect(f.state.sent).toBe(0)
    expect(f.writes).toEqual([])
  })
)
