import { it } from "@effect/vitest"
import { Effect, Fiber, Schema } from "effect"
import { TestClock } from "effect/testing"
import { expect } from "vitest"
import { parseMoveIssueParams } from "../../../src/domain/schemas/issue-movement.js"
import { MoveIssueResultSchema } from "../../../src/domain/schemas/issues-results.js"
import { moveIssue } from "../../../src/huly/operations/issue-movement.js"
import { HulyClient } from "../../../src/huly/client.js"
import { assertExists } from "../../../src/utils/assertions.js"
import { tracker } from "../../../src/huly/huly-plugins.js"
import { transferFixture } from "../../helpers/transfer.js"
import { sdkFixture } from "../../helpers/huly-sdk.js"

const call = (f: ReturnType<typeof transferFixture>, input: unknown = f.input) =>
  parseMoveIssueParams(input).pipe(Effect.flatMap(moveIssue), Effect.provide(f.layer))
const value = (
  f: ReturnType<typeof transferFixture>,
  id: string,
  field: "component" | "milestone",
  label: string,
  destination = true
) => {
  f.attributeRows.push(
    sdkFixture({
      _id: id,
      _class: field === "component" ? tracker.class.Component : tracker.class.Milestone,
      space: destination ? f.destination._id : f.source._id,
      label,
      lead: null,
      status: 0,
      targetDate: 0
    })
  )
}

it.effect("two conflicts return IDs and distinguishing candidates for a schema-valid selective-clear retry", () =>
  Effect.gen(function* () {
    const f = transferFixture()
    f.root.component = sdkFixture("dangling-component")
    f.root.milestone = sdkFixture("dangling-milestone")
    value(f, "replacement", "component", "API")
    const blocked = yield* call(f)
    expect(blocked).toMatchObject({
      outcome: "blocked",
      changed: false,
      discovery: "complete",
      conflicts: [
        { field: "component", from: "dangling-component", candidates: [{ _id: "replacement", lead: null }] },
        { field: "milestone", from: "dangling-milestone", clearingAllowed: true }
      ]
    })
    expect(f.state.allocated).toBe(0)
    if (blocked.outcome !== "blocked" || blocked.conflicts === undefined)
      throw new Error("Expected actionable conflicts")
    const retry = yield* parseMoveIssueParams({
      ...blocked.nextCall,
      resolutions: blocked.conflicts
        .filter((entry) => "field" in entry)
        .map((entry) => ({
          issueId: entry.issueId,
          field: entry.field,
          from: entry.from,
          to: entry.candidates?.[0]?._id ?? null
        }))
    })
    const completed = yield* call(f, retry)
    expect(completed).toMatchObject({
      outcome: "completed",
      attributeChanges: [
        { field: "component", reason: "explicit-replacement", to: "replacement" },
        { field: "milestone", reason: "explicit-clear", to: null }
      ]
    })
    expect(Schema.decodeUnknownSync(MoveIssueResultSchema)(completed)).toEqual(completed)
  })
)

it.effect("literal unique names resolve automatically while case, whitespace and duplicates do not", () =>
  Effect.gen(function* () {
    for (const field of ["component", "milestone"] satisfies Array<"component" | "milestone">) {
      for (const labels of [["API"], ["api"], [" API"], ["API", "API"]]) {
        const f = transferFixture()
        f.root[field] = sdkFixture("source")
        value(f, "source", field, "API", false)
        labels.forEach((label, index) => value(f, `target-${index}`, field, label))
        const result = yield* call(f)
        expect(result.outcome).toBe(labels.length === 1 && labels[0] === "API" ? "completed" : "blocked")
      }
    }
  })
)

it.effect(
  "explicit consent overrides destination preservation and rejects stale null, duplicate and out-of-tree decisions before writes",
  () =>
    Effect.gen(function* () {
      const f = transferFixture()
      f.root.component = sdkFixture("target")
      value(f, "target", "component", "Existing")
      expect(
        yield* call(f, {
          ...f.input,
          resolutions: [{ issueId: f.root._id, field: "component", from: "target", to: null }]
        })
      ).toMatchObject({ outcome: "completed", attributeChanges: [{ reason: "explicit-clear" }] })
      for (const resolutions of [
        [{ issueId: "outside", field: "component", from: "old", to: null }],
        [{ issueId: "root", field: "component", from: "old", to: null }],
        [
          { issueId: "root", field: "component", from: "old", to: null },
          { issueId: "root", field: "component", from: "old", to: null }
        ]
      ]) {
        const fresh = transferFixture()
        const result = yield* call(fresh, { ...fresh.input, resolutions })
        expect(result).toMatchObject({ outcome: "blocked" })
        expect(fresh.state.allocated).toBe(0)
      }
    })
)

it.effect("same-project empty decisions reject before no-op and invalid destination replacements cannot write", () =>
  Effect.gen(function* () {
    const f = transferFixture()
    expect(yield* call(f, { issue: f.root._id, destination: { parent: f.old._id }, resolutions: [] })).toMatchObject({
      outcome: "blocked",
      reason: expect.stringContaining("Omit resolutions")
    })
    f.root.component = sdkFixture("dangling")
    expect(
      yield* call(f, {
        ...f.input,
        resolutions: [{ issueId: f.root._id, field: "component", from: "dangling", to: "not-destination" }]
      })
    ).toMatchObject({ outcome: "blocked", conflicts: [{ code: "invalid-resolution" }] })
    expect(f.state.allocated).toBe(0)
  })
)

it.effect(
  "valid destination reference takes priority over ambiguous names; explicit equal reference is unchanged",
  () =>
    Effect.gen(function* () {
      for (const explicit of [false, true]) {
        const f = transferFixture()
        f.root.component = sdkFixture("target")
        value(f, "target", "component", "API")
        value(f, "duplicate", "component", "API")
        const result = yield* call(f, {
          ...f.input,
          ...(explicit
            ? { resolutions: [{ issueId: f.root._id, field: "component", from: "target", to: "target" }] }
            : {})
        })
        expect(result).toMatchObject({ outcome: "completed", attributeChanges: [] })
        expect(f.root.component).toBe("target")
      }
    })
)

it.effect("a retry rebuilds state and reports current absent or changed reference without allocation", () =>
  Effect.gen(function* () {
    for (const current of [null, undefined, "changed"]) {
      const f = transferFixture()
      f.root.component = sdkFixture("original")
      const blocked = yield* call(f)
      expect(blocked.outcome).toBe("blocked")
      if (current === undefined) Reflect.deleteProperty(f.root, "component")
      else f.root.component = sdkFixture(current)
      const result = yield* call(f, {
        ...f.input,
        resolutions: [{ issueId: f.root._id, field: "component", from: "original", to: null }]
      })
      expect(result).toMatchObject({
        outcome: "blocked",
        conflicts: [{ code: "stale-resolution", from: current ?? null }]
      })
      expect(f.state.allocated).toBe(0)
    }
  })
)

it.effect(
  "incomplete total and malformed class/space/value inventories refuse with discovery completeness before writes",
  () =>
    Effect.gen(function* () {
      for (const scenario of ["total", "invalid-total", "class", "space", "invalid", "limit", "duplicate"]) {
        const f = transferFixture()
        f.root.component = sdkFixture("source")
        f.root.milestone = sdkFixture("missing")
        f.workflow.tasks = []
        value(f, "source", "component", "API", false)
        value(f, "target", "component", "API")
        if (scenario === "total") f.state.attributeTotal = 50
        if (scenario === "invalid-total") f.state.attributeTotal = -1
        if (scenario === "limit") {
          for (let index = 0; index < 1001; index++) value(f, `target-${index}`, "component", "API")
        }
        if (scenario === "duplicate") value(f, "target", "component", "API")
        if (scenario === "invalid") Reflect.deleteProperty(f.attributeRows[1] ?? {}, "lead")
        if (scenario === "class" || scenario === "space") {
          f.state.unfilteredAttributeRows = true
          Reflect.set(f.attributeRows[1] ?? {}, scenario === "class" ? "_class" : "space", "wrong")
        }
        const blocked = yield* call(f)
        expect(blocked).toMatchObject({ outcome: "blocked", discovery: "incomplete" })
        if (blocked.outcome !== "blocked") throw new Error("Expected discovery refusal")
        expect(blocked.conflicts).toEqual(
          expect.arrayContaining([
            { code: "workflow", issueId: f.root._id, identifier: f.root.identifier, reason: expect.any(String) },
            expect.objectContaining({ code: "discovery", field: "component" })
          ])
        )
        expect(f.state.allocated).toBe(0)
        expect(f.state.sent).toBe(0)
      }
    })
)

it.effect("stale consent for now-absent reference returns a directly usable nextCall omitting obsolete decisions", () =>
  Effect.gen(function* () {
    for (const field of ["component", "milestone"] satisfies Array<"component" | "milestone">) {
      for (const absent of [null, undefined]) {
        const f = transferFixture()
        if (absent === undefined) Reflect.deleteProperty(f.root, field)
        const blocked = yield* call(f, {
          ...f.input,
          resolutions: [{ issueId: f.root._id, field, from: "old", to: null }]
        })
        expect(blocked).toMatchObject({
          outcome: "blocked",
          conflicts: [{ code: "stale-resolution", field, from: null, clearingAllowed: false }],
          nextCall: { resolutions: [] }
        })
        if (blocked.outcome !== "blocked") throw new Error("Expected stale consent")
        expect(yield* call(f, blocked.nextCall)).toMatchObject({ outcome: "completed", attributeChanges: [] })
      }
    }
  })
)

it.effect("candidate payloads retain required distinguishing fields and exclude unrelated candidate details", () =>
  Effect.gen(function* () {
    const f = transferFixture()
    f.root.component = sdkFixture("missing-component")
    f.root.milestone = sdkFixture("missing-milestone")
    value(f, "component-choice", "component", "Choice")
    value(f, "milestone-choice", "milestone", "Choice")
    const blocked = yield* call(f)
    expect(blocked).toMatchObject({
      outcome: "blocked",
      conflicts: [
        { field: "component", candidates: [{ _id: "component-choice", lead: null }] },
        { field: "milestone", candidates: [{ _id: "milestone-choice", status: 0, targetDate: 0 }] }
      ]
    })
    if (blocked.outcome !== "blocked" || blocked.conflicts === undefined) throw new Error("Expected candidates")
    for (const entry of blocked.conflicts) {
      if (!("field" in entry)) continue
      expect(entry.candidates[0]).not.toHaveProperty(entry.field === "component" ? "status" : "lead")
    }
    expect(Schema.decodeUnknownSync(MoveIssueResultSchema)(blocked)).toEqual(blocked)
  })
)

it.effect(
  "stale-null nextCall retains valid consent for the other field and removes duplicate/out-of-tree decisions",
  () =>
    Effect.gen(function* () {
      const f = transferFixture()
      f.root.milestone = sdkFixture("milestone-current")
      const result = yield* call(f, {
        ...f.input,
        resolutions: [
          { issueId: f.root._id, field: "component", from: "component-old", to: null },
          { issueId: f.root._id, field: "milestone", from: "milestone-current", to: null }
        ]
      })
      expect(result).toMatchObject({
        outcome: "blocked",
        nextCall: { resolutions: [{ field: "milestone", from: "milestone-current" }] }
      })
      if (result.outcome !== "blocked") throw new Error("Expected stale consent")
      expect(yield* call(f, result.nextCall)).toMatchObject({
        outcome: "completed",
        attributeChanges: [{ field: "milestone", reason: "explicit-clear" }]
      })
      const fresh = transferFixture()
      const duplicate = { issueId: fresh.root._id, field: "component", from: "old", to: null }
      const bad = yield* call(fresh, {
        ...fresh.input,
        resolutions: [duplicate, duplicate, { ...duplicate, issueId: "outside" }]
      })
      expect(bad).toMatchObject({ outcome: "blocked", nextCall: { resolutions: [] } })
    })
)

it.effect("verification cannot report completed when observed attributes differ from the approved final values", () =>
  Effect.gen(function* () {
    const f = transferFixture()
    f.root.component = sdkFixture("source")
    value(f, "source", "component", "API", false)
    value(f, "approved", "component", "API")
    const commit = assertExists(f.operations.commitTransfer)
    const layer = HulyClient.testLayer({
      ...f.operations,
      commitTransfer: (write) =>
        commit(write).pipe(
          Effect.tap(() =>
            Effect.sync(() => {
              f.root.component = sdkFixture("unexpected")
            })
          )
        )
    })
    const fiber = yield* parseMoveIssueParams(f.input).pipe(
      Effect.flatMap(moveIssue),
      Effect.provide(layer),
      Effect.forkChild
    )
    yield* TestClock.adjust("2 seconds")
    expect(yield* Fiber.join(fiber)).toMatchObject({
      outcome: "incomplete",
      reason: expect.stringContaining("inconsistent")
    })
    expect(f.state.sent).toBe(1)
    expect(f.root.component).toBe("unexpected")
  })
)
