import { it } from "@effect/vitest"
import { Effect, Schema, Fiber } from "effect"
import { TestClock } from "effect/testing"
import { assertExists } from "../../../src/utils/assertions.js"
import { expect } from "vitest"
import { parseMoveIssueParams } from "../../../src/domain/schemas/issue-movement.js"
import { MoveIssueResultSchema } from "../../../src/domain/schemas/issues-results.js"
import { getIssue } from "../../../src/huly/operations/issues-read.js"
import { withDiagnostics } from "../../helpers/diagnostics.js"
import { SocialIdentityId } from "../../../src/domain/schemas/person-administration.js"
import {
  DocId,
  ProjectIdentifier,
  IssueIdentifier,
  ObjectClassName,
  Timestamp
} from "../../../src/domain/schemas/shared.js"
import { moveIssue } from "../../../src/huly/operations/issue-movement.js"
import { findIssueInProject } from "../../../src/huly/operations/issues-shared.js"
import { HulyClient } from "../../../src/huly/client.js"
import { transferFixture, appendTransferChild } from "../../helpers/transfer.js"
import { movementIssue } from "../../helpers/movement.js"
import { sdkFixture } from "../../helpers/huly-sdk.js"

const call = (fixture: ReturnType<typeof transferFixture>, input: unknown = fixture.input) =>
  parseMoveIssueParams(input).pipe(Effect.flatMap(moveIssue), Effect.provide(fixture.layer))

it.effect(
  "moves compatible ordinary leaf, history and both ancestor aggregates, preserving references and stable ID; public recovery and repeat work",
  () =>
    Effect.gen(function* () {
      const f = transferFixture()
      const previous = f.root.identifier
      const relations = f.root.relations
      const result = yield* call(f)
      expect(result).toMatchObject({
        outcome: "completed",
        changed: true,
        issueId: f.root._id,
        projectId: f.destination._id,
        parentId: f.parent._id,
        tasks: [{ previousIdentifier: previous, identifier: "OTHER-4", issueId: f.root._id }]
      })
      expect(Schema.decodeUnknownSync(MoveIssueResultSchema)(result)).toEqual(result)
      expect(f.root.relations).toEqual(relations)
      expect(f.records[0]?.space).toBe(f.destination._id)
      expect(f.old.subIssues).toBe(0)
      expect(f.parent.subIssues).toBe(2)
      const client = yield* HulyClient.pipe(Effect.provide(f.layer))
      expect((yield* findIssueInProject(client, sdkFixture(f.destination), f.root._id))._id).toBe(f.root._id)
      expect(yield* call(f)).toMatchObject({ outcome: "no-op", changed: false })
      expect(f.state.allocated).toBe(1)
    })
)

it.effect("top-level destination works without a parent", () =>
  Effect.gen(function* () {
    const f = transferFixture()
    expect(yield* call(f, { issue: f.root._id, destination: { project: "OTHER" } })).toMatchObject({
      outcome: "completed",
      parentId: null
    })
  })
)

it.effect("aggregates discoverable blockers before allocation; unsupported inventory is explicitly limited", () =>
  Effect.gen(function* () {
    const f = transferFixture()
    f.root.component = sdkFixture("component")
    f.root.milestone = sdkFixture("milestone")
    f.destination.type = "other-type"
    f.workflow._id = "other-type"
    f.destination.private = true
    f.kind.statuses = []
    f.workflow.tasks = []
    f.state.recordsBlockers = sdkFixture(["Unsupported owned comment"])
    appendTransferChild(
      f,
      movementIssue("child", { attachedTo: f.root._id, number: 3, rank: f.root.rank, component: null, milestone: null })
    )
    const result = yield* call(f, { ...f.input, resolutions: [] })
    expect(result).toMatchObject({ outcome: "blocked", changed: false, discovery: "incomplete" })
    for (const text of ["component", "milestone", "membership", "Kind", "Status", "comment", "equal project types"])
      expect(JSON.stringify(result)).toContain(text)
    expect(f.state.allocated).toBe(0)
    expect(f.state.sent).toBe(0)
  })
)

for (const mode of [
  "failAllocation",
  "invalidAllocation",
  "refuseCommit",
  "failCommit",
  "failPostRead",
  "failOrdering"
] as const) {
  it.effect(`truthfully classifies ${mode} without blind retry`, () =>
    Effect.gen(function* () {
      const f = transferFixture()
      f.state[mode] = true
      const result = yield* call(f)
      expect(result.outcome).toBe(
        mode === "failOrdering" ? "blocked" : mode === "refuseCommit" ? "incomplete" : "indeterminate"
      )
      expect("changed" in result).toBe(mode === "failOrdering")
      expect(result).toHaveProperty("inspection")
      expect(f.state.allocated).toBe(mode === "failOrdering" ? 0 : 1)
      expect(f.state.sent).toBeLessThanOrEqual(1)
    })
  )
}

for (const mode of [
  "ignoreCommit",
  "corruptHistory",
  "corruptHistoryPayload",
  "corruptHistoryAuthor",
  "corruptHistoryTime",
  "corruptNumber",
  "corruptContent"
] as const) {
  it.effect(`bounded verification refuses completed on ${mode}`, () =>
    Effect.gen(function* () {
      const f = transferFixture()
      f.state[mode] = true
      const fiber = yield* call(f).pipe(Effect.forkChild)
      yield* TestClock.adjust("2 seconds")
      const result = yield* Fiber.join(fiber)
      expect(result).toMatchObject({ outcome: "incomplete" })
    })
  )
}

it.effect(
  "published get_issue stable-ID input recovers actual project and direct parent through old project context",
  () =>
    Effect.gen(function* () {
      const f = transferFixture()
      yield* call(f)
      const recovered = yield* getIssue({
        project: ProjectIdentifier.make("TEST"),
        identifier: IssueIdentifier.make(f.root._id)
      }).pipe(Effect.provide(f.layer), withDiagnostics)
      expect(recovered).toMatchObject({
        issueId: f.root._id,
        identifier: "OTHER-4",
        project: "OTHER",
        parentIssue: f.parent.identifier
      })
    })
)

it.effect("inconsistent moved records and identifier cannot be successful no-ops", () =>
  Effect.gen(function* () {
    const f = transferFixture()
    yield* call(f)
    assertExists(f.records[0]).space = DocId.make(f.source._id)
    expect(yield* call(f)).toMatchObject({ outcome: "blocked", changed: false })
    assertExists(f.records[0]).space = DocId.make(f.destination._id)
    f.root.number++
    expect(yield* call(f)).toMatchObject({ outcome: "blocked", changed: false })
    expect(f.state.allocated).toBe(1)
  })
)

for (const discovery of ["incomplete", "unsupported"] as const) {
  it.effect(`refuses structured ${discovery} inventory even when adapter blocker text is empty`, () =>
    Effect.gen(function* () {
      const f = transferFixture()
      f.layer = HulyClient.testLayer({
        ...f.operations,
        inspectTransferRecords: () =>
          Effect.succeed(
            discovery === "incomplete"
              ? { discovery: "incomplete", records: [], blockers: [], limitation: "Limited discovery." }
              : {
                  discovery: "complete",
                  records: [
                    {
                      kind: "unsupported",
                      _id: DocId.make("owned-comment"),
                      _class: ObjectClassName.make("chunter:class:ChatMessage"),
                      attachedTo: DocId.make(f.root._id),
                      space: DocId.make(f.source._id),
                      modifiedOn: Timestamp.make(0),
                      modifiedBy: SocialIdentityId.make("author")
                    }
                  ],
                  blockers: [],
                  limitation: "Unsupported collection."
                }
          )
      })
      expect(yield* call(f)).toMatchObject({ outcome: "blocked", changed: false })
      expect(f.state.allocated).toBe(0)
      expect(f.state.sent).toBe(0)
    })
  )
}
