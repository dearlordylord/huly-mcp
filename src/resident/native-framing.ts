import type { Writable } from "node:stream"
import { Effect, Schema, Stream } from "effect"

import { nativeBridgeFailure } from "./native-contract.js"
import { NATIVE_FRAME_BYTES, NATIVE_FRAME_HEADER_BYTES, NATIVE_DIAGNOSTIC_FLAG } from "./native-wire.js"

import { writeNativeControl } from "./native-control.js"

const FrameLength = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: NATIVE_FRAME_BYTES }))

// Each subscription owns its bounded partial frame; zero-length frames are transport heartbeats.
export const decodeNativeFrames = <E, R>(input: Stream.Stream<Uint8Array, E, R>) =>
  Stream.unwrap(
    Effect.sync(() => {
      let pending = Buffer.alloc(0)
      let length: Schema.Schema.Type<typeof FrameLength> | undefined
      return input.pipe(
        Stream.mapEffect((chunk) =>
          Effect.gen(function* () {
            const frames: Array<Uint8Array> = []
            let offset = 0
            while (offset < chunk.length) {
              const required = length ?? NATIVE_FRAME_HEADER_BYTES
              const take = Math.min(required - pending.length, chunk.length - offset)
              pending = Buffer.concat([pending, chunk.subarray(offset, offset + take)])
              offset += take
              if (pending.length !== required) continue
              if (length === undefined) {
                length = yield* Schema.decodeUnknownEffect(FrameLength)(pending.readUInt32BE(0)).pipe(
                  Effect.mapError(nativeBridgeFailure)
                )
                pending = Buffer.alloc(0)
                if (length !== 0) continue
              }
              frames.push(pending)
              pending = Buffer.alloc(0)
              length = undefined
            }
            return frames
          })
        ),
        Stream.flattenIterable,
        Stream.concat(
          Stream.unwrap(
            Effect.suspend(() =>
              pending.length === 0 && length === undefined
                ? Effect.succeed(Stream.empty)
                : Effect.fail(nativeBridgeFailure())
            )
          )
        )
      )
    })
  )

export const writeNativeFrame = (output: Writable, data: Uint8Array, diagnostic = false) =>
  Effect.gen(function* () {
    yield* Schema.decodeUnknownEffect(FrameLength)(data.length).pipe(Effect.mapError(nativeBridgeFailure))
    const header = Buffer.alloc(NATIVE_FRAME_HEADER_BYTES)
    header.writeUInt32BE(data.length + (diagnostic ? NATIVE_DIAGNOSTIC_FLAG : 0))
    yield* writeNativeControl(output, Buffer.concat([header, data]))
  })

export const writeNativeData = (output: Writable, input: string | Uint8Array) =>
  Effect.gen(function* () {
    const bytes = typeof input === "string" ? Buffer.from(input) : input
    for (let offset = 0; offset < bytes.length; offset += NATIVE_FRAME_BYTES) {
      yield* writeNativeFrame(output, bytes.subarray(offset, offset + NATIVE_FRAME_BYTES))
    }
  })
