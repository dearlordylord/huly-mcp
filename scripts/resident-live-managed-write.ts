import { spawn } from "node:child_process"
import { once } from "node:events"
import * as fs from "node:fs/promises"
import { join } from "node:path"
import { createInterface } from "node:readline"
import { Effect, Redacted, Schema } from "effect"

import { CreateProjectParamsSchema, CreateProjectResultSchema } from "../src/domain/schemas/projects.js"
import { type ResidentPackagePath, ResidentRegistryEnvelope } from "../src/resident/managed-contract.js"
import type { ResidentDirectory } from "../src/resident/protected-path.js"
import { openKernelReapedEvents, type ReapedEventsFd } from "../test/helpers/kernel-reaped-events.js"
import type { LiveProbeEnvironment } from "./resident-live-read-contract.js"

const RESPONSE_BOUND = 5_000
const EXIT_BOUND = 7_000
const REQUEST_ID = 41
const NativeCall = Schema.Struct({
  jsonrpc: Schema.Literal("2.0"),
  id: Schema.Literal(REQUEST_ID),
  method: Schema.Literal("tools/call"),
  params: Schema.Struct({
    name: Schema.Literal("create_project"),
    arguments: CreateProjectParamsSchema,
    _meta: Schema.Struct({
      "io.modelcontextprotocol/protocolVersion": Schema.Literal("2026-07-28"),
      "io.modelcontextprotocol/clientCapabilities": Schema.Struct({}),
      "io.modelcontextprotocol/clientInfo": Schema.Struct({
        name: Schema.Literal("resident-live-write"),
        version: Schema.Literal("1.0")
      })
    })
  })
})
const NativeReply = Schema.Struct({
  jsonrpc: Schema.Literal("2.0"),
  id: NativeCall.fields.id,
  result: Schema.Struct({
    isError: Schema.optionalKey(Schema.Literal(false)),
    structuredContent: Schema.Struct({ result: CreateProjectResultSchema })
  })
})
const bounded = <A>(pending: Promise<A>, millis: number) =>
  Effect.runPromise(Effect.promise(() => pending).pipe(Effect.timeout(millis)))

const readGeneration = async (root: ResidentDirectory) => {
  const directory = join(root, "generations")
  const names = await fs.readdir(directory)
  const [name] = names
  if (names.length !== 1 || name === undefined) throw new Error("Managed write requires exactly one generation")
  return Schema.decodeUnknownSync(Schema.fromJsonString(ResidentRegistryEnvelope))(
    await fs.readFile(join(directory, name), "utf8")
  )
}

export const withLiveManagedWrite = async <A>(
  input: {
    readonly bundle: Schema.Schema.Type<typeof ResidentPackagePath>
    readonly directory: ResidentDirectory
    readonly reapedFd: ReapedEventsFd
  },
  environment: LiveProbeEnvironment,
  use: (
    submit: (
      project: Schema.Schema.Type<typeof CreateProjectParamsSchema>
    ) => Promise<Schema.Schema.Type<typeof CreateProjectResultSchema>>
  ) => Promise<A>
) => {
  const kernel = openKernelReapedEvents(input.reapedFd)
  const child = spawn(process.execPath, [input.bundle], {
    env: {
      ...Object.fromEntries(Object.entries(environment).map(([key, value]) => [key, Redacted.value(value)])),
      MCP_TRANSPORT: "stdio-resident",
      MCP_RESIDENT_STATE_DIRECTORY: input.directory,
      HULY_TOOL_MODE: "native",
      HULY_MCP_TELEMETRY: "0"
    }
  })
  const closed = once(child, "close")
  void closed.catch(() => {})
  child.stderr.resume()
  child.stdin.on("error", () => {})
  const lines = createInterface({ input: child.stdout })
  const incoming = lines[Symbol.asyncIterator]()
  const submit = async (project: Schema.Schema.Type<typeof CreateProjectParamsSchema>) => {
    child.stdin.write(
      `${Schema.encodeSync(Schema.fromJsonString(NativeCall))({
        jsonrpc: "2.0",
        id: REQUEST_ID,
        method: "tools/call",
        params: {
          name: "create_project",
          arguments: project,
          _meta: {
            "io.modelcontextprotocol/protocolVersion": "2026-07-28",
            "io.modelcontextprotocol/clientCapabilities": {},
            "io.modelcontextprotocol/clientInfo": { name: "resident-live-write", version: "1.0" }
          }
        }
      })}\n`
    )
    const next = await bounded(incoming.next(), RESPONSE_BOUND)
    if (next.done) throw new Error("Managed write adapter ended before its response")
    return Schema.decodeUnknownSync(Schema.fromJsonString(NativeReply))(next.value).result.structuredContent.result
  }
  const outcome = await (async (): Promise<
    { readonly value: A; readonly record: ResidentRegistryEnvelope } | { readonly error: unknown }
  > => {
    try {
      const value = await use(submit)
      return { value, record: await readGeneration(input.directory) }
    } catch (error) {
      return { error }
    }
  })()
  const cleanup = await Promise.allSettled([
    (async () => {
      child.stdin.end()
      const exited = await bounded(closed, RESPONSE_BOUND).catch(async () => {
        if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL")
        await bounded(closed, EXIT_BOUND)
        throw new Error("Managed write adapter did not close cooperatively")
      })
      if (exited[0] !== 0 || exited[1] !== null) throw new Error("Managed write adapter exited unsuccessfully")
    })()
  ])
  lines.close()
  try {
    if ("error" in outcome) throw outcome.error
    for (const result of cleanup) if (result.status === "rejected") throw result.reason
    const backendExit = await kernel.wait(outcome.record.diagnostics.processId)
    if (backendExit.exitCode !== 0 || (await fs.readdir(input.directory)).length !== 0)
      throw new Error("Managed write backend retirement not confirmed")
    return { observation: outcome.value, backendExit }
  } finally {
    kernel.close()
  }
}
