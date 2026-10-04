import { it } from "vitest"
import { expect } from "vitest"
import { Effect } from "effect"
import * as fc from "fast-check"
import { parseMoveIssueParams } from "../../../src/domain/schemas/issue-movement.js"
import { moveIssue } from "../../../src/huly/operations/issue-movement.js"
import { transferFixture, appendTransferChild } from "../../helpers/transfer.js"
import { movementIssue } from "../../helpers/movement.js"
import { sdkFixture } from "../../helpers/huly-sdk.js"
import { propertyTestParameters } from "../../helpers/property.js"

it("preserves stable identity and independent references, adds one destination edge and never reallocates on a consistent repeat", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({ min: 3, max: 10_000 }),
      fc.integer({ min: 0, max: 12 }),
      fc.boolean(),
      async (sequence, siblingCount, topLevel) => {
        const f = transferFixture()
        f.state.sequence = sequence
        for (const index of Array.from({ length: siblingCount }, (_, index) => index))
          appendTransferChild(
            f,
            movementIssue(`sibling-${index}`, {
              space: f.parent.space,
              attachedTo: f.parent._id,
              identifier: `OTHER-${index + 20}`
            })
          )
        const stableId = f.root._id
        const sourceParent = f.root.attachedTo
        const relations = f.root.relations
        const description = f.root.description
        const input = { issue: stableId, destination: topLevel ? { project: "OTHER" } : { parent: f.parent._id } }
        const call = parseMoveIssueParams(input).pipe(Effect.flatMap(moveIssue), Effect.provide(f.layer))
        const result = await Effect.runPromise(call)
        expect(result.outcome).toBe("completed")
        expect(f.root._id).toBe(stableId)
        expect(f.root.identifier).toBe(`OTHER-${sequence + 1}`)
        expect(f.root.description).toBe(description)
        expect(f.root.relations).toEqual(relations)
        expect(f.root.attachedTo).not.toBe(sourceParent)
        expect(f.parent.subIssues).toBe(1 + siblingCount + (topLevel ? 0 : 1))
        expect((await Effect.runPromise(call)).outcome).toBe("no-op")
        expect(f.state.allocated).toBe(1)
        expect(f.state.sent).toBe(1)
      }
    ),
    propertyTestParameters
  )
})

it("any populated component or milestone refuses without writes, while null and unset are eligible", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.constantFrom("component", "milestone"),
      fc.string({ minLength: 1 }).filter((id) => id.trim().length > 0),
      async (field, id) => {
        const f = transferFixture()
        f.root[field] = sdkFixture(id)
        const result = await Effect.runPromise(
          parseMoveIssueParams(f.input).pipe(Effect.flatMap(moveIssue), Effect.provide(f.layer))
        )
        expect(result).toMatchObject({ outcome: "blocked", changed: false })
        expect(f.root.space).toBe(f.source._id)
        expect(f.state.allocated).toBe(0)
        expect(f.state.sent).toBe(0)
      }
    ),
    propertyTestParameters
  )
})
