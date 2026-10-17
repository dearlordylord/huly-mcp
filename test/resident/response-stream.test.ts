import { Effect, Result, Schema, Stream } from "effect"
import { describe, expect, it } from "vitest"

import {
  advanceBackendResponse,
  BackendMessage,
  decodeBackendMessages,
  finishBackendResponse
} from "../../src/resident/response-stream.js"

const encode = (text: string) => new TextEncoder().encode(text)
const result = { jsonrpc: "2.0", id: 1, result: { name: "first host" } }
const progress = { jsonrpc: "2.0", method: "notifications/progress", params: { progressToken: "first", progress: 1 } }
const collect = (contentType: string, chunks: ReadonlyArray<string>, maxBytes = 1024) =>
  Effect.runPromise(
    decodeBackendMessages({ body: Stream.fromIterable(chunks.map(encode)), contentType, maxBytes }).pipe(
      Stream.runCollect
    )
  )

describe("resident backend response stream", () => {
  it("decodes a chunked JSON reply", async () => {
    expect(await collect("application/json; charset=utf-8", [JSON.stringify(result)])).toEqual([result])
  })

  it("delivers progress before the SSE connection completes", async () => {
    const stream = Stream.concat(
      Stream.make(encode(`: keepalive\r\n\r\ndata: ${JSON.stringify(progress)}\r\n\r\n`)),
      Stream.never
    )
    const messages = decodeBackendMessages({ body: stream, contentType: "text/event-stream", maxBytes: 1024 })
    expect(await Effect.runPromise(messages.pipe(Stream.take(1), Stream.runCollect))).toEqual([progress])
  })

  it("preserves progress and final replies across arbitrary SSE chunk boundaries", async () => {
    const text = `: comment\n\ndata: ${JSON.stringify(progress)}\n\ndata: ${JSON.stringify(result)}\n\n`
    expect(await collect("text/event-stream", Array.from(text))).toEqual([progress, result])
  })

  it("rejects JSON bodies exceeding the bound", async () => {
    await expect(collect("application/json", [JSON.stringify(result)], 1)).rejects.toThrow("Backend response exceeded")
  })

  it("rejects oversized SSE events", async () => {
    await expect(collect("text/event-stream", [`data: ${JSON.stringify(result)}\n\n`], 1)).rejects.toThrow()
  })

  it("rejects unsupported content without reflecting the body", async () => {
    await expect(collect("text/html", ["private backend payload"])).rejects.toThrow("Unsupported backend response")
  })

  it("does not discard the id of an unsupported interactive request", async () => {
    await expect(
      collect("application/json", [
        JSON.stringify({ jsonrpc: "2.0", id: 1, method: "sampling/createMessage", params: {} })
      ])
    ).rejects.toThrow("Invalid backend protocol response")
  })
})

it("enforces response ownership and one terminal reply per request", () => {
  const notification = { jsonrpc: "2.0", method: "notifications/progress" }
  const parse = Schema.decodeUnknownSync(BackendMessage)
  expect(advanceBackendResponse("awaiting", 1, parse(notification))).toEqual(Result.succeed("awaiting"))
  expect(advanceBackendResponse("awaiting", 1, parse(result))).toEqual(Result.succeed("answered"))
  expect(Result.isFailure(advanceBackendResponse("awaiting", 2, parse(result)))).toBe(true)
  expect(Result.isFailure(advanceBackendResponse("answered", 1, parse(result)))).toBe(true)
  expect(Result.isFailure(finishBackendResponse("awaiting", 1))).toBe(true)
  expect(Result.isSuccess(finishBackendResponse("answered", 1))).toBe(true)
  expect(Result.isSuccess(finishBackendResponse("awaiting", undefined))).toBe(true)
})
