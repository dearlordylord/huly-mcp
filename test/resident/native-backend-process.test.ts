import { execFile, spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { once } from "node:events"
import { dirname, join } from "node:path"
import { createInterface } from "node:readline"
import { promisify } from "node:util"
import * as fs from "node:fs/promises"
import { tmpdir } from "node:os"
import { Client } from "@modelcontextprotocol/client"
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio"
import { Deferred, Effect, Schema } from "effect"
import { McpSchema } from "effect/ai"
import { afterAll, beforeAll, beforeEach, describe, expect, it, onTestFailed } from "vitest"

import { buildIsolatedStdioServer, NATIVE_RUNTIME_EXTERNALS } from "../helpers/stdio-build.js"
import { testStdioEnvironment } from "../helpers/stdio-environment.js"
import { residentSelectionEnvironment } from "../helpers/resident-selection-environment.js"
import { NativeHostObservation } from "./native-host-observation.js"
import {
  exercisePackagedProfileLifecycle,
  ProfileLifecyclePhase,
  ProfileLifecycleProject
} from "./profile-lifecycle-fixture.js"
import { startDisposableRestFixture } from "./disposable-rest-fixture.js"
import { ProfileUrlSchema } from "../../src/profiles/model.js"

const PROCESS_BOUND = 30_000
const RESPONSE_BOUND = 5_000
const LEASE_PROCESS_BOUND = 45_000
const EXPIRY_WAIT = "31 seconds"
const READY_PREFIX = "Resident attachment: "
const PROTOCOL = "2026-07-28"
const runFile = promisify(execFile)
const initializeReply = Schema.fromJsonString(
  Schema.Struct({ jsonrpc: Schema.Literal("2.0"), id: Schema.Literal(1), result: McpSchema.InitializeResult })
)
let bundle: Awaited<ReturnType<typeof buildIsolatedStdioServer>>
let backend: ChildProcessWithoutNullStreams
let attachmentFile: string
let stateDirectory: string
let rest: Awaited<ReturnType<typeof startDisposableRestFixture>>
let profileUrl: Schema.Schema.Type<typeof ProfileUrlSchema>
let prepared = false
let failed = false
let nativeHostPrepared = false
let heldRead: { arrived: Deferred.Deferred<void>; release: Deferred.Deferred<void> } | undefined
const backendEnvironment = () => ({ ...residentSelectionEnvironment(), HULY_URL: profileUrl })

beforeEach(() =>
  onTestFailed(() => {
    failed = true
  })
)

beforeAll(async () => {
  bundle = await buildIsolatedStdioServer(PROCESS_BOUND)
  rest = await startDisposableRestFixture({
    projects: [ProfileLifecycleProject],
    onProjectRead: async () => {
      const pending = heldRead
      heldRead = undefined
      if (pending === undefined) return
      Effect.runSync(Deferred.succeed(pending.arrived, undefined))
      await Effect.runPromise(Deferred.await(pending.release))
    }
  })
  profileUrl = Schema.decodeUnknownSync(ProfileUrlSchema)(rest.endpoint)
  stateDirectory = await fs.mkdtemp(join(await fs.realpath(tmpdir()), "resident-native-process-"))
  backend = spawn(process.execPath, [bundle.path], {
    env: {
      ...backendEnvironment(),
      MCP_TRANSPORT: "resident-http",
      MCP_RESIDENT_STATE_DIRECTORY: stateDirectory,
      MCP_RESIDENT_ATTACHMENT_CAPACITY: "2"
    }
  })
  const lines = createInterface({ input: backend.stderr })
  const readiness = (async () => {
    for await (const line of lines) {
      if (line.startsWith(READY_PREFIX))
        return Schema.decodeUnknownSync(Schema.NonEmptyString)(line.slice(READY_PREFIX.length))
    }
    throw new Error("Owned native backend exited before announcing its listener")
  })()
  attachmentFile = await Effect.runPromise(Effect.promise(() => readiness).pipe(Effect.timeout(RESPONSE_BOUND)))
  prepared = true
}, PROCESS_BOUND)

afterAll(async () => {
  const backendCleanup = (async () => {
    if (backend !== undefined && backend.exitCode === null && backend.signalCode === null) {
      const exit = once(backend, "exit", { signal: AbortSignal.timeout(RESPONSE_BOUND) })
      backend.kill("SIGTERM")
      try {
        await exit
      } finally {
        if (backend.exitCode === null && backend.signalCode === null) {
          const forcedExit = once(backend, "exit", { signal: AbortSignal.timeout(RESPONSE_BOUND) })
          backend.kill("SIGKILL")
          await forcedExit
        }
      }
    }
  })()
  const cleanup = await Promise.allSettled([backendCleanup, rest?.close()])
  const failure = cleanup.find((result) => result.status === "rejected")
  if (failure !== undefined) throw failure.reason
  if (stateDirectory !== undefined) {
    const remaining = await fs.readdir(stateDirectory)
    expect(remaining).toEqual([])
    await fs.rmdir(stateDirectory)
  }
  if (prepared && !failed) await bundle?.cleanup()
})

describe("manual adapters against the packaged native HTTP backend", { timeout: PROCESS_BOUND }, () => {
  it.skipIf(process.platform !== "linux")(
    "keeps admitted profile authority through saved-profile changes",
    async () => {
      let phase: Schema.Schema.Type<typeof ProfileLifecyclePhase> = "connect"
      onTestFailed(() =>
        fs.writeFile(
          join(dirname(bundle.path), "profile-lifecycle-phase.json"),
          Schema.encodeSync(Schema.fromJsonString(ProfileLifecyclePhase))(phase)
        )
      )
      const readsBefore = rest.observed.projectReads
      await exercisePackagedProfileLifecycle(
        bundle.path,
        attachmentFile,
        profileUrl,
        (observed) => {
          phase = observed
        },
        async (read, change) => {
          const arrived = Effect.runSync(Deferred.make<void>())
          const release = Effect.runSync(Deferred.make<void>())
          heldRead = { arrived, release }
          let settled = false
          const pending = read()
            .then(
              () => true,
              () => false
            )
            .finally(() => {
              settled = true
            })
          try {
            await Effect.runPromise(Deferred.await(arrived).pipe(Effect.timeout(RESPONSE_BOUND)))
            expect(settled).toBe(false)
            await change()
            expect(settled).toBe(false)
          } finally {
            heldRead = undefined
            Effect.runSync(Deferred.succeed(release, undefined))
            await pending
          }
          expect(await pending).toBe(true)
        }
      )
      expect(rest.observed.projectReads - readsBefore).toBe(10)
      expect(rest.observed.projectWrites).toBe(0)
      expect(rest.observed.invalidRequests).toBe(0)
      expect(backend.exitCode).toBeNull()
      expect(backend.signalCode).toBeNull()
    }
  )

  it("refuses another identity, policy, or missing selection before admitting an MCP session", async () => {
    const base = backendEnvironment()
    for (const selected of [
      { ...base, HULY_TOKEN: "other-fixture-token" },
      { ...base, HULY_WORKSPACE: "other-workspace" },
      { ...base, HULY_CONNECTION_TIMEOUT: "2500" },
      { ...base, TOOLS: "get_huly_context" },
      { ...base, HULY_TOOL_MODE: "native" },
      { ...base, PROXY_OUTPUT_STRICT: "true" },
      testStdioEnvironment()
    ]) {
      const transport = new StdioClientTransport({
        command: process.execPath,
        args: [bundle.path],
        stderr: "pipe",
        env: { ...selected, MCP_TRANSPORT: "stdio-http", MCP_RESIDENT_ATTACHMENT_FILE: attachmentFile }
      })
      const client = new Client({ name: "refused-host", version: "1.0" })
      try {
        await expect(client.connect(transport, { timeout: RESPONSE_BOUND })).rejects.toThrow()
      } finally {
        await transport.close()
      }
    }
    expect(backend.exitCode).toBeNull()
    expect(backend.signalCode).toBeNull()
  })

  it.each(["death", "pause"])(
    "expires an adapter after %s while its survivor keeps the same backend",
    { timeout: LEASE_PROCESS_BOUND },
    async (mode) => {
      const transport = new StdioClientTransport({
        command: process.execPath,
        args: [bundle.path],
        stderr: "pipe",
        env: { ...backendEnvironment(), MCP_TRANSPORT: "stdio-http", MCP_RESIDENT_ATTACHMENT_FILE: attachmentFile }
      })
      const survivor = new Client(
        { name: "claude-code", version: "1.0" },
        { versionNegotiation: { mode: { pin: PROTOCOL } } }
      )
      const survivorClosed = Effect.runSync(Deferred.make<void>())
      survivor.onclose = () => Effect.runSync(Deferred.succeed(survivorClosed, undefined))
      const abandoned = spawn(process.execPath, [bundle.path], {
        env: { ...backendEnvironment(), MCP_TRANSPORT: "stdio-http", MCP_RESIDENT_ATTACHMENT_FILE: attachmentFile }
      })
      const output: Array<string> = []
      const firstReply = Effect.runSync(Deferred.make<void>())
      const lines = createInterface({ input: abandoned.stdout })
      lines.on("line", (line) => {
        output.push(line)
        Effect.runSync(Deferred.succeed(firstReply, undefined))
      })
      const abandonedExit = once(abandoned, "exit")
      try {
        await survivor.connect(transport, { timeout: RESPONSE_BOUND })
        abandoned.stdin.write(
          `${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "paused-owned-host", version: "1.0" } } })}\n`
        )
        await Effect.runPromise(Deferred.await(firstReply).pipe(Effect.timeout(RESPONSE_BOUND)))
        expect(output).toHaveLength(1)
        const initialized = Schema.decodeUnknownSync(initializeReply)(output[0])
        expect(initialized.result.protocolVersion).toBe("2025-06-18")
        abandoned.kill(mode === "death" ? "SIGKILL" : "SIGSTOP")
        if (mode === "death")
          await Effect.runPromise(Effect.promise(() => abandonedExit).pipe(Effect.timeout(RESPONSE_BOUND)))
        else abandoned.stdin.write('{"jsonrpc":"2.0","id":2,"method":"ping"}\n')
        await Effect.runPromise(Effect.sleep(EXPIRY_WAIT))
        const catalog = await survivor.listTools(undefined, { timeout: RESPONSE_BOUND })
        expect(catalog.tools.length).toBeGreaterThan(0)
        const fresh = new StdioClientTransport({
          command: process.execPath,
          args: [bundle.path],
          stderr: "pipe",
          env: { ...backendEnvironment(), MCP_TRANSPORT: "stdio-http", MCP_RESIDENT_ATTACHMENT_FILE: attachmentFile }
        })
        const next = new Client(
          { name: "claude-code", version: "1.0" },
          { versionNegotiation: { mode: { pin: PROTOCOL } } }
        )
        const nextClosed = Effect.runSync(Deferred.make<void>())
        next.onclose = () => Effect.runSync(Deferred.succeed(nextClosed, undefined))
        try {
          await next.connect(fresh, { timeout: RESPONSE_BOUND })
          expect((await next.listTools(undefined, { timeout: RESPONSE_BOUND })).tools.length).toBeGreaterThan(0)
          if (mode === "pause") {
            abandoned.kill("SIGCONT")
            const [code] = await Effect.runPromise(
              Effect.promise(() => abandonedExit).pipe(Effect.timeout(RESPONSE_BOUND))
            )
            expect(code).toBe(1)
            expect(output).toHaveLength(1)
          }
        } finally {
          const ownsAdapter = fresh.pid !== null
          await fresh.close()
          if (ownsAdapter) await Effect.runPromise(Deferred.await(nextClosed).pipe(Effect.timeout(RESPONSE_BOUND)))
        }
        expect(backend.exitCode).toBeNull()
        expect(backend.signalCode).toBeNull()
        expect((await survivor.listTools(undefined, { timeout: RESPONSE_BOUND })).tools.length).toBeGreaterThan(0)
      } finally {
        if (abandoned.exitCode === null && abandoned.signalCode === null) {
          abandoned.kill("SIGCONT")
          abandoned.kill("SIGKILL")
          await Effect.runPromise(Effect.promise(() => abandonedExit).pipe(Effect.timeout(RESPONSE_BOUND)))
        }
        lines.close()
        const ownsAdapter = transport.pid !== null
        await transport.close()
        if (ownsAdapter) await Effect.runPromise(Deferred.await(survivorClosed).pipe(Effect.timeout(RESPONSE_BOUND)))
      }
    }
  )

  it.each(["modern", "legacy"])("serves %s catalogs to adapters owned by independent parents", async (mode) => {
    if (!nativeHostPrepared) {
      await runFile(
        "pnpm",
        [
          "exec",
          "esbuild",
          "test/resident/fixtures/native-host.ts",
          "--bundle",
          "--platform=node",
          "--format=cjs",
          ...NATIVE_RUNTIME_EXTERNALS,
          `--outfile=${join(dirname(bundle.path), "native-host.cjs")}`
        ],
        { timeout: PROCESS_BOUND }
      )
      nativeHostPrepared = true
    }
    const observations = await Promise.all(
      ["claude-code", "codex-mcp-client"].map(async (host) => {
        const { stdout } = await runFile(
          process.execPath,
          [join(dirname(bundle.path), "native-host.cjs"), bundle.path, attachmentFile, host, mode, profileUrl],
          { timeout: PROCESS_BOUND, env: backendEnvironment() }
        )
        return Schema.decodeUnknownSync(Schema.fromJsonString(NativeHostObservation))(stdout)
      })
    )
    expect(new Set(observations.map((observation) => observation.parentPid)).size).toBe(observations.length)
    expect(new Set(observations.map((observation) => observation.adapterPid)).size).toBe(observations.length)
    for (const observation of observations) {
      expect(observation.parentPid).not.toBe(process.pid)
      expect(observation.adapterPid).not.toBe(observation.parentPid)
      expect(observation.contextIsError).toBe(false)
      expect(observation.resourceTemplates.length).toBeGreaterThan(0)
      expect(observation.tools.includes("list_projects")).toBe(observation.host === "claude-code")
      expect(observation.tools.includes("invoke_tool")).toBe(observation.host === "codex-mcp-client")
    }
  })

  it.each(["modern", "legacy"])("preserves %s host identity and catalog policy", async (mode) => {
    const hosts = ["claude-code", "codex-mcp-client"].map((name) => {
      const transport = new StdioClientTransport({
        command: process.execPath,
        args: [bundle.path],
        stderr: "pipe",
        env: { ...backendEnvironment(), MCP_TRANSPORT: "stdio-http", MCP_RESIDENT_ATTACHMENT_FILE: attachmentFile }
      })
      const client = new Client(
        { name, version: "1.0" },
        { versionNegotiation: mode === "modern" ? { mode: { pin: PROTOCOL } } : { mode: "legacy" } }
      )
      const closed = Effect.runSync(Deferred.make<void>())
      client.onclose = () => Effect.runSync(Deferred.succeed(closed, undefined))
      return { client, closed, name, transport }
    })
    try {
      await Promise.all(hosts.map(({ client, transport }) => client.connect(transport, { timeout: RESPONSE_BOUND })))
      for (const { client, name } of hosts) {
        const tools = await client.listTools(undefined, { timeout: RESPONSE_BOUND })
        const names = tools.tools.map((tool) => tool.name)
        expect(names).toContain("get_huly_context")
        expect(names.includes("list_projects")).toBe(name === "claude-code")
        expect(names.includes("invoke_tool")).toBe(name === "codex-mcp-client")
        const result = await client.callTool({ name: "get_huly_context", arguments: {} }, { timeout: RESPONSE_BOUND })
        expect(result.isError, JSON.stringify(result)).not.toBe(true)
        if (mode === "modern" && name === "claude-code") {
          for (const uri of ["fixture://проект", "=?base64?Zml4dHVyZQ==?=", " fixture://space "]) {
            await expect(client.readResource({ uri }, { timeout: RESPONSE_BOUND })).rejects.toMatchObject({
              message: expect.stringContaining(`Resource '${uri}' not found`)
            })
          }
        }
      }
    } finally {
      await Promise.all(
        hosts.map(async ({ closed, transport }) => {
          const ownsAdapter = transport.pid !== null
          await transport.close()
          if (ownsAdapter) await Effect.runPromise(Deferred.await(closed).pipe(Effect.timeout(RESPONSE_BOUND)))
        })
      )
    }
  })
})
