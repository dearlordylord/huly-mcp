import { Effect, Redacted, Schema } from "effect"
import { expect, it } from "vitest"

import {
  encodeChildReply,
  encodeChildStart,
  parseChildReply,
  parseChildStart
} from "../../src/resident/bootstrap-codec.js"
import { BootstrapNonce, MAX_BOOTSTRAP_BYTES } from "../../src/resident/managed-contract.js"
import { ResidentDirectory } from "../../src/resident/protected-path.js"
import { captureResidentSelection } from "../../src/resident/selection-config.js"

const start = Effect.gen(function* () {
  const capture = yield* captureResidentSelection({
    HULY_URL: "https://bootstrap.invalid",
    HULY_WORKSPACE: "bootstrap",
    HULY_EMAIL: "fixture-email",
    HULY_PASSWORD: "fixture-private-password"
  })
  return {
    kind: "start",
    version: 1,
    nonce: Schema.decodeUnknownSync(BootstrapNonce)("d".repeat(64)),
    directory: ResidentDirectory.make("/private-bootstrap-fixture"),
    capture
  } satisfies Parameters<typeof encodeChildStart>[0]
})

it("round-trips captured password authority only inside a redacted private frame", async () => {
  const frame = await Effect.runPromise(start)
  const encoded = await Effect.runPromise(encodeChildStart(frame))
  expect(JSON.stringify(encoded)).not.toContain("fixture-private-password")
  const decoded = await Effect.runPromise(parseChildStart(Redacted.value(encoded)))
  expect(decoded.capture.runtimeContext).toEqual(frame.capture.runtimeContext)
  expect(decoded.capture.selection.huly.auth._tag).toBe("password")
  if (decoded.capture.selection.huly.auth._tag === "password")
    expect(Redacted.value(decoded.capture.selection.huly.auth.password)).toBe("fixture-private-password")
})

it("refuses malformed, unknown-version, non-string and oversized UTF-8 frames with static errors", async () => {
  for (const input of [null, {}, "{", '{"kind":"refused","version":2}', "é".repeat(MAX_BOOTSTRAP_BYTES)]) {
    const error = await Effect.runPromise(parseChildReply(input).pipe(Effect.flip))
    expect(error.reason).toBe("ipc")
    expect(JSON.stringify(error)).not.toContain("é")
  }
  const error = await Effect.runPromise(parseChildStart("fixture-private-password").pipe(Effect.flip))
  expect(JSON.stringify(error)).not.toContain("fixture-private-password")
})

it("bounds serialized Start bytes before process creation and preserves reply variants", async () => {
  const frame = await Effect.runPromise(start)
  const oversized = { ...frame, directory: ResidentDirectory.make("é".repeat(MAX_BOOTSTRAP_BYTES)) }
  expect((await Effect.runPromise(encodeChildStart(oversized).pipe(Effect.flip))).reason).toBe("ipc")
  for (const reply of [
    { kind: "refused", version: 1 },
    { kind: "ready", version: 1, file: "/private-fixture/generation.json" }
  ]) {
    const parsed = await Effect.runPromise(parseChildReply(JSON.stringify(reply)))
    const encoded = await Effect.runPromise(encodeChildReply(parsed))
    expect(await Effect.runPromise(parseChildReply(Redacted.value(encoded)))).toEqual(parsed)
  }
})
