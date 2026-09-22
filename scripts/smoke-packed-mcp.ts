import { spawn } from "node:child_process"

import { Console, Effect, Schema } from "effect"

const JsonRpcResponseSchema = Schema.Struct({
  id: Schema.Number,
  jsonrpc: Schema.Literal("2.0"),
  result: Schema.optional(Schema.Unknown)
})
const ToolCallResultSchema = Schema.Struct({
  isError: Schema.optional(Schema.Boolean),
  structuredContent: Schema.optional(Schema.Unknown)
})
const DiscoverResultSchema = Schema.Struct({
  _meta: Schema.Struct({
    "io.modelcontextprotocol/serverInfo": Schema.Struct({
      name: Schema.Literal("huly-mcp"),
      version: Schema.NonEmptyString
    })
  })
})
const parseResponse = Schema.decodeUnknownSync(Schema.fromJsonString(JsonRpcResponseSchema))
const processArgumentOffset = 2
const [command, expectedVersion] = Schema.decodeUnknownSync(
  Schema.Tuple([Schema.NonEmptyString, Schema.NonEmptyString])
)(process.argv.slice(processArgumentOffset))
const protocolVersion = "2026-07-28"
const interruptedExitCode = 130
const discoveryRequestId = 1
const successfulCallRequestId = 2
const invalidCallRequestId = 3
const meta = {
  "io.modelcontextprotocol/clientCapabilities": {},
  "io.modelcontextprotocol/clientInfo": { name: "packed-artifact-certification", version: "1.0.0" },
  "io.modelcontextprotocol/protocolVersion": protocolVersion
}
const request = (id: number, method: string, params: Readonly<Record<string, unknown>>): string =>
  JSON.stringify({ id, jsonrpc: "2.0", method, params: { ...params, _meta: meta } })

const runEofExchange = async (): Promise<void> => {
  const child = spawn(command, [], { env: { ...process.env, LAZY_ENVS: "true" }, stdio: ["pipe", "pipe", "pipe"] })
  let stdout = ""
  let stderr = ""
  child.stdout.setEncoding("utf8")
  child.stderr.setEncoding("utf8")
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk
  })
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk
  })
  const exited = new Promise<{ readonly code: number | null; readonly signal: NodeJS.Signals | null }>(
    (resolve, reject) => {
      child.once("error", reject)
      child.once("close", (code, signal) => resolve({ code, signal }))
    }
  )
  child.stdin.end(
    `${request(discoveryRequestId, "server/discover", {})}\n${request(successfulCallRequestId, "tools/call", {
      arguments: {},
      name: "get_huly_context"
    })}\n${request(invalidCallRequestId, "tools/call", { arguments: {}, name: "get_issue" })}\n`
  )
  const exit = await exited
  const responses = stdout
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => parseResponse(line))
  const byId = new Map(responses.map((response) => [response.id, response]))
  const discovery = Schema.decodeUnknownSync(DiscoverResultSchema)(byId.get(discoveryRequestId)?.result)
  const successfulCall = Schema.decodeUnknownSync(ToolCallResultSchema)(byId.get(successfulCallRequestId)?.result)
  const invalidCall = Schema.decodeUnknownSync(ToolCallResultSchema)(byId.get(invalidCallRequestId)?.result)
  if (exit.code !== 0 || exit.signal !== null) throw new Error(`Packed MCP EOF exit was ${JSON.stringify(exit)}.`)
  if (
    byId.get(discoveryRequestId)?.result === undefined ||
    byId.get(successfulCallRequestId)?.result === undefined ||
    byId.get(invalidCallRequestId)?.result === undefined
  ) {
    throw new Error(`Packed MCP did not drain discovery, success, and invalid calls: ${stdout}`)
  }
  if (stderr.includes("FiberFailure")) throw new Error("Packed MCP stderr exposed FiberFailure internals.")
  if (successfulCall.isError === true || successfulCall.structuredContent === undefined) {
    throw new Error("Packed MCP get_huly_context call did not return a structured success.")
  }
  if (invalidCall.isError !== true) throw new Error("Packed MCP invalid get_issue call did not return a tool error.")
  if (discovery._meta["io.modelcontextprotocol/serverInfo"].version !== expectedVersion) {
    throw new Error("Packed MCP discovery version does not match the package manifest.")
  }
}

const runSignalShutdown = async (): Promise<void> => {
  const child = spawn(command, [], { env: { ...process.env, LAZY_ENVS: "true" }, stdio: ["pipe", "pipe", "pipe"] })
  let stderr = ""
  let stdout = ""
  const discovered = new Promise<void>((resolve) => {
    child.stdout.setEncoding("utf8")
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk
      if (stdout.includes("\n")) resolve()
    })
  })
  child.stderr.setEncoding("utf8")
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk
  })
  const exited = new Promise<{ readonly code: number | null; readonly signal: NodeJS.Signals | null }>(
    (resolve, reject) => {
      child.once("error", reject)
      child.once("close", (code, signal) => resolve({ code, signal }))
    }
  )
  child.stdin.write(`${request(discoveryRequestId, "server/discover", {})}\n`)
  await discovered
  child.kill("SIGTERM")
  const exit = await exited
  if (exit.code !== interruptedExitCode || exit.signal !== null) {
    throw new Error(`Packed MCP signal exit was ${JSON.stringify(exit)}.`)
  }
  if (stderr.includes("FiberFailure")) throw new Error("Packed MCP signal stderr exposed FiberFailure internals.")
}

const main = async (): Promise<void> => {
  await runEofExchange()
  await runSignalShutdown()
  process.stdout.write("Packed MCP discovery, calls, EOF, and signal shutdown verified.\n")
}

main().catch(async (error: unknown) => {
  await Effect.runPromise(Console.error(error))
  process.exitCode = 1
})
