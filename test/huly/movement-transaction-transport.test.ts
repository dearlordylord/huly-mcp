import type { Tx } from "@hcengineering/core"
import { it } from "@effect/vitest"
import { Effect, Redacted } from "effect"
import { describe, expect } from "vitest"
import {
  MovementTransportConfigSchema,
  MovementTransportMilliseconds,
  sendMovementTransaction,
  type MovementHttpPort
} from "../../src/huly/movement-transaction-transport.js"
import { NonEmptyString, PositiveInteger, UrlString } from "../../src/domain/schemas/shared.js"
import { Schema } from "effect"
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
