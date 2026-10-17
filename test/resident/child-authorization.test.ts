import { EventEmitter } from "node:events"
import { it } from "@effect/vitest"
import { Deferred, Effect, Fiber, Redacted, Schema } from "effect"
import { TestClock } from "effect/testing"
import { expect } from "vitest"

import { encodeChildReply, encodeChildStart } from "../../src/resident/bootstrap-codec.js"
import { awaitChildAuthorization, type ChildAuthorizationPort } from "../../src/resident/child-authorization.js"
import { BootstrapNonce, MANAGED_PACKAGE_NAME } from "../../src/resident/managed-contract.js"
import { ResidentDirectory } from "../../src/resident/protected-path.js"
import { captureResidentSelection } from "../../src/resident/selection-config.js"

const peer = Effect.gen(function* () {
  const events = new EventEmitter()
  const queuedMessages: Array<(message: unknown) => void> = []
  const queuedDisconnects: Array<() => void> = []
  const sent = yield* Deferred.make<void>()
  const capture = yield* captureResidentSelection({
    HULY_URL: "https://huly.invalid",
    HULY_WORKSPACE: "authorization",
    HULY_TOKEN: "fixture-private-token"
  })
  const nonce = Schema.decodeUnknownSync(BootstrapNonce)("a".repeat(64))
  const prepared = yield* encodeChildReply({
    kind: "prepared",
    version: 1,
    implementation: { name: MANAGED_PACKAGE_NAME, version: "fixture" },
    nonce
  })
  const start = yield* encodeChildStart({
    kind: "start",
    version: 1,
    nonce,
    directory: ResidentDirectory.make("/private-fixture"),
    capture
  })
  const port: ChildAuthorizationPort = {
    onMessage: (listener) => {
      queuedMessages.push(listener)
      events.on("message", listener)
      return () => {
        events.removeListener("message", listener)
      }
    },
    onDisconnect: (listener) => {
      queuedDisconnects.push(listener)
      events.on("disconnect", listener)
      return () => {
        events.removeListener("disconnect", listener)
      }
    },
    send: (_frame, onFailure) => {
      events.once("send-failure", onFailure)
      Effect.runSync(Deferred.succeed(sent, undefined))
    }
  }
  return { events, sent, nonce, prepared, start, port, queuedMessages, queuedDisconnects }
})

it.effect("commits Start once, removes listeners, and survives a later parent disconnect", () =>
  Effect.gen(function* () {
    const p = yield* peer
    const child = yield* awaitChildAuthorization(p.port, p.nonce, p.prepared).pipe(Effect.forkChild)
    yield* Deferred.await(p.sent)
    p.events.emit("message", Redacted.value(p.start))
    p.events.emit("disconnect")
    for (const queued of p.queuedMessages) queued("{")
    for (const queued of p.queuedDisconnects) queued()
    const selected = yield* Fiber.join(child)
    expect(selected.capture.selection.huly.workspace).toBe("authorization")
    expect(p.events.listenerCount("message")).toBe(0)
    expect(p.events.listenerCount("disconnect")).toBe(0)
    yield* TestClock.adjust("5 seconds")
  })
)

for (const event of ["disconnect", "send-failure", "invalid", "wrong-nonce", "timeout"]) {
  it.effect(`retires on ${event} before Start and cannot be revived by a queued Start`, () =>
    Effect.gen(function* () {
      const p = yield* peer
      const child = yield* awaitChildAuthorization(p.port, p.nonce, p.prepared).pipe(Effect.flip, Effect.forkChild)
      yield* Deferred.await(p.sent)
      switch (event) {
        case "invalid":
          p.events.emit("message", "{")
          break
        case "wrong-nonce":
          p.events.emit("message", Redacted.value(p.start).replace("a".repeat(64), "b".repeat(64)))
          break
        case "timeout":
          yield* TestClock.adjust("5 seconds")
          break
        default:
          p.events.emit(event)
      }
      p.events.emit("message", Redacted.value(p.start))
      for (const queued of p.queuedMessages) queued(Redacted.value(p.start))
      for (const queued of p.queuedDisconnects) queued()
      expect((yield* Fiber.join(child)).reason).toBe("ipc")
      expect(p.events.listenerCount("message")).toBe(0)
      expect(p.events.listenerCount("disconnect")).toBe(0)
    })
  )
}

it.effect("removes private-channel listeners when the waiting child is interrupted", () =>
  Effect.gen(function* () {
    const p = yield* peer
    const child = yield* awaitChildAuthorization(p.port, p.nonce, p.prepared).pipe(Effect.forkChild)
    yield* Deferred.await(p.sent)
    yield* Fiber.interrupt(child)
    expect(p.events.listenerCount("message")).toBe(0)
    expect(p.events.listenerCount("disconnect")).toBe(0)
    p.events.emit("message", Redacted.value(p.start))
  })
)
