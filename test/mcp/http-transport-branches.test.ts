/**
 * Branch coverage tests for http-transport.ts.
 *
 * Lines 121-222 cover createMcpHandlers internals and startHttpTransport.
 * Lines 240-241 are signal handling (SIGINT/SIGTERM) which cannot be safely
 * tested in a unit test without killing the process.
 *
 * The existing http-transport.test.ts already covers most of these lines.
 * This file covers the specific remaining branches:
 * - res.headersSent check (line 135)
 * - closeHttpServer error path (line 181-188)
 */
import type http from "node:http"

import type { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { Effect, Layer } from "effect"
import type { Express, Request, Response } from "express"
import { describe, expect, it, vi } from "vitest"

import {
  createMcpHandlers,
  type HttpServerFactory,
  HttpServerFactoryService,
  startHttpTransport
} from "../../src/mcp/http-transport.js"

// Test mock factory: accepts any object, returns it typed as T.
// Single cast from Record<string,unknown> to T (valid for test mocks of large interfaces).
function mock<T>(impl: Record<string, unknown>): T {
  return impl as T
}

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

const createMockMcpServer = (): Server => {
  return mock<Server>({
    connect: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    setRequestHandler: vi.fn()
  })
}

const createMockResponse = () => {
  return mock<Response>({
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    headersSent: false,
    on: vi.fn()
  })
}

describe("HTTP Transport - Branch Coverage", () => {
  describe("createMcpHandlers - headersSent check (line 135)", () => {
    // test-revizorro: approved
    it("should not send error response when headers already sent", async () => {
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

      // When headersSent is true, status() should NOT be called
      expect(res.status).not.toHaveBeenCalled()
    })
  })

  describe("closeHttpServer - error path (lines 181-188)", () => {
    // test-revizorro: suspect | Only checks closeFn called, doesn't verify error was caught/handled; should assert stderr written and program didn't fail
    it("should handle server close error gracefully", async () => {
      const { app } = createMockExpressApp()
      const closeFn = vi.fn((cb?: (err?: Error) => void) => {
        cb?.(new Error("Close failed"))
      })
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

      // Verify close was called even though it errored
      expect(closeFn).toHaveBeenCalled()
    })
  })

  describe("GET and DELETE handlers return method not allowed (lines 148-168)", () => {
    // test-revizorro: approved
    it("GET returns 405 with method not allowed error", () => {
      const handlers = createMcpHandlers(createMockMcpServer)
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- test mock: empty Request
      const req = {} as Request
      const res = createMockResponse()

      handlers.get(req, res)

      expect(res.status).toHaveBeenCalledWith(405)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({ message: expect.stringContaining("Method not allowed") })
        })
      )
    })

    // test-revizorro: approved
    it("DELETE returns 405 with method not allowed error", () => {
      const handlers = createMcpHandlers(createMockMcpServer)
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- test mock: empty Request
      const req = {} as Request
      const res = createMockResponse()

      handlers.delete(req, res)

      expect(res.status).toHaveBeenCalledWith(405)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({ message: expect.stringContaining("Method not allowed") })
        })
      )
    })
  })
})
