import { Context, Effect, Exit } from "effect"
import { HttpServerRequest, HttpServerResponse } from "effect/http"
import { describe, expect, it } from "vitest"
import { EventEmitter } from "node:events"

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

class AbortableWebRequest extends Request {
  readonly events = new EventEmitter()

  constructor(readonly socket: object | null | undefined) {
    super("http://localhost/request-context")
  }

  once(event: string, listener: () => void): unknown {
    return this.events.once(event, listener)
  }

  removeListener(event: string, listener: () => void): unknown {
    return this.events.removeListener(event, listener)
  }
}

describe("HTTP MCP request context", () => {
  it.each([
    { socket: undefined, response: undefined },
    { socket: null, response: null },
    { socket: {}, response: {} }
  ])(
    "releases the request lease when optional disconnect sources are unavailable: %j",
    async ({ response, socket }) => {
      const source = new AbortableWebRequest(socket)
      const request = Object.assign(HttpServerRequest.fromWeb(source), { resolvedResponse: response })
      const unavailable = new ConfigValidationError({ message: "request-local client unavailable" })
      let closes = 0
      await runRequest(
        request,
        {
          resolveClients: async () => Exit.fail(unavailable),
          resolveClientLeaseForHttpRequest: async () => ({
            bundle: Exit.fail(unavailable),
            close: () => {
              closes++
            }
          })
        },
        Effect.gen(function* () {
          const context = yield* McpRequestContextService
          expect(yield* Effect.promise(context.resolveClients)).toEqual(Exit.fail(unavailable))
          expect(source.events.listenerCount("aborted")).toBe(1)
        })
      )
      expect(closes).toBe(1)
      expect(source.events.listenerCount("aborted")).toBe(0)
    }
  )

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
