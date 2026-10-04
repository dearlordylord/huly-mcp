import { spawn } from "node:child_process"
import { createInterface } from "node:readline"
import { Effect, Schema } from "effect"
import { MoveIssueResultSchema } from "../../src/domain/schemas/issues-results.js"
import { GatewayEvent, type GatewayEvent as Event } from "./protocol.js"

import { ScenarioArguments, ScenarioEvidence } from "./scenario-contract.js"
import { runPublic } from "./public-process.js"
import { readStableIssue, runMutation } from "./mutation.js"

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
const main = async (args: ScenarioArguments, signal: AbortSignal) => {
  const lifetime = new AbortController()
  const abort = () => lifetime.abort()
  signal.addEventListener("abort", abort, { once: true })
  if (signal.aborted) abort()
  const gateway = spawn(
    process.execPath,
    [
      "node_modules/tsx/dist/cli.mjs",
      "scripts/issue-movement-concurrency/gateway.ts",
      JSON.stringify({ upstream: args.upstream })
    ],
    { stdio: ["pipe", "pipe", "ignore"], signal: lifetime.signal }
  )
  const lines = createInterface({ input: gateway.stdout })
  const events: Array<Event> = []
  const waiters: Array<{
    readonly event: Event["event"]
    readonly resolve: (event: Event) => void
    readonly reject: (reason: Error) => void
  }> = []
  let gatewayFailure: Error | undefined
  const failGateway = () => {
    gatewayFailure = new Error("Fixture gateway became unavailable")
    for (const waiter of waiters.splice(0)) waiter.reject(gatewayFailure)
  }
  const waitFor = (event: Event["event"]) =>
    new Promise<Event>((resolve, reject) => {
      if (gatewayFailure !== undefined) reject(gatewayFailure)
      else waiters.push({ event, resolve, reject })
    })
  gateway.on("error", failGateway)
  gateway.on("exit", failGateway)
  gateway.stdin.on("error", failGateway)
  lines.on("line", (line) => {
    const decoded = Schema.decodeUnknownOption(Schema.fromJsonString(GatewayEvent))(line)
    if (decoded._tag === "None") {
      failGateway()
      return
    }
    const parsed = decoded.value
    events.push(parsed)
    if (parsed.event === "failure") {
      failGateway()
      return
    }
    const index = waiters.findIndex((waiter) => waiter.event === parsed.event)
    if (index >= 0) waiters.splice(index, 1)[0]?.resolve(parsed)
  })
  try {
    const ready = await waitFor("ready")
    if (ready.event !== "ready") throw new Error("Gateway startup unavailable")
    const armed = waitFor("armed")
    gateway.stdin.write(
      `${JSON.stringify({ command: "arm", point: args.point, action: args.action, persistent: args.persistent })}\n`
    )
    await armed
    const barrier = waitFor("barrier")
    const destination = JSON.stringify(args.movement.destination)
    const cliArgs = [
      "packages/huly-cli/dist/index.cjs",
      "issues",
      "move",
      args.movement.issue,
      "--destination",
      destination,
      "--json"
    ]
    if (args.movement.resolutions !== undefined)
      cliArgs.push("--resolutions", JSON.stringify(args.movement.resolutions))
    const input =
      [
        {
          jsonrpc: "2.0",
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "movement-concurrency-certification", version: "1.0" }
          },
          id: 1
        },
        { jsonrpc: "2.0", method: "tools/call", params: { name: "move_issue", arguments: args.movement }, id: 2 }
      ]
        .map((request) => JSON.stringify(request))
        .join("\n") + "\n"
    const movement = runPublic(
      args.transport === "cli" ? cliArgs : ["dist/index.cjs"],
      ready.url,
      lifetime.signal,
      args.transport === "mcp" ? input : undefined
    ).then<ProcessObservation, ProcessObservation>(
      (stdout) => ({ status: "stdout", stdout }),
      () => ({ status: "no-result" })
    )
    const reached = await Promise.race([barrier.then(() => "barrier"), movement.then(() => "finished")])
    if (reached !== "barrier") throw new Error("Movement finished without reaching the requested transport barrier")
    const mutation = await runMutation(args, lifetime.signal)
    gateway.stdin.write('{"command":"release"}\n')
    const completed = await movement
    const text = completed.status === "stdout" ? completed.stdout : undefined
    const payload =
      text === undefined
        ? undefined
        : args.transport === "cli"
          ? text
          : text.split("\n").flatMap((line) => {
              const message = Schema.decodeUnknownOption(Schema.fromJsonString(McpResponse))(line)
              return message._tag === "Some" && message.value.result.isError !== true
                ? message.value.result.content.map((content) => content.text)
                : []
            })[0]
    const result =
      payload === undefined
        ? undefined
        : Schema.decodeUnknownOption(Schema.fromJsonString(MoveIssueResultSchema))(payload)
    const after = await readStableIssue(args, lifetime.signal)
    const evidence = Schema.decodeUnknownSync(ScenarioEvidence)({
      mutation: { ...mutation, after },
      observation:
        result?._tag === "Some"
          ? { status: "result", result: result.value }
          : {
              status: "no-result",
              reason: "Public movement returned no schema-valid result; inspect stable IDs independently."
            },
      gatewayEvents: events
    })
    process.stdout.write(`${JSON.stringify(evidence)}\n`)
  } finally {
    lifetime.abort()
    signal.removeEventListener("abort", abort)
    gateway.kill()
    lines.close()
  }
}
const args = Schema.decodeUnknownSync(Schema.fromJsonString(ScenarioArguments))(process.argv[2])
void Effect.runPromise(Effect.tryPromise({
  try: (signal) => main(args, signal),
  catch: () => new Error("Movement concurrency fixture failed; no workspace-state claim made.")
}).pipe(Effect.timeout(args.timeoutMs))).catch(() => {
  process.stderr.write("Movement concurrency fixture failed or exceeded its deadline; no workspace-state claim made.\n")
  process.exitCode = 1
})
