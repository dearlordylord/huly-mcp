import { Client } from "@modelcontextprotocol/client"
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio"
import {
  NativeDiscoverySchema,
  NativeToolListSchema,
  normalizeIntegrationEnvironment
} from "./integration-mcp-prior.js"
import { Clock, Effect, Redacted, Schema } from "effect"

const CONNECT_TIMEOUT_MILLISECONDS_VALUE = 10_000
const LIST_TIMEOUT_MILLISECONDS_VALUE = 10_000
const CALL_TIMEOUT_MILLISECONDS_VALUE = 45_000
const InputSchema = Schema.Tuple([Schema.NonEmptyString, Schema.fromJsonString(Schema.JsonObject)])
const RESPONSE_ID = 2
const EnvironmentSchema = Schema.Record(Schema.String, Schema.RedactedFromValue(Schema.String))
const ReplySchema = Schema.Struct({
  isError: Schema.optionalKey(Schema.Boolean),
  content: Schema.Tuple([Schema.Struct({ type: Schema.Literal("text"), text: Schema.NonEmptyString })])
})
export class IntegrationMcpCallError extends Error {
  constructor(phase: "input" | "connect" | "list" | "call" | "reply" | "close") {
    super(`Integration MCP call failed during ${phase}; no automatic mutation retry performed.`)
  }
}
const FractionalMilliseconds = Schema.Number.check(Schema.isFinite(), Schema.isGreaterThanOrEqualTo(0))
export const IntegrationMonotonicMilliseconds = FractionalMilliseconds.pipe(
  Schema.brand("IntegrationMonotonicMilliseconds")
)
export type IntegrationMonotonicMilliseconds = Schema.Schema.Type<typeof IntegrationMonotonicMilliseconds>
export const IntegrationElapsedMilliseconds = FractionalMilliseconds.pipe(
  Schema.brand("IntegrationElapsedMilliseconds")
)
export type IntegrationElapsedMilliseconds = Schema.Schema.Type<typeof IntegrationElapsedMilliseconds>
const CONNECT_TIMEOUT_MILLISECONDS = IntegrationElapsedMilliseconds.make(CONNECT_TIMEOUT_MILLISECONDS_VALUE)
const LIST_TIMEOUT_MILLISECONDS = IntegrationElapsedMilliseconds.make(LIST_TIMEOUT_MILLISECONDS_VALUE)
const CALL_TIMEOUT_MILLISECONDS = IntegrationElapsedMilliseconds.make(CALL_TIMEOUT_MILLISECONDS_VALUE)
export const IntegrationMcpPhaseSchema = Schema.Struct({
  phase: Schema.Literals([
    "bundle-ready",
    "connect-start",
    "connect-ready",
    "list-start",
    "list-ready",
    "call-start",
    "call-reply",
    "close-start",
    "closed"
  ]),
  elapsedMilliseconds: IntegrationElapsedMilliseconds
})
export type IntegrationMcpPhase = Schema.Schema.Type<typeof IntegrationMcpPhaseSchema>
// Internal clock/output ports; serialized phase events are owned by the schema above.
export interface IntegrationMcpTelemetry {
  readonly now: () => IntegrationMonotonicMilliseconds
  readonly publish: (event: IntegrationMcpPhase) => void
}
const NANOSECONDS_PER_MILLISECOND = 1_000_000
export const integrationMcpClock = (): IntegrationMonotonicMilliseconds =>
  Schema.decodeUnknownSync(IntegrationMonotonicMilliseconds)(
    Number(Effect.runSync(Clock.monotonicTimeNanos)) / NANOSECONDS_PER_MILLISECOND
  )
const quietTelemetry: IntegrationMcpTelemetry = { now: integrationMcpClock, publish: () => {} }
// Request-shell timer ports make whole-phase deadlines independently testable.
export interface IntegrationMcpTimers {
  readonly schedule: (
    callback: () => void,
    milliseconds: IntegrationElapsedMilliseconds
  ) => ReturnType<typeof setTimeout>
  readonly cancel: (timer: ReturnType<typeof setTimeout>) => void
}
const realTimers: IntegrationMcpTimers = {
  schedule: (callback, milliseconds) => setTimeout(callback, milliseconds),
  cancel: (timer) => clearTimeout(timer)
}
const boundedPhase = <A>(
  phase: "connect" | "list" | "call",
  milliseconds: IntegrationElapsedMilliseconds,
  timers: IntegrationMcpTimers,
  request: (signal: AbortSignal) => Promise<A>
): Promise<A> => {
  const controller = new AbortController()
  return new Promise<A>((resolve, reject) => {
    const timer = timers.schedule(() => {
      controller.abort()
      reject(new IntegrationMcpCallError(phase))
    }, milliseconds)
    request(controller.signal)
      .then(resolve, reject)
      .finally(() => timers.cancel(timer))
  })
}
// Internal process adapter seam; protocol input and output remain schema-owned.
export interface ProcessOptions {
  readonly command: string
  readonly args: ReadonlyArray<string>
  readonly environment: NodeJS.ProcessEnv
  readonly prior?: Schema.Schema.Type<typeof NativeDiscoverySchema>
}
const EnvelopeSchema = Schema.Struct({
  jsonrpc: Schema.Literal("2.0"),
  id: Schema.Literal(RESPONSE_ID),
  result: ReplySchema
})
export const makeIntegrationMcpSession = (options: ProcessOptions) => {
  const environment =
    options.prior === undefined
      ? Schema.decodeUnknownSync(EnvironmentSchema)(
          Object.fromEntries(
            Object.entries({ ...options.environment, LAZY_ENVS: "true" }).filter((entry) => entry[1] !== undefined)
          )
        )
      : normalizeIntegrationEnvironment(options.environment)
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
  return { client, transport }
}
export const integrationMcpCall = async (
  input: unknown,
  options: ProcessOptions,
  telemetry: IntegrationMcpTelemetry = quietTelemetry,
  timers: IntegrationMcpTimers = realTimers
): Promise<Schema.Schema.Type<typeof EnvelopeSchema>> => {
  const parsed = Schema.decodeUnknownOption(InputSchema)(input)
  if (parsed._tag === "None") throw new IntegrationMcpCallError("input")
  return withNativeClient(options, telemetry, timers, async (client, step) => {
    step("list")
    const definition = (await listNativeTools(client, timers)).tools.find((tool) => tool.name === parsed.value[0])
    if (definition === undefined) throw new IntegrationMcpCallError("call")
    step("call")
    const raw = await boundedPhase("call", CALL_TIMEOUT_MILLISECONDS, timers, (signal) =>
      client.callTool(
        { name: parsed.value[0], arguments: parsed.value[1] },
        {
          signal,
          toolDefinition: definition,
          timeout: CALL_TIMEOUT_MILLISECONDS,
          maxTotalTimeout: CALL_TIMEOUT_MILLISECONDS
        }
      )
    )
    step("reply")
    const reply = Schema.decodeUnknownSync(ReplySchema)(raw)
    if (reply.isError !== true) Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Json))(reply.content[0].text)
    return Schema.decodeUnknownSync(EnvelopeSchema)({ jsonrpc: "2.0", id: RESPONSE_ID, result: reply })
  })
}
const listNativeTools = (client: Client, timers: IntegrationMcpTimers) =>
  boundedPhase("list", LIST_TIMEOUT_MILLISECONDS, timers, (signal) =>
    client.listTools(undefined, {
      signal,
      timeout: LIST_TIMEOUT_MILLISECONDS,
      maxTotalTimeout: LIST_TIMEOUT_MILLISECONDS
    })
  )
const ToolListEnvelope = Schema.Struct({
  jsonrpc: Schema.Literal("2.0"),
  id: Schema.Literal(RESPONSE_ID),
  result: NativeToolListSchema
})
export const integrationMcpListTools = (
  options: ProcessOptions,
  telemetry: IntegrationMcpTelemetry = quietTelemetry,
  timers: IntegrationMcpTimers = realTimers
) =>
  withNativeClient(options, telemetry, timers, async (client, step) => {
    step("list")
    const raw: unknown = await listNativeTools(client, timers)
    const result = Schema.decodeUnknownSync(NativeToolListSchema)(raw)
    step("reply")
    const envelope: unknown = { jsonrpc: "2.0", id: RESPONSE_ID, result }
    return Schema.decodeUnknownSync(ToolListEnvelope)(envelope)
  })
export const captureIntegrationMcpDiscovery = (options: ProcessOptions, timers: IntegrationMcpTimers = realTimers) =>
  withNativeClient(
    {
      ...options,
      environment: {
        ...options.environment,
        HULY_TOOL_MODE: "native",
        LAZY_ENVS: "true",
        HULY_MCP_TELEMETRY: "0",
        HULY_CLI_TELEMETRY: "0"
      }
    },
    quietTelemetry,
    timers,
    async (client) => {
      const raw: unknown = client.getDiscoverResult()
      return Schema.decodeUnknownSync(NativeDiscoverySchema)(raw)
    }
  )
const withNativeClient = async <A>(
  options: ProcessOptions,
  telemetry: IntegrationMcpTelemetry,
  timers: IntegrationMcpTimers,
  use: (client: Client, step: (phase: "list" | "call" | "reply") => void) => Promise<A>
): Promise<A> => {
  const started = telemetry.now()
  const emit = (phase: IntegrationMcpPhase["phase"]): void =>
    telemetry.publish(
      Schema.decodeUnknownSync(IntegrationMcpPhaseSchema)({
        phase,
        elapsedMilliseconds: IntegrationElapsedMilliseconds.make(telemetry.now() - started)
      })
    )
  const { client, transport } = makeIntegrationMcpSession(options)
  let phase: "connect" | "list" | "call" | "reply" | "close" = "connect"
  let connecting: Promise<void> | undefined
  const exchange = async () => {
    emit("connect-start")
    await boundedPhase(
      "connect",
      CONNECT_TIMEOUT_MILLISECONDS,
      timers,
      (signal) =>
        (connecting = client.connect(transport, {
          signal,
          ...(options.prior === undefined ? {} : { prior: { kind: "modern", discover: options.prior } }),
          timeout: CONNECT_TIMEOUT_MILLISECONDS,
          maxTotalTimeout: CONNECT_TIMEOUT_MILLISECONDS
        }))
    )
    if (client.getNegotiatedProtocolVersion() !== "2026-07-28") throw new IntegrationMcpCallError("connect")
    emit("connect-ready")
    const step = (next: "list" | "call" | "reply") => {
      if (phase === "list") emit("list-ready")
      if (next === "reply" && phase === "call") emit("call-reply")
      if (next !== "reply") emit(next === "list" ? "list-start" : "call-start")
      phase = next
    }
    return use(client, step)
  }
  const close = async () => {
    emit("close-start")
    try {
      await transport.close()
      await connecting?.catch(() => {})
      await client.close()
      emit("closed")
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
