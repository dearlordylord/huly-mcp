/**
 * Effect-native HTTP transport for the MCP server.
 *
 * The MCP protocol layer owns JSON-RPC, sessions, and request interruption.
 * This module owns the Node listener, the local-host policy, bearer
 * authentication, and the lifetime of the layer scope in which the protocol
 * is mounted.
 */
import { NodeHttpServer } from "@effect/platform-node"
import { timingSafeEqual } from "node:crypto"
import { createServer as createNodeServer } from "node:http"
import { Cause, Context, Effect, Exit, Layer, Redacted, Schema, Scope, type Duration } from "effect"
import { HttpRouter, HttpServer } from "effect/unstable/http"
import type * as HttpMiddlewareModule from "effect/unstable/http/HttpMiddleware"
import * as HttpHeaders from "effect/unstable/http/Headers"
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse"
import * as HttpServerRequestModule from "effect/unstable/http/HttpServerRequest"

import { DEFAULT_HTTP_HOST_VALUE, DEFAULT_HTTP_PORT_NUMBER } from "./http-defaults.js"

const MIN_HTTP_PORT = 0
const MAX_HTTP_PORT = 65_535
const HTTP_UNAUTHORIZED_ERROR_CODE = -32_000
const HTTP_UNAUTHORIZED = 401
const HTTP_FORBIDDEN = 403
const DEFAULT_HTTP_SHUTDOWN_GRACE_PERIOD = "5 seconds"
const NO_INDEX = -1

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

const UNAUTHORIZED_JSON_RPC_RESPONSE = Schema.encodeSync(UnauthorizedJsonRpcResponse)({
  jsonrpc: "2.0",
  error: { code: HTTP_UNAUTHORIZED_ERROR_CODE, message: "Unauthorized" },
  id: null
})

const writeStderr = (message: string): void => {
  process.stderr.write(message)
}

export interface HttpTransportConfig {
  readonly port: HttpPort
  readonly host: HttpHost
  readonly authToken?: Redacted.Redacted<string> | undefined
  /** Middleware that runs after transport policy but before MCP routing. */
  readonly middleware?: HttpMiddlewareModule.HttpMiddleware | undefined
  /** Completes when the owner requests listener shutdown. */
  readonly shutdown?: Effect.Effect<void> | undefined
  readonly onReady?: (() => Effect.Effect<void>) | undefined
  readonly onShutdown?: (() => Effect.Effect<void, unknown>) | undefined
  readonly shutdownGracePeriod?: Duration.Input | undefined
}

export class HttpTransportError extends Schema.TaggedError<HttpTransportError>()("HttpTransportError", {
  message: Schema.String,
  cause: Schema.optional(Schema.Defect())
}) {}

/**
 * A factory keeps the listener injectable for deterministic transport tests.
 * The optional grace period is forwarded to the Node adapter and is not part
 * of the application protocol.
 */
export interface HttpServerFactory {
  readonly make: (
    port: HttpPort,
    host: HttpHost,
    gracefulShutdownTimeout?: Duration.Input
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
  make: (port, host, gracefulShutdownTimeout) =>
    NodeHttpServer.make(createNodeServer, {
      port,
      host,
      ...(gracefulShutdownTimeout === undefined ? {} : { gracefulShutdownTimeout })
    }).pipe(Effect.mapError((error) => httpServeError(host, port, error))),
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

const activeAuthToken = (authToken: Redacted.Redacted<string> | undefined): string | undefined => {
  if (authToken === undefined) return undefined
  const value = Redacted.value(authToken).trim()
  return value === "" ? undefined : value
}

const extractBearerToken = (authorization: string | undefined): string | undefined =>
  authorization === undefined ? undefined : /^Bearer ([^ ]+)$/u.exec(authorization)?.[1]

const tokenMatches = (received: string, expected: string): boolean => {
  const receivedBuffer = Buffer.from(received, "utf8")
  const expectedBuffer = Buffer.from(expected, "utf8")
  return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer)
}

const isAuthorized = (authorization: string | undefined, authToken: Redacted.Redacted<string> | undefined): boolean => {
  const expected = activeAuthToken(authToken)
  if (expected === undefined) return true
  const received = extractBearerToken(authorization)
  return received !== undefined && tokenMatches(received, expected)
}

const localHostnames = new Set(["127.0.0.1", "localhost", "::1"])

const normalizedHostname = (value: string): string => {
  const trimmed = value.trim().toLowerCase()
  if (trimmed.startsWith("[")) {
    const closingBracket = trimmed.indexOf("]")
    return closingBracket > 0 ? trimmed.slice(1, closingBracket) : trimmed
  }
  const colon = trimmed.lastIndexOf(":")
  return colon > NO_INDEX && trimmed.indexOf(":") === colon ? trimmed.slice(0, colon) : trimmed
}

const isLocalBinding = (host: HttpHost): boolean => localHostnames.has(normalizedHostname(host))

const isAllowedHostHeader = (requestHost: string | undefined): boolean =>
  requestHost !== undefined && localHostnames.has(normalizedHostname(requestHost))

const isAllowedOrigin = (origin: string | undefined): boolean => {
  if (origin === undefined) return true
  try {
    return localHostnames.has(normalizedHostname(new URL(origin).hostname))
  } catch {
    return false
  }
}

const unauthorizedResponse = (): HttpServerResponse.HttpServerResponse =>
  HttpServerResponse.jsonUnsafe(UNAUTHORIZED_JSON_RPC_RESPONSE, {
    status: HTTP_UNAUTHORIZED,
    headers: { "www-authenticate": "Bearer" }
  })

const forbiddenResponse = (): HttpServerResponse.HttpServerResponse =>
  HttpServerResponse.empty({ status: HTTP_FORBIDDEN })

/**
 * Applies transport policy without replacing the request fiber context. The
 * MCP adapter can therefore read `HttpServerRequest` and derive request-local
 * configuration/client leases in the same fiber that executes a tool call.
 */
export const httpPolicyMiddleware =
  (config: {
    readonly host: HttpHost
    readonly authToken?: Redacted.Redacted<string> | undefined
  }): HttpMiddlewareModule.HttpMiddleware =>
  (httpEffect) =>
    Effect.gen(function* () {
      const request = yield* HttpServerRequestModule.HttpServerRequest
      const enforceLocalRequestPolicy = isLocalBinding(config.host)
      if (enforceLocalRequestPolicy && !isAllowedHostHeader(request.headers.host)) return forbiddenResponse()
      if (enforceLocalRequestPolicy && !isAllowedOrigin(request.headers.origin)) return forbiddenResponse()
      if (!isAuthorized(request.headers.authorization, config.authToken)) return unauthorizedResponse()
      // Effect AI's `layerHttp` intentionally rejects all Origins unless its
      // exact allow-list contains one. We perform the host/origin decision here
      // (including arbitrary local ports), then hide the accepted browser Origin
      // from that lower-level route guard.
      const requestForMcp = request.modify({ headers: HttpHeaders.remove(request.headers, "origin") })
      return yield* Effect.updateContext((context) =>
        Context.add(context, HttpServerRequestModule.HttpServerRequest, requestForMcp)
      )(httpEffect)
    })

const formatHttpAddress = (address: HttpServer.HttpServer["Service"]["address"]): string =>
  `${HttpServer.formatAddress(address)}/mcp`

const errorMessage = (cause: unknown): string => (cause instanceof Error ? cause.message : String(cause))

const boundedShutdownStep = (
  effect: Effect.Effect<void, unknown>,
  gracePeriod: Duration.Input,
  timeoutMessage: string,
  failurePrefix: string,
  writeError: (message: string) => void
): Effect.Effect<void> =>
  effect.pipe(
    Effect.timeoutOrElse({ duration: gracePeriod, orElse: () => Effect.sync(() => writeError(`${timeoutMessage}\n`)) }),
    Effect.catchCause((cause) =>
      Effect.sync(() => writeError(`${failurePrefix}: ${errorMessage(Cause.squash(cause))}\n`))
    )
  )

const closeTransportScope = (
  scope: Scope.Scope,
  gracePeriod: Duration.Input,
  writeError: (message: string) => void,
  onShutdown: (() => Effect.Effect<void, unknown>) | undefined
): Effect.Effect<void> =>
  boundedShutdownStep(
    onShutdown?.() ?? Effect.void,
    gracePeriod,
    "MCP HTTP server drain timed out",
    "MCP HTTP server drain failed",
    writeError
  ).pipe(
    // Always close the listener scope, even when application-level draining
    // reaches its deadline.
    Effect.andThen(
      boundedShutdownStep(
        Scope.close(scope, Exit.void),
        gracePeriod,
        "MCP HTTP server shutdown timed out",
        "MCP HTTP server shutdown failed",
        writeError
      )
    )
  )

const transportMiddleware = (config: HttpTransportConfig): HttpMiddlewareModule.HttpMiddleware => {
  const policy = httpPolicyMiddleware(config)
  const middleware = config.middleware
  return middleware === undefined ? policy : (httpEffect) => policy(middleware(httpEffect))
}

/**
 * Starts a mounted Effect HTTP app in an explicit child scope. Closing the
 * returned effect interrupts active requests, runs MCP and Node finalizers,
 * and is bounded by the configured shutdown grace period.
 */
export const startHttpTransport = <A, E>(
  config: HttpTransportConfig,
  appLayer: Layer.Layer<A, E, HttpRouter.HttpRouter>,
  configuredWriteError?: (message: string) => void
): Effect.Effect<void, HttpTransportError, HttpServerFactoryService> =>
  Effect.scoped(
    Effect.gen(function* () {
      const factory = yield* HttpServerFactoryService
      const writeError = configuredWriteError ?? factory.writeError ?? writeStderr
      const gracePeriod = config.shutdownGracePeriod ?? DEFAULT_HTTP_SHUTDOWN_GRACE_PERIOD
      const transportScope = yield* Scope.make()

      yield* Effect.acquireUseRelease(
        Effect.succeed(transportScope),
        (scope) =>
          Scope.provide(scope)(
            Effect.gen(function* () {
              const server = yield* factory.make(config.port, config.host, gracePeriod)
              const app = yield* HttpRouter.toHttpEffect(appLayer).pipe(
                Effect.mapError((cause) => new HttpTransportError({ message: "HTTP application setup failed", cause }))
              )
              yield* server.serve(app, transportMiddleware(config))
              if (config.onReady !== undefined) yield* config.onReady()
              yield* Effect.sync(() =>
                writeError(`MCP HTTP server listening on ${formatHttpAddress(server.address)}\n`)
              )
              yield* config.shutdown ?? Effect.never
            })
          ),
        (scope) => closeTransportScope(scope, gracePeriod, writeError, config.onShutdown)
      )
    })
  )
