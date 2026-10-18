import { Effect, Redacted, Schema } from "effect"
import { describe, expect, it } from "vitest"

import { ProfileEnvironmentSchema } from "../../src/profiles/model.js"
import { parseManagedChildEnvironment } from "../../src/resident/managed-child-environment.js"
import { BootstrapNonce } from "../../src/resident/managed-contract.js"

const nonce = Schema.decodeUnknownSync(BootstrapNonce)("a".repeat(64))
const profileKeys = Object.keys(ProfileEnvironmentSchema.fields)
const privateKeys = [...profileKeys, "MCP_AUTH_TOKEN", "MCP_RESIDENT_BOOTSTRAP_NONCE", "MCP_TRANSPORT"]
const inherited = Object.fromEntries(
  privateKeys.flatMap((key) => [
    [key, "private-inherited-value"],
    [key.toLowerCase(), "private-alias-value"]
  ])
)

describe("managed child environment boundary", () => {
  it("removes inherited selection and authentication while preserving unrelated environment entries", async () => {
    const input = {
      ...Object.fromEntries(privateKeys.map((key) => [key, "private-inherited-value"])),
      Path: "fixture-search-path",
      EMPTY: "",
      ABSENT: undefined
    }
    const parsed = await Effect.runPromise(parseManagedChildEnvironment(input, nonce))
    expect(Object.keys(parsed).sort()).toEqual(["EMPTY", "MCP_RESIDENT_BOOTSTRAP_NONCE", "MCP_TRANSPORT", "Path"])
    expect(Redacted.value(parsed["MCP_TRANSPORT"] ?? Redacted.make(""))).toBe("resident-child")
    expect(Redacted.value(parsed["MCP_RESIDENT_BOOTSTRAP_NONCE"] ?? Redacted.make("")) === Redacted.value(nonce)).toBe(
      true
    )
    expect(Redacted.value(parsed["Path"] ?? Redacted.make(""))).toBe("fixture-search-path")
    expect(Redacted.value(parsed["EMPTY"] ?? Redacted.make("fallback"))).toBe("")
    expect(
      Object.entries(input).some(([key, value]) => key === "MCP_TRANSPORT" && value === "private-inherited-value")
    ).toBe(true)
  })

  it("preserves distinct lowercase keys on supported POSIX platforms", async () => {
    const parsed = await Effect.runPromise(parseManagedChildEnvironment(inherited, nonce))
    expect(profileKeys.every((key) => !(key in parsed))).toBe(true)
    expect(privateKeys.every((key) => key.toLowerCase() in parsed)).toBe(true)
    expect("MCP_AUTH_TOKEN" in parsed).toBe(false)
    expect(Redacted.value(parsed["MCP_TRANSPORT"] ?? Redacted.make(""))).toBe("resident-child")
  })

  it("keeps invalid environment input in a redacted typed failure before spawn", async () => {
    const result = await Effect.runPromise(
      parseManagedChildEnvironment({ HULY_TOKEN: { privateMarker: "must-not-be-reported" } }, nonce).pipe(Effect.flip)
    )
    expect(result.reason).toBe("ipc")
    expect(JSON.stringify(result).includes("must-not-be-reported")).toBe(false)
  })
})
