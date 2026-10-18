import { Client } from "@modelcontextprotocol/client"
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio"
import { Deferred, Effect, Schema } from "effect"

import { residentSelectionEnvironment } from "../../helpers/resident-selection-environment.js"
import { NativeHostInput, NativeHostObservation } from "../native-host-observation.js"

const RESPONSE_BOUND = 5_000

const main = async () => {
  const input = Schema.decodeUnknownSync(NativeHostInput)({
    bundle: process.argv[2],
    attachment: process.argv[3],
    host: process.argv[4],
    mode: process.argv[5],
    url: process.argv[6]
  })
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [input.bundle],
    stderr: "pipe",
    env: {
      ...residentSelectionEnvironment(),
      HULY_URL: input.url,
      MCP_TRANSPORT: "stdio-http",
      MCP_RESIDENT_ATTACHMENT_FILE: input.attachment
    }
  })
  const client = new Client(
    { name: input.host, version: "1.0" },
    { versionNegotiation: input.mode === "modern" ? { mode: { pin: "2026-07-28" } } : { mode: "legacy" } }
  )
  const closed = await Effect.runPromise(Deferred.make<void>())
  client.onclose = () => Effect.runSync(Deferred.succeed(closed, undefined))
  try {
    await client.connect(transport, { timeout: RESPONSE_BOUND })
    const tools = await client.listTools(undefined, { timeout: RESPONSE_BOUND })
    const resources = await client.listResourceTemplates(undefined, { timeout: RESPONSE_BOUND })
    const context = await client.callTool({ name: "get_huly_context", arguments: {} }, { timeout: RESPONSE_BOUND })
    return Schema.decodeUnknownSync(NativeHostObservation)({
      host: input.host,
      mode: input.mode,
      parentPid: process.pid,
      adapterPid: transport.pid,
      tools: tools.tools.map((tool) => tool.name),
      resourceTemplates: resources.resourceTemplates.map((template) => template.uriTemplate),
      contextIsError: context.isError ?? false
    })
  } finally {
    const ownsAdapter = transport.pid !== null
    await transport.close()
    if (ownsAdapter) await Effect.runPromise(Deferred.await(closed).pipe(Effect.timeout(RESPONSE_BOUND)))
  }
}

void main().then(
  (result) => process.stdout.write(Schema.encodeSync(Schema.fromJsonString(NativeHostObservation))(result)),
  () => {
    process.stderr.write("Independent native host fixture failed\n")
    process.exitCode = 1
  }
)
