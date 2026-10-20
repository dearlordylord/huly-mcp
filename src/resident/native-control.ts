import type { Readable, Writable } from "node:stream"
import { Effect } from "effect"

import { nativeBridgeFailure, NATIVE_CONTROL_BYTES, NATIVE_STARTUP_MILLIS } from "./native-contract.js"

const LINE_FEED = 10

export const readNativeControl = (input: Readable) =>
  Effect.callback<string, ReturnType<typeof nativeBridgeFailure>>((resume) => {
    let pending = Buffer.alloc(0)
    let finished = false
    const cleanup = () => {
      input.pause()
      input.off("data", data)
      input.off("error", failed)
      input.off("end", failed)
      input.off("close", failed)
    }
    const complete = (result: Effect.Effect<string, ReturnType<typeof nativeBridgeFailure>>) => {
      if (finished) return
      finished = true
      cleanup()
      resume(result)
    }
    const failed = () => complete(Effect.fail(nativeBridgeFailure()))
    const data = (chunk: Buffer) => {
      if (pending.length + chunk.length > NATIVE_CONTROL_BYTES) return failed()
      pending = Buffer.concat([pending, chunk])
      const newline = pending.indexOf(LINE_FEED)
      if (newline < 0) return
      if (newline !== pending.length - 1) return failed()
      complete(Effect.succeed(pending.subarray(0, newline).toString("utf8")))
    }
    input.on("data", data)
    input.on("error", failed)
    input.on("end", failed)
    input.on("close", failed)
    input.resume()
    return Effect.sync(cleanup)
  }).pipe(Effect.timeout(NATIVE_STARTUP_MILLIS), Effect.mapError(nativeBridgeFailure))

export const writeNativeControl = (output: Writable, bytes: Uint8Array) =>
  Effect.tryPromise({
    try: () =>
      new Promise<void>((resolve, reject) => {
        output.write(bytes, (error) => (error ? reject(error) : resolve()))
      }),
    catch: nativeBridgeFailure
  }).pipe(Effect.timeout(NATIVE_STARTUP_MILLIS), Effect.mapError(nativeBridgeFailure))
