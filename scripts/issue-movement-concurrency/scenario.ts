import { spawn } from "node:child_process"
import { createInterface } from "node:readline"
import { Schema } from "effect"
import { MoveIssueParamsSchema } from "../../src/domain/schemas/issue-movement.js"
import { MoveIssueResultSchema } from "../../src/domain/schemas/issues-results.js"
import { NonEmptyString, UrlString } from "../../src/domain/schemas/shared.js"
import { GatewayAction, GatewayEvent, GatewayPoint, type GatewayEvent as Event } from "./protocol.js"

const Arguments = Schema.Struct({
  upstream: UrlString,
  transport: Schema.Literals(["mcp", "cli"]),
  movement: MoveIssueParamsSchema,
  point: GatewayPoint,
  action: GatewayAction,
  persistent: Schema.Boolean,
  mutationArgs: Schema.Array(NonEmptyString)
})
const McpResponse = Schema.Struct({
  id: Schema.Literal(2),
  result: Schema.Struct({
    isError: Schema.optionalKey(Schema.Boolean),
    content: Schema.Array(Schema.Struct({ type: Schema.Literal("text"), text: Schema.String }))
  })
})
const ProcessObservation = Schema.Union([
  Schema.Struct({ status: Schema.Literal("stdout"), stdout: Schema.String }),
  Schema.Struct({ status: Schema.Literal("no-result") })
])
type ProcessObservation = Schema.Schema.Type<typeof ProcessObservation>
const PublicObservation = Schema.Union([
  Schema.Struct({ status: Schema.Literal("result"), result: MoveIssueResultSchema }),
  Schema.Struct({ status: Schema.Literal("no-result"), reason: NonEmptyString })
])
const Evidence = Schema.Struct({ observation: PublicObservation, gatewayEvents: Schema.Array(GatewayEvent) })

// Process environment is framework-owned and stays within this child-process adapter; it is never emitted.
const runPublic = (argv: ReadonlyArray<string>, url: UrlString, input?: string) => new Promise<string>((resolve, reject) => {
  const child = spawn(process.execPath, [...argv], {
    env: { ...process.env, HULY_URL: url, HULY_TOOL_MODE: "native", MCP_AUTO_EXIT: "true" },
    stdio: ["pipe", "pipe", "ignore"]
  })
  const chunks: Array<Buffer> = []
  child.stdout.on("data", (chunk: unknown) => chunks.push(Buffer.from(Schema.decodeUnknownSync(Schema.Uint8Array)(chunk))))
  child.on("error", () => reject(new Error("Public fixture process unavailable")))
  child.on("exit", (code) => code === 0 ? resolve(Buffer.concat(chunks).toString("utf8")) : reject(new Error("Public fixture process returned no successful response")))
  child.stdin.end(input)
})
const main = async () => {
  const args = Schema.decodeUnknownSync(Schema.fromJsonString(Arguments))(process.argv[2])
  const gateway = spawn(process.execPath, [
    "node_modules/tsx/dist/cli.mjs", "scripts/issue-movement-concurrency/gateway.ts",
    JSON.stringify({ upstream: args.upstream })
  ], { stdio: ["pipe", "pipe", "ignore"] })
  const lines = createInterface({ input: gateway.stdout })
  const events: Array<Event> = []
  const waiters: Array<{ readonly event: Event["event"]; readonly resolve: (event: Event) => void }> = []
  const waitFor = (event: Event["event"]) => new Promise<Event>((resolve) => { waiters.push({ event, resolve }) })
  lines.on("line", (line) => {
    const parsed = Schema.decodeUnknownSync(Schema.fromJsonString(GatewayEvent))(line)
    events.push(parsed)
    const index = waiters.findIndex((waiter) => waiter.event === parsed.event)
    if (index >= 0) waiters.splice(index, 1)[0]?.resolve(parsed)
  })
  try {
    const ready = await waitFor("ready")
    if (ready.event !== "ready") throw new Error("Gateway startup unavailable")
    const armed = waitFor("armed")
    gateway.stdin.write(`${JSON.stringify({ command: "arm", point: args.point, action: args.action, persistent: args.persistent })}\n`)
    await armed
    const barrier = waitFor("barrier")
    const destination = JSON.stringify(args.movement.destination)
    const cliArgs = ["packages/huly-cli/dist/index.cjs", "issues", "move", args.movement.issue, "--destination", destination, "--json"]
    if (args.movement.resolutions !== undefined) cliArgs.push("--resolutions", JSON.stringify(args.movement.resolutions))
    const input = [
      { jsonrpc: "2.0", method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "movement-concurrency-certification", version: "1.0" } }, id: 1 },
      { jsonrpc: "2.0", method: "tools/call", params: { name: "move_issue", arguments: args.movement }, id: 2 }
    ].map((request) => JSON.stringify(request)).join("\n") + "\n"
    const movement = runPublic(args.transport === "cli" ? cliArgs : ["dist/index.cjs"], ready.url, args.transport === "mcp" ? input : undefined)
      .then<ProcessObservation, ProcessObservation>((stdout) => ({ status: "stdout", stdout }), () => ({ status: "no-result" }))
    const reached = await Promise.race([barrier.then(() => "barrier"), movement.then(() => "finished")])
    if (reached !== "barrier") throw new Error("Movement finished without reaching the requested transport barrier")
    if (args.mutationArgs.length > 0)
      await runPublic(["packages/huly-cli/dist/index.cjs", ...args.mutationArgs, "--json"], args.upstream)
    gateway.stdin.write('{"command":"release"}\n')
    const completed = await movement
    const text = completed.status === "stdout" ? completed.stdout : undefined
    const payload = text === undefined ? undefined : args.transport === "cli" ? text : text.split("\n").flatMap((line) => {
      const message = Schema.decodeUnknownOption(Schema.fromJsonString(McpResponse))(line)
      return message._tag === "Some" && message.value.result.isError !== true ? message.value.result.content.map((content) => content.text) : []
    })[0]
    const result = payload === undefined ? undefined : Schema.decodeUnknownOption(Schema.fromJsonString(MoveIssueResultSchema))(payload)
    const evidence = Schema.decodeUnknownSync(Evidence)({
      observation: result?._tag === "Some" ? { status: "result", result: result.value } : { status: "no-result", reason: "Public movement returned no schema-valid result; inspect stable IDs independently." },
      gatewayEvents: events
    })
    process.stdout.write(`${JSON.stringify(evidence)}\n`)
  } finally {
    gateway.stdin.write('{"command":"close"}\n')
    gateway.stdin.end()
    lines.close()
  }
}
void main().catch(() => { process.stderr.write("Movement concurrency fixture failed; no workspace-state claim made.\n"); process.exitCode = 1 })
