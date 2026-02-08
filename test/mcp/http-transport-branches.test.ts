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

const createMockMcpServer = (): Server => {
  // eslint-disable-next-line no-restricted-syntax -- test mock: partial MCP Server
  return {
    connect: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    setRequestHandler: vi.fn()
  } as unknown as Server
}

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
