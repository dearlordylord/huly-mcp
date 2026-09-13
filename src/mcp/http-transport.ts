/**
 * MCP 2026-07-28 HTTP transport with SDK-owned 2025 compatibility.
 *
 * The official SDK owns the MCP wire boundary while Effect Platform owns the
 * HTTP routing, server lifecycle, and Node adapter.
 */
import { timingSafeEqual } from "node:crypto"
import { createServer as createNodeServer } from "node:http"

import { NodeHttpServer } from "@effect/platform-node"
import {
  createMcpHandler,
  hostHeaderValidationResponse,
  localhostAllowedHostnames,
  localhostAllowedOrigins,
  type McpServerFactory,
  originValidationResponse
} from "@modelcontextprotocol/server"
import type { Duration, Scope } from "effect"
import { Context, Effect, Layer, Redacted, Schema } from "effect"
import { HttpEffect, HttpRouter, type HttpServer } from "effect/unstable/http"
import { observeHttpAdmission, type ObservedBearer } from "./http-admission-observations.js"
import { DEFAULT_HTTP_HOST_VALUE, DEFAULT_HTTP_PORT_NUMBER } from "./http-defaults.js"

const MIN_HTTP_PORT = 0
const HTTP_SERVICE_UNAVAILABLE = 503
const MAX_HTTP_PORT = 65_535
const HTTP_UNAUTHORIZED_ERROR_CODE = -32_000
const HTTP_UNAUTHORIZED = 401
const DEFAULT_HTTP_SHUTDOWN_GRACE_PERIOD = "5 seconds"

export const HttpPort = Schema.Int.check(
  Schema.isBetween(
    { minimum: MIN_HTTP_PORT, maximum: MAX_HTTP_PORT },
    { message: `must be a whole number between ${String(MIN_HTTP_PORT)} and ${String(MAX_HTTP_PORT)}` }
  )
).annotate({ identifier: "HttpPort", description: "TCP port used by the MCP HTTP server." })
export type HttpPort = Schema.Schema.Type<typeof HttpPort>

export const HttpHost = Schema.Trimmed.check(Schema.isNonEmpty()).annotate({
  identifier: "HttpHost",
  description: "Host interface used by the MCP HTTP server."
})
export type HttpHost = Schema.Schema.Type<typeof HttpHost>

export const DEFAULT_HTTP_PORT: HttpPort = HttpPort.make(DEFAULT_HTTP_PORT_NUMBER)
export const DEFAULT_HTTP_HOST: HttpHost = HttpHost.make(DEFAULT_HTTP_HOST_VALUE)

const UnauthorizedJsonRpcResponse = Schema.Struct({
  jsonrpc: Schema.Literal("2.0"),
  error: Schema.Struct({ code: Schema.Literal(HTTP_UNAUTHORIZED_ERROR_CODE), message: Schema.Literal("Unauthorized") }),
  id: Schema.Null
}).annotate({ identifier: "UnauthorizedJsonRpcResponse" })

const UNAUTHORIZED_JSON_RPC_RESPONSE = Schema.encodeSync(UnauthorizedJsonRpcResponse)(
  UnauthorizedJsonRpcResponse.make({
    jsonrpc: "2.0",
    error: { code: HTTP_UNAUTHORIZED_ERROR_CODE, message: "Unauthorized" },
    id: null
  })
)

const writeStderr = (message: string): void => {
  process.stderr.write(message)
}

interface HttpTransportConfig {
  readonly port: HttpPort
  readonly host: HttpHost
  readonly authToken?: Redacted.Redacted<string> | undefined
  readonly onReady?: (() => Effect.Effect<void>) | undefined
  readonly shutdownGracePeriod?: Duration.Input | undefined
}

export class HttpTransportError extends Schema.TaggedError<HttpTransportError>()("HttpTransportError", {
  message: Schema.String,
  cause: Schema.optional(Schema.Defect())
}) {}

export interface HttpServerFactory {
  readonly make: (
    port: HttpPort,
    host: HttpHost
  ) => Effect.Effect<HttpServer.HttpServer["Service"], HttpTransportError, Scope.Scope>
  readonly writeError?: (message: string) => void
}

export const httpServeError = (
  host: HttpHost,
  port: HttpPort,
  error: { readonly cause: unknown }
): HttpTransportError =>
  new HttpTransportError({
    message: `Failed to start HTTP server on ${host}:${port}: ${String(error.cause)}`,
    cause: error
  })

const defaultHttpServerFactory: HttpServerFactory = {
  make: (port, host) =>
    NodeHttpServer.make(createNodeServer, { port, host }).pipe(
      Effect.mapError((error) => httpServeError(host, port, error))
    ),
  writeError: writeStderr
}

export class HttpServerFactoryService extends Context.Service<HttpServerFactoryService, HttpServerFactory>()(
  "@hulymcp/HttpServerFactory"
) {
  static readonly defaultLayer: Layer.Layer<HttpServerFactoryService> = Layer.succeed(
    HttpServerFactoryService,
    defaultHttpServerFactory
  )
}

const activeAuthToken = (authToken: string | undefined): string | undefined => {
  const trimmed = authToken?.trim()
  return trimmed === undefined || trimmed === "" ? undefined : trimmed
}

const extractBearerToken = (authorization: unknown): string | undefined => {
  if (typeof authorization !== "string") return undefined
  return /^Bearer ([^ ]+)$/iu.exec(authorization)?.[1]
}

const tokenMatches = (received: string, expected: string): boolean => {
  const receivedBuffer = Buffer.from(received, "utf8")
  const expectedBuffer = Buffer.from(expected, "utf8")
  return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer)
}

const isAuthorizedMcpRequest = (request: Request, authToken: string | undefined): boolean => {
  const expected = activeAuthToken(authToken)
  if (expected === undefined) return true
  const received = extractBearerToken(request.headers.get("authorization"))
  return received !== undefined && tokenMatches(received, expected)
}

const unauthorizedResponse = (): Response =>
  Response.json(UNAUTHORIZED_JSON_RPC_RESPONSE, {
    status: HTTP_UNAUTHORIZED,
    headers: { "WWW-Authenticate": "Bearer" }
  })

export interface MountedMcpHttpHandler {
  readonly fetch: (request: Request) => Promise<Response>
  readonly close: Effect.Effect<void, HttpTransportError>
}

type MountedShutdownState =
  | { readonly phase: "Serving" }
  | { readonly phase: "Draining" | "Closed" | "TimedOut"; readonly close: Promise<void> }

type McpServerProduct = Awaited<ReturnType<McpServerFactory>>

interface McpServerCloseTracker {
  readonly factory: McpServerFactory
  readonly drain: () => Promise<void>
}

const createMcpServerCloseTracker = (createServer: McpServerFactory): McpServerCloseTracker => {
  const pending = new Set<Promise<void>>()
  const failures: Array<unknown> = []
  const track = (server: McpServerProduct): McpServerProduct => {
    const originalClose = server.close.bind(server)
    let closePromise: Promise<void> | undefined
    server.close = () => {
      if (closePromise !== undefined) return closePromise
      const closing = originalClose()
      closePromise = closing
      pending.add(closing)
      void closing.then(
        () => {
          pending.delete(closing)
          observeHttpAdmission("McpServerCloseTracker_closeSettles", { failed: false })
        },
        (error) => {
          pending.delete(closing)
          failures.push(error)
          observeHttpAdmission("McpServerCloseTracker_closeSettles", { failed: true })
        }
      )
      return closing
    }
    return server
  }
  const drain = async (): Promise<void> => {
    while (pending.size > 0) await Promise.allSettled([...pending])
    if (failures.length === 1) throw failures[0]
    if (failures.length > 1) throw new AggregateError(failures, "One or more MCP server closes failed")
  }
  return { factory: async (context) => track(await createServer(context)), drain }
}

export const createMountedMcpHttpHandler = (
  createServer: McpServerFactory,
  authToken?: Redacted.Redacted<string>,
  writeError: (message: string) => void = writeStderr,
  host: HttpHost = DEFAULT_HTTP_HOST,
  shutdownGracePeriod: Duration.Input = DEFAULT_HTTP_SHUTDOWN_GRACE_PERIOD
): MountedMcpHttpHandler => {
  const reportError = (): void => {
    writeError("MCP HTTP handler error\n")
  }
  const closeTracker = createMcpServerCloseTracker(createServer)
  const activeRequests = new Set<Promise<Response>>()
  let shutdownState: MountedShutdownState = { phase: "Serving" }
  const mcpHandler = createMcpHandler(closeTracker.factory, { legacy: "stateless", onerror: reportError })
  const protectLocalhost = host === "127.0.0.1" || host === "localhost" || host === "::1"
  observeHttpAdmission("createMountedMcpHttpHandler", {
    loopback: protectLocalhost,
    token: () => {
      if (authToken === undefined) return "NoToken"
      return activeAuthToken(Redacted.value(authToken)) === undefined ? "BlankToken" : "SecretToken"
    }
  })

  const reportCloseSettlement = (failed: boolean): void => {
    if (shutdownState.phase !== "Draining") return
    observeHttpAdmission("createMountedMcpHttpHandler_closeSettles", { timedOut: false, failed })
    shutdownState = { phase: "Closed", close: shutdownState.close }
  }
  const closeHandler = (): Promise<void> => {
    if (shutdownState.phase === "TimedOut") return Promise.resolve()
    if (shutdownState.phase !== "Serving") return shutdownState.close
    const closing = Promise.resolve().then(async () => {
      observeHttpAdmission("createMountedMcpHttpHandler_close", {})
      await mcpHandler.close()
      while (activeRequests.size > 0) await Promise.allSettled([...activeRequests])
      await closeTracker.drain()
      reportCloseSettlement(false)
    })
    shutdownState = { phase: "Draining", close: closing }
    return closing
  }

  return {
    fetch: async (request) => {
      const observed = {
        hostOk: () => hostHeaderValidationResponse(request, localhostAllowedHostnames()) === undefined,
        originOk: () => originValidationResponse(request, localhostAllowedOrigins()) === undefined,
        bearer: (): ObservedBearer => {
          const authorization = request.headers.get("authorization")
          const received = extractBearerToken(authorization)
          if (received === undefined) return authorization === null ? "NoBearer" : "MalformedAuthorization"
          const expected = activeAuthToken(authToken === undefined ? undefined : Redacted.value(authToken))
          return expected !== undefined && tokenMatches(received, expected) ? "MatchingBearer" : "WrongBearer"
        }
      }
      const rejected = protectLocalhost
        ? (hostHeaderValidationResponse(request, localhostAllowedHostnames()) ??
          originValidationResponse(request, localhostAllowedOrigins()))
        : undefined
      if (rejected !== undefined) {
        observeHttpAdmission("createMountedMcpHttpHandler_fetch", { ...observed, dispatched: false })
        return rejected
      }
      if (!isAuthorizedMcpRequest(request, authToken === undefined ? undefined : Redacted.value(authToken))) {
        observeHttpAdmission("createMountedMcpHttpHandler_fetch", { ...observed, dispatched: false })
        return unauthorizedResponse()
      }
      if (shutdownState.phase !== "Serving") {
        observeHttpAdmission("createMountedMcpHttpHandler_fetchRejectedDuringShutdown", {})
        return new Response(null, { status: HTTP_SERVICE_UNAVAILABLE })
      }

      observeHttpAdmission("createMountedMcpHttpHandler_fetch", { ...observed, dispatched: true })
      const response = mcpHandler.fetch(request)
      activeRequests.add(response)
      try {
        return await response
      } finally {
        activeRequests.delete(response)
        observeHttpAdmission("createMountedMcpHttpHandler_fetchSettles", {})
      }
    },
    close: Effect.tryPromise({
      try: closeHandler,
      catch: (cause) => {
        reportCloseSettlement(true)
        return new HttpTransportError({ message: "MCP HTTP handler shutdown failed", cause })
      }
    }).pipe(
      Effect.timeoutOrElse({
        duration: shutdownGracePeriod,
        orElse: () =>
          Effect.sync(() => {
            if (shutdownState.phase !== "Draining") return
            shutdownState = { phase: "TimedOut", close: shutdownState.close }
            observeHttpAdmission("createMountedMcpHttpHandler_closeSettles", { timedOut: true, failed: false })
            writeError("MCP HTTP handler shutdown timed out\n")
          })
      })
    )
  }
}

export const createMcpHttpApp = (mounted: MountedMcpHttpHandler) =>
  HttpRouter.toHttpEffect(HttpRouter.add("*", "/mcp", HttpEffect.fromWebHandler(mounted.fetch)))

const formatHttpAddress = (address: HttpServer.Address): string => {
  if (address._tag === "UnixAddress") return address.path
  const hostname = address.hostname.includes(":") ? `[${address.hostname}]` : address.hostname
  return `http://${hostname}:${String(address.port)}/mcp`
}

export const startHttpTransport = (
  config: HttpTransportConfig,
  createServer: McpServerFactory,
  configuredWriteError?: (message: string) => void
): Effect.Effect<void, HttpTransportError, HttpServerFactoryService | Scope.Scope> =>
  Effect.gen(function* () {
    const factory = yield* HttpServerFactoryService
    const writeError = configuredWriteError ?? factory.writeError ?? writeStderr
    const mounted = createMountedMcpHttpHandler(
      createServer,
      config.authToken,
      writeError,
      config.host,
      config.shutdownGracePeriod
    )

    const closeMounted = mounted.close.pipe(
      Effect.catch(() => Effect.sync(() => writeError("MCP HTTP handler shutdown failed\n")))
    )

    const server = yield* factory.make(config.port, config.host).pipe(
      Effect.tapError(() => Effect.sync(() => observeHttpAdmission("startHttpTransport", { bindOk: false }))),
      Effect.onError(() => closeMounted)
    )
    yield* Effect.sync(() => observeHttpAdmission("startHttpTransport", { bindOk: true }))
    const app = yield* createMcpHttpApp(mounted)
    yield* server.serve(app).pipe(Effect.onError(() => closeMounted))
    yield* Effect.addFinalizer(() => closeMounted)
    yield* config.onReady?.() ?? Effect.void

    yield* Effect.sync(() => {
      writeError(`MCP HTTP server listening on ${formatHttpAddress(server.address)}\n`)
    })

    return yield* Effect.never
  })
