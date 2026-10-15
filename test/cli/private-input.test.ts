import { Readable } from "node:stream"
import { Effect, Fiber, Redacted, Result } from "effect"
import { expect, it } from "vitest"

import { readPrivateTokenInput } from "../../packages/huly-cli/src/private-input.js"

it("returns a typed failure when stdin was already closed", async () => {
  const input = new Readable({ read() {} })
  input.destroy()
  expect(Result.isFailure(await Effect.runPromise(readPrivateTokenInput(input).pipe(Effect.result)))).toBe(true)
  expect(input.listenerCount("data")).toBe(0)
})

it("parses and redacts token bytes at the input boundary", async () => {
  const input = Readable.from([Buffer.from("  private-"), Buffer.from("input-sentinel\n")])
  const token = await Effect.runPromise(readPrivateTokenInput(input))
  expect(Redacted.value(token)).toBe("private-input-sentinel")
  expect(JSON.stringify(token)).not.toContain("private-input-sentinel")
  expect(input.listenerCount("data")).toBe(0)
})

it.each([[], [Buffer.from(" \n")], [Buffer.alloc(65537, "x")], ["object-mode input is not a byte payload"]])(
  "returns a typed secret-free failure for invalid or oversized input",
  async (...chunks) => {
    const result = await Effect.runPromise(readPrivateTokenInput(Readable.from(chunks)).pipe(Effect.result))
    expect(Result.isFailure(result)).toBe(true)
  }
)

it("removes listeners when the read is interrupted", async () => {
  const input = new Readable({ read() {} })
  await Effect.runPromise(
    Effect.gen(function* () {
      const fiber = yield* readPrivateTokenInput(input).pipe(Effect.forkChild)
      yield* Effect.yieldNow
      yield* Fiber.interrupt(fiber)
    })
  )
  expect(input.listenerCount("data")).toBe(0)
  expect(input.listenerCount("end")).toBe(0)
  expect(input.listenerCount("error")).toBe(0)
  input.destroy()
})
