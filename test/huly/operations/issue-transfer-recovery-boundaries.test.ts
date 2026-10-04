import { it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { expect } from "vitest"
import { MovementIssueSchema, MovementProjectSchema } from "../../../src/domain/schemas/issue-movement-state.js"
import { parseMoveIssueParams } from "../../../src/domain/schemas/issue-movement.js"
import { parseGetIssueParams } from "../../../src/domain/schemas/issues.js"
import { TransferInspectionSchema } from "../../../src/domain/schemas/issue-transfer.js"
import { HulyClient } from "../../../src/huly/client.js"
import { moveIssue } from "../../../src/huly/operations/issue-movement.js"
import { getIssue } from "../../../src/huly/operations/issues-read.js"
import { movementNoopProblem } from "../../../src/huly/operations/issue-transfer-verification.js"
import { withDiagnostics } from "../../helpers/diagnostics.js"
import { transferFixture } from "../../helpers/transfer.js"
import { sdkFixture } from "../../helpers/huly-sdk.js"

const issueSnapshot = (input: unknown) => Schema.decodeUnknownSync(MovementIssueSchema)(input)
const projectSnapshot = (input: unknown) => Schema.decodeUnknownSync(MovementProjectSchema)(input)

for (const mode of ["unavailableInspection", "invalidIdentity", "incompleteInventory"]) {
  it.effect(`no-op inspection handles ${mode} without a second write`, () =>
    Effect.gen(function* () {
      const f = transferFixture()
      const params = yield* parseMoveIssueParams(f.input)
      expect((yield* moveIssue(params).pipe(Effect.provide(f.layer))).outcome).toBe("completed")
      const root = issueSnapshot(f.root)
      const parent = issueSnapshot(f.parent)
      if (mode === "invalidIdentity") f.root.number = Number.NaN
      const { inspectTransferRecords: _inspect, ...withoutInspector } = f.operations
      const layer = HulyClient.testLayer({
        ...withoutInspector,
        ...(mode === "unavailableInspection"
          ? {}
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
      const client = yield* HulyClient.pipe(Effect.provide(layer))
      const problem = yield* movementNoopProblem(client, {
        root,
        parent,
        source: projectSnapshot(f.destination),
        tree: [root],
        relevant: [root, parent]
      })
      if (mode === "unavailableInspection") expect(problem).toContain("No-op ownership inspection unavailable")
      if (mode === "invalidIdentity") expect(problem).toBe("No-op identity inspection failed.")
      if (mode === "incompleteInventory") expect(problem).toContain("Incomplete owned-record discovery")
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
