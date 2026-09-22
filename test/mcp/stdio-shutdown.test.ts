import { it } from "@effect/vitest"
import { Deferred, Effect, Fiber, Option, Ref } from "effect"
import { TestClock } from "effect/testing"
import { describe, expect } from "vitest"

import {
  executeBoundedStdioShutdown,
  liveStdioProcessPort,
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
  it("registers and removes the live process shutdown listeners as one subscription", () => {
    const stdinEof = () => {}
    const stdinClose = () => {}
    const sigint = () => {}
    const sigterm = () => {}
    const initialCounts = {
      stdinEof: process.stdin.listenerCount("end"),
      stdinClose: process.stdin.listenerCount("close"),
      sigint: process.listenerCount("SIGINT"),
      sigterm: process.listenerCount("SIGTERM")
    }

    const remove = liveStdioProcessPort.listen({ stdinEof, stdinClose, sigint, sigterm })
    expect(process.stdin.listeners("end")).toContain(stdinEof)
    expect(process.stdin.listeners("close")).toContain(stdinClose)
    expect(process.listeners("SIGINT")).toContain(sigint)
    expect(process.listeners("SIGTERM")).toContain(sigterm)

    remove()
    expect(process.stdin.listenerCount("end")).toBe(initialCounts.stdinEof)
    expect(process.stdin.listenerCount("close")).toBe(initialCounts.stdinClose)
    expect(process.listenerCount("SIGINT")).toBe(initialCounts.sigint)
    expect(process.listenerCount("SIGTERM")).toBe(initialCounts.sigterm)
  })

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
      const shutdownFiber = yield* executeBoundedStdioShutdown(coordinator, probe.resources).pipe(
        Effect.forkChild({ startImmediately: true })
      )
      yield* TestClock.adjust("250 millis")
      yield* Fiber.join(shutdownFiber)
      yield* executeBoundedStdioShutdown(coordinator, probe.resources)

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
        Deferred.succeed(closeStarted, undefined).pipe(
          Effect.andThen(Deferred.await(stuckClose)),
          Effect.uninterruptible
        )
      )

      yield* coordinator.request("stop")
      const shutdownFiber = yield* executeBoundedStdioShutdown(coordinator, probe.resources).pipe(
        Effect.forkChild({ startImmediately: true })
      )

      expect(yield* Deferred.poll(closeStarted)).toEqual(Option.none())
      yield* TestClock.adjust("2 seconds")
      expect(Option.isSome(yield* Deferred.poll(closeStarted))).toBe(true)

      yield* TestClock.adjust("8 seconds")
      yield* Fiber.join(shutdownFiber)

      expect(yield* coordinator.state).toEqual({ _tag: "Complete", outcome: "forced", reason: "stop" })
      expect(yield* Ref.get(probe.forcedExits)).toBe(1)
      expect(yield* Ref.get(probe.diagnostics)).toEqual([
        "Huly MCP stdio shutdown exceeded 10 seconds; forcing process exit"
      ])
    })
  )
})
