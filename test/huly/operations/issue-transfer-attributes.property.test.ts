import { it, expect } from "vitest"
import { Effect, Schema } from "effect"
import * as fc from "fast-check"
import { propertyTestParameters } from "../../helpers/property.js"
import { transferFixture } from "../../helpers/transfer.js"
import { resolveTransferAttributes } from "../../../src/huly/operations/issue-transfer-attribute-resolution.js"
import { TransferIssueSchema } from "../../../src/domain/schemas/issue-transfer.js"
import { MovementIssueSchema } from "../../../src/domain/schemas/issue-movement-state.js"
import { parseMoveIssueParams } from "../../../src/domain/schemas/issue-movement.js"

const parseSnapshot = <A>(schema: Schema.ConstraintDecoder<A>, input: unknown): A =>
  Schema.decodeUnknownSync(schema)(input)

it("discard consent cannot authorize another task or a different current reference", async () => {
  await fc.assert(
    fc.asyncProperty(fc.uuid(), fc.uuid(), fc.boolean(), async (current, other, wrongTask) => {
      fc.pre(current !== other)
      const f = transferFixture()
      const root = parseSnapshot(MovementIssueSchema, f.root)
      const issue = parseSnapshot(TransferIssueSchema, { ...f.root, component: current, milestone: other })
      const params = await Effect.runPromise(
        parseMoveIssueParams({
          ...f.input,
          resolutions: [{ issueId: wrongTask ? "another-task" : root._id, field: "component", from: other, to: null }]
        })
      )
      const result = resolveTransferAttributes(
        root,
        issue,
        [
          { field: "component", source: [], destination: [], complete: true },
          { field: "milestone", source: [], destination: [], complete: true }
        ],
        params.resolutions
      )
      expect(result.changes).toEqual([])
      expect(
        result.conflicts.some((entry) => entry.code === (wrongTask ? "invalid-resolution" : "stale-resolution"))
      ).toBe(true)
      expect(issue.component).toBe(current)
      expect(issue.milestone).toBe(other)
    }),
    propertyTestParameters
  )
})
