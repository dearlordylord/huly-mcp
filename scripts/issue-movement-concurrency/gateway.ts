import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { createInterface } from "node:readline"
import { Schema } from "effect"
import { PositiveInteger, UrlString } from "../../src/domain/schemas/shared.js"
import { makeGatewayBarrier } from "./barrier.js"
import { GatewayArguments, GatewayControl, GatewayEvent, parseWritePoint, type GatewayPoint } from "./protocol.js"

const emit = (event: Schema.Schema.Type<typeof GatewayEvent>) =>
  process.stdout.write(`${JSON.stringify(Schema.decodeUnknownSync(GatewayEvent)(event))}\n`)
const readBody = async (request: IncomingMessage) => {
  const chunks: Array<Buffer> = []
  for await (const chunk of request) chunks.push(Buffer.from(Schema.decodeUnknownSync(Schema.Uint8Array)(chunk)))
  return Buffer.concat(chunks)
}
const fail = (response: ServerResponse) => {
  response.writeHead(503, { "content-type": "application/json" })
  response.end('{"error":"Disposable movement fixture transport refusal"}')
}

const main = async () => {
  const args = Schema.decodeUnknownSync(Schema.fromJsonString(GatewayArguments))(process.argv[2])
  const targets = new Map<string, URL>([["root", new URL(args.upstream)]])
  const state = { base: "", commitSeen: false }
  const suppressedWrites = new Set<GatewayPoint>()
  const attempts = new Map<GatewayPoint, number>()
  const barrier = makeGatewayBarrier(emit)
  const route = (value: string) => {
    const target = new URL(value.replace(/^ws:/, "http:").replace(/^wss:/, "https:"))
    const existing = [...targets.entries()].find(([, url]) => url.href === target.href)
    const key = existing?.[0] ?? `target-${targets.size}`
    targets.set(key, target)
    return `${state.base}/route/${key}`
  }
  type Json = Schema.Schema.Type<typeof Schema.Json>
  const rewriteDiscovery = (json: Json): Json => {
    if (Array.isArray(json)) return json.map(rewriteDiscovery)
    if (json === null || typeof json !== "object") return json
    return Object.fromEntries(
      Object.entries(json).map(([key, value]) => [
        key,
        (key === "ACCOUNTS_URL" || key === "endpoint") && typeof value === "string" && /^(https?|wss?):\/\//.test(value)
          ? route(value)
          : rewriteDiscovery(value)
      ])
    )
  }
  const visit = async (point: GatewayPoint | undefined, response: ServerResponse) => {
    if (point === undefined) return false
    const action = await barrier.visit(point)
    if (action === "fail") fail(response)
    if (action === "drop") response.destroy()
    return action === "fail" || action === "drop"
  }
  const handle = async (request: IncomingMessage, response: ServerResponse) => {
    const incoming = new URL(request.url ?? "/", state.base)
    const match = /^\/route\/([^/]+)(.*)$/.exec(incoming.pathname)
    const target = targets.get(match?.[1] ?? "root")
    if (target === undefined) {
      fail(response)
      return
    }
    const url = new URL(`${target.href.replace(/\/$/, "")}${match?.[2] ?? incoming.pathname}${incoming.search}`)
    const body = await readBody(request)
    const transaction =
      url.pathname.includes("/api/v1/tx/") && body.length > 0
        ? Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Json))(body.toString("utf8"))
        : undefined
    const writePoint = parseWritePoint(transaction)
    const point =
      writePoint ?? (state.commitSeen && url.pathname.includes("/api/v1/find-all/") ? "verification-read" : undefined)
    const attempt = writePoint === undefined ? 0 : (attempts.get(writePoint) ?? 0) + 1
    if (writePoint !== undefined) attempts.set(writePoint, attempt)
    if (writePoint !== undefined && suppressedWrites.has(writePoint)) {
      emit({ event: "retry-suppressed", point: writePoint, attempt: PositiveInteger.make(attempt) })
      fail(response)
      return
    }
    if (await visit(point, response)) {
      if (writePoint !== undefined && response.destroyed) suppressedWrites.add(writePoint)
      return
    }
    const headers = new Headers()
    for (const [key, value] of Object.entries(request.headers)) {
      if (value !== undefined && !["host", "connection", "content-length", "accept-encoding"].includes(key))
        headers.set(key, Array.isArray(value) ? value.join(",") : value)
    }
    const upstream = await fetch(url, {
      method: request.method ?? "GET",
      headers,
      ...(body.length === 0 ? {} : { body: new Uint8Array(body) }),
      redirect: "manual"
    })
    const content = Buffer.from(await upstream.arrayBuffer())
    const after =
      writePoint === "allocation-before"
        ? "allocation-after"
        : writePoint === "commit-before"
          ? "commit-after"
          : undefined
    if (writePoint === "commit-before") state.commitSeen = true
    if (after !== undefined)
      emit({
        event: "forwarded",
        point: after,
        status: PositiveInteger.make(upstream.status),
        attempt: PositiveInteger.make(attempt)
      })
    if (await visit(after, response)) {
      if (writePoint !== undefined && response.destroyed) suppressedWrites.add(writePoint)
      return
    }
    if (!url.pathname.includes("/api/v1/") && upstream.headers.get("content-encoding") === "snappy") {
      emit({
        event: "failure",
        reason: "Compressed bootstrap cannot be endpoint-routed; certification must not bypass the gateway"
      })
      fail(response)
      return
    }
    const rewritten =
      upstream.headers.get("content-encoding") !== "snappy" &&
      !url.pathname.includes("/api/v1/") &&
      upstream.headers.get("content-type")?.includes("json")
        ? Buffer.from(
            JSON.stringify(
              rewriteDiscovery(Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Json))(content.toString("utf8")))
            )
          )
        : content
    response.statusCode = upstream.status
    for (const [key, value] of upstream.headers)
      if (key === "content-encoding" && value === "snappy") response.setHeader(key, value)
      else if (!["content-length", "content-encoding", "transfer-encoding", "connection"].includes(key))
        response.setHeader(key, value)
    response.end(rewritten)
  }
  const server = createServer((request, response) => {
    void handle(request, response).catch(() => {
      emit({ event: "failure", reason: "Gateway routing or upstream transport unavailable" })
      if (!response.headersSent) fail(response)
      else response.destroy()
    })
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  if (address === null || typeof address === "string") throw new Error("Gateway listen address unavailable")
  state.base = `http://127.0.0.1:${address.port}`
  emit({ event: "ready", url: UrlString.make(state.base) })
  const controls = createInterface({ input: process.stdin })
  controls.on("line", (line) => {
    const command = Schema.decodeUnknownSync(Schema.fromJsonString(GatewayControl))(line)
    barrier.control(command)
    if (command.command === "arm") emit({ event: "armed", point: command.point, action: command.action })
    if (command.command === "close") {
      controls.close()
      server.closeAllConnections()
      server.close()
    }
  })
  controls.on("close", () => {
    barrier.control({ command: "close" })
    server.closeAllConnections()
    server.close()
  })
}
void main().catch(() => {
  emit({ event: "failure", reason: "Gateway startup failed" })
  process.exitCode = 1
})
