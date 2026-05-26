/**
 * HTTP transport for MCP server using Streamable HTTP protocol.
 *
 * Uses SDK's StreamableHTTPServerTransport with Express.
 * Stateless mode: each request creates a new transport instance.
 *
 * @module
 */
import { timingSafeEqual } from "node:crypto"
import type http from "node:http"

import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js"
import type { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js"
import type { Scope } from "effect"
import { Context, Effect, Layer, Schema } from "effect"
import type { Express, Request, Response } from "express"

export const DEFAULT_HTTP_PORT = 3000
const HTTP_METHOD_NOT_ALLOWED = 405
const HTTP_UNAUTHORIZED = 401
const HTTP_INTERNAL_SERVER_ERROR = 500
const writeStderr = (message: string): void => {
  process.stderr.write(message)
}

/**
 * HTTP transport configuration.
 */
interface HttpTransportConfig {
  readonly port: number
  readonly host: string
  readonly authToken?: string | undefined
}

/**
 * Error during HTTP transport operations.
 */
export class HttpTransportError extends Schema.TaggedError<HttpTransportError>()(
  "HttpTransportError",
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Defect)
  }
) {}

/**
 * HTTP server abstraction for DI/testing.
 */
export interface HttpServerFactory {
  /**
   * Create an Express app configured for MCP.
   */
  readonly createApp: (host: string) => Express

  /**
   * Start listening on the given port/host.
   * Returns the underlying http.Server for shutdown.
   */
  readonly listen: (
    app: Express,
    port: number,
    host: string
  ) => Effect.Effect<http.Server, HttpTransportError>

  readonly writeError?: (message: string) => void
}

/**
 * Default HTTP server factory using SDK's createMcpExpressApp.
 */
const defaultHttpServerFactory: HttpServerFactory = {
  createApp: (host: string) => createMcpExpressApp({ host }),

  listen: (app, port, host) =>
    Effect.async<http.Server, HttpTransportError>((resume) => {
      const server = app.listen(port, host, (error?: Error) => {
        if (error) {
          resume(
            Effect.fail(
              new HttpTransportError({
                message: `Failed to start HTTP server on ${host}:${port}: ${error.message}`,
                cause: error
              })
            )
          )
        } else {
          resume(Effect.succeed(server))
        }
      })
    }),

  writeError: writeStderr
}

export interface HttpTransportDependencies {
  readonly createTransport: () => StreamableHTTPServerTransport
  readonly writeError: (message: string) => void
}

const defaultTransportDependencies: HttpTransportDependencies = {
  createTransport: () => new StreamableHTTPServerTransport({}),
  writeError: writeStderr
}

const activeAuthToken = (authToken: string | undefined): string | undefined => {
  const trimmed = authToken?.trim()
  return trimmed === undefined || trimmed === "" ? undefined : trimmed
}

const extractBearerToken = (authorization: unknown): string | undefined => {
  if (typeof authorization !== "string") return undefined

  const match = /^Bearer ([^ ]+)$/iu.exec(authorization)
  return match?.[1]
}

const tokenMatches = (received: string, expected: string): boolean => {
  const receivedBuffer = Buffer.from(received, "utf8")
  const expectedBuffer = Buffer.from(expected, "utf8")
  if (receivedBuffer.length !== expectedBuffer.length) return false
  return timingSafeEqual(receivedBuffer, expectedBuffer)
}

const isAuthorizedMcpRequest = (req: Request, authToken: string | undefined): boolean => {
  const expected = activeAuthToken(authToken)
  if (expected === undefined) return true

  const received = extractBearerToken(req.headers.authorization)
  return received !== undefined && tokenMatches(received, expected)
}

const writeUnauthorized = (res: Response): void => {
  res.setHeader("WWW-Authenticate", "Bearer")
  res.status(HTTP_UNAUTHORIZED).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Unauthorized" },
    id: null
  })
}

const writeMethodNotAllowed = (res: Response, message: string): void => {
  res.status(HTTP_METHOD_NOT_ALLOWED).json({
    jsonrpc: "2.0",
    error: {
      code: -32000,
      message
    },
    id: null
  })
}

/**
 * Service tag for HTTP server factory - allows DI for testing.
 */
export class HttpServerFactoryService extends Context.Tag("@hulymcp/HttpServerFactory")<
  HttpServerFactoryService,
  HttpServerFactory
>() {
  static readonly defaultLayer: Layer.Layer<HttpServerFactoryService> = Layer.succeed(
    HttpServerFactoryService,
    defaultHttpServerFactory
  )
}

/**
 * Create HTTP request handlers for the MCP endpoint.
 * Uses stateless mode - each request creates a new server/transport pair.
 *
 * @param createServer - Factory function to create MCP Server instance per request
 */
export const createMcpHandlers = (
  createServer: (req: Request) => Server,
  dependencies: HttpTransportDependencies = defaultTransportDependencies,
  authToken?: string
): {
  post: (req: Request, res: Response) => Promise<void>
  get: (req: Request, res: Response) => void
  delete: (req: Request, res: Response) => void
} => {
  const post = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!isAuthorizedMcpRequest(req, authToken)) {
        writeUnauthorized(res)
        return
      }

      const server = createServer(req)
      // Stateless mode: no session ID generator, each request is independent
      const transport = dependencies.createTransport()

      // SDK's StreamableHTTPServerTransport declares `implements Transport` but its
      // property types (onmessage, send options) don't satisfy Transport under
      // exactOptionalPropertyTypes. SDK bug — safe because the class genuinely
      // implements the interface at runtime.
      // eslint-disable-next-line no-restricted-syntax -- see above
      await server.connect(transport as Transport)
      await transport.handleRequest(req, res, req.body)

      req.on("close", () => {
        transport.close().catch((err) => {
          dependencies.writeError(`Transport cleanup error: ${String(err)}\n`)
        })
        server.close().catch((err) => {
          dependencies.writeError(`Server cleanup error: ${String(err)}\n`)
        })
      })
    } catch (error) {
      if (!res.headersSent) {
        res.status(HTTP_INTERNAL_SERVER_ERROR).json({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: `Internal server error: ${String(error)}`
          },
          id: null
        })
      }
    }
  }

  const get = (req: Request, res: Response): void => {
    if (!isAuthorizedMcpRequest(req, authToken)) {
      writeUnauthorized(res)
      return
    }

    writeMethodNotAllowed(res, "Method not allowed (stateless mode - no SSE streams)")
  }

  const del = (req: Request, res: Response): void => {
    if (!isAuthorizedMcpRequest(req, authToken)) {
      writeUnauthorized(res)
      return
    }

    writeMethodNotAllowed(res, "Method not allowed (stateless mode - no sessions)")
  }

  return { post, get, delete: del }
}

/**
 * Close an HTTP server with proper error handling.
 */
const closeHttpServer = (
  server: http.Server
): Effect.Effect<void, HttpTransportError> =>
  Effect.async<void, HttpTransportError>((resume) => {
    server.close((err?: Error) => {
      if (err) {
        resume(
          Effect.fail(
            new HttpTransportError({
              message: `Error closing HTTP server: ${err.message}`,
              cause: err
            })
          )
        )
      } else {
        resume(Effect.void)
      }
    })
  })

/**
 * Start an HTTP transport server.
 *
 * @param config - HTTP transport configuration
 * @param createServer - Factory to create MCP Server instances
 * @returns Effect that completes when server is stopped (via interrupt)
 */
export const startHttpTransport = (
  config: HttpTransportConfig,
  createServer: (req: Request) => Server,
  dependencies?: Partial<HttpTransportDependencies>
): Effect.Effect<void, HttpTransportError, HttpServerFactoryService | Scope.Scope> =>
  Effect.gen(function*() {
    const factory = yield* HttpServerFactoryService
    const writeError: (message: string) => void = dependencies?.writeError ?? factory.writeError ?? writeStderr

    const app = factory.createApp(config.host)
    const handlers = createMcpHandlers(createServer, {
      createTransport: dependencies?.createTransport ?? defaultTransportDependencies.createTransport,
      writeError
    }, config.authToken)
    app.post("/mcp", handlers.post)
    app.get("/mcp", handlers.get)
    app.delete("/mcp", handlers.delete)

    yield* Effect.acquireRelease(
      factory.listen(app, config.port, config.host),
      (srv) =>
        closeHttpServer(srv).pipe(
          Effect.catchAll((err) =>
            Effect.sync(() => {
              writeError(`Server close error: ${err.message}\n`)
            })
          )
        )
    )

    // Log startup (to stderr, not stdout which is reserved)
    yield* Effect.sync(() => {
      writeError(`MCP HTTP server listening on http://${config.host}:${config.port}/mcp\n`)
    })

    yield* Effect.async<void, never>((resume) => {
      const cleanup = () => {
        process.off("SIGINT", shutdown)
        process.off("SIGTERM", shutdown)
      }

      const shutdown = () => {
        cleanup()
        resume(Effect.void)
      }

      process.on("SIGINT", shutdown)
      process.on("SIGTERM", shutdown)

      return Effect.sync(cleanup)
    })
  })
