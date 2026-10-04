import type { Tx, TxOperations } from "@hcengineering/core"
import { it } from "@effect/vitest"
import { Effect, Fiber, Redacted } from "effect"
import { describe, expect } from "vitest"
import {
  MovementTransportConfigSchema,
  MovementTransportError,
  makeMovementTxOperations,
  MovementTransportMilliseconds,
  sendMovementTransaction,
  type MovementHttpPort
} from "../../src/huly/movement-transaction-transport.js"
import { NonEmptyString, PositiveInteger, UrlString } from "../../src/domain/schemas/shared.js"
import { Schema } from "effect"
import { TestClock } from "effect/testing"
import { sdkFixture } from "../helpers/huly-sdk.js"

const config = Schema.decodeUnknownSync(MovementTransportConfigSchema)({
  endpoint: UrlString.make("http://ordinary-huly.invalid"),
  workspace: NonEmptyString.make("workspace"),
  token: Redacted.make(NonEmptyString.make("fixture-secret")),
  timeoutMs: MovementTransportMilliseconds.make(1000)
})
const sequence = sdkFixture<Tx>({
  _id: "tx-1", _class: "core:class:TxUpdateDoc", space: "core:space:Tx", objectSpace: "core:space:Space",
  modifiedOn: 0, modifiedBy: "person", objectId: "destination", objectClass: "tracker:class:Project",
  operations: { $inc: { sequence: 1 } }, retrieve: true
})

describe("single-send movement transaction boundary", () => {
  it.effect("does not resend a write when the response body is malformed", () => Effect.gen(function* () {
    const sent: Array<string> = []
    const http: MovementHttpPort = {
      send: (request) => Effect.sync(() => {
        sent.push(request.body)
        return { status: PositiveInteger.make(200), body: "lost or truncated JSON" }
      })
    }
    const result = yield* Effect.result(sendMovementTransaction(sequence, config, http))
    expect(result._tag).toBe("Failure")
    if (result._tag === "Failure") expect(result.failure.phase).toBe("after-send")
    expect(sent).toHaveLength(1)
    expect(sent[0]).not.toContain("fixture-secret")
  }))

  it.effect("reports uncertain effects after HTTP refusal without resend", () => Effect.gen(function* () {
    const sent: Array<string> = []
    const http: MovementHttpPort = {
      send: (request) => Effect.sync(() => {
        sent.push(request.body)
        return { status: PositiveInteger.make(503), body: "unavailable" }
      })
    }
    const result = yield* Effect.result(sendMovementTransaction(sequence, config, http))
    expect(result._tag).toBe("Failure")
    if (result._tag === "Failure") expect(result.failure.phase).toBe("after-send")
    expect(sent).toHaveLength(1)
  }))

  it.effect("parses the allocated sequence and sends exactly its parsed serialized transaction", () => Effect.gen(function* () {
    const sent: Array<string> = []
    const http: MovementHttpPort = {
      send: (request) => Effect.sync(() => {
        sent.push(request.body)
        return { status: PositiveInteger.make(200), body: '{"object":{"sequence":7}}' }
      })
    }
    const result = yield* sendMovementTransaction(sequence, config, http)
    expect(result).toEqual({ object: { sequence: 7 } })
    expect(sent).toEqual([JSON.stringify(sequence)])
  }))

  it.effect("rejects unsupported writes before any transport effect", () => Effect.gen(function* () {
    const sent: Array<string> = []
    const http: MovementHttpPort = {
      send: (request) => Effect.sync(() => {
        sent.push(request.body)
        return { status: PositiveInteger.make(200), body: "{}" }
      })
    }
    const unsupported = sdkFixture<Tx>({ ...sequence, objectClass: "contact:class:Person" })
    const result = yield* Effect.result(sendMovementTransaction(unsupported, config, http))
    expect(result._tag).toBe("Failure")
    if (result._tag === "Failure") expect(result.failure.phase).toBe("before-send")
    expect(sent).toEqual([])
  }))
})

it.effect("returns confirmed scoped refusal from the ordinary false-only response without resend", () => Effect.gen(function* () {
  const sent: Array<string> = []
  const http: MovementHttpPort = {
    send: (request) => Effect.sync(() => {
      sent.push(request.body)
      return { status: PositiveInteger.make(200), body: '{"success":false}' }
    })
  }
  const conditional = sdkFixture<Tx>({
    _id: "batch-1", _class: "core:class:TxApplyIf", space: "core:space:Tx", objectSpace: "core:space:Tx",
    modifiedOn: 0, modifiedBy: "person", scope: "issue-transfer:root", match: [], notMatch: [], txes: []
  })
  expect(yield* sendMovementTransaction(conditional, config, http)).toEqual({ success: false })
  expect(sent).toHaveLength(1)
}))

it.effect("bounds a single write response with Effect Clock and reports after-send uncertainty", () => Effect.gen(function* () {
  const sent: Array<string> = []
  const http: MovementHttpPort = {
    send: (request) => Effect.sync(() => { sent.push(request.body) }).pipe(Effect.andThen(Effect.never))
  }
  const fiber = yield* sendMovementTransaction(sequence, config, http).pipe(Effect.result, Effect.forkChild)
  yield* TestClock.adjust("2 seconds")
  const result = yield* Fiber.join(fiber)
  expect(result._tag).toBe("Failure")
  if (result._tag === "Failure") expect(result.failure.phase).toBe("after-send")
  expect(sent).toHaveLength(1)
}))

it.effect("preserves the typed write phase across the SDK promise boundary", () => Effect.gen(function* () {
  const ordinary = sdkFixture<TxOperations>({ user: "person", isDerived: false })
  const error = new MovementTransportError({ phase: "after-send", reason: NonEmptyString.make("Lost reply") })
  const http: MovementHttpPort = { send: () => Effect.fail(error) }
  const movement = makeMovementTxOperations(ordinary, config, http)
  const result = yield* Effect.tryPromise({ try: () => movement.tx(sequence), catch: (cause) => cause }).pipe(Effect.result)
  expect(result._tag).toBe("Failure")
  if (result._tag === "Failure") expect(result.failure).toBe(error)
}))
