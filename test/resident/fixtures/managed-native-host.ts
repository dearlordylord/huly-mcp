import { createInterface } from "node:readline"
import { Client } from "@modelcontextprotocol/client"
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio"
import { Clock, Deferred, Effect, Schema } from "effect"

import { GetHulyContextResultSchema } from "../../../src/domain/schemas/huly-context.js"
import { ResidentDirectory } from "../../../src/resident/protected-path.js"
import { ResidentPackagePath } from "../../../src/resident/managed-contract.js"
import { residentSelectionEnvironment } from "../../helpers/resident-selection-environment.js"
import { ManagedParentConnected } from "../managed-observation.js"
import { HostName, ManagedNativeHostObservation } from "../native-host-observation.js"

const RESPONSE_BOUND = 5_000
const Input = Schema.Struct({
  bundle: ResidentPackagePath,
  directory: ResidentDirectory,
  host: HostName,
  workspace: Schema.NonEmptyString
})
const Command = Schema.Literals(["read", "close"])
const Phase = Schema.Struct({
  parentPid: ManagedParentConnected.fields.parentPid,
  host: HostName,
  phase: Schema.Literals(["connecting", "connected", "observing", "observed", "closing", "closed", "failed"]),
  elapsedMillis: Schema.Number,
  monotonicMillis: Schema.Number
})
const NANOS_PER_MILLISECOND = 1_000_000n

const main = async () => {
  const input = Schema.decodeUnknownSync(Input)({
    bundle: process.argv[2],
    directory: process.argv[3],
    host: process.argv[4],
    workspace: process.argv[5] ?? "fixture"
  })
  const started = await Effect.runPromise(Clock.monotonicTimeNanos)
  const phase = async (state: Schema.Schema.Type<typeof Phase>["phase"]) => {
    const now = await Effect.runPromise(Clock.monotonicTimeNanos)
    process.stderr.write(
      `${Schema.encodeSync(Schema.fromJsonString(Phase))({
        parentPid: process.pid,
        host: input.host,
        phase: state,
        elapsedMillis: Number((now - started) / NANOS_PER_MILLISECOND),
        monotonicMillis: Number(now / NANOS_PER_MILLISECOND)
      })}\n`
    )
  }
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [input.bundle],
    stderr: "pipe",
    env: {
      ...residentSelectionEnvironment(),
      HULY_WORKSPACE: input.workspace,
      MCP_TRANSPORT: "stdio-resident",
      MCP_RESIDENT_STATE_DIRECTORY: input.directory
    }
  })
  const client = new Client(
    { name: input.host, version: "1.0" },
    { versionNegotiation: { mode: { pin: "2026-07-28" } } }
  )
  transport.stderr?.on("data", (chunk: Buffer) => process.stderr.write(chunk))
  const closed = Effect.runSync(Deferred.make<void>())
  client.onclose = () => Effect.runSync(Deferred.succeed(closed, undefined))
  const commands = createInterface({ input: process.stdin })
  const incoming = commands[Symbol.asyncIterator]()
  const observe = async () => {
    await phase("observing")
    const tools = await client.listTools(undefined, { timeout: RESPONSE_BOUND })
    const resources = await client.listResourceTemplates(undefined, { timeout: RESPONSE_BOUND })
    const request = { name: "get_huly_context", arguments: {} }
    const toolDefinition = tools.tools.find((tool) => tool.name === request.name)
    if (toolDefinition === undefined) throw new Error("Context tool is absent from the actual catalog")
    const context = await client.callTool(request, { timeout: RESPONSE_BOUND, toolDefinition })
    const result = Schema.decodeUnknownSync(Schema.Struct({ result: GetHulyContextResultSchema }))(
      context.structuredContent
    ).result
    const observation = Schema.decodeUnknownSync(ManagedNativeHostObservation)({
      host: input.host,
      mode: "modern",
      parentPid: process.pid,
      adapterPid: transport.pid,
      tools: tools.tools.map((tool) => tool.name),
      resourceTemplates: resources.resourceTemplates.map((template) => template.uriTemplate),
      contextIsError: context.isError ?? false,
      observedWorkspace: result.huly.workspace.value,
      observedPort: result.transport.http?.port
    })
    process.stdout.write(`${Schema.encodeSync(Schema.fromJsonString(ManagedNativeHostObservation))(observation)}\n`)
    await phase("observed")
  }
  try {
    await phase("connecting")
    await client.connect(transport, { timeout: RESPONSE_BOUND })
    await phase("connected")
    const connected = Schema.decodeUnknownSync(ManagedParentConnected)({
      kind: "connected",
      parentPid: process.pid,
      adapterPid: transport.pid
    })
    process.stdout.write(`${Schema.encodeSync(Schema.fromJsonString(ManagedParentConnected))(connected)}\n`)
    await observe()
    for await (const line of incoming) {
      if (Schema.decodeUnknownSync(Command)(line) === "close") break
      await observe()
    }
  } catch (error) {
    await phase("failed")
    throw error
  } finally {
    await phase("closing")
    commands.close()
    const ownsAdapter = transport.pid !== null
    await transport.close()
    if (ownsAdapter) await Effect.runPromise(Deferred.await(closed).pipe(Effect.timeout(RESPONSE_BOUND)))
    await phase("closed")
  }
}

void main().catch(() => {
  process.stderr.write("Managed parent fixture failed\n")
  process.exitCode = 1
})
