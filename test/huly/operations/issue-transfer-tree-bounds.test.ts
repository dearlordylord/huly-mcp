import { it } from "@effect/vitest"
import { Deferred, Effect, Fiber, Schema } from "effect"
import { TestClock } from "effect/testing"
import { expect } from "vitest"
import { parseMoveIssueParams } from "../../../src/domain/schemas/issue-movement.js"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import { moveIssue } from "../../../src/huly/operations/issue-movement.js"
import {
  TRANSFER_DISCOVERY_BUDGET,
  TRANSFER_EXECUTION_BUDGET
} from "../../../src/huly/operations/issue-transfer-tree.js"
import { assertExists } from "../../../src/utils/assertions.js"
import { transferTreeFixture } from "../../helpers/transfer-tree.js"
import { IssueId } from "../../../src/domain/schemas/shared.js"

const DescendantQuery = Schema.Struct({ attachedTo: Schema.Struct({ $in: Schema.Array(IssueId) }) })
const parseQuery = (input: unknown) => Schema.decodeUnknownOption(DescendantQuery)(input)

it.effect("an unavailable descendant query reaches the discovery deadline without reservations or a prefix move", () =>
  Effect.gen(function* () {
    const f = transferTreeFixture()
    const reached = yield* Deferred.make<void>()
    const original = assertExists(f.operations.findAll)
    const findAll: HulyClientOperations["findAll"] = (cls, query, options) => {
      const parsed = parseQuery(query)
      return parsed._tag === "Some" && parsed.value.attachedTo.$in.includes(IssueId.make(f.child._id))
        ? Deferred.succeed(reached, undefined).pipe(Effect.andThen(Effect.never))
        : original(cls, query, options)
    }
    const layer = HulyClient.testLayer({ ...f.operations, findAll })
    const fiber = yield* parseMoveIssueParams(f.input).pipe(
      Effect.flatMap(moveIssue),
      Effect.provide(layer),
      Effect.forkChild
    )
    yield* Deferred.await(reached)
    yield* TestClock.adjust(TRANSFER_DISCOVERY_BUDGET)
    expect(yield* Fiber.join(fiber)).toMatchObject({ outcome: "blocked", changed: false, discovery: "incomplete" })
    expect(f.state.allocated).toBe(0)
    expect(f.state.sent).toBe(0)
  })
)

it.effect("allocation timeout is indeterminate with every known task ID and sends no task prefix", () =>
  Effect.gen(function* () {
    const f = transferTreeFixture()
    const reached = yield* Deferred.make<void>()
    const original = assertExists(f.operations.allocateMovementNumber)
    const allocateMovementNumber: NonNullable<HulyClientOperations["allocateMovementNumber"]> = (id) =>
      original(id).pipe(Effect.andThen(Deferred.succeed(reached, undefined)), Effect.andThen(Effect.never))
    const layer = HulyClient.testLayer({ ...f.operations, allocateMovementNumber })
    const fiber = yield* parseMoveIssueParams(f.input).pipe(
      Effect.flatMap(moveIssue),
      Effect.provide(layer),
      Effect.forkChild
    )
    yield* Deferred.await(reached)
    yield* TestClock.adjust(TRANSFER_EXECUTION_BUDGET)
    const result = yield* Fiber.join(fiber)
    expect(result).toMatchObject({ outcome: "indeterminate", issueIds: [f.root._id, f.child._id, f.grandchild._id] })
    expect(result).not.toHaveProperty("changed")
    expect(result).not.toHaveProperty("tasks")
    expect(f.state.allocated).toBe(1)
    expect(f.state.sent).toBe(0)
  })
)
