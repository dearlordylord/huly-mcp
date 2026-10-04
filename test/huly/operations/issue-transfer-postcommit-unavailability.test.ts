import { it } from "@effect/vitest"
import { Effect, Fiber, Schema } from "effect"
import { TestClock } from "effect/testing"
import { expect } from "vitest"
import { parseMoveIssueParams } from "../../../src/domain/schemas/issue-movement.js"
import { TransferInspectionSchema } from "../../../src/domain/schemas/issue-transfer.js"
import { UNKNOWN_TOTAL } from "../../../src/domain/schemas/shared.js"
import { HulyClient } from "../../../src/huly/client.js"
import { moveIssue } from "../../../src/huly/operations/issue-movement.js"
import { assertExists } from "../../../src/utils/assertions.js"
import { sdkFixture } from "../../helpers/huly-sdk.js"
import { transferFixture } from "../../helpers/transfer.js"

for (const mode of [
  "unknownSource",
  "truncatedSource",
  "unknownDestination",
  "truncatedDestination",
  "unknownClosure",
  "truncatedClosure",
  "incompleteRecords",
  "malformedIdentity"
]) {
  it.effect(`post-commit ${mode} is indeterminate and never retries writes`, () =>
    Effect.gen(function* () {
      const f = transferFixture()
      const originalFindAll = assertExists(f.operations.findAll)
      const originalInspect = assertExists(f.operations.inspectTransferRecords)
      const layer = HulyClient.testLayer({
        ...f.operations,
        findAll: (cls, query, options) =>
          originalFindAll(cls, query, options).pipe(
            Effect.map((rows) => {
              if (f.state.sent > 0 && mode === "malformedIdentity") f.root.rank = sdkFixture(null)
              if (
                f.state.sent > 0 &&
                ((mode.endsWith("Source") && Reflect.get(query, "space") === f.source._id) ||
                  (mode.endsWith("Destination") && Reflect.get(query, "space") === f.destination._id) ||
                  (mode.endsWith("Closure") && Reflect.get(query, "attachedTo") !== undefined))
              )
                rows.total = mode.startsWith("unknown") ? UNKNOWN_TOTAL : rows.length + 1
              return rows
            })
          ),
        inspectTransferRecords: (issueId) =>
          f.state.sent > 0 && mode === "incompleteRecords"
            ? Effect.succeed(
                Schema.decodeUnknownSync(TransferInspectionSchema)({
                  discovery: "incomplete",
                  records: [],
                  classes: [...new Set(f.records.map((record) => record._class))],
                  blockers: [],
                  limitation: "Post-commit inventory unavailable"
                })
              )
            : originalInspect(issueId)
      })
      const params = yield* parseMoveIssueParams(f.input)
      const fiber = yield* moveIssue(params).pipe(Effect.provide(layer), Effect.forkChild)
      yield* TestClock.adjust("2 seconds")
      const result = yield* Fiber.join(fiber)
      expect(result).toMatchObject({ outcome: "indeterminate" })
      expect(result).not.toHaveProperty("changed")
      expect(JSON.stringify(result)).toContain("Post-send state unavailable")
      expect(f.state.allocated).toBe(1)
      expect(f.state.sent).toBe(1)
      expect(f.root.space).toBe(f.destination._id)
    })
  )
}
