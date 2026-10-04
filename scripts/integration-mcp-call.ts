import { Client } from "@modelcontextprotocol/client"
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio"
import { Redacted, Schema } from "effect"

const CALL_TIMEOUT_MILLISECONDS = 45_000
const InputSchema = Schema.Tuple([Schema.NonEmptyString, Schema.fromJsonString(Schema.JsonObject)])
const RESPONSE_ID = 2
const EnvironmentSchema = Schema.Record(Schema.String, Schema.RedactedFromValue(Schema.String))
const ReplySchema = Schema.Struct({
  isError: Schema.optionalKey(Schema.Boolean),
  content: Schema.Tuple([Schema.Struct({ type: Schema.Literal("text"), text: Schema.NonEmptyString })])
})
export class IntegrationMcpCallError extends Error {
  constructor(phase: "input" | "connect" | "call" | "reply" | "close") {
    super(`Integration MCP call failed during ${phase}; no automatic mutation retry performed.`)
  }
}
// Internal process adapter seam; protocol input and output remain schema-owned.
interface ProcessOptions {
  readonly command: string
  readonly args: ReadonlyArray<string>
  readonly environment: NodeJS.ProcessEnv
}
const EnvelopeSchema = Schema.Struct({
  jsonrpc: Schema.Literal("2.0"),
  id: Schema.Literal(RESPONSE_ID),
  result: ReplySchema
})
export const integrationMcpCall = async (
  input: unknown,
  options: ProcessOptions
): Promise<Schema.Schema.Type<typeof EnvelopeSchema>> => {
  const parsed = Schema.decodeUnknownOption(InputSchema)(input)
  if (parsed._tag === "None") throw new IntegrationMcpCallError("input")
  const environment = Schema.decodeUnknownSync(EnvironmentSchema)(
    Object.fromEntries(Object.entries(options.environment).filter((entry) => entry[1] !== undefined))
  )
  const transport = new StdioClientTransport({
    command: options.command,
    args: [...options.args],
    env: Object.fromEntries(Object.entries(environment).map(([key, value]) => [key, Redacted.value(value)])),
    stderr: "pipe"
  })
  // Never forward server diagnostics, which can contain credential-bearing integration failures.
  transport.stderr?.on("data", () => {})
  const client = new Client(
    { name: "hulymcp-integration-call", version: "1.0.0" },
    { versionNegotiation: { mode: { pin: "2026-07-28" } } }
  )
  let phase: "connect" | "call" | "reply" | "close" = "connect"
  const exchange = async () => {
    await client.connect(transport)
    phase = "call"
    const definition = (await client.listTools()).tools.find((tool) => tool.name === parsed.value[0])
    if (definition === undefined) throw new IntegrationMcpCallError("call")
    const raw = await client.callTool(
      { name: parsed.value[0], arguments: parsed.value[1] },
      { toolDefinition: definition, timeout: CALL_TIMEOUT_MILLISECONDS, maxTotalTimeout: CALL_TIMEOUT_MILLISECONDS }
    )
    phase = "reply"
    const reply = Schema.decodeUnknownSync(ReplySchema)(raw)
    if (reply.isError !== true) Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Json))(reply.content[0].text)
    return Schema.decodeUnknownSync(EnvelopeSchema)({ jsonrpc: "2.0", id: RESPONSE_ID, result: reply })
  }
  const close = async () => {
    try {
      await client.close()
    } catch {
      throw new IntegrationMcpCallError("close")
    }
  }
  return exchange().then(
    async (result) => {
      await close()
      return result
    },
    async () => {
      await close()
      throw new IntegrationMcpCallError(phase)
    }
  )
}
