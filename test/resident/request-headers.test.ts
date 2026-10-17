import { Effect, Option, Redacted, Schema } from "effect"
import { Base64 } from "effect/encoding"
import { expect, it } from "vitest"

import { requestHeaders, HostMessage } from "../../src/resident/request-headers.js"
import { parseLegacyHttpSession } from "../../src/resident/protocol-session.js"

const authorization = Redacted.make("fixture-secret")
const message = Schema.decodeUnknownSync(HostMessage)

it.each(["", " padded ", "日本語", "=?base64?literal?=", "plain"])(
  "preserves routing name %j through native encoding",
  (name) => {
    const headers = requestHeaders(
      message({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name } }),
      authorization,
      Option.none()
    )
    expect(headers.get("mcp-name")).toBe(name === "plain" ? name : `=?base64?${Base64.encode(name)}?=`)
    expect(headers.get("authorization")).toBe("Bearer fixture-secret")
  }
)

it("mirrors resource URI and metadata, and gives the admitted legacy session precedence", async () => {
  const session = await Effect.runPromise(
    parseLegacyHttpSession(new Headers({ "mcp-session-id": "owned", "mcp-protocol-version": "2025-06-18" }))
  )
  const headers = requestHeaders(
    message({
      jsonrpc: "2.0",
      method: "resources/read",
      params: { uri: "huly://context", _meta: { "io.modelcontextprotocol/protocolVersion": "2026-07-28" } }
    }),
    authorization,
    session
  )
  expect(headers.get("mcp-name")).toBe("huly://context")
  expect(headers.get("mcp-protocol-version")).toBe("2025-06-18")
  expect(headers.get("mcp-session-id")).toBe("owned")
  expect(
    requestHeaders(message({ jsonrpc: "2.0", id: 1, method: "initialize" }), authorization, session).has(
      "mcp-session-id"
    )
  ).toBe(false)
  expect(
    requestHeaders(message({ jsonrpc: "2.0", id: 1, method: "ping", params: null }), authorization, Option.none()).has(
      "mcp-name"
    )
  ).toBe(false)
})

it.each([
  { "mcp-session-id": "", "mcp-protocol-version": "2025-06-18" },
  { "mcp-session-id": "private", "mcp-protocol-version": "2026-07-28" },
  { "mcp-session-id": "private" }
])("refuses invalid legacy session headers without exposing the identifier", async (headers) => {
  await expect(Effect.runPromise(parseLegacyHttpSession(new Headers(headers)))).rejects.toThrow(
    "invalid legacy session headers"
  )
})
