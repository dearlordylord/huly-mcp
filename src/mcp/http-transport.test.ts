/**
 * Tests for HTTP transport module.
 *
 * Uses DI to mock HTTP server - no actual network calls.
 *
 * @module
 */
/* eslint-disable @typescript-eslint/consistent-type-assertions -- test mocks */
import type http from "node:http"

import type { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { Effect, Exit, Layer } from "effect"
import type { Express, Request, Response } from "express"
import { describe, expect, it, vi } from "vitest"

import {
  createMcpHandlers,
  type HttpServerFactory,
  HttpServerFactoryService,
  HttpTransportError,
  startHttpTransport
} from "./http-transport.js"

// Mock Express app for testing
const createMockExpressApp = () => {
  const routes: Record<string, Record<string, (req: Request, res: Response) => Promise<void>>> = {
    get: {},
    post: {},
    delete: {}
  }

  // eslint-disable-next-line no-restricted-syntax -- test mock: partial Express app
  const app = {
    get: vi.fn((path: string, handler: (req: Request, res: Response) => Promise<void>) => {
      routes.get[path] = handler
    }),
    post: vi.fn((path: string, handler: (req: Request, res: Response) => Promise<void>) => {
      routes.post[path] = handler
    }),
    delete: vi.fn((path: string, handler: (req: Request, res: Response) => Promise<void>) => {
      routes.delete[path] = handler
    }),
    listen: vi.fn()
  } as unknown as Express

  return { app, routes }
}

// Mock MCP Server for testing
const createMockMcpServer = (): Server => {
  // eslint-disable-next-line no-restricted-syntax -- test mock: partial MCP Server
  return {
    connect: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    setRequestHandler: vi.fn()
  } as unknown as Server
}

// Mock HTTP response
const createMockResponse = () => {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    headersSent: false,
    on: vi.fn()
  }
  // eslint-disable-next-line no-restricted-syntax -- test mock: partial Response
  return res as unknown as Response
}

describe("HTTP Transport", () => {
  describe("createMcpHandlers", () => {
    it("should handle tool calls in stateless mode (connect server and delegate to transport)", async () => {
      const mockServer = createMockMcpServer()
      const handlers = createMcpHandlers(() => mockServer)

      const req = {
        body: { jsonrpc: "2.0", method: "tools/list", id: 1 }
      } as Request

      const res = createMockResponse()

      await handlers.post(req, res)

      // In stateless mode, every request creates a fresh server and transport
      // The server should be connected and the request delegated to the transport
      expect(mockServer.connect).toHaveBeenCalled()
      // Response handling is delegated to the SDK transport, so we don't check res.status/json here
      // The SDK handles JSON-RPC protocol responses
    })

    it("should handle initialize requests in stateless mode", async () => {
      const mockServer = createMockMcpServer()
      const handlers = createMcpHandlers(() => mockServer)

      const req = {
        body: {
          jsonrpc: "2.0",
          method: "initialize",
          id: 1,
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "test", version: "1.0" }
          }
        }
      } as Request

      const res = createMockResponse()

      await handlers.post(req, res)

      // Initialize requests should also be handled via the transport
      expect(mockServer.connect).toHaveBeenCalled()
    })

    it("should create fresh server for each request in stateless mode", async () => {
      const serverInstances: Array<Server> = []
      const handlers = createMcpHandlers(() => {
        const server = createMockMcpServer()
        serverInstances.push(server)
        return server
      })

      const res1 = createMockResponse()
      const res2 = createMockResponse()

      // First request - tools/list
      await handlers.post(
        { body: { jsonrpc: "2.0", method: "tools/list", id: 1 } } as Request,
        res1
      )

      // Second request - tools/call
      await handlers.post(
        {
          body: {
            jsonrpc: "2.0",
            method: "tools/call",
            id: 2,
            params: { name: "test_tool", arguments: {} }
          }
        } as Request,
        res2
      )

      // Should have created two separate server instances
      expect(serverInstances).toHaveLength(2)
      expect(serverInstances[0]).not.toBe(serverInstances[1])
      expect(serverInstances[0].connect).toHaveBeenCalled()
      expect(serverInstances[1].connect).toHaveBeenCalled()
    })

    it("should reject GET requests in stateless mode", async () => {
      const mockServer = createMockMcpServer()
      const handlers = createMcpHandlers(() => mockServer)

      const req = {} as Request
      const res = createMockResponse()

      await handlers.get(req, res)

      expect(res.status).toHaveBeenCalledWith(405)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          jsonrpc: "2.0",
          error: expect.objectContaining({
            code: -32000,
            message: expect.stringContaining("Method not allowed")
          })
        })
      )
    })

    it("should reject DELETE requests in stateless mode", async () => {
      const mockServer = createMockMcpServer()
      const handlers = createMcpHandlers(() => mockServer)

      const req = {} as Request
      const res = createMockResponse()

      await handlers.delete(req, res)

      expect(res.status).toHaveBeenCalledWith(405)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          jsonrpc: "2.0",
          error: expect.objectContaining({
            code: -32000,
            message: expect.stringContaining("Method not allowed")
          })
        })
      )
    })

    it("should return 500 when server factory throws", async () => {
      const handlers = createMcpHandlers(() => {
        throw new Error("Factory error")
      })

      // Any valid JSON-RPC request (tools/list in this case)
      const req = {
        body: {
          jsonrpc: "2.0",
          method: "tools/list",
          id: 1,
          params: {}
        }
      } as Request

      const res = createMockResponse()

      await handlers.post(req, res)

      expect(res.status).toHaveBeenCalledWith(500)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          jsonrpc: "2.0",
          error: expect.objectContaining({
            code: -32603,
            message: expect.stringContaining("Internal server error")
          })
        })
      )
    })
  })

  describe("startHttpTransport", () => {
    it("should register POST, GET, DELETE handlers on /mcp", async () => {
      const { app } = createMockExpressApp()
      // eslint-disable-next-line no-restricted-syntax -- test mock: partial http.Server
      const mockHttpServer = {
        close: vi.fn((cb?: (err?: Error) => void) => cb?.())
      } as unknown as http.Server

      const mockFactory: HttpServerFactory = {
        createApp: vi.fn(() => app),
        listen: vi.fn(() => Effect.succeed(mockHttpServer))
      }

      const mockMcpServer = createMockMcpServer()

      // Run with scope and timeout to test resource management
      const program = startHttpTransport(
        { port: 3000, host: "127.0.0.1" },
        () => mockMcpServer
      ).pipe(
        Effect.scoped, // Provide Scope for acquireRelease
        Effect.timeout(10), // Timeout quickly for test
        Effect.ignore
      )

      await Effect.runPromise(
        program.pipe(
          Effect.provide(Layer.succeed(HttpServerFactoryService, mockFactory))
        )
      )

      expect(mockFactory.createApp).toHaveBeenCalledWith("127.0.0.1")
      expect(mockFactory.listen).toHaveBeenCalledWith(app, 3000, "127.0.0.1")
      expect(app.post).toHaveBeenCalledWith("/mcp", expect.any(Function))
      expect(app.get).toHaveBeenCalledWith("/mcp", expect.any(Function))
      expect(app.delete).toHaveBeenCalledWith("/mcp", expect.any(Function))
    })

    it("should close server when scope closes", async () => {
      const { app } = createMockExpressApp()
      const closeFn = vi.fn((cb?: (err?: Error) => void) => cb?.())
      // eslint-disable-next-line no-restricted-syntax -- test mock: partial http.Server
      const mockHttpServer = {
        close: closeFn
      } as unknown as http.Server

      const mockFactory: HttpServerFactory = {
        createApp: vi.fn(() => app),
        listen: vi.fn(() => Effect.succeed(mockHttpServer))
      }

      const mockMcpServer = createMockMcpServer()

      const program = startHttpTransport(
        { port: 3000, host: "127.0.0.1" },
        () => mockMcpServer
      ).pipe(
        Effect.scoped,
        Effect.timeout(10),
        Effect.ignore
      )

      await Effect.runPromise(
        program.pipe(
          Effect.provide(Layer.succeed(HttpServerFactoryService, mockFactory))
        )
      )

      // Verify server was closed when scope ended
      expect(closeFn).toHaveBeenCalled()
    })

    it("should fail if listen fails", async () => {
      const { app } = createMockExpressApp()

      const mockFactory: HttpServerFactory = {
        createApp: vi.fn(() => app),
        listen: vi.fn(() =>
          Effect.fail(
            new HttpTransportError({
              message: "Port already in use"
            })
          )
        )
      }

      const mockMcpServer = createMockMcpServer()

      const program = startHttpTransport(
        { port: 3000, host: "127.0.0.1" },
        () => mockMcpServer
      ).pipe(Effect.scoped) // Provide Scope for acquireRelease

      const result = await Effect.runPromiseExit(
        program.pipe(
          Effect.provide(Layer.succeed(HttpServerFactoryService, mockFactory))
        )
      )

      expect(Exit.isFailure(result)).toBe(true)
      if (Exit.isFailure(result)) {
        const error = result.cause
        expect(error._tag).toBe("Fail")
      }
    })
  })

  describe("HttpTransportError", () => {
    it("should include message and optional cause", () => {
      const cause = new Error("underlying error")
      const error = new HttpTransportError({
        message: "HTTP transport failed",
        cause
      })

      expect(error.message).toBe("HTTP transport failed")
      expect(error.cause).toBe(cause)
      expect(error._tag).toBe("HttpTransportError")
    })
  })
})
