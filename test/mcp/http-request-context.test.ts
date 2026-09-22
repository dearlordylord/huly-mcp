import { Context, Effect, Exit } from "effect"
import { HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import { describe, expect, it } from "vitest"

import { ConfigValidationError, sanitizeHulyRuntimeConfigFromEnv } from "../../src/config/config.js"
import { requestContextMiddleware } from "../../src/mcp/http-request-context.js"
import { McpRequestContextService } from "../../src/mcp/request-context.js"

const runRequest = (
  request: HttpServerRequest.HttpServerRequest,
  options: Parameters<typeof requestContextMiddleware>[0],
  inspect: Effect.Effect<void, never, McpRequestContextService>
): Promise<HttpServerResponse.HttpServerResponse> =>
  Effect.runPromiseWith(Context.make(HttpServerRequest.HttpServerRequest, request))(
    requestContextMiddleware(options)(Effect.as(inspect, HttpServerResponse.empty()))
  )

describe("HTTP MCP request context", () => {
  it("preserves absolute adapter URLs and closes the acquired request lease", async () => {
    const runtimeConfig = sanitizeHulyRuntimeConfigFromEnv({})
    const seenUrls: Array<string> = []
    let closes = 0
    const expectedFailure = new ConfigValidationError({ message: "request-local client unavailable" })
    const request = HttpServerRequest.fromWeb(new Request("http://localhost/original")).modify({
      url: "https://mcp.example.test/custom"
    })

    await runRequest(
      request,
      {
        resolveClients: async () => Exit.fail(expectedFailure),
        getRuntimeConfigContextForHttpRequest: () => runtimeConfig,
        resolveClientLeaseForHttpRequest: async (webRequest) => {
          seenUrls.push(webRequest.url)
          return {
            bundle: Exit.fail(expectedFailure),
            close: () => {
              closes++
            }
          }
        }
      },
      Effect.gen(function* () {
        const context = yield* McpRequestContextService
        expect(context.runtimeConfig).toBe(runtimeConfig)
        expect(yield* Effect.promise(context.resolveClients)).toEqual(Exit.fail(expectedFailure))
      })
    )

    expect(seenUrls).toEqual(["https://mcp.example.test/custom"])
    expect(closes).toBe(1)
  })

  it("uses environment-derived config and the process client resolver for Web requests", async () => {
    const expectedFailure = new ConfigValidationError({ message: "process client unavailable" })
    let resolutions = 0
    const request = HttpServerRequest.fromWeb(new Request("http://localhost/from-web"))

    await runRequest(
      request,
      {
        resolveClients: async () => {
          resolutions++
          return Exit.fail(expectedFailure)
        }
      },
      Effect.gen(function* () {
        const context = yield* McpRequestContextService
        expect(context.runtimeConfig).toEqual(sanitizeHulyRuntimeConfigFromEnv(process.env))
        expect(yield* Effect.promise(context.resolveClients)).toEqual(Exit.fail(expectedFailure))
      })
    )

    expect(resolutions).toBe(1)
  })
})
