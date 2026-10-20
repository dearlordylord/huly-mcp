import { PassThrough } from "node:stream"
import { Effect, Result, Stream } from "effect"
import { expect, it } from "vitest"

import { decodeNativeFrames, writeNativeData, writeNativeFrame } from "../../src/resident/native-framing.js"
import { NATIVE_FRAME_BYTES } from "../../src/resident/native-wire.js"

const frame = (body: Uint8Array) => {
  const header = Buffer.alloc(4)
  header.writeUInt32BE(body.length)
  return Buffer.concat([header, body])
}
const collect = (chunks: ReadonlyArray<Uint8Array>) =>
  Effect.runPromise(Stream.fromIterable(chunks).pipe(decodeNativeFrames, Stream.runCollect))

it("preserves opaque bytes and heartbeats at every header and body split", async () => {
  const body = Buffer.from([0, 255, 10, 13, 42])
  const bytes = Buffer.concat([frame(body), frame(Buffer.alloc(0)), frame(body)])
  for (let split = 0; split <= bytes.length; split++) {
    const frames = await collect([bytes.subarray(0, split), bytes.subarray(split)])
    expect(frames.map((value) => Array.from(value))).toEqual([Array.from(body), [], Array.from(body)])
  }
})

it("accepts a full-size frame across header and body splits", async () => {
  const body = Buffer.alloc(NATIVE_FRAME_BYTES, 42)
  const bytes = frame(body)
  const frames = await collect([bytes.subarray(0, 2), bytes.subarray(2, 5), bytes.subarray(5)])
  expect(frames).toHaveLength(1)
  expect(Buffer.from(frames[0] ?? [])).toEqual(body)
})

it.each([
  Buffer.from([0]),
  Buffer.from([0, 0, 0, 1]),
  Buffer.from([0, 0, 0, 2, 42]),
  Buffer.from([255, 255, 255, 255])
])("rejects a truncated or oversized frame without emitting its body", async (bytes) => {
  const result = await Effect.runPromise(Stream.make(bytes).pipe(decodeNativeFrames, Stream.runCollect, Effect.result))
  expect(Result.isFailure(result)).toBe(true)
})

it("keeps decoder state private to each subscription", async () => {
  const input = Stream.make(frame(Buffer.from("opaque"))).pipe(decodeNativeFrames)
  const [first, second] = await Promise.all([
    Effect.runPromise(Stream.runCollect(input)),
    Effect.runPromise(Stream.runCollect(input))
  ])
  expect(first).toEqual(second)
})

it("encodes large replies in bounded frames and keeps diagnostics separate", async () => {
  const output = new PassThrough()
  const chunks: Array<Buffer> = []
  output.on("data", (chunk: Buffer) => chunks.push(chunk))
  const bytes = Buffer.alloc(NATIVE_FRAME_BYTES + 2, 42)
  await Effect.runPromise(writeNativeData(output, bytes))
  await Effect.runPromise(writeNativeData(output, "opaque\n"))
  await Effect.runPromise(writeNativeData(output, ""))
  const decoded = await collect(chunks)
  expect(decoded.map((body) => body.length)).toEqual([NATIVE_FRAME_BYTES, 2, 7])
  expect(Buffer.concat(decoded)).toEqual(Buffer.concat([bytes, Buffer.from("opaque\n")]))
  chunks.length = 0
  await Effect.runPromise(writeNativeFrame(output, Buffer.from("safe diagnostic"), true))
  const diagnostic = Buffer.concat(chunks)
  expect(diagnostic.readUInt32BE(0)).toBe(2_147_483_648 + Buffer.byteLength("safe diagnostic"))
  expect(diagnostic.subarray(4).toString()).toBe("safe diagnostic")
  chunks.length = 0
  const result = await Effect.runPromise(
    writeNativeFrame(output, Buffer.alloc(NATIVE_FRAME_BYTES + 1)).pipe(Effect.result)
  )
  expect(Result.isFailure(result)).toBe(true)
  expect(chunks).toEqual([])
  output.destroy()
})
