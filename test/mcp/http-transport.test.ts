/**
 * Tests for HTTP transport module.
 *
 * Uses DI to mock HTTP server - no actual network calls.
 *
 * @module
 */
import type http from "node:http"

import type { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import { Effect, Exit, Layer } from "effect"
import type { Express, Request, Response } from "express"
import { describe, expect, it, vi } from "vitest"

import {
  createMcpHandlers,
  type HttpServerFactory,
  HttpServerFactoryService,
  HttpTransportError,
  startHttpTransport
} from "../../src/mcp/http-transport.js"

// Test mock factory: accepts any object, returns it typed as T.
// Single cast from Record<string,unknown> to T (valid for test mocks of large interfaces).
function mock<T>(impl: Record<string, unknown>): T {
  return impl as T
}

// Mock Express app for testing
const createMockExpressApp = () => {
  const routes: Record<string, Record<string, (req: Request, res: Response) => Promise<void>>> = {
    get: {},
    post: {},
    delete: {}
  }

  const app = mock<Express>({
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
  })

  return { app, routes }
}

// Mock MCP Server for testing
const createMockMcpServer = (): Server => {
  return mock<Server>({
    connect: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    setRequestHandler: vi.fn()
  })
}

// Mock HTTP response
const createMockResponse = () => {
  return mock<Response>({
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    headersSent: false,
    on: vi.fn()
  })
}

describe("HTTP Transport", () => {
  describe("createMcpHandlers", () => {
    // test-revizorro: approved
    it("should handle tool calls in stateless mode (connect server and delegate to transport)", async () => {
      const mockServer = createMockMcpServer()
      const handlers = createMcpHandlers(() => mockServer)

      const reqData = {
        body: { jsonrpc: "2.0", method: "tools/list", id: 1 }
      }
      const req = reqData as Request

      const res = createMockResponse()

      await handlers.post(req, res)

      // In stateless mode, every request creates a fresh server and transport
      // The server should be connected and the request delegated to the transport
      expect(mockServer.connect).toHaveBeenCalled()
      // Response handling is delegated to the SDK transport, so we don't check res.status/json here
      // The SDK handles JSON-RPC protocol responses
    })

    // test-revizorro: approved
    it("should handle initialize requests in stateless mode", async () => {
      const mockServer = createMockMcpServer()
      const handlers = createMcpHandlers(() => mockServer)

      const reqData = {
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
      }
      const req = reqData as Request

      const res = createMockResponse()

      await handlers.post(req, res)

      // Initialize requests should also be handled via the transport
      expect(mockServer.connect).toHaveBeenCalled()
    })

    // test-revizorro: approved
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

    // test-revizorro: approved
    it("should reject GET requests in stateless mode", async () => {
      const mockServer = createMockMcpServer()
      const handlers = createMcpHandlers(() => mockServer)

      const reqData = {}
      const req = reqData as Request
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

    // test-revizorro: approved
    it("should reject DELETE requests in stateless mode", async () => {
      const mockServer = createMockMcpServer()
      const handlers = createMcpHandlers(() => mockServer)

      const reqData = {}
      const req = reqData as Request
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

    // test-revizorro: suspect | headersSent set after handler runs; test doesn't verify intended behavior of skipping error response when headers already sent
    it("should not send 500 when server factory throws and headers already sent", async () => {
      const handlers = createMcpHandlers(() => {
        throw new Error("Factory error")
      })

      const reqData = {
        body: { jsonrpc: "2.0", method: "tools/list", id: 1 }
      }
      const req = reqData as Request

      const res = createMockResponse()
      // Simulate headers already sent
      Object.defineProperty(res, "headersSent", { value: true })

      await handlers.post(req, res)

      expect(res.status).not.toHaveBeenCalled()
      expect(res.json).not.toHaveBeenCalled()
    })

    // test-revizorro: approved
    it("should return 500 when server factory throws", async () => {
      const handlers = createMcpHandlers(() => {
        throw new Error("Factory error")
      })

      // Any valid JSON-RPC request (tools/list in this case)
      const reqData = {
        body: {
          jsonrpc: "2.0",
          method: "tools/list",
          id: 1,
          params: {}
        }
      }
      const req = reqData as Request

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
    // test-revizorro: approved
    it("should register POST, GET, DELETE handlers on /mcp", async () => {
      const { app } = createMockExpressApp()
      const mockHttp = mock<http.Server>({
        close: vi.fn((cb?: (err?: Error) => void) => cb?.())
      })

      const mockFactory: HttpServerFactory = {
        createApp: vi.fn(() => app),
        listen: vi.fn(() => Effect.succeed(mockHttp))
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

    // test-revizorro: approved
    it("should close server when scope closes", async () => {
      const { app } = createMockExpressApp()
      const closeFn = vi.fn((cb?: (err?: Error) => void) => cb?.())
      const mockHttp = mock<http.Server>({
        close: closeFn
      })

      const mockFactory: HttpServerFactory = {
        createApp: vi.fn(() => app),
        listen: vi.fn(() => Effect.succeed(mockHttp))
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

    // test-revizorro: approved
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
      ).pipe(Effect.scoped)

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

    // test-revizorro: approved
    it("should log to stderr and continue when server close fails during release", async () => {
      const { app } = createMockExpressApp()
      const closeFn = vi.fn((cb?: (err?: Error) => void) => cb?.(new Error("close failed")))
      const mockHttp = mock<http.Server>({
        close: closeFn
      })

      const mockFactory: HttpServerFactory = {
        createApp: vi.fn(() => app),
        listen: vi.fn(() => Effect.succeed(mockHttp))
      }

      const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true)

      const program = startHttpTransport(
        { port: 3000, host: "127.0.0.1" },
        createMockMcpServer
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

      expect(closeFn).toHaveBeenCalled()
      const closeErrorCall = stderrSpy.mock.calls.find(
        (call) => typeof call[0] === "string" && call[0].includes("Server close error")
      )
      expect(closeErrorCall).toBeDefined()

      stderrSpy.mockRestore()
    })

    // test-revizorro: suspect | Only checks effect succeeded, not that SIGINT was handled; stderrSpy created but not restored; missing verification of handler cleanup
    it("should shut down when SIGINT is received", async () => {
      const { app } = createMockExpressApp()
      const mockHttp = mock<http.Server>({
        close: vi.fn((cb?: (err?: Error) => void) => cb?.())
      })

      const mockFactory: HttpServerFactory = {
        createApp: vi.fn(() => app),
        listen: vi.fn(() => Effect.succeed(mockHttp))
      }

      const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true)

      const program = startHttpTransport(
        { port: 3000, host: "127.0.0.1" },
        createMockMcpServer
      ).pipe(Effect.scoped)

      const fiber = Effect.runFork(
        program.pipe(
          Effect.provide(Layer.succeed(HttpServerFactoryService, mockFactory))
        )
      )

      // Give the program time to register signal handlers
      await new Promise((resolve) => setTimeout(resolve, 50))

      process.emit("SIGINT", "SIGINT")

      const result = await fiber.pipe(Effect.runPromiseExit)

      stderrSpy.mockRestore()

      expect(Exit.isSuccess(result)).toBe(true)
    })
  })

  describe("createMcpHandlers - close cleanup", () => {
    // test-revizorro: suspect | Verifies handler registration but not cleanup execution; doesn't assert that mockServer.close() or transport.close() are invoked when handler runs
    it("should register close handler and call cleanup on close", async () => {
      const mockServer = createMockMcpServer()
      const handlers = createMcpHandlers(() => mockServer)

      const closeHandlers: Array<() => void> = []
      const res = mock<Response>({
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
        headersSent: false,
        writeHead: vi.fn(),
        write: vi.fn().mockReturnValue(true),
        end: vi.fn(),
        setHeader: vi.fn(),
        getHeader: vi.fn(),
        flushHeaders: vi.fn(),
        on: vi.fn((event: string, handler: () => void) => {
          if (event === "close") closeHandlers.push(handler)
        })
      })

      await handlers.post(
        { body: { jsonrpc: "2.0", method: "tools/list", id: 1 } } as Request,
        res
      )

      expect(closeHandlers).toHaveLength(1)
      closeHandlers[0]()

      expect(res.on).toHaveBeenCalledWith("close", expect.any(Function))
    })

    // test-revizorro: approved
    it("should log to stderr when transport.close rejects during cleanup", async () => {
      const closeSpy = vi.spyOn(StreamableHTTPServerTransport.prototype, "close")
        .mockRejectedValue(new Error("transport close boom"))

      const mockServer = createMockMcpServer()
      const handlers = createMcpHandlers(() => mockServer)

      const closeHandlers: Array<() => void> = []
      const res = mock<Response>({
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
        headersSent: false,
        writeHead: vi.fn(),
        write: vi.fn().mockReturnValue(true),
        end: vi.fn(),
        setHeader: vi.fn(),
        getHeader: vi.fn(),
        flushHeaders: vi.fn(),
        on: vi.fn((event: string, handler: () => void) => {
          if (event === "close") closeHandlers.push(handler)
        })
      })

      const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true)

      await handlers.post(
        { body: { jsonrpc: "2.0", method: "tools/list", id: 1 } } as Request,
        res
      )

      closeHandlers[0]()
      await new Promise((resolve) => setTimeout(resolve, 10))

      const transportCleanupCall = stderrSpy.mock.calls.find(
        (call) => typeof call[0] === "string" && call[0].includes("Transport cleanup error")
      )
      expect(transportCleanupCall).toBeDefined()

      stderrSpy.mockRestore()
      closeSpy.mockRestore()
    })

    // test-revizorro: approved
    it("should log to stderr when server.close rejects during cleanup", async () => {
      const mcpServer = mock<Server>({
        connect: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockRejectedValue(new Error("server close failed")),
        setRequestHandler: vi.fn()
      })

      const handlers = createMcpHandlers(() => mcpServer)

      const closeHandlers: Array<() => void> = []
      const res = mock<Response>({
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
        headersSent: false,
        writeHead: vi.fn(),
        write: vi.fn().mockReturnValue(true),
        end: vi.fn(),
        setHeader: vi.fn(),
        getHeader: vi.fn(),
        flushHeaders: vi.fn(),
        on: vi.fn((event: string, handler: () => void) => {
          if (event === "close") closeHandlers.push(handler)
        })
      })

      const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true)

      await handlers.post(
        { body: { jsonrpc: "2.0", method: "tools/list", id: 1 } } as Request,
        res
      )

      closeHandlers[0]()
      await new Promise((resolve) => setTimeout(resolve, 10))

      const serverCleanupCall = stderrSpy.mock.calls.find(
        (call) => typeof call[0] === "string" && call[0].includes("Server cleanup error")
      )
      expect(serverCleanupCall).toBeDefined()

      stderrSpy.mockRestore()
    })
  })

  describe("defaultHttpServerFactory via defaultLayer", () => {
    // test-revizorro: approved
    it("should succeed when app.listen calls back without error", async () => {
      const fakeHttp = mock<http.Server>({ close: vi.fn() })
      const mockApp = mock<Express>({
        get: vi.fn(),
        post: vi.fn(),
        delete: vi.fn(),
        listen: vi.fn((_port: number, _host: string, cb: (error?: Error) => void) => {
          // Callback must fire asynchronously so that `const server = app.listen(...)` completes first
          setTimeout(() => cb(), 0)
          return fakeHttp
        })
      })

      const program = Effect.gen(function*() {
        const factory = yield* HttpServerFactoryService
        return yield* factory.listen(mockApp, 3000, "127.0.0.1")
      })

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(HttpServerFactoryService.defaultLayer))
      )

      expect(result).toBe(fakeHttp)
    })

    // test-revizorro: approved
    it("should fail with HttpTransportError when app.listen calls back with error", async () => {
      const mockApp = mock<Express>({
        get: vi.fn(),
        post: vi.fn(),
        delete: vi.fn(),
        listen: vi.fn((_port: number, _host: string, cb: (error?: Error) => void) => {
          setTimeout(() => cb(new Error("EADDRINUSE")), 0)
          return mock<http.Server>({ close: vi.fn() })
        })
      })

      const program = Effect.gen(function*() {
        const factory = yield* HttpServerFactoryService
        return yield* factory.listen(mockApp, 3000, "127.0.0.1")
      })

      const result = await Effect.runPromiseExit(
        program.pipe(Effect.provide(HttpServerFactoryService.defaultLayer))
      )

      expect(Exit.isFailure(result)).toBe(true)
    })

    // test-revizorro: suspect | Only checks .toBeDefined(), doesn't verify createMcpExpressApp called or app configured correctly
    it("should call createMcpExpressApp via createApp", async () => {
      const program = Effect.gen(function*() {
        const factory = yield* HttpServerFactoryService
        return factory.createApp("0.0.0.0")
      })

      // createMcpExpressApp is real SDK code, but we can verify createApp returns an Express-like object
      const result = await Effect.runPromise(
        program.pipe(Effect.provide(HttpServerFactoryService.defaultLayer))
      )

      expect(result).toBeDefined()
    })
  })

  describe("HttpTransportError", () => {
    // test-revizorro: approved
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
