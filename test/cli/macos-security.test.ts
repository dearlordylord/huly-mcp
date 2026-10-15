import { execFile } from "node:child_process"
import { it as effectIt } from "@effect/vitest"
import { Deferred, Effect, Fiber, Redacted, Result } from "effect"
import { TestClock } from "effect/testing"
import { expect, it } from "vitest"

import { makeMacosSecurity } from "../../src/profiles/macos-security.js"

it.each([0, 44])("preserves real subprocess status %s without exposing captured metadata", async (status) => {
  const security = makeMacosSecurity((_args, complete) =>
    execFile(
      process.execPath,
      ["-e", `process.stdout.write('private-metadata');process.exitCode=${status}`],
      { encoding: "utf8" },
      complete
    )
  )
  const reply = await Effect.runPromise(security({ _tag: "Locate", key: "key" }))
  expect(reply.status).toBe(status)
  expect(Redacted.value(reply.output)).toBe("private-metadata")
  expect(JSON.stringify(reply)).not.toContain("private-metadata")
})

it.each([
  { error: { code: "ENOENT", message: "private-error" }, output: "private-output" },
  { error: null, output: 42 }
])("rejects unavailable processes and malformed output safely", async ({ error, output }) => {
  const security = makeMacosSecurity((_args, complete) => {
    complete(error, output)
    return { exitCode: 0, signalCode: null, kill: () => true }
  })
  const result = await Effect.runPromise(security({ _tag: "Locate", key: "key" }).pipe(Effect.result))
  expect(Result.isFailure(result)).toBe(true)
  expect(JSON.stringify(result)).not.toContain("private-")
})

effectIt.effect("bounds a stalled metadata query and terminates its process", () =>
  Effect.gen(function* () {
    const states: ReadonlyArray<{ exitCode: number | null; signalCode: NodeJS.Signals | null; kill: boolean }> = [
      { exitCode: null, signalCode: null, kill: true },
      { exitCode: 0, signalCode: null, kill: false },
      { exitCode: null, signalCode: "SIGTERM", kill: false }
    ]
    for (const state of states) {
      const entered = yield* Deferred.make<void>()
      let killed = false
      const security = makeMacosSecurity(() => {
        Effect.runSync(Deferred.succeed(entered, undefined))
        return {
          exitCode: state.exitCode,
          signalCode: state.signalCode,
          kill: () => {
            killed = true
            return true
          }
        }
      })
      const fiber = yield* security({ _tag: "Locate", key: "key" }).pipe(Effect.result, Effect.forkChild)
      yield* Deferred.await(entered)
      yield* TestClock.adjust("10 seconds")
      expect(Result.isFailure(yield* Fiber.join(fiber))).toBe(true)
      expect(killed).toBe(state.kill)
    }
  })
)
