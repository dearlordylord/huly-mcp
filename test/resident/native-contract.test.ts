import { Effect, Redacted, Schema } from "effect"
import { describe, expect, it } from "vitest"

import { NativeHello, NativeSocketPath, parseNativeHello } from "../../src/resident/native-contract.js"

const authorization = Redacted.make("channel-secret")
const hello = Schema.decodeUnknownSync(NativeHello)({
  version: 1,
  authorization: "channel-secret",
  attachmentToken: "c".repeat(64),
  proof: {
    version: 1,
    implementation: "0.55.0",
    generation: "11111111-1111-4111-8111-111111111111",
    nonce: "a".repeat(64),
    mac: "b".repeat(64)
  }
})
const encoded = Schema.encodeSync(Schema.fromJsonString(NativeHello))(hello)

describe("native resident handshake boundary", () => {
  it("parses an authorized proof without exposing the bearer", async () => {
    const parsed = await Effect.runPromise(parseNativeHello(encoded, authorization))
    expect(parsed.proof.generation).toBe("11111111-1111-4111-8111-111111111111")
    expect(JSON.stringify(parsed.authorization)).not.toContain("channel-secret")
  })

  it.each(["invalid", "{}", encoded.replace("channel-secret", "wrong-secret"), encoded.replace("channel-secret", "x")])(
    "refuses malformed or unauthorized handshakes",
    async (input) => {
      const result = await Effect.runPromise(Effect.result(parseNativeHello(input, authorization)))
      expect(result._tag).toBe("Failure")
      expect(JSON.stringify(result)).not.toContain("channel-secret")
    }
  )

  it.each(["relative", "/bad\npath", "/bad\rpath", "/bad\0path", `/${"a".repeat(103)}`])(
    "refuses unsafe or unrepresentable Unix socket paths",
    (input) => expect(Schema.decodeUnknownResult(NativeSocketPath)(input)._tag).toBe("Failure")
  )

  it("accepts a short absolute socket path", () => {
    expect(Schema.decodeUnknownSync(NativeSocketPath)("/tmp/huly-native-abc/channel")).toBe(
      "/tmp/huly-native-abc/channel"
    )
  })
})
