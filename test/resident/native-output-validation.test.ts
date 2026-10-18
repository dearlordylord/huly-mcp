import { Context, Effect, Exit, Layer, Ref, Schema, Stream } from "effect"
import { expect, it } from "vitest"

import { toDraft07JsonSchema } from "../../src/domain/schemas/json-schema.js"
import { HulyClient } from "../../src/huly/client.js"
import { HulyStorageClient } from "../../src/huly/storage.js"
import { makeEffectMcpRegistry } from "../../src/mcp/effect-ai-registry.js"
import type { ToolRegistry } from "../../src/mcp/tools/index.js"
import { defineTool } from "../../src/mcp/tools/registry.js"
import { MAX_ADAPTER_RESPONSE_BYTES } from "../../src/resident/adapter-limits.js"
import { HostMessage } from "../../src/resident/request-headers.js"
import { decodeBackendMessages } from "../../src/resident/response-stream.js"
import { TelemetryService } from "../../src/telemetry/telemetry.js"
import {
  exchange,
  initialize,
  withNativeServer,
  type Owner,
  type OwnerName
} from "../helpers/resident-native-fixture.js"

const Params = Schema.Struct({ valid: Schema.Boolean })
const Result = Schema.Struct({ count: Schema.Number.check(Schema.isGreaterThan(0)) })
const ToolError = Schema.Struct({
  isError: Schema.Literal(true),
  structuredContent: Schema.optionalKey(Schema.Never),
  content: Schema.Array(Schema.Struct({ type: Schema.Literal("text"), text: Schema.String }))
})
const SuccessfulEnvelope = Schema.Struct({
  isError: Schema.optionalKey(Schema.Literal(false)),
  structuredContent: Schema.Struct({ result: Schema.Json })
})
const BOUND = "5 seconds"
const HTTP_OK = 200

it.each(["native", "proxy-strict", "proxy-non-strict"])(
  "rejects invalid operation output at the native HTTPS server in %s mode and preserves subsequent calls",
  async (mode) => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const calls = yield* Ref.make(0)
        const tool = defineTool(
          {
            name: "fixture_output",
            description: "Exercise output validation over the native HTTP boundary.",
            inputSchema: toDraft07JsonSchema(Params),
            resultSchema: Result,
            category: "test"
          },
          Schema.decodeUnknownEffect(Params),
          ({ valid }) => Ref.update(calls, (count) => count + 1).pipe(Effect.as({ count: valid ? 1 : -1 }))
        )
        const registry: ToolRegistry = {
          tools: new Map([[tool.name, tool]]),
          definitions: [tool],
          handleToolCall: (name, args, huly, storage, workspace) =>
            name === tool.name ? tool.handler(args, huly, storage, workspace) : Promise.resolve(null)
        }
        const services = yield* Layer.build(
          Layer.merge(
            Layer.merge(HulyClient.testLayer({}), HulyStorageClient.testLayer({})),
            TelemetryService.testLayer({})
          )
        )
        const bundle = {
          hulyClient: Context.get(services, HulyClient),
          storageClient: Context.get(services, HulyStorageClient)
        }
        const registered = makeEffectMcpRegistry({
          registry,
          resolveClients: async () => Exit.succeed(bundle),
          discoverConcreteResources: false,
          telemetry: Context.get(services, TelemetryService),
          getHulyContext: () => Effect.die("Unexpected context lookup"),
          exposureOptions: {
            exposureConfig: {
              configuredMode: mode === "native" ? "native" : "proxy",
              proxyOutputStrict: mode === "proxy-strict"
            }
          }
        })
        yield* withNativeServer(
          new Map<OwnerName, Owner>(),
          (endpoint, identity) =>
            Effect.gen(function* () {
              const initialized = yield* exchange(endpoint, identity, "first", initialize("first"))
              expect(initialized.status).toBe(HTTP_OK)
              const call = (valid: boolean, id: number) =>
                Effect.gen(function* () {
                  const response = yield* exchange(
                    endpoint,
                    identity,
                    "first",
                    HostMessage.make({
                      jsonrpc: "2.0",
                      id,
                      method: "tools/call",
                      params:
                        mode === "native"
                          ? { name: tool.name, arguments: { valid } }
                          : { name: "invoke_tool", arguments: { toolName: tool.name, arguments: { valid } } }
                    }),
                    initialized.session
                  )
                  expect(response.status).toBe(HTTP_OK)
                  const messages = yield* decodeBackendMessages({
                    body: Stream.make(new TextEncoder().encode(response.body)),
                    contentType: response.contentType,
                    maxBytes: MAX_ADAPTER_RESPONSE_BYTES
                  }).pipe(Stream.runCollect)
                  expect(messages).toHaveLength(1)
                  return yield* Schema.decodeUnknownEffect(
                    Schema.Struct({ jsonrpc: Schema.Literal("2.0"), id: Schema.Literal(id), result: Schema.Unknown })
                  )(messages[0])
                })
              const rejected = yield* call(false, 2)
              const error = yield* Schema.decodeUnknownEffect(ToolError)(rejected.result)
              expect(error.content.map((item) => item.text)).toEqual(["Tool fixture_output produced invalid output"])
              const accepted = yield* call(true, 3)
              const expected = mode === "native" ? { count: 1 } : { toolName: tool.name, result: { count: 1 } }
              const successful = yield* Schema.decodeUnknownEffect(SuccessfulEnvelope)(accepted.result)
              expect(successful.structuredContent.result).toEqual(expected)
              expect(yield* Ref.get(calls)).toBe(2)
            }),
          { registration: registered.registration }
        )
      }).pipe(Effect.scoped, Effect.timeout(BOUND))
    )
  }
)
