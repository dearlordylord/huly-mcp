import { it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { expect } from "vitest"
import { parseMoveIssueParams } from "../../../src/domain/schemas/issue-movement.js"
import { parseGetIssueParams } from "../../../src/domain/schemas/issues.js"
import { TransferInspectionSchema } from "../../../src/domain/schemas/issue-transfer.js"
import { HulyClient } from "../../../src/huly/client.js"
import { moveIssue } from "../../../src/huly/operations/issue-movement.js"
import { getIssue } from "../../../src/huly/operations/issues-read.js"
import { withDiagnostics } from "../../helpers/diagnostics.js"
import { transferFixture } from "../../helpers/transfer.js"
import { assertExists } from "../../../src/utils/assertions.js"
import { sdkFixture } from "../../helpers/huly-sdk.js"

for (const mode of ["unavailableInspection", "invalidIdentity", "incompleteInventory"]) {
  it.effect(`no-op inspection handles ${mode} without a second write`, () =>
    Effect.gen(function* () {
      const f = transferFixture()
      const params = yield* parseMoveIssueParams(f.input)
      expect((yield* moveIssue(params).pipe(Effect.provide(f.layer))).outcome).toBe("completed")
      if (mode === "invalidIdentity") f.root.number = Number.NaN
      const { inspectTransferRecords: _inspect, ...withoutInspector } = f.operations
      const inspect = assertExists(_inspect)
      const layer = HulyClient.testLayer({
        ...withoutInspector,
        ...(mode === "unavailableInspection"
          ? {}
          : mode === "invalidIdentity"
            ? { inspectTransferRecords: inspect }
            : {
                inspectTransferRecords: () =>
                  Effect.succeed(
                    Schema.decodeUnknownSync(TransferInspectionSchema)({
                      discovery: "incomplete",
                      records: [],
                      classes: [...new Set(f.records.map((record) => record._class))],
                      blockers: [],
                      limitation: "Missing closure inventory"
                    })
                  )
              })
      })
      const observed = yield* Effect.result(moveIssue(params).pipe(Effect.provide(layer)))
      expect(observed).toMatchObject({ _tag: "Success", success: { outcome: "blocked", changed: false } })
      if (observed._tag === "Success" && observed.success.outcome === "blocked") {
        expect(observed.success.discovery).toBe("incomplete")
        expect(observed.success.issueIds).toContain(f.input.issue)
        expect(observed.success.inspection).toContain(f.root._id)
      }

      expect(f.state.allocated).toBe(1)
      expect(f.state.sent).toBe(1)
    })
  )
}

it.effect("malformed transfer identity is a pre-write refusal with no sequence gap", () =>
  Effect.gen(function* () {
    const f = transferFixture()
    f.root.rank = sdkFixture(null)
    const result = yield* parseMoveIssueParams(f.input).pipe(Effect.flatMap(moveIssue), Effect.provide(f.layer))
    expect(result).toMatchObject({ outcome: "blocked", changed: false })
    if (result.outcome === "blocked") {
      expect(result.discovery).toBe("incomplete")
      expect(result.conflicts).toEqual(expect.arrayContaining([expect.objectContaining({ code: "discovery" })]))
    }
    expect(f.state.allocated).toBe(0)
    expect(f.state.sent).toBe(0)
  })
)

it.effect("stable-ID recovery reports a missing actual project rather than the stale requested project", () =>
  Effect.gen(function* () {
    const f = transferFixture()
    f.root.space = sdkFixture("vanished-project")
    const params = yield* parseGetIssueParams({ project: "TEST", identifier: f.root._id })
    const result = yield* Effect.result(getIssue(params).pipe(Effect.provide(f.layer), withDiagnostics))
    expect(result).toMatchObject({ _tag: "Failure", failure: { _tag: "IssueNotFoundError" } })
    expect(f.state.allocated).toBe(0)
    expect(f.state.sent).toBe(0)
  })
)
