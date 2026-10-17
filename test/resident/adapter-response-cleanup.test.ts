import { Cause, ConfigProvider, Deferred, Effect, Exit, Fiber, Layer, Stdio, Stream } from "effect"
import { expect, it } from "vitest"

import { runManualAdapter } from "../../src/resident/manual-adapter.js"
import { startResidentFixture } from "../helpers/resident-fixture.js"

const RESPONSE_BOUND = 5_000

it("closes an unsupported live response before returning from the adapter scope", { timeout: 15_000 }, async () => {
  const disconnected = await Effect.runPromise(Deferred.make<void>())
  const fixture = await startResidentFixture((_request, response) => {
    response.once("close", () => Effect.runSync(Deferred.succeed(disconnected, undefined)))
    response.writeHead(200, { "content-type": "text/html" })
    response.write("private backend payload")
  }, "private-fixture-auth")
  try {
    const request = new TextEncoder().encode(
      `${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "server/discover" })}\n`
    )
    const exit = await Effect.runPromiseExit(
      runManualAdapter().pipe(
        Effect.provide(
          Layer.merge(
            Stdio.layerTest({ stdin: Stream.concat(Stream.make(request), Stream.never) }),
            ConfigProvider.layer(ConfigProvider.fromUnknown({ MCP_RESIDENT_ATTACHMENT_FILE: fixture.file }))
          )
        )
      )
    )
    expect(Exit.isFailure(exit)).toBe(true)
    await Effect.runPromise(Deferred.await(disconnected).pipe(Effect.timeout(RESPONSE_BOUND)))
  } finally {
    await fixture.cleanup()
  }
})

it("aborts an owned request interrupted before response headers arrive", { timeout: 15_000 }, async () => {
  const arrived = await Effect.runPromise(Deferred.make<void>())
  const disconnected = await Effect.runPromise(Deferred.make<void>())
  const fixture = await startResidentFixture((_request, response) => {
    response.once("close", () => Effect.runSync(Deferred.succeed(disconnected, undefined)))
    Effect.runSync(Deferred.succeed(arrived, undefined))
  }, "private-fixture-auth")
  const request = new TextEncoder().encode('{"jsonrpc":"2.0","id":1,"method":"server/discover"}\n')
  const fiber = Effect.runFork(
    runManualAdapter().pipe(
      Effect.provide(
        Layer.merge(
          Stdio.layerTest({ stdin: Stream.concat(Stream.make(request), Stream.never) }),
          ConfigProvider.layer(ConfigProvider.fromUnknown({ MCP_RESIDENT_ATTACHMENT_FILE: fixture.file }))
        )
      )
    )
  )
  try {
    await Effect.runPromise(Deferred.await(arrived).pipe(Effect.timeout(RESPONSE_BOUND)))
    await Effect.runPromise(Fiber.interrupt(fiber).pipe(Effect.timeout(RESPONSE_BOUND)))
    await Effect.runPromise(Deferred.await(disconnected).pipe(Effect.timeout(RESPONSE_BOUND)))
  } finally {
    await Effect.runPromise(Fiber.interrupt(fiber))
    await fixture.cleanup()
  }
})

it.each(["initialize", "duplicate", "capacity"])(
  "rejects overlapping %s admission before opening excess backend requests",
  { timeout: 15_000 },
  async (mode) => {
    const arrived = await Effect.runPromise(Deferred.make<void>())
    let requests = 0
    const fixture = await startResidentFixture(() => {
      requests += 1
      Effect.runSync(Deferred.succeed(arrived, undefined))
    }, "private-fixture-auth")
    try {
      const encode = (id: number) =>
        new TextEncoder().encode(
          `${JSON.stringify({ jsonrpc: "2.0", id, method: mode === "initialize" ? "initialize" : "ping" })}\n`
        )
      const stdin = Stream.concat(
        Stream.make(encode(1)),
        Stream.concat(
          Stream.fromEffect(
            Deferred.await(arrived).pipe(
              Effect.as(
                mode === "capacity"
                  ? new TextEncoder().encode(
                      Array.from({ length: 8 }, (_, index) => new TextDecoder().decode(encode(index + 2))).join("")
                    )
                  : encode(mode === "duplicate" ? 1 : 2)
              )
            )
          ),
          Stream.never
        )
      )
      const exit = await Effect.runPromiseExit(
        runManualAdapter().pipe(
          Effect.provide(
            Layer.merge(
              Stdio.layerTest({ stdin }),
              ConfigProvider.layer(ConfigProvider.fromUnknown({ MCP_RESIDENT_ATTACHMENT_FILE: fixture.file }))
            )
          ),
          Effect.timeout(RESPONSE_BOUND)
        )
      )
      expect(Exit.isFailure(exit) && Cause.pretty(exit.cause)).toContain(
        mode === "initialize" ? "initialization already started" : "admission limit"
      )
      expect(requests).toBeLessThanOrEqual(mode === "capacity" ? 8 : 1)
    } finally {
      await fixture.cleanup()
    }
  }
)
