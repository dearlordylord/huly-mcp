import { it as effectIt } from "@effect/vitest"
import { TestClock } from "effect/testing"
import { Cause, ConfigProvider, Deferred, Effect, Exit, Fiber, Layer, Queue, Sink, Stdio, Stream } from "effect"
import { expect, it } from "vitest"

import { runManualAdapter } from "../../src/resident/manual-adapter.js"
import { startResidentFixture } from "../helpers/resident-fixture.js"

import type { ServerResponse } from "node:http"

const HTTP_OK = 200
const HTTP_FORBIDDEN = 403
const HTTP_NO_CONTENT = 204
const BOUND = "5 seconds"
const reply = JSON.stringify({ jsonrpc: "2.0", id: 1, result: {} })
const progress = JSON.stringify({ jsonrpc: "2.0", method: "notifications/progress", params: { progress: 1 } })
const input = new TextEncoder().encode('{"jsonrpc":"2.0","id":1,"method":"initialize"}\n')

it.each([
  {
    label: "missing content type",
    status: HTTP_OK,
    type: undefined,
    body: reply,
    error: "Unsupported backend response"
  },
  {
    label: "rejected status",
    status: HTTP_FORBIDDEN,
    type: "application/json",
    body: "private",
    error: "Backend rejected"
  },
  {
    label: "missing terminal reply",
    status: HTTP_NO_CONTENT,
    type: "application/json",
    body: "",
    error: "without a terminal response"
  },
  {
    label: "foreign response",
    status: HTTP_OK,
    type: "application/json",
    body: '{"jsonrpc":"2.0","id":2,"result":{}}',
    error: "another request"
  },
  {
    label: "duplicate terminal reply",
    status: HTTP_OK,
    type: "text/event-stream",
    body: `data: ${reply}\n\ndata: ${reply}\n\n`,
    error: "duplicate terminal"
  },
  {
    label: "unfinished stream",
    status: HTTP_OK,
    type: "text/event-stream",
    body: `data: ${progress}\n\n`,
    error: "without a terminal response"
  }
])("fails $label without retrying the request", async ({ body, error, status, type }) => {
  let calls = 0
  const fixture = await startResidentFixture((_request, response) => {
    calls++
    response.writeHead(status, type === undefined ? {} : { "content-type": type }).end(body)
  }, "boundary-fixture")
  try {
    const exit = await Effect.runPromiseExit(
      runManualAdapter.pipe(
        Effect.provide(
          Layer.merge(
            Stdio.layerTest({ stdin: Stream.concat(Stream.make(input), Stream.never) }),
            ConfigProvider.layer(ConfigProvider.fromUnknown({ MCP_RESIDENT_ATTACHMENT_FILE: fixture.file }))
          )
        ),
        Effect.timeout(BOUND)
      )
    )
    expect(Exit.isFailure(exit) && Cause.pretty(exit.cause)).toContain(error)
    expect(calls).toBe(1)
  } finally {
    await fixture.cleanup()
  }
})

it.each(["application/json", "text/event-stream"])("flushes %s replies before clean EOF", async (contentType) => {
  const done = Effect.runSync(Deferred.make<void>())
  const output: Array<string> = []
  const fixture = await startResidentFixture((_request, response) => {
    response
      .writeHead(HTTP_OK, {
        "content-type": contentType,
        "mcp-session-id": "owned-legacy-session",
        "mcp-protocol-version": "2025-06-18"
      })
      .end(contentType === "application/json" ? reply : `data: ${progress}\n\ndata: ${reply}\n\n`)
  }, "boundary-fixture")
  try {
    await Effect.runPromise(
      runManualAdapter.pipe(
        Effect.provide(
          Layer.merge(
            Stdio.layerTest({
              stdin: Stream.concat(Stream.make(input), Stream.fromEffectDrain(Deferred.await(done))),
              stdout: () =>
                Sink.forEach((value) =>
                  Effect.sync(() => {
                    const text = typeof value === "string" ? value : new TextDecoder().decode(value)
                    output.push(text)
                    if (text.includes('"result"')) Effect.runSync(Deferred.succeed(done, undefined))
                  })
                )
            }),
            ConfigProvider.layer(ConfigProvider.fromUnknown({ MCP_RESIDENT_ATTACHMENT_FILE: fixture.file }))
          )
        ),
        Effect.timeout(BOUND)
      )
    )
    expect(output.join("")).toBe(contentType === "application/json" ? `${reply}\n` : `${progress}\n${reply}\n`)
  } finally {
    await fixture.cleanup()
  }
})

it("rejects an unterminated oversized input before dispatch", async () => {
  let calls = 0
  const fixture = await startResidentFixture(() => {
    calls++
  }, "boundary-fixture")
  try {
    const exit = await Effect.runPromiseExit(
      runManualAdapter.pipe(
        Effect.provide(
          Layer.merge(
            Stdio.layerTest({ stdin: Stream.make(new Uint8Array(1024 * 1024 + 1).fill(32)) }),
            ConfigProvider.layer(ConfigProvider.fromUnknown({ MCP_RESIDENT_ATTACHMENT_FILE: fixture.file }))
          )
        ),
        Effect.timeout(BOUND)
      )
    )
    expect(Exit.isFailure(exit) && Cause.pretty(exit.cause)).toContain("input exceeded its message budget")
    expect(calls).toBe(0)
  } finally {
    await fixture.cleanup()
  }
})

it("uses its negotiated legacy session for the next request", async () => {
  const stdin = Effect.runSync(Queue.unbounded<Uint8Array, Cause.Done>())
  const seen: Array<string | string[] | undefined> = []
  let count = 0
  const fixture = await startResidentFixture((request, response) => {
    seen.push(request.headers["mcp-session-id"])
    count++
    response
      .writeHead(HTTP_OK, {
        "content-type": "application/json",
        "mcp-session-id": "owned-session",
        "mcp-protocol-version": "2025-06-18"
      })
      .end(JSON.stringify({ jsonrpc: "2.0", id: count, result: {} }))
  }, "boundary-fixture")
  let replies = 0
  try {
    Effect.runSync(Queue.offer(stdin, input))
    await Effect.runPromise(
      runManualAdapter.pipe(
        Effect.provide(
          Layer.merge(
            Stdio.layerTest({
              stdin: Stream.fromQueue(stdin),
              stdout: () =>
                Sink.forEach(() =>
                  Effect.gen(function* () {
                    replies++
                    if (replies === 1)
                      yield* Queue.offer(stdin, new TextEncoder().encode('{"jsonrpc":"2.0","id":2,"method":"ping"}\n'))
                    else yield* Queue.end(stdin)
                  })
                )
            }),
            ConfigProvider.layer(ConfigProvider.fromUnknown({ MCP_RESIDENT_ATTACHMENT_FILE: fixture.file }))
          )
        ),
        Effect.timeout(BOUND)
      )
    )
    expect(replies).toBe(2)
    expect(seen).toEqual([undefined, "owned-session"])
  } finally {
    await fixture.cleanup()
  }
})

it("cancels an active request and ends cleanly after the backend socket closes", async () => {
  const arrived = Effect.runSync(Deferred.make<void>())
  const closed = Effect.runSync(Deferred.make<void>())
  const fixture = await startResidentFixture((_request, response) => {
    response.once("close", () => Effect.runSync(Deferred.succeed(closed, undefined)))
    Effect.runSync(Deferred.succeed(arrived, undefined))
  }, "boundary-fixture")
  const cancellation = new TextEncoder().encode(
    '{"jsonrpc":"2.0","method":"notifications/cancelled","params":{"requestId":1}}\n'
  )
  try {
    await Effect.runPromise(
      runManualAdapter.pipe(
        Effect.provide(
          Layer.merge(
            Stdio.layerTest({
              stdin: Stream.concat(
                Stream.make(input),
                Stream.concat(
                  Stream.fromEffect(Deferred.await(arrived).pipe(Effect.as(cancellation))),
                  Stream.fromEffectDrain(Deferred.await(closed))
                )
              )
            }),
            ConfigProvider.layer(ConfigProvider.fromUnknown({ MCP_RESIDENT_ATTACHMENT_FILE: fixture.file }))
          )
        ),
        Effect.timeout(BOUND)
      )
    )
  } finally {
    await fixture.cleanup()
  }
})

effectIt.effect("stops when stdout exceeds its write allowance", () =>
  Effect.gen(function* () {
    const writing = yield* Deferred.make<void>()
    const fixture = yield* Effect.promise(() =>
      startResidentFixture((_request, response) => {
        response.writeHead(HTTP_OK, { "content-type": "application/json" }).end(reply)
      }, "boundary-fixture")
    )
    try {
      const bridge = yield* runManualAdapter.pipe(
        Effect.provide(
          Layer.merge(
            Stdio.layerTest({
              stdin: Stream.concat(Stream.make(input), Stream.never),
              stdout: () => Sink.fromEffect(Deferred.succeed(writing, undefined).pipe(Effect.andThen(Effect.never)))
            }),
            ConfigProvider.layer(ConfigProvider.fromUnknown({ MCP_RESIDENT_ATTACHMENT_FILE: fixture.file }))
          )
        ),
        Effect.exit,
        Effect.forkScoped
      )
      yield* Deferred.await(writing)
      yield* TestClock.adjust("10 seconds")
      const exit = yield* Fiber.join(bridge)
      expect(Exit.isFailure(exit) && Cause.pretty(exit.cause)).toContain("Stdio output failed or exceeded")
    } finally {
      yield* Effect.promise(fixture.cleanup)
    }
  }).pipe(Effect.scoped)
)

it("reports a stream disconnect after delivering progress without replay", async () => {
  const responseReady = Effect.runSync(Deferred.make<ServerResponse>())
  const fixture = await startResidentFixture((_request, response) => {
    response.writeHead(HTTP_OK, { "content-type": "text/event-stream" })
    response.write(`data: ${progress}\n\n`)
    Effect.runSync(Deferred.succeed(responseReady, response))
  }, "boundary-fixture")
  let delivered = 0
  try {
    const exit = await Effect.runPromiseExit(
      runManualAdapter.pipe(
        Effect.provide(
          Layer.merge(
            Stdio.layerTest({
              stdin: Stream.concat(Stream.make(input), Stream.never),
              stdout: () =>
                Sink.forEach(() =>
                  Effect.gen(function* () {
                    delivered++
                    const response = yield* Deferred.await(responseReady)
                    response.destroy(new Error("Private fixture disconnect"))
                  })
                )
            }),
            ConfigProvider.layer(ConfigProvider.fromUnknown({ MCP_RESIDENT_ATTACHMENT_FILE: fixture.file }))
          )
        ),
        Effect.timeout(BOUND)
      )
    )
    expect(Exit.isFailure(exit) && Cause.pretty(exit.cause)).toContain("Backend response disconnected")
    expect(delivered).toBe(1)
  } finally {
    await fixture.cleanup()
  }
})

it("flushes a notification response before clean EOF", async () => {
  const done = Effect.runSync(Deferred.make<void>())
  const fixture = await startResidentFixture((_request, response) => {
    response.writeHead(HTTP_OK, { "content-type": "application/json" }).end(progress)
  }, "boundary-fixture")
  try {
    await Effect.runPromise(
      runManualAdapter.pipe(
        Effect.provide(
          Layer.merge(
            Stdio.layerTest({
              stdin: Stream.concat(
                Stream.make(new TextEncoder().encode('{"jsonrpc":"2.0","method":"notifications/initialized"}\n')),
                Stream.fromEffectDrain(Deferred.await(done))
              ),
              stdout: () => Sink.forEach(() => Deferred.succeed(done, undefined).pipe(Effect.asVoid))
            }),
            ConfigProvider.layer(ConfigProvider.fromUnknown({ MCP_RESIDENT_ATTACHMENT_FILE: fixture.file }))
          )
        ),
        Effect.timeout(BOUND)
      )
    )
  } finally {
    await fixture.cleanup()
  }
})
