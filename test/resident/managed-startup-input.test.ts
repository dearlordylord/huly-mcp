import { PassThrough } from "node:stream"
import { it } from "@effect/vitest"
import { Deferred, Effect, Fiber } from "effect"
import { expect } from "vitest"

import { withManagedStartupInput } from "../../src/resident/managed-startup-input.js"

it.effect("empty EOF interrupts startup and joins its cleanup", () =>
  Effect.gen(function* () {
    const input = new PassThrough()
    const entered = yield* Deferred.make<void>()
    let cleaned = false
    const running = yield* withManagedStartupInput(input, () =>
      Deferred.succeed(entered, undefined).pipe(
        Effect.andThen(Effect.never),
        Effect.ensuring(
          Effect.sync(() => {
            cleaned = true
          })
        )
      )
    ).pipe(Effect.forkChild)
    yield* Deferred.await(entered)
    input.end()
    yield* Fiber.join(running)
    expect(cleaned).toBe(true)
    expect(input.listenerCount("end")).toBe(0)
    expect(input.listenerCount("error")).toBe(0)
    expect(input.listenerCount("readable")).toBe(0)
  })
)

it.effect("preserves buffered request bytes and transfers EOF ownership to the bridge", () =>
  Effect.gen(function* () {
    const input = new PassThrough()
    const request = Buffer.from('{"method":"server/discover","id":1}\n')
    const received: Buffer[] = []
    yield* withManagedStartupInput(input, (handoff) =>
      Effect.gen(function* () {
        yield* Effect.promise(
          () =>
            new Promise<void>((resolve) => {
              input.once("readable", resolve)
              input.write(request)
            })
        )
        yield* handoff(
          Effect.promise(async () => {
            expect(input.listenerCount("end")).toBe(0)
            expect(input.listenerCount("error")).toBe(0)
            expect(input.listenerCount("readable")).toBe(0)
            input.end()
            for await (const chunk of input) received.push(Buffer.from(chunk))
          })
        )
      })
    )
    expect(Buffer.concat(received)).toEqual(request)
  })
)

it.effect("rejects handoff after an observed stdin failure", () =>
  Effect.gen(function* () {
    const input = new PassThrough()
    let dispatched = false
    const error = yield* withManagedStartupInput(input, (handoff) =>
      Effect.uninterruptible(
        Effect.promise(
          () =>
            new Promise<void>((resolve) => {
              input.once("error", resolve)
              input.destroy(new Error("private delayed input failure"))
            })
        ).pipe(
          Effect.andThen(
            handoff(
              Effect.sync(() => {
                dispatched = true
              })
            )
          )
        )
      )
    ).pipe(Effect.flip)

    expect(error._tag).toBe("BackendResponseError")
    expect(error.message).not.toContain("private delayed input failure")
    expect(dispatched).toBe(false)
    expect(input.listenerCount("readable")).toBe(0)
    expect(input.listenerCount("error")).toBe(0)
  })
)

it.effect("EOF after handoff does not cancel active bridge work", () =>
  Effect.gen(function* () {
    const input = new PassThrough()
    const admitted = yield* Deferred.make<void>()
    const ended = yield* Deferred.make<void>()
    const release = yield* Deferred.make<void>()
    const running = yield* withManagedStartupInput(input, (handoff) =>
      handoff(
        Effect.gen(function* () {
          input.once("end", () => Deferred.doneUnsafe(ended, Effect.void))
          input.resume()
          yield* Deferred.succeed(admitted, undefined)
          yield* Deferred.await(release)
        })
      )
    ).pipe(Effect.forkChild)
    yield* Deferred.await(admitted)
    input.end()
    yield* Deferred.await(ended)
    expect(running.pollUnsafe()).toBeUndefined()
    yield* Deferred.succeed(release, undefined)
    yield* Fiber.join(running)
  })
)

it.effect("reports an input failure without exposing the underlying error", () =>
  Effect.gen(function* () {
    const input = new PassThrough()
    const entered = yield* Deferred.make<void>()
    const running = yield* withManagedStartupInput(input, () =>
      Deferred.succeed(entered, undefined).pipe(Effect.andThen(Effect.never))
    ).pipe(Effect.flip, Effect.forkChild)
    yield* Deferred.await(entered)
    input.destroy(new Error("private input details"))
    const error = yield* Fiber.join(running)
    expect(error._tag).toBe("BackendResponseError")
    expect(error.message).not.toContain("private input details")
    expect(input.listenerCount("end")).toBe(0)
    expect(input.listenerCount("error")).toBe(0)
  })
)

it.effect("owns pending destruction errors even when startup immediately attempts handoff", () =>
  Effect.gen(function* () {
    const input = new PassThrough()
    input.destroy(new Error("private pending destruction"))
    let dispatched = false
    const error = yield* withManagedStartupInput(input, (handoff) =>
      handoff(
        Effect.sync(() => {
          dispatched = true
        })
      )
    ).pipe(Effect.flip)
    expect(error._tag).toBe("BackendResponseError")
    expect(error.message).not.toContain("private pending destruction")
    expect(input.listenerCount("error")).toBe(0)
    expect(input.listenerCount("close")).toBe(0)
    expect(dispatched).toBe(false)
  })
)

it.effect("does not dispatch startup after stdin has already ended", () =>
  Effect.gen(function* () {
    const input = new PassThrough()
    const ended = new Promise<void>((resolve) => {
      input.once("end", resolve)
      input.resume()
    })
    input.end()
    yield* Effect.promise(() => ended)

    let attemptedHandoff = false
    let dispatched = false
    yield* withManagedStartupInput(input, (handoff) => {
      attemptedHandoff = true
      return handoff(
        Effect.sync(() => {
          dispatched = true
        })
      )
    })

    expect(attemptedHandoff).toBe(true)
    expect(dispatched).toBe(false)
    expect(input.listenerCount("end")).toBe(0)
    expect(input.listenerCount("error")).toBe(0)
    expect(input.listenerCount("readable")).toBe(0)
  })
)

it.effect("rejects a second startup handoff after bridge ownership has transferred", () =>
  Effect.gen(function* () {
    const input = new PassThrough()
    let firstDispatch = false
    let secondDispatch = false
    const error = yield* withManagedStartupInput(input, (handoff) =>
      Effect.gen(function* () {
        yield* handoff(
          Effect.sync(() => {
            firstDispatch = true
          })
        )
        return yield* handoff(
          Effect.sync(() => {
            secondDispatch = true
          })
        )
      })
    ).pipe(Effect.flip)

    expect(error._tag).toBe("BackendResponseError")
    expect(error.message).toContain("already transferred")
    expect(firstDispatch).toBe(true)
    expect(secondDispatch).toBe(false)
    expect(input.listenerCount("readable")).toBe(0)
  })
)
