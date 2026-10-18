import { createInterface } from "node:readline"
import { Effect, Redacted, Schema } from "effect"

import { MAX_ADAPTER_RESPONSE_BYTES } from "../src/resident/adapter-limits.js"
import { GetProjectParamsSchema } from "../src/domain/schemas/projects.js"
import { readResidentAttachmentEnvelope } from "../src/resident/attachment-file.js"
import { BackendMessage } from "../src/resident/response-stream.js"
import { HostMessage } from "../src/resident/request-headers.js"
import { NativeToolListSchema } from "./integration-mcp-prior.js"
import {
  resolveLiveReadClient,
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
import { discoverLiveReadProtocol, liveReadMetadata } from "./resident-live-protocol.js"
import { liveProjectCall, parseLiveProjectReply } from "./resident-live-exposure.js"
import { captureManagedReadIdentity } from "./resident-live-managed-identity.js"
import { probeIo, withLiveProbeChild } from "./resident-live-read-process.js"

const MAX_INTERLEAVED_NOTIFICATIONS = 64
const CATALOG_ID = 2
const RESOURCE_TEMPLATES_ID = 3
const Templates = Schema.Struct({ resourceTemplates: Schema.Array(Schema.Struct({ uriTemplate: Schema.String })) })
const refuse = (phase: LiveReadProbeError["phase"]) => new LiveReadProbeError({ phase })

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
            method: "initialize" | "server/discover" | "tools/list" | "resources/templates/list" | "tools/call",
            params: Readonly<Record<string, Schema.Json>>
          ) =>
            Effect.gen(function* () {
              const frame = yield* Schema.encodeEffect(Schema.fromJsonString(HostMessage))({
                jsonrpc: "2.0",
                id,
                method,
                params: { ...params, ...liveReadMetadata(input) }
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
          yield* discoverLiveReadProtocol(input, request, (frame) =>
            probeIo(
              "send",
              () =>
                new Promise<void>((resolve, reject) =>
                  owned.process.stdin.write(`${frame}\n`, (error) => (error ? reject(error) : resolve()))
                )
            )
          )
          const identity:
            | Pick<LiveReadHostReceipt, "mode" | "generation">
            | Pick<ManagedLiveReadHostReceipt, "mode" | "generation" | "backendProcessId" | "exposure"> =
            "attachment" in input
              ? { mode: "manual", generation: input.generation }
              : yield* captureManagedReadIdentity(input.directory, request, input.client)
          const catalog = yield* Schema.decodeUnknownEffect(NativeToolListSchema)(
            yield* request(CATALOG_ID, "tools/list", {})
          ).pipe(Effect.mapError(() => refuse("catalog")))
          const client = resolveLiveReadClient(input.host, input.client)
          const operation = client.exposure === "native" ? "get_project" : "invoke_tool"
          if (!catalog.tools.some((tool) => tool.name === operation)) return yield* refuse("catalog")
          if (identity.mode === "managed" && catalog.tools.length !== identity.exposure?.visibleToolCount)
            return yield* refuse("catalog")
          const templates = yield* Schema.decodeUnknownEffect(Templates)(
            yield* request(RESOURCE_TEMPLATES_ID, "resources/templates/list", {})
          ).pipe(Effect.mapError(() => refuse("templates")))
          if (!templates.resourceTemplates.some((template) => template.uriTemplate === "huly://projects/{project}"))
            return yield* refuse("response")
          for (const id of [LIVE_FIRST_READ_ID, LIVE_CONTINUED_READ_ID]) {
            const argumentsValue = yield* Schema.encodeEffect(GetProjectParamsSchema)({ project: input.target.project })
            const call = yield* parseLiveProjectReply(
              client,
              yield* request(id, "tools/call", liveProjectCall(client, argumentsValue))
            )
            if (call.identifier !== input.target.project || call.name !== input.target.name)
              return yield* refuse("read")
          }
          owned.process.stdin.end()
          for (let count = 0; count <= MAX_INTERLEAVED_NOTIFICATIONS; count++) {
            const next = yield* probeIo("response", () => incoming.next())
            if (next.done) {
              yield* owned.exited
              return yield* Schema.decodeUnknownEffect(AnyLiveReadHostReceipt)({
                client,
                catalog: catalog.tools.map((tool) => tool.name),
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
