import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { once } from "node:events"
import { createServer as createTcpServer, type Socket } from "node:net"
import { resolve } from "node:path"
import { createInterface } from "node:readline"

import { Schema } from "effect"
import { beforeAll, describe, expect, it } from "vitest"

const builtServerPath = resolve(process.cwd(), "dist/index.cjs")
const PROCESS_BOUND_MS = 13_000
const SECRET = "subprocess-secret-token"
const PAYLOAD_MARKER = "lifecycle-secret-payload"
const JsonRpcEnvelopeSchema = Schema.Struct({ id: Schema.Number, jsonrpc: Schema.Literal("2.0") })
const parseJsonRpcLine = Schema.decodeUnknownSync(Schema.parseJson(JsonRpcEnvelopeSchema))

interface SpawnedServer {
  readonly child: ChildProcessWithoutNullStreams
  readonly exit: Promise<{ readonly code: number | null; readonly signal: string | null }>
  readonly firstLine: Promise<string>
  readonly pid: number
  readonly stderr: () => string
  readonly stdout: () => string
  readonly responseLine: (id: number) => Promise<string>
}

const withBound = <A>(promise: Promise<A>, label: string): Promise<A> =>
  new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} exceeded ${PROCESS_BOUND_MS}ms`)), PROCESS_BOUND_MS)
    void promise.then(
      (value) => {
        clearTimeout(timer)
        resolvePromise(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error)
      }
    )
  })

const spawnServer = (environment: Readonly<NodeJS.ProcessEnv> = {}): SpawnedServer => {
  const { MCP_AUTO_EXIT: _ignoredAutoExit, ...inheritedEnvironment } = process.env
  const child = spawn(process.execPath, [builtServerPath], {
    env: {
      ...inheritedEnvironment,
      HULY_MCP_TELEMETRY: "0",
      HULY_TOKEN: SECRET,
      HULY_URL: "https://huly.example.com",
      HULY_WORKSPACE: "workspace",
      LAZY_ENVS: "true",
      ...environment
    }
  })
  const pid = child.pid
  if (pid === undefined) throw new Error("Spawned stdio server did not expose a PID")

  const output = { stderr: "", stdout: "" }
  child.stdout.setEncoding("utf8")
  child.stderr.setEncoding("utf8")
  child.stdout.on("data", (chunk: string) => {
    output.stdout += chunk
  })
  child.stderr.on("data", (chunk: string) => {
    output.stderr += chunk
  })
  const lines = createInterface({ input: child.stdout })
  const firstLine = once(lines, "line").then(([line]) => (typeof line === "string" ? line : ""))
  const responseWaiters = new Map<number, (line: string) => void>()
  lines.on("line", (line) => {
    const envelope = parseJsonRpcLine(line)
    const resolveResponse = responseWaiters.get(envelope.id)
    if (resolveResponse === undefined) return
    responseWaiters.delete(envelope.id)
    resolveResponse(line)
  })
  const exit = once(child, "exit").then(([code, signal]) => ({
    code: typeof code === "number" ? code : null,
    signal: typeof signal === "string" ? signal : null
  }))

  child.stdin.write(
    `${JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "server/discover",
      params: {
        _meta: {
          "io.modelcontextprotocol/protocolVersion": "2026-07-28",
          "io.modelcontextprotocol/clientCapabilities": {},
          "io.modelcontextprotocol/clientInfo": { name: PAYLOAD_MARKER, version: "1.0.0" }
        }
      }
    })}\n`
  )

  const responseLine = (id: number): Promise<string> =>
    new Promise((resolveResponse) => responseWaiters.set(id, resolveResponse))

  return { child, exit, firstLine, pid, responseLine, stderr: () => output.stderr, stdout: () => output.stdout }
}

const processExists = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

const assertProtocolOnlyStdout = (stdout: string): void => {
  const lines = stdout
    .trim()
    .split("\n")
    .filter((line) => line.length > 0)
  expect(lines.length).toBeGreaterThan(0)
  for (const line of lines) {
    expect(parseJsonRpcLine(line).jsonrpc).toBe("2.0")
  }
}

const assertSanitizedStderr = (stderr: string): void => {
  expect(stderr).not.toContain(SECRET)
  expect(stderr).not.toContain(PAYLOAD_MARKER)
}

const ensureStopped = (server: SpawnedServer): void => {
  if (processExists(server.pid)) server.child.kill("SIGKILL")
}

describe("built stdio process lifecycle", () => {
  beforeAll(() => {
    const child = spawn("pnpm", ["build:mcp"], { cwd: process.cwd(), stdio: "ignore" })
    return withBound(
      once(child, "exit").then(([code]) => {
        if (code !== 0) throw new Error(`pnpm build:mcp exited with ${String(code)}`)
      }),
      "MCP build"
    )
  })

  it("exits successfully and removes its PID on stdin EOF without MCP_AUTO_EXIT", async () => {
    const server = spawnServer()
    try {
      await withBound(server.firstLine, "stdio discovery")
      server.child.stdin.end()
      const result = await withBound(server.exit, "EOF shutdown")

      expect(result).toEqual({ code: 0, signal: null })
      expect(processExists(server.pid)).toBe(false)
      assertProtocolOnlyStdout(server.stdout())
      assertSanitizedStderr(server.stderr())
    } finally {
      ensureStopped(server)
    }
  })

  it("runs bounded cleanup and removes its PID on SIGTERM", async () => {
    const server = spawnServer()
    try {
      await withBound(server.firstLine, "stdio discovery")
      server.child.kill("SIGTERM")
      const result = await withBound(server.exit, "SIGTERM shutdown")

      expect(result).toEqual({ code: 0, signal: null })
      expect(processExists(server.pid)).toBe(false)
      assertProtocolOnlyStdout(server.stdout())
      assertSanitizedStderr(server.stderr())
    } finally {
      ensureStopped(server)
    }
  })

  it("coalesces racing EOF and SIGTERM without leaving a PID", async () => {
    const server = spawnServer()
    try {
      await withBound(server.firstLine, "stdio discovery")
      server.child.stdin.end()
      server.child.kill("SIGTERM")
      const result = await withBound(server.exit, "racing shutdown")

      expect(result).toEqual({ code: 0, signal: null })
      expect(processExists(server.pid)).toBe(false)
      assertProtocolOnlyStdout(server.stdout())
      assertSanitizedStderr(server.stderr())
    } finally {
      ensureStopped(server)
    }
  })

  it("delivers a response admitted immediately before EOF", async () => {
    const server = spawnServer()
    try {
      await withBound(server.firstLine, "stdio discovery")
      const response = server.responseLine(2)
      server.child.stdin.end(
        `${JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: { name: "get_huly_context", arguments: {} }
        })}\n`
      )

      expect(await withBound(response, "in-flight response")).toContain('"id":2')
      expect(await withBound(server.exit, "in-flight EOF shutdown")).toEqual({ code: 0, signal: null })
      expect(processExists(server.pid)).toBe(false)
      assertProtocolOnlyStdout(server.stdout())
      assertSanitizedStderr(server.stderr())
    } finally {
      ensureStopped(server)
    }
  })

  it("abandons a Huly request on SIGTERM and removes its PID after the drain allowance", async () => {
    const sockets = new Set<Socket>()
    const stalledHuly = createTcpServer((socket) => {
      sockets.add(socket)
      socket.on("close", () => sockets.delete(socket))
    })
    stalledHuly.listen(0, "127.0.0.1")
    await once(stalledHuly, "listening")
    const address = stalledHuly.address()
    if (address === null || typeof address === "string") throw new Error("Stalled Huly server has no TCP port")
    const server = spawnServer({ HULY_URL: `http://127.0.0.1:${address.port}` })

    try {
      await withBound(server.firstLine, "stdio discovery")
      server.child.stdin.write(
        `${JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: { name: "list_projects", arguments: {} }
        })}\n`
      )
      await withBound(
        once(stalledHuly, "connection").then(() => {}),
        "Huly request admission"
      )
      server.child.kill("SIGTERM")

      const exit = await withBound(server.exit, "abandoned request shutdown").catch((error: unknown) => {
        throw new Error(
          `${error instanceof Error ? error.message : String(error)}; stdout=${server.stdout()}; stderr=${server.stderr()}`
        )
      })
      expect(exit).toEqual({ code: 0, signal: null })
      expect(processExists(server.pid)).toBe(false)
      expect(server.stdout()).not.toContain('"id":2')
      assertProtocolOnlyStdout(server.stdout())
      assertSanitizedStderr(server.stderr())
    } finally {
      ensureStopped(server)
      for (const socket of sockets) socket.destroy()
      await new Promise<void>((resolveClose, reject) => {
        stalledHuly.close((error) => (error === undefined ? resolveClose() : reject(error)))
      })
    }
  }, 20_000)
})
