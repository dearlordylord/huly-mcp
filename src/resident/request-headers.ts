import { Option, Redacted, Schema } from "effect"
import { McpSchema } from "effect/ai"
import { Base64 } from "effect/encoding"

import type { LegacyHttpSession } from "./protocol-session.js"

export const HostMessage = Schema.Struct({
  jsonrpc: Schema.Literal("2.0"),
  id: Schema.optionalKey(McpSchema.RequestId),
  method: Schema.String,
  params: Schema.optionalKey(Schema.Unknown)
})
export type HostMessage = Schema.Schema.Type<typeof HostMessage>

const Routing = Schema.Struct({
  name: Schema.optionalKey(Schema.String),
  uri: Schema.optionalKey(Schema.String),
  _meta: Schema.optionalKey(
    Schema.Struct({ "io.modelcontextprotocol/protocolVersion": Schema.optionalKey(Schema.String) })
  )
})
const BASE64_PREFIX = "=?base64?"
const BASE64_SUFFIX = "?="

// Match native MCP routing-header decoding, including literal sentinel values.
const encodeRoutingValue = (value: string): string =>
  value.length === 0 ||
  value !== value.trim() ||
  !/^[\t\x20-\x7e]*$/.test(value) ||
  (value.startsWith(BASE64_PREFIX) && value.endsWith(BASE64_SUFFIX))
    ? `${BASE64_PREFIX}${Base64.encode(value)}${BASE64_SUFFIX}`
    : value

export const requestHeaders = (
  message: HostMessage,
  authorization: Redacted.Redacted<string>,
  session: Option.Option<LegacyHttpSession>
): Headers => {
  const headers = new Headers({
    accept: "application/json, text/event-stream",
    authorization: `Bearer ${Redacted.value(authorization)}`,
    "content-type": "application/json",
    "mcp-method": message.method
  })
  const routing = Schema.decodeUnknownOption(Routing)(message.params)
  if (Option.isSome(routing)) {
    const version = routing.value._meta?.["io.modelcontextprotocol/protocolVersion"]
    if (version !== undefined) headers.set("mcp-protocol-version", version)
    const name = message.method === "resources/read" ? routing.value.uri : routing.value.name
    if (name !== undefined) headers.set("mcp-name", encodeRoutingValue(name))
  }
  if (Option.isSome(session) && message.method !== "initialize") {
    headers.set("mcp-session-id", Redacted.value(session.value.id))
    headers.set("mcp-protocol-version", session.value.protocolVersion)
  }
  return headers
}
