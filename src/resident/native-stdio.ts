import type { Socket } from "node:net"
import * as NodeSink from "@effect/platform-node/NodeSink"
import * as NodeStream from "@effect/platform-node/NodeStream"
import { Effect, PlatformError, Stdio, Stream, Sink } from "effect"

import { decodeNativeFrames, writeNativeData } from "./native-framing.js"

const socketError = (cause: unknown) =>
  PlatformError.systemError({ module: "Stdio", method: "nativeSocket", _tag: "Unknown", cause })

export const nativeSocketStdio = (socket: Socket, renew: Effect.Effect<void, unknown> = Effect.void) =>
  Stdio.make({
    args: Effect.succeed([]),
    stdin: NodeStream.fromReadable({ evaluate: () => socket, onError: socketError, closeOnDone: false }).pipe(
      decodeNativeFrames,
      Stream.mapEffect((frame) => (frame.length === 0 ? renew.pipe(Effect.as(frame)) : Effect.succeed(frame))),
      Stream.filter((frame) => frame.length > 0),
      Stream.mapError(socketError)
    ),
    stdout: () =>
      Sink.forEach((input: string | Uint8Array) => writeNativeData(socket, input).pipe(Effect.mapError(socketError))),
    stderr: () => NodeSink.fromWritable({ evaluate: () => process.stderr, onError: socketError, endOnDone: false })
  })
