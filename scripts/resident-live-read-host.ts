import { createInterface } from "node:readline"
import { Effect, Redacted, Schema } from "effect"

import { MAX_ADAPTER_RESPONSE_BYTES } from "../src/resident/adapter-limits.js"
import { GetProjectParamsSchema, GetProjectResultSchema } from "../src/domain/schemas/projects.js"
import { readResidentAttachmentEnvelope } from "../src/resident/attachment-file.js"
import { BackendMessage } from "../src/resident/response-stream.js"
import { HostMessage } from "../src/resident/request-headers.js"
import { NativeDiscoverySchema, NativeToolListSchema } from "./integration-mcp-prior.js"
import {
  LIVE_PROBE_IO_BOUND,
  LIVE_PROBE_HOST_BOUND,
  LIVE_CONTINUED_READ_ID,
  LIVE_FIRST_READ_ID,
  type LiveProbeEnvironment,
  type LiveReadHostInput,
  type ManagedLiveReadHostInput,
  type ManagedLiveReadHostReceipt,
  AnyLiveReadHostReceipt,
  type LiveReadHostReceipt,
  LiveReadProbeError
} from "./resident-live-read-contract.js"
import { captureManagedReadIdentity } from "./resident-live-managed-identity.js"
import { probeIo, withLiveProbeChild } from "./resident-live-read-process.js"

const MAX_INTERLEAVED_NOTIFICATIONS = 64
const DISCOVER_ID = 1
const CATALOG_ID = 2
const RESOURCE_TEMPLATES_ID = 3
const ProjectCall = Schema.Struct({
  isError: Schema.optionalKey(Schema.Literal(false)),
  structuredContent: Schema.Struct({ result: GetProjectResultSchema })
})
const Templates = Schema.Struct({ resourceTemplates: Schema.Array(Schema.Struct({ uriTemplate: Schema.String })) })
const refuse = (phase: LiveReadProbeError["phase"]) => new LiveReadProbeError({ phase })
const metadata = (input: Pick<LiveReadHostInput, "host">) => ({
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientCapabilities": {},
  "io.modelcontextprotocol/clientInfo": { name: `resident-live-${input.host}`, version: "1.0" }
})

export const observeLiveResidentReads = Effect.fn("observeLiveResidentReads")(function* (
  input: LiveReadHostInput | ManagedLiveReadHostInput,
  environment: LiveProbeEnvironment,
  parentPid: LiveReadHostReceipt["parentPid"]
) {
  if ("attachment" in input) {
    const descriptor = yield* readResidentAttachmentEnvelope(input.attachment)
    if (descriptor.identity.generation !== input.generation) return yield* refuse("input")
  }
  const adapterEnvironment =
    "attachment" in input
      ? {
          ...environment,
          MCP_TRANSPORT: Redacted.make("stdio-http"),
          MCP_RESIDENT_ATTACHMENT_FILE: Redacted.make(input.attachment)
        }
      : {
          ...environment,
          MCP_TRANSPORT: Redacted.make("stdio-resident"),
          MCP_RESIDENT_STATE_DIRECTORY: Redacted.make(input.directory)
        }
  return yield* withLiveProbeChild([input.bundle], adapterEnvironment, (owned) =>
    Effect.acquireUseRelease(
      Effect.sync(() => createInterface({ input: owned.process.stdout })),
      (lines) =>
        Effect.gen(function* () {
          const incoming = lines[Symbol.asyncIterator]()
          const request = (
            id: NonNullable<HostMessage["id"]>,
            method: "server/discover" | "tools/list" | "resources/templates/list" | "tools/call",
            params: Readonly<Record<string, Schema.Json>>
          ) =>
            Effect.gen(function* () {
              const frame = yield* Schema.encodeEffect(Schema.fromJsonString(HostMessage))({
                jsonrpc: "2.0",
                id,
                method,
                params: { ...params, _meta: metadata(input) }
              })
              yield* probeIo(
                "send",
                () =>
                  new Promise<void>((resolve, reject) =>
                    owned.process.stdin.write(`${frame}\n`, (error) =>
                      error === null || error === undefined ? resolve() : reject(error)
                    )
                  )
              )
              for (let count = 0; count <= MAX_INTERLEAVED_NOTIFICATIONS; count++) {
                const next = yield* probeIo("response", () => incoming.next())
                if (next.done || Buffer.byteLength(next.value) > MAX_ADAPTER_RESPONSE_BYTES)
                  return yield* refuse("response")
                const message = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(BackendMessage))(next.value)
                if (!("id" in message)) continue
                if (message.id !== id || "error" in message) return yield* refuse("response")
                return message.result
              }
              return yield* refuse("response")
            }).pipe(
              Effect.timeout(LIVE_PROBE_IO_BOUND),
              Effect.mapError((error) => (error instanceof LiveReadProbeError ? error : refuse("response")))
            )
          yield* Schema.decodeUnknownEffect(NativeDiscoverySchema)(
            yield* request(DISCOVER_ID, "server/discover", {})
          ).pipe(Effect.mapError(() => refuse("discover")))
          const identity:
            | Pick<LiveReadHostReceipt, "mode" | "generation">
            | Pick<ManagedLiveReadHostReceipt, "mode" | "generation" | "backendProcessId"> =
            "attachment" in input
              ? { mode: "manual", generation: input.generation }
              : yield* captureManagedReadIdentity(input.directory, request)
          const catalog = yield* Schema.decodeUnknownEffect(NativeToolListSchema)(
            yield* request(CATALOG_ID, "tools/list", {})
          ).pipe(Effect.mapError(() => refuse("catalog")))
          if (!catalog.tools.some((tool) => tool.name === "get_project")) return yield* refuse("input")
          const templates = yield* Schema.decodeUnknownEffect(Templates)(
            yield* request(RESOURCE_TEMPLATES_ID, "resources/templates/list", {})
          ).pipe(Effect.mapError(() => refuse("templates")))
          if (!templates.resourceTemplates.some((template) => template.uriTemplate === "huly://projects/{project}"))
            return yield* refuse("response")
          for (const id of [LIVE_FIRST_READ_ID, LIVE_CONTINUED_READ_ID]) {
            const argumentsValue = yield* Schema.encodeEffect(GetProjectParamsSchema)({ project: input.target.project })
            const call = yield* Schema.decodeUnknownEffect(ProjectCall)(
              yield* request(id, "tools/call", { name: "get_project", arguments: argumentsValue })
            ).pipe(Effect.mapError(() => refuse("read")))
            if (
              call.structuredContent.result.identifier !== input.target.project ||
              call.structuredContent.result.name !== input.target.name
            )
              return yield* refuse("read")
          }
          owned.process.stdin.end()
          for (let count = 0; count <= MAX_INTERLEAVED_NOTIFICATIONS; count++) {
            const next = yield* probeIo("response", () => incoming.next())
            if (next.done) {
              yield* owned.exited
              return yield* Schema.decodeUnknownEffect(AnyLiveReadHostReceipt)({
                host: input.host,
                parentPid,
                adapterPid: owned.process.pid,
                ...identity,
                firstId: LIVE_FIRST_READ_ID,
                continuedId: LIVE_CONTINUED_READ_ID,
                target: input.target,
                adapterExit: 0
              })
            }
            if (Buffer.byteLength(next.value) > MAX_ADAPTER_RESPONSE_BYTES) return yield* refuse("response")
            const message = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(BackendMessage))(next.value)
            if ("id" in message) return yield* refuse("response")
          }
          return yield* refuse("response")
        }),
      (lines) => Effect.sync(() => lines.close())
    )
  )
}, Effect.timeout(LIVE_PROBE_HOST_BOUND))
