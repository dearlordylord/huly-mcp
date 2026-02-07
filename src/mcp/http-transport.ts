/**
 * HTTP transport for MCP server using Streamable HTTP protocol.
 *
 * Uses SDK's StreamableHTTPServerTransport with Express.
 * Stateless mode: each request creates a new transport instance.
 *
 * @module
 */
import type http from "node:http"

import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js"
import type { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js"
import type { Scope } from "effect"
import { Context, Effect, Layer, Schema } from "effect"
import type { Express, Request, Response } from "express"

/**
 * HTTP transport configuration.
 */
interface HttpTransportConfig {
  readonly port: number
  readonly host: string
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
  createServer: () => Server
): {
  post: (req: Request, res: Response) => Promise<void>
  get: (req: Request, res: Response) => Promise<void>
  delete: (req: Request, res: Response) => Promise<void>
} => {
  const post = async (req: Request, res: Response): Promise<void> => {
    try {
      const server = createServer()
      // Stateless mode: no session ID generator, each request is independent
      const transport = new StreamableHTTPServerTransport({})

      await server.connect(transport as Transport)
      await transport.handleRequest(req, res, req.body)

      res.on("close", () => {
        transport.close().catch((err) => {
          process.stderr.write(`Transport cleanup error: ${String(err)}\n`)
        })
        server.close().catch((err) => {
          process.stderr.write(`Server cleanup error: ${String(err)}\n`)
        })
      })
    } catch (error) {
      if (!res.headersSent) {
        res.status(500).json({
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

  const get = async (_req: Request, res: Response): Promise<void> => {
    res.status(405).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed (stateless mode - no SSE streams)"
      },
      id: null
    })
  }

  const del = async (_req: Request, res: Response): Promise<void> => {
    res.status(405).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed (stateless mode - no sessions)"
      },
      id: null
    })
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
    server.close((err) => {
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
  createServer: () => Server
): Effect.Effect<void, HttpTransportError, HttpServerFactoryService | Scope.Scope> =>
  Effect.gen(function*() {
    const factory = yield* HttpServerFactoryService

    const app = factory.createApp(config.host)
    const handlers = createMcpHandlers(createServer)
    app.post("/mcp", handlers.post)
    app.get("/mcp", handlers.get)
    app.delete("/mcp", handlers.delete)

    yield* Effect.acquireRelease(
      factory.listen(app, config.port, config.host),
      (srv) =>
        closeHttpServer(srv).pipe(
          Effect.catchAll((err) =>
            Effect.sync(() => {
              process.stderr.write(`Server close error: ${err.message}\n`)
            })
          )
        )
    )

    // Log startup (to stderr, not stdout which is reserved)
    yield* Effect.sync(() => {
      process.stderr.write(`MCP HTTP server listening on http://${config.host}:${config.port}/mcp\n`)
    })

    // Wait for signal to shutdown - this keeps the server running
    yield* Effect.async<void, never>((resume) => {
      const shutdown = () => {
        resume(Effect.void)
      }

      process.on("SIGINT", shutdown)
      process.on("SIGTERM", shutdown)

      // Cleanup signal handlers when interrupted
      return Effect.sync(() => {
        process.off("SIGINT", shutdown)
        process.off("SIGTERM", shutdown)
      })
    })
  })
