import { strict as assert } from "node:assert"
import { Schema } from "effect"

import { HostMessage } from "../../../src/resident/request-headers.js"

const CONTEXT_REQUEST_ID = 2
const FALLBACK_REPLY_COUNT = 2
const encode = Schema.encodeSync(Schema.fromJsonString(HostMessage))
const meta = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientCapabilities": {},
  "io.modelcontextprotocol/clientInfo": { name: "startup-fallback-fixture", version: "1" }
}
const discovery = encode({ jsonrpc: "2.0", id: 1, method: "server/discover", params: { _meta: meta } })

// Discovery is available before resident selection; an application call proves fallback.
export const fallbackRequests = `${discovery}\n${encode({
  jsonrpc: "2.0",
  id: CONTEXT_REQUEST_ID,
  method: "tools/call",
  params: { name: "get_huly_context", arguments: {}, _meta: meta }
})}`

const ContextReply = Schema.Struct({
  id: Schema.Literal(CONTEXT_REQUEST_ID),
  result: Schema.Struct({
    structuredContent: Schema.Struct({
      result: Schema.Struct({ transport: Schema.Struct({ type: Schema.Literal("stdio") }) })
    })
  })
})

const DiscoveryReply = Schema.Struct({
  id: Schema.Literal(1),
  result: Schema.Struct({ supportedVersions: Schema.Array(Schema.String) })
})

export const assertStartupFallback = (output: string, diagnostics: string) => {
  const lines = output.trim().split("\n")
  assert.equal(lines.length, FALLBACK_REPLY_COUNT)
  const reply = Schema.decodeUnknownSync(Schema.fromJsonString(DiscoveryReply))(lines[0])
  Schema.decodeUnknownSync(Schema.fromJsonString(ContextReply))(lines[1])
  assert.ok(reply.result.supportedVersions.includes("2026-07-28"))
  assert.ok(diagnostics.includes("Native resident startup failed; starting ordinary stdio"))
}
