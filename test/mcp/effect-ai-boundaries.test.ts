import { Effect } from "effect"
import { describe, expect, it } from "vitest"

import { sanitizeHulyRuntimeConfigFromEnv } from "../../src/config/config.js"
import { CanonicalBase64ImageData } from "../../src/domain/schemas/attachments.js"
import {
  createImageSuccessResponse,
  createInvalidParamsError,
  createSuccessResponse,
  type McpToolResponse
} from "../../src/mcp/error-mapping.js"
import { toEffectCallToolResult } from "../../src/mcp/effect-ai-content.js"
import {
  requestScopedResolver,
  requestScopedRuntimeConfig,
  withRequestScopedResolver
} from "../../src/mcp/effect-ai-request.js"
import { McpRequestContextService } from "../../src/mcp/request-context.js"
import type { ClientResolver } from "../../src/runtime/client-resolver.js"

const pendingResolver = (): ClientResolver => () => new Promise(() => undefined)

describe("Effect AI boundary adapters", () => {
  it("preserves structured text and image success content", () => {
    const textResult = toEffectCallToolResult(createSuccessResponse({ issue: "HULY-1" }))
    const imageResult = toEffectCallToolResult(
      createImageSuccessResponse(
        { attachment: "preview" },
        { type: "image", data: CanonicalBase64ImageData.make("cG5n"), mimeType: "image/png" }
      )
    )

    expect(textResult.structuredContent).toEqual({ result: { issue: "HULY-1" } })
    expect(imageResult.content).toEqual([
      { type: "text", text: '{"attachment":"preview"}' },
      { type: "image", data: Uint8Array.from([112, 110, 103]), mimeType: "image/png" }
    ])
  })

  it("omits absent success metadata and supplies complete error metadata", () => {
    const unstructured: McpToolResponse = { content: [{ type: "text", text: "ready" }] }
    const defaultError: McpToolResponse = { content: [{ type: "text", text: "failed" }], isError: true }
    const taggedError = createInvalidParamsError("invalid", "ParseError")

    expect(toEffectCallToolResult(unstructured)).toMatchObject({ content: [{ type: "text", text: "ready" }] })
    expect(toEffectCallToolResult(unstructured).structuredContent).toBeUndefined()
    expect(toEffectCallToolResult(defaultError)._meta).toEqual({ errorCode: -32603 })
    expect(toEffectCallToolResult(taggedError)._meta).toEqual({ errorCode: -32602, errorTag: "ParseError" })
  })

  it("uses fallbacks outside a request and request-local values inside one", async () => {
    const fallbackResolver = pendingResolver()
    const requestResolver = pendingResolver()
    const fallbackRuntime = sanitizeHulyRuntimeConfigFromEnv({ HULY_WORKSPACE: "fallback" })
    const requestRuntime = sanitizeHulyRuntimeConfigFromEnv({ HULY_WORKSPACE: "request" })

    expect(await Effect.runPromise(requestScopedResolver(fallbackResolver))).toBe(fallbackResolver)
    expect(await Effect.runPromise(requestScopedRuntimeConfig(fallbackRuntime))).toBe(fallbackRuntime)

    const requestContext = McpRequestContextService.of({
      resolveClients: requestResolver,
      runtimeConfig: requestRuntime
    })
    const scopedResolver = requestScopedResolver(fallbackResolver).pipe(
      Effect.provideService(McpRequestContextService, requestContext)
    )
    const scopedRuntime = requestScopedRuntimeConfig(fallbackRuntime).pipe(
      Effect.provideService(McpRequestContextService, requestContext)
    )

    expect(await Effect.runPromise(scopedResolver)).toBe(requestResolver)
    expect(await Effect.runPromise(scopedRuntime)).toBe(requestRuntime)
  })

  it("uses a request resolver without optional lease retention or cancellation", async () => {
    const fallbackResolver = pendingResolver()
    const requestResolver = pendingResolver()
    const runtimeConfig = sanitizeHulyRuntimeConfigFromEnv({ HULY_WORKSPACE: "request" })
    const requestContext = McpRequestContextService.of({ resolveClients: requestResolver, runtimeConfig })

    const selected = await Effect.runPromise(
      withRequestScopedResolver(fallbackResolver, (resolver) => Effect.succeed(resolver)).pipe(
        Effect.provideService(McpRequestContextService, requestContext)
      )
    )

    expect(selected).toBe(requestResolver)
  })
})
