import { PassThrough, Writable } from "node:stream"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"

import { readNativeControl, writeNativeControl } from "../../src/resident/native-control.js"
import { NATIVE_CONTROL_BYTES } from "../../src/resident/native-contract.js"

describe("native bootstrap control channel", () => {
  it("assembles a fragmented bounded handshake and relinquishes the stream", async () => {
    const input = new PassThrough()
    const parsed = Effect.runPromise(readNativeControl(input))
    input.write('{"version":')
    input.write("1}\n")
    expect(await parsed).toBe('{"version":1}')
    expect(input.listenerCount("data")).toBe(0)
    expect(input.isPaused()).toBe(true)
    input.destroy()
  })

  it.each(["end", "close", "error", "overflow", "trailing"])("refuses %s before admission", async (kind) => {
    const input = new PassThrough()
    const parsed = Effect.runPromise(Effect.result(readNativeControl(input)))
    if (kind === "end") input.end()
    if (kind === "close") input.destroy()
    if (kind === "error") input.destroy(new Error("private socket cause"))
    if (kind === "overflow") input.write(Buffer.alloc(NATIVE_CONTROL_BYTES + 1))
    if (kind === "trailing") input.write("{}\nunauthorized-frame")
    const result = await parsed
    expect(result._tag).toBe("Failure")
    expect(JSON.stringify(result)).not.toContain("private socket cause")
    expect(input.listenerCount("data")).toBe(0)
    input.destroy()
  })

  it("writes control bytes and propagates a failed private write safely", async () => {
    const output = new PassThrough()
    await Effect.runPromise(writeNativeControl(output, new Uint8Array([1])))
    expect(output.read()).toEqual(Buffer.from([1]))
    output.destroy()
    const failed = new Writable({ write: (_chunk, _encoding, callback) => callback(new Error("private write cause")) })
    failed.on("error", () => {})
    const result = await Effect.runPromise(Effect.result(writeNativeControl(failed, new Uint8Array([1]))))
    expect(result._tag).toBe("Failure")
    expect(JSON.stringify(result)).not.toContain("private write cause")
    failed.destroy()
  })
})
