import { it } from "@effect/vitest"
import { TxOperations, type Client } from "@hcengineering/core"
import type { Project } from "@hcengineering/tracker"
import { Effect, Redacted, Schema } from "effect"
import { describe, expect } from "vitest"
import { NonEmptyString, PositiveInteger } from "../../src/domain/schemas/shared.js"
import { core, tracker } from "../../src/huly/huly-plugins.js"
import { HulyDataInvalidError, HulyConnectionError } from "../../src/huly/errors-base.js"
import { MovementTransportError, type MovementHttpPort } from "../../src/huly/movement-transaction-transport.js"
import { parseMovementTransportConfig, withMovementWriteClient } from "../../src/huly/movement-write-client.js"
import { toRef } from "../../src/huly/operations/sdk-boundary.js"
import { corePersonId, sdkFixture } from "../helpers/huly-sdk.js"

const configuration = {
  endpoint: "http://ordinary-huly.invalid",
  workspace: "workspace",
  token: Redacted.make(NonEmptyString.make("private-token")),
  timeoutMs: 1000
}

class OrdinarySdkReadFailure extends Schema.TaggedError<OrdinarySdkReadFailure>()("OrdinarySdkReadFailure", {
  message: Schema.String
}) {}

for (const endpoint of [
  "http://ordinary-huly.invalid",
  "https://ordinary-huly.invalid/rest/",
  "ws://ordinary-huly.invalid:3333",
  "wss://ordinary-huly.invalid/rest"
]) {
  it.effect(`parses the absolute movement endpoint ${endpoint}`, () =>
    Effect.gen(function* () {
      const parsed = yield* parseMovementTransportConfig({ ...configuration, endpoint })
      expect(parsed.endpoint).toBeInstanceOf(URL)
      expect(parsed.endpoint.href).toBe(new URL(endpoint).href)
    })
  )
}
for (const endpoint of [
  "invalid",
  "/relative",
  "http://",
  "ftp://ordinary-huly.invalid",
  "file:///tmp/huly",
  "https://private-token@ordinary-huly.invalid",
  "https://:private-token@ordinary-huly.invalid",
  "https://ordinary-huly.invalid?token=private-token",
  "https://ordinary-huly.invalid/#private-token"
]) {
  it.effect("rejects invalid or unsupported movement endpoint before startup writes", () =>
    Effect.gen(function* () {
      const result = yield* Effect.result(parseMovementTransportConfig({ ...configuration, endpoint }))
      expect(result._tag).toBe("Failure")
      if (result._tag === "Failure") {
        expect(result.failure).toBeInstanceOf(HulyConnectionError)
        expect(JSON.stringify(result.failure)).not.toContain("private-token")
      }
    })
  )
}
const clientFixture = () => {
  const state = { closed: 0, ordinaryWrites: 0 }
  const ordinary = new TxOperations(
    sdkFixture<Client>({
      close: async () => {
        state.closed++
      },
      tx: async () => {
        state.ordinaryWrites++
        return {}
      }
    }),
    corePersonId("person")
  )
  return { ordinary, state }
}
const allocate = (client: TxOperations) =>
  client.updateDoc<Project>(
    tracker.class.Project,
    core.space.Space,
    toRef<Project>(NonEmptyString.make("destination")),
    { $inc: { sequence: 1 } },
    true
  )

describe("movement-only client boundary", () => {
  it.effect("sanitizes ordinary delegated SDK failures while retaining operation and HTTP status context", () =>
    Effect.gen(function* () {
      const calls: Array<unknown> = []
      const ordinary = new TxOperations(
        sdkFixture<Client>({
          searchFulltext: async (...args: Array<unknown>) => {
            calls.push(args)
            throw new OrdinarySdkReadFailure({ message: "HTTP error 503 private-token" })
          }
        }),
        corePersonId("person")
      )
      const config = yield* parseMovementTransportConfig(configuration)
      const http: MovementHttpPort = {
        send: () =>
          Effect.fail(
            new MovementTransportError({
              phase: "before-send",
              reason: NonEmptyString.make("Unexpected write during delegated search")
            })
          )
      }
      const result = yield* Effect.result(
        withMovementWriteClient(ordinary, config, http, "findAll", (movement) =>
          movement.searchFulltext({ query: "root" }, { limit: 1 })
        )
      )
      expect(result._tag).toBe("Failure")
      if (result._tag === "Failure") {
        expect(result.failure).toBeInstanceOf(HulyConnectionError)
        if (result.failure instanceof HulyConnectionError) {
          expect(result.failure.diagnostic).toEqual({ operation: "findAll", httpStatus: 503 })
          expect(result.failure.message).toBe("findAll failed with HTTP 503")
        }
        expect(JSON.stringify(result.failure)).not.toContain("private-token")
      }
      expect(calls).toEqual([[{ query: "root" }, { limit: 1 }]])
    })
  )
  it.effect("preserves confirmed no-send failure rather than normalizing away its phase", () =>
    Effect.gen(function* () {
      const { ordinary, state } = clientFixture()
      const config = yield* parseMovementTransportConfig(configuration)
      const http: MovementHttpPort = {
        send: () =>
          Effect.fail(
            new MovementTransportError({
              phase: "before-send",
              reason: NonEmptyString.make("No connection established.")
            })
          )
      }
      const result = yield* Effect.result(withMovementWriteClient(ordinary, config, http, "updateDoc", allocate))
      expect(result._tag).toBe("Failure")
      if (result._tag === "Failure") {
        expect(result.failure).toBeInstanceOf(MovementTransportError)
        if (result.failure instanceof MovementTransportError) expect(result.failure.phase).toBe("before-send")
      }
      expect(state).toEqual({ closed: 0, ordinaryWrites: 0 })
    })
  )

  it.effect("reports lost replies after one send without falling back to the ordinary SDK", () =>
    Effect.gen(function* () {
      const { ordinary, state } = clientFixture()
      const config = yield* parseMovementTransportConfig(configuration)
      const sent: Array<string> = []
      const http: MovementHttpPort = {
        send: (request) =>
          Effect.sync(() => {
            sent.push(request.body)
            return { status: PositiveInteger.make(200), body: "truncated" }
          })
      }
      const result = yield* Effect.result(withMovementWriteClient(ordinary, config, http, "updateDoc", allocate))
      expect(result._tag).toBe("Failure")
      if (result._tag === "Failure" && result.failure instanceof MovementTransportError)
        expect(result.failure.phase).toBe("after-send")
      expect(sent).toHaveLength(1)
      expect(state.ordinaryWrites).toBe(0)
    })
  )

  it.effect("retains the ordinary lease owner when the movement wrapper closes", () =>
    Effect.gen(function* () {
      const { ordinary, state } = clientFixture()
      const config = yield* parseMovementTransportConfig(configuration)
      const http: MovementHttpPort = { send: () => Effect.succeed({ status: PositiveInteger.make(200), body: "{}" }) }
      yield* withMovementWriteClient(ordinary, config, http, "updateDoc", (movement) => movement.close())
      expect(state.closed).toBe(0)
      yield* Effect.promise(() => ordinary.close())
      expect(state.closed).toBe(1)
    })
  )

  it.effect("does not expose redacted credential values when startup metadata is invalid", () =>
    Effect.gen(function* () {
      const result = yield* Effect.result(parseMovementTransportConfig({ ...configuration, endpoint: "invalid" }))
      expect(result._tag).toBe("Failure")
      if (result._tag === "Failure") {
        expect(result.failure).toBeInstanceOf(HulyConnectionError)
        expect(JSON.stringify(result.failure)).not.toContain("private-token")
      }
    })
  )
})

it.effect("preserves a typed invalid queued receipt without invoking the movement HTTP port", () =>
  Effect.gen(function* () {
    const { ordinary } = clientFixture()
    const config = yield* parseMovementTransportConfig(configuration)
    let sends = 0
    const http: MovementHttpPort = {
      send: () =>
        Effect.sync(() => {
          sends++
          return { status: PositiveInteger.make(200), body: "{}" }
        })
    }
    const failure = new HulyDataInvalidError({ operation: "move_issue", entity: "queued movement transactions" })
    const result = yield* withMovementWriteClient(
      ordinary,
      config,
      http,
      "conditionalUpdateDoc",
      async (_client, signal) => {
        expect(signal.aborted).toBe(false)
        throw failure
      }
    ).pipe(Effect.result)
    expect(result._tag).toBe("Failure")
    if (result._tag === "Failure") expect(result.failure).toBe(failure)
    expect(sends).toBe(0)
  })
)
