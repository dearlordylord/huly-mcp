import type { Socket } from "node:net"
import * as NodeSink from "@effect/platform-node/NodeSink"
import * as NodeStream from "@effect/platform-node/NodeStream"
import { Effect, PlatformError, Stdio } from "effect"

const socketError = (cause: unknown) =>
  PlatformError.systemError({ module: "Stdio", method: "nativeSocket", _tag: "Unknown", cause })

export const nativeSocketStdio = (socket: Socket) =>
  Stdio.make({
    args: Effect.succeed([]),
    stdin: NodeStream.fromReadable({ evaluate: () => socket, onError: socketError, closeOnDone: false }),
    stdout: () => NodeSink.fromWritable({ evaluate: () => socket, onError: socketError, endOnDone: false }),
    stderr: () => NodeSink.fromWritable({ evaluate: () => process.stderr, onError: socketError, endOnDone: false })
  })
