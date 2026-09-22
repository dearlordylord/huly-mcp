import { describe, it } from "@effect/vitest"
import { type Doc, toFindResult } from "@hcengineering/core"
import { Context, Effect, Exit, Layer, Schema } from "effect"
import { McpProtocol } from "effect/unstable/ai"
import { McpServer } from "effect/unstable/ai/McpServer"
import * as McpSchema from "effect/unstable/ai/McpSchema"
import { expect } from "vitest"

import { CanonicalBase64ImageData, SupportedAttachmentImageTypeSchema } from "../../src/domain/schemas/attachments.js"
import { createImageSuccessResponse, McpErrorCode } from "../../src/mcp/error-mapping.js"
import { HulyConnectionError } from "../../src/huly/errors-base.js"
import { HulyClient } from "../../src/huly/client.js"
import { Diagnostics } from "../../src/huly/diagnostics.js"
import { HulyStorageClient } from "../../src/huly/storage.js"
import {
  makeEffectMcpRegistry,
  registerEffectMcpRegistry,
  toEffectCallToolResult
} from "../../src/mcp/effect-ai-registry.js"
import { fetchLatestNpmVersion } from "../../src/mcp/effect-ai-dispatch.js"
import { requestScopedResolver, requestScopedRuntimeConfig } from "../../src/mcp/effect-ai-request.js"
import { registerEffectMcpResources } from "../../src/mcp/effect-ai-resources.js"
import { McpRequestContextService } from "../../src/mcp/request-context.js"
import { createRequestAdmission } from "../../src/mcp/request-admission.js"
import { createErrorResponse } from "../../src/mcp/tool-responses.js"
import { StatusMetadataUnresolvedWarningCode } from "../../src/domain/schemas/tool-warnings.js"
import { sanitizeHulyRuntimeConfigFromEnv } from "../../src/config/config.js"
import { toolRegistry } from "../../src/mcp/tools/index.js"
import type { TelemetryOperations } from "../../src/telemetry/telemetry.js"

const telemetry: TelemetryOperations = {
  sessionStart: () => {},
  firstListTools: () => {},
  toolCalled: () => {},
  shutdown: async () => {}
}

const resourceClient = McpSchema.McpServerClient.of({
  clientId: 1,
  protocolVersion: McpProtocol.v2025_06_18.protocolVersion,
  clientCapabilities: {},
  clientInfo: { name: "resource-test", version: "1.0.0" },
  initializePayload: Schema.decodeUnknownSync(McpSchema.Initialize.payloadSchema)({
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "resource-test", version: "1.0.0" }
  }),
  getClient: Effect.die("reverse requests are outside this test")
})

const withResourceClient = <A, E, R>(effect: Effect.Effect<A, E, R | McpSchema.McpServerClient>) =>
  effect.pipe(Effect.provideService(McpSchema.McpServerClient, resourceClient))

const successfulResolver = async () => {
  const services = await Effect.runPromise(
    Layer.build(
      Layer.merge(
        HulyClient.testLayer({ findAll: <T extends Doc>() => Effect.succeed(toFindResult<T>([])) }),
        HulyStorageClient.testLayer({})
      )
    ).pipe(Effect.scoped)
  )
  return Exit.succeed({
    hulyClient: Context.get(services, HulyClient),
    storageClient: Context.get(services, HulyStorageClient)
  })
}

const failedListResolver = async () => {
  const services = await Effect.runPromise(
    Layer.build(
      Layer.merge(
        HulyClient.testLayer({
          findAll: () => Effect.fail(new HulyConnectionError({ message: "project listing failed" }))
        }),
        HulyStorageClient.testLayer({})
      )
    ).pipe(Effect.scoped)
  )
  return Exit.succeed({
    hulyClient: Context.get(services, HulyClient),
    storageClient: Context.get(services, HulyStorageClient)
  })
}

const WireCallToolResultSchema = Schema.Struct({
  content: Schema.Array(
    Schema.Union([
      Schema.Struct({ type: Schema.Literal("text"), text: Schema.String }),
      Schema.Struct({ type: Schema.Literal("image"), data: Schema.String, mimeType: Schema.String })
    ])
  ),
  structuredContent: Schema.optional(Schema.Unknown),
  isError: Schema.optional(Schema.Boolean),
  _meta: Schema.optional(Schema.Record(Schema.String, Schema.Unknown))
})

const encodeWireCallToolResult = (result: typeof McpSchema.CallToolResult.Type) =>
  Schema.decodeUnknownSync(WireCallToolResultSchema)(
    Schema.encodeUnknownSync(Schema.toCodecJson(McpSchema.CallToolResult))(result)
  )

describe("Effect AI MCP registry adapter", () => {
  it("reads the latest package version through the injected fetch boundary", async () => {
    const fetchImpl: typeof fetch = async () => new Response(JSON.stringify({ version: "9.9.9" }), { status: 200 })

    await expect(fetchLatestNpmVersion(fetchImpl)).resolves.toBe("9.9.9")
  })

  it("returns unknown when the latest package response is unavailable", async () => {
    const fetchImpl: typeof fetch = async () => new Response("", { status: 503 })

    await expect(fetchLatestNpmVersion(fetchImpl)).resolves.toBe("unknown")
  })

  it("maps Huly rich image results and warnings to Effect MCP content", () => {
    const imageData = CanonicalBase64ImageData.make("dW5pcXVlLWltYWdlLWJ5dGVz")
    const imageType = Schema.decodeUnknownSync(SupportedAttachmentImageTypeSchema)("image/png")
    const response = createImageSuccessResponse(
      { name: "shot.png" },
      { type: "image", data: imageData, mimeType: imageType },
      [{ code: StatusMetadataUnresolvedWarningCode, message: "The preview is abbreviated." }]
    )

    const encoded = encodeWireCallToolResult(toEffectCallToolResult(response))

    expect(encoded.content).toEqual([
      { type: "text", text: JSON.stringify({ name: "shot.png" }) },
      { type: "text", text: JSON.stringify({ warnings: response.structuredContent?.warnings }) },
      { type: "image", data: imageData, mimeType: "image/png" }
    ])
    expect(encoded.structuredContent).toEqual(response.structuredContent)
  })

  it("keeps Huly error metadata on an Effect MCP tool result", () => {
    const response = createErrorResponse("Invalid issue", McpErrorCode.InvalidParams, "ParseError")
    const encoded = encodeWireCallToolResult(toEffectCallToolResult(response))

    expect(encoded.isError).toBe(true)
    expect(encoded.content).toEqual([{ type: "text", text: "Invalid issue" }])
    expect(encoded._meta).toEqual({ errorCode: McpErrorCode.InvalidParams, errorTag: "ParseError" })
  })

  it("maps minimal success and error content without optional metadata", () => {
    const success = encodeWireCallToolResult(toEffectCallToolResult({ content: [{ type: "text", text: "ok" }] }))
    const failure = encodeWireCallToolResult(
      toEffectCallToolResult({ content: [{ type: "text", text: "failed" }], isError: true })
    )
    expect(success).toEqual({ content: [{ type: "text", text: "ok" }] })
    expect(failure._meta).toEqual({ errorCode: McpErrorCode.InternalError })
  })

  it.effect("prefers the resolver attached to the current request fiber", () => {
    const fallback = async () => Exit.fail(new HulyConnectionError({ message: "fallback" }))
    const requestResolver = async () => Exit.fail(new HulyConnectionError({ message: "request" }))
    return Effect.gen(function* () {
      const resolver = yield* requestScopedResolver(fallback)
      expect(resolver).toBe(requestResolver)
    }).pipe(
      Effect.provideService(
        McpRequestContextService,
        McpRequestContextService.of({
          runtimeConfig: sanitizeHulyRuntimeConfigFromEnv({}),
          resolveClients: requestResolver
        })
      )
    )
  })

  it.effect("prefers runtime configuration attached to the current request fiber", () => {
    const fallback = sanitizeHulyRuntimeConfigFromEnv({})
    const requestRuntimeConfig = sanitizeHulyRuntimeConfigFromEnv({ HULY_URL: "https://request.example" })
    return Effect.gen(function* () {
      const runtimeConfig = yield* requestScopedRuntimeConfig(fallback)
      expect(runtimeConfig).toBe(requestRuntimeConfig)
    }).pipe(
      Effect.provideService(
        McpRequestContextService,
        McpRequestContextService.of({
          runtimeConfig: requestRuntimeConfig,
          resolveClients: async () => Exit.fail(new HulyConnectionError({ message: "not used" }))
        })
      )
    )
  })

  it.effect("uses resolver and runtime configuration fallbacks outside an HTTP request", () => {
    const resolver = async () => Exit.fail(new HulyConnectionError({ message: "fallback" }))
    const runtimeConfig = sanitizeHulyRuntimeConfigFromEnv({ HULY_URL: "https://fallback.example" })
    return Effect.gen(function* () {
      expect(yield* requestScopedResolver(resolver)).toBe(resolver)
      expect(yield* requestScopedRuntimeConfig(runtimeConfig)).toBe(runtimeConfig)
    })
  })

  it.effect("registers every tool and all Huly resource templates in one Effect", () =>
    Effect.gen(function* () {
      const adapter = makeEffectMcpRegistry({
        resolveClients: async () => Exit.fail(new HulyConnectionError({ message: "not used" })),
        telemetry,
        registry: toolRegistry,
        getHulyContext: () => Effect.die("context is not used during registration")
      })

      yield* adapter.registration
      const server = yield* McpServer
      expect(server.tools.length).toBeGreaterThan(toolRegistry.definitions.length)
      expect(server.resourceTemplates).toHaveLength(3)
    }).pipe(Effect.provide(McpServer.layer))
  )

  it.effect("registers only templates when concrete resource discovery is disabled", () =>
    Effect.gen(function* () {
      let discoveryAttempted = false
      yield* registerEffectMcpResources(successfulResolver, createRequestAdmission(), {
        discoverConcreteResources: false,
        concreteResources: Effect.sync(() => {
          discoveryAttempted = true
          return { resources: [] }
        })
      })

      const server = yield* McpServer
      expect(server.resourceTemplates).toHaveLength(3)
      expect(server.resources).toEqual([])
      expect(discoveryAttempted).toBe(false)
    }).pipe(Effect.provide(McpServer.layer))
  )

  it.effect("supports direct Effect registry registration", () =>
    Effect.gen(function* () {
      yield* registerEffectMcpRegistry({
        resolveClients: async () => Exit.fail(new HulyConnectionError({ message: "not used" })),
        telemetry,
        registry: toolRegistry,
        getHulyContext: () => Effect.die("not used")
      })
      const server = yield* McpServer
      expect(server.tools.length).toBeGreaterThan(0)
    }).pipe(Effect.provide(McpServer.layer))
  )

  it.effect("uses and closes an isolated concrete-resource discovery lease", () =>
    Effect.gen(function* () {
      let closes = 0
      const adapter = makeEffectMcpRegistry({
        resolveClients: failedListResolver,
        resolveResourceClientLease: async () => ({
          bundle: Exit.fail(new HulyConnectionError({ message: "isolated discovery unavailable" })),
          close: () => {
            closes++
          }
        }),
        telemetry,
        registry: toolRegistry,
        getHulyContext: () => Effect.die("not used")
      })

      yield* adapter.registration
      const server = yield* McpServer
      expect(server.resources).toEqual([])
      expect(closes).toBe(1)
    }).pipe(Effect.provide(McpServer.layer))
  )

  it.effect("discovers concrete resources through the fallback resolver when explicitly enabled", () =>
    Effect.gen(function* () {
      yield* registerEffectMcpResources(successfulResolver, createRequestAdmission(), {
        discoverConcreteResources: true
      })

      const server = yield* McpServer
      expect(server.resources).toEqual([])
    }).pipe(Effect.provide(McpServer.layer))
  )

  it.effect("falls back to an empty concrete catalog when discovery fails", () =>
    Effect.gen(function* () {
      yield* registerEffectMcpResources(failedListResolver, createRequestAdmission(), {
        discoverConcreteResources: true
      })
      yield* registerEffectMcpResources(successfulResolver, createRequestAdmission(), {
        discoverConcreteResources: true,
        leaseResolver: async () => {
          throw new Error("isolated discovery rejected")
        }
      })

      const server = yield* McpServer
      expect(server.resources).toEqual([])
    }).pipe(Effect.provide(McpServer.layer))
  )

  it.effect("registers listed Huly projects as concrete Effect AI resources", () =>
    Effect.gen(function* () {
      yield* registerEffectMcpResources(
        async () => Exit.fail(new HulyConnectionError({ message: "not used" })),
        makeEffectMcpRegistry({
          resolveClients: async () => Exit.fail(new HulyConnectionError({ message: "not used" })),
          telemetry,
          registry: toolRegistry,
          getHulyContext: () => Effect.die("not used")
        }).admission,
        {
          concreteResources: Effect.succeed({
            resources: [
              {
                uri: "huly://projects/TEST",
                name: "TEST",
                title: "Test Project",
                description: "Project used by Effect AI registry tests",
                mimeType: "application/json"
              },
              { uri: "huly://projects/MIN", name: "MIN", title: "Minimal Project" }
            ]
          })
        }
      )

      const server = yield* McpServer
      expect(server.resources.map(({ resource }) => resource.uri)).toEqual([
        "huly://projects/TEST",
        "huly://projects/MIN"
      ])
      expect(server.resourceTemplates).toHaveLength(3)
    }).pipe(Effect.provide(McpServer.layer))
  )

  it.effect("maps failed resource client resolution at the Effect AI boundary", () =>
    Effect.gen(function* () {
      const admission = createRequestAdmission()
      yield* registerEffectMcpResources(
        async () => Exit.fail(new HulyConnectionError({ message: "resource backend unavailable" })),
        admission,
        { concreteResources: Effect.succeed({ resources: [] }) }
      )
      const server = yield* McpServer
      const failed = yield* Effect.exit(withResourceClient(server.findResource("huly://projects/TEST")))
      expect(Exit.isFailure(failed)).toBe(true)
    }).pipe(Effect.provide(McpServer.layer))
  )

  it.effect("maps rejected resource client resolution at the Effect AI boundary", () =>
    Effect.gen(function* () {
      const rejectedAdmission = createRequestAdmission()
      yield* registerEffectMcpResources(
        async () => {
          throw new Error("resolver rejected")
        },
        rejectedAdmission,
        { concreteResources: Effect.succeed({ resources: [] }) }
      )
      const server = yield* McpServer
      const rejected = yield* Effect.exit(withResourceClient(server.findResource("huly://issues/TEST-1")))
      expect(Exit.isFailure(rejected)).toBe(true)
    }).pipe(Effect.provide(McpServer.layer))
  )

  it.effect("rejects resource reads after request admission quiesces", () =>
    Effect.gen(function* () {
      const admission = createRequestAdmission()
      yield* registerEffectMcpResources(
        async () => Exit.fail(new HulyConnectionError({ message: "not reached" })),
        admission,
        { concreteResources: Effect.succeed({ resources: [] }) }
      )
      yield* Effect.promise(admission.quiesce)
      const server = yield* McpServer
      const result = yield* Effect.exit(withResourceClient(server.findResource("huly://projects/TEST")))
      expect(Exit.isFailure(result)).toBe(true)
    }).pipe(Effect.provide(McpServer.layer))
  )

  it.effect("reads resources with diagnostics through an injected resource port", () =>
    Effect.gen(function* () {
      const admission = createRequestAdmission()
      yield* registerEffectMcpResources(successfulResolver, admission, {
        concreteResources: Effect.succeed({ resources: [] }),
        readResource: (uri) =>
          Effect.gen(function* () {
            const diagnostics = yield* Diagnostics
            yield* diagnostics.warnAgent({
              code: "status_metadata_unresolved",
              message: "Resource metadata was degraded for this test."
            })
            return { contents: [{ uri, mimeType: "application/json", text: "{}" }] }
          })
      })
      const server = yield* McpServer
      const result = yield* withResourceClient(server.findResource("huly://projects/TEST/issues/1"))
      expect(result.contents).toHaveLength(1)
      expect(result._meta).toHaveProperty("warnings")
    }).pipe(Effect.provide(McpServer.layer))
  )

  it.effect("maps resource reader failures and malformed responses", () =>
    Effect.gen(function* () {
      const failureAdmission = createRequestAdmission()
      yield* registerEffectMcpResources(successfulResolver, failureAdmission, {
        concreteResources: Effect.succeed({ resources: [] }),
        readResource: (uri) =>
          uri.includes("issues")
            ? Effect.fail(new HulyConnectionError({ message: "reader error" }))
            : Effect.fail("reader failed")
      })
      const server = yield* McpServer
      const failure = yield* Effect.exit(withResourceClient(server.findResource("huly://projects/TEST")))
      const errorFailure = yield* Effect.exit(withResourceClient(server.findResource("huly://issues/TEST-1")))
      expect(Exit.isFailure(failure)).toBe(true)
      expect(Exit.isFailure(errorFailure)).toBe(true)
    }).pipe(Effect.provide(McpServer.layer))
  )

  it.effect("preserves typed resource reader failures", () =>
    Effect.gen(function* () {
      yield* registerEffectMcpResources(successfulResolver, createRequestAdmission(), {
        concreteResources: Effect.succeed({ resources: [] }),
        readResource: () => Effect.fail(new McpSchema.InvalidParams({ message: "typed resource failure" }))
      })
      const server = yield* McpServer
      const result = yield* Effect.exit(withResourceClient(server.findResource("huly://projects/TEST")))
      const error = Exit.isFailure(result) ? result.cause : undefined
      expect(String(error)).toContain("typed resource failure")
    }).pipe(Effect.provide(McpServer.layer))
  )

  it.effect("rejects malformed successful resource payloads", () =>
    Effect.gen(function* () {
      const admission = createRequestAdmission()
      yield* registerEffectMcpResources(successfulResolver, admission, {
        concreteResources: Effect.succeed({ resources: [] }),
        readResource: () => Effect.succeed({})
      })
      const server = yield* McpServer
      const malformed = yield* Effect.exit(withResourceClient(server.findResource("huly://projects/TEST")))
      expect(Exit.isFailure(malformed)).toBe(true)
    }).pipe(Effect.provide(McpServer.layer))
  )

  it.effect("normalizes primitive resource-reader output to empty contents", () =>
    Effect.gen(function* () {
      yield* registerEffectMcpResources(successfulResolver, createRequestAdmission(), {
        concreteResources: Effect.succeed({ resources: [] }),
        readResource: () => Effect.succeed("plain resource")
      })
      const server = yield* McpServer
      const result = yield* withResourceClient(server.findResource("huly://projects/TEST"))
      expect(result.contents).toEqual([])
    }).pipe(Effect.provide(McpServer.layer))
  )

  it.effect("falls back to an empty concrete catalog when project listing fails", () =>
    Effect.gen(function* () {
      yield* registerEffectMcpResources(failedListResolver, createRequestAdmission())
      const server = yield* McpServer
      expect(server.resources).toEqual([])
    }).pipe(Effect.provide(McpServer.layer))
  )
})
