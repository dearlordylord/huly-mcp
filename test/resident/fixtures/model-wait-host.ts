import { createInterface } from "node:readline"
import { Client } from "@modelcontextprotocol/client"
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio"
import { Schema } from "effect"

import { GetHulyContextResultSchema } from "../../../src/domain/schemas/huly-context.js"
import { GetProjectResultSchema } from "../../../src/domain/schemas/projects.js"
import { ModelWaitCommand, ModelWaitEvent, ModelWaitHostInput } from "../model-wait-contract.js"
import { boundModelWait } from "../../helpers/model-wait-parent.js"
import { residentSelectionEnvironment } from "../../helpers/resident-selection-environment.js"

const RESPONSE_BOUND = 5_000
const ContextReply = Schema.Struct({ result: GetHulyContextResultSchema })
const ProjectReply = Schema.Struct({
  isError: Schema.optionalKey(Schema.Literal(false)),
  structuredContent: Schema.Struct({ result: GetProjectResultSchema })
})
const emit = (event: ModelWaitEvent) =>
  process.stdout.write(`${Schema.encodeSync(Schema.fromJsonString(ModelWaitEvent))(event)}\n`)

const main = async () => {
  const input = Schema.decodeUnknownSync(Schema.fromJsonString(ModelWaitHostInput))(process.argv[2])
  const client = new Client(
    { name: `model-wait-${input.role}`, version: "1" },
    { versionNegotiation: input.protocol === "2026-07-28" ? { mode: { pin: input.protocol } } : { mode: "legacy" } }
  )
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [input.bundle],
    stderr: "pipe",
    env: {
      ...residentSelectionEnvironment(),
      HULY_URL: input.endpoint,
      HULY_TOOL_MODE: "native",
      MCP_TRANSPORT: "stdio-resident",
      MCP_RESIDENT_STATE_DIRECTORY: input.directory
    }
  })
  transport.stderr?.on("data", (chunk: Buffer) => process.stderr.write(chunk))
  const commands = createInterface({ input: process.stdin })
  // Internal owned request capability; command/event schemas own the IPC contract.
  let active: { readonly abort: AbortController; readonly settled: Promise<void> } | undefined
  let failed = false
  const read = async (
    project: Schema.Schema.Type<typeof ModelWaitCommand.cases.read>["project"],
    abort: AbortController
  ) => {
    try {
      const reply = Schema.decodeUnknownSync(ProjectReply)(
        await client.callTool(
          { name: "get_project", arguments: { project } },
          { timeout: RESPONSE_BOUND, signal: abort.signal }
        )
      )
      active = undefined
      emit({ _tag: "result", project, result: reply.structuredContent.result })
    } catch (error) {
      active = undefined
      if (!abort.signal.aborted) throw error
      emit({ _tag: "cancelled", project })
    }
  }
  try {
    await client.connect(transport, { timeout: RESPONSE_BOUND })
    if (client.getNegotiatedProtocolVersion() !== input.protocol) throw new Error("Unexpected negotiated protocol")
    const tools = await client.listTools(undefined, { timeout: RESPONSE_BOUND })
    if (!tools.tools.some((tool) => tool.name === "get_project")) throw new Error("Native project tool unavailable")
    const context = await client.callTool({ name: "get_huly_context", arguments: {} }, { timeout: RESPONSE_BOUND })
    const parsed = Schema.decodeUnknownSync(ContextReply)(context.structuredContent).result
    emit(
      Schema.decodeUnknownSync(ModelWaitEvent.cases.ready)({
        _tag: "ready",
        protocol: client.getNegotiatedProtocolVersion(),
        parentPid: process.pid,
        adapterPid: transport.pid,
        port: parsed.transport.http?.port
      })
    )
    for await (const line of commands) {
      const command = Schema.decodeUnknownSync(Schema.fromJsonString(ModelWaitCommand))(line)
      if (command._tag === "close") break
      if (command._tag === "cancel") {
        if (active === undefined) throw new Error("No active model waiter to cancel")
        active.abort.abort(new Error("Fixture cancelled its model waiter"))
      } else {
        if (active !== undefined) throw new Error("Fixture already owns a request")
        const abort = new AbortController()
        const settled = read(command.project, abort).catch(() => {
          failed = true
          emit({ _tag: "failed" })
        })
        active = { abort, settled }
        emit({ _tag: "started", project: command.project })
      }
    }
  } finally {
    commands.close()
    const pending = active
    pending?.abort.abort(new Error("Fixture parent closing"))
    await boundModelWait(transport.close())
    if (pending !== undefined) await boundModelWait(pending.settled)
  }
  if (failed) throw new Error("Model waiter operation failed")
}

void main().catch(() => {
  process.stderr.write("Model waiter parent failed\n")
  process.exitCode = 1
})
