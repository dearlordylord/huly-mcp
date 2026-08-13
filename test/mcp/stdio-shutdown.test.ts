import { it } from "@effect/vitest"
import { Deferred, Effect, Fiber, Option, Ref, TestClock } from "effect"
import { describe, expect } from "vitest"

import {
  executeBoundedStdioShutdown,
  makeStdioShutdownCoordinator,
  type StdioShutdownResources
} from "../../src/mcp/stdio-shutdown.js"

const makeResources = (
  drain: Effect.Effect<void> = Effect.void,
  closeWire: Effect.Effect<void> = Effect.void,
  closeTelemetry: Effect.Effect<void> = Effect.void,
  closeClients: Effect.Effect<void> = Effect.void
) =>
  Effect.gen(function* () {
    const forcedExits = yield* Ref.make(0)
    const diagnostics = yield* Ref.make<ReadonlyArray<string>>([])
    const resources: StdioShutdownResources = {
      drain,
      closeWire,
      closeTelemetry,
      closeClients,
      forceExit: () => Ref.update(forcedExits, (count) => count + 1),
      writeDiagnostic: (message) => Ref.update(diagnostics, (messages) => [...messages, message])
    }
    return { diagnostics, forcedExits, resources }
  })

describe("bounded stdio shutdown", () => {
  it.effect("does not signal completion from an invalid Running transition", () =>
    Effect.gen(function* () {
      const coordinator = yield* makeStdioShutdownCoordinator()

      yield* coordinator.complete("graceful")
      const waiter = yield* coordinator.awaitComplete.pipe(Effect.fork)
      yield* Effect.yieldNow()

      expect(yield* Fiber.poll(waiter)).toEqual(Option.none())
      expect(yield* coordinator.state).toEqual({ _tag: "Running" })
      yield* Fiber.interrupt(waiter)
    })
  )

  it.effect("uses the first shutdown reason and completes graceful cleanup once", () =>
    Effect.gen(function* () {
      const coordinator = yield* makeStdioShutdownCoordinator()
      const closes = yield* Ref.make(0)
      const probe = yield* makeResources(
        Effect.void,
        Ref.update(closes, (count) => count + 1),
        Ref.update(closes, (count) => count + 1),
        Ref.update(closes, (count) => count + 1)
      )

      expect(yield* coordinator.request("stdin-eof")).toBe(true)
      expect(yield* coordinator.request("sigterm")).toBe(false)
      yield* executeBoundedStdioShutdown(coordinator, probe.resources)
      yield* coordinator.beginClosing
      yield* coordinator.complete("forced")

      expect(yield* coordinator.state).toEqual({ _tag: "Complete", outcome: "graceful", reason: "stdin-eof" })
      expect(yield* Ref.get(closes)).toBe(3)
      expect(yield* Ref.get(probe.forcedExits)).toBe(0)
      expect(yield* Ref.get(probe.diagnostics)).toEqual([])
    })
  )

  it.effect("starts cleanup after the drain allowance and forces one nonzero exit at the global deadline", () =>
    Effect.gen(function* () {
      const coordinator = yield* makeStdioShutdownCoordinator()
      const closeStarted = yield* Deferred.make<void>()
      const stuckDrain = yield* Deferred.make<void>()
      const stuckClose = yield* Deferred.make<void>()
      const probe = yield* makeResources(
        Deferred.await(stuckDrain),
        Deferred.succeed(closeStarted, undefined).pipe(Effect.zipRight(Deferred.await(stuckClose)))
      )

      yield* coordinator.request("stop")
      const shutdownFiber = yield* executeBoundedStdioShutdown(coordinator, probe.resources).pipe(Effect.fork)

      expect(yield* Deferred.poll(closeStarted)).toEqual(Option.none())
      yield* TestClock.adjust("5 seconds")
      expect(Option.isSome(yield* Deferred.poll(closeStarted))).toBe(true)

      yield* TestClock.adjust("5 seconds")
      yield* Fiber.join(shutdownFiber)

      expect(yield* coordinator.state).toEqual({ _tag: "Complete", outcome: "forced", reason: "stop" })
      expect(yield* Ref.get(probe.forcedExits)).toBe(1)
      expect(yield* Ref.get(probe.diagnostics)).toEqual([
        "Huly MCP stdio shutdown exceeded 10 seconds; forcing process exit"
      ])
    })
  )
})
