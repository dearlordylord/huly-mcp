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
/* eslint-disable functional/no-mixed-types -- local test probes intentionally combine call data with callable functions */
import type http from "node:http"

import type { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { Effect, Layer } from "effect"
import type { Express, Request, Response } from "express"
import { describe, expect, it } from "vitest"

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

interface Probe<Args extends Array<unknown>, Result> {
  readonly calls: Array<Args>
  readonly fn: (...args: Args) => Result
}

const createProbe = <Args extends Array<unknown>, Result>(
  impl: (...args: Args) => Result
): Probe<Args, Result> => {
  const calls: Array<Args> = []
  return {
    calls,
    fn: (...args) => {
      calls.push(args)
      return impl(...args)
    }
  }
}

const createVoidProbe = <Args extends Array<unknown>>(): Probe<Args, void> => createProbe<Args, void>(() => undefined)

const createMockExpressApp = () => {
  const routes: Record<string, Record<string, (req: Request, res: Response) => Promise<void>>> = {
    get: {},
    post: {},
    delete: {}
  }

  const app = mock<Express>({
    get: createProbe<[string, (req: Request, res: Response) => Promise<void>], void>((path, handler) => {
      routes.get[path] = handler
    }).fn,
    post: createProbe<[string, (req: Request, res: Response) => Promise<void>], void>((path, handler) => {
      routes.post[path] = handler
    }).fn,
    delete: createProbe<[string, (req: Request, res: Response) => Promise<void>], void>((path, handler) => {
      routes.delete[path] = handler
    }).fn,
    listen: createVoidProbe<[number, string, (error?: Error) => void]>().fn
  })

  return { app, routes }
}

const createMockMcpServer = (): Server => {
  return mock<Server>({
    connect: createProbe<[], Promise<void>>(() => Promise.resolve()).fn,
    close: createProbe<[], Promise<void>>(() => Promise.resolve()).fn,
    setRequestHandler: createVoidProbe<[unknown, (...args: Array<unknown>) => unknown]>().fn
  })
}

const createMockResponse = () => {
  const statusCalls: Array<[number]> = []
  const jsonCalls: Array<[unknown]> = []
  const response = mock<Response>({
    status(code: number) {
      statusCalls.push([code])
      return this
    },
    json(body: unknown) {
      jsonCalls.push([body])
      return this
    },
    headersSent: false,
    on: createVoidProbe<[string, (...args: Array<unknown>) => void]>().fn,
    __calls: { status: statusCalls, json: jsonCalls }
  })
  return response
}

const getResponseCalls = (response: Response): {
  status: Array<[number]>
  json: Array<[unknown]>
} =>
  // eslint-disable-next-line no-restricted-syntax -- test probe metadata is attached to a structural fake
  (response as unknown as { __calls: { status: Array<[number]>; json: Array<[unknown]> } }).__calls

const createMockRequest = (body: unknown = {}): Request =>
  mock<Request>({
    body,
    on: createVoidProbe<[string, (...args: Array<unknown>) => void]>().fn
  })

describe("HTTP Transport - Branch Coverage", () => {
  describe("createMcpHandlers - headersSent check (line 135)", () => {
    // test-revizorro: approved
    it("should not send error response when headers already sent", async () => {
      const handlers = createMcpHandlers(() => {
        throw new Error("Factory error")
      })

      const req = createMockRequest({ jsonrpc: "2.0", method: "tools/list", id: 1 })

      const res = createMockResponse()
      // Simulate headers already sent
      Object.defineProperty(res, "headersSent", { value: true })

      await handlers.post(req, res)

      // When headersSent is true, status() should NOT be called
      expect(getResponseCalls(res).status).toHaveLength(0)
    })
  })

  describe("closeHttpServer - error path (lines 181-188)", () => {
    // test-revizorro: approved
    it("should handle server close error gracefully", async () => {
      const { app } = createMockExpressApp()
      const closeProbe = createProbe<[((err?: Error) => void)?], void>((cb) => {
        cb?.(new Error("Close failed"))
      })
      const mockHttp = mock<http.Server>({
        close: closeProbe.fn
      })
      const writeError = createProbe<[string], void>(() => undefined)

      const mockFactory: HttpServerFactory = {
        createApp: createProbe<[string], Express>(() => app).fn,
        listen: createProbe<[Express, number, string], Effect.Effect<http.Server, never>>(
          () => Effect.succeed(mockHttp)
        ).fn,
        writeError: writeError.fn
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

      expect(closeProbe.calls).toHaveLength(1)
      // Verify the error was caught and logged to stderr rather than crashing
      const closeErrorCall = writeError.calls.find(
        (call) => call[0].includes("Server close error")
      )
      expect(closeErrorCall).toBeDefined()
    })
  })

  describe("GET and DELETE handlers return method not allowed (lines 148-168)", () => {
    // test-revizorro: approved
    it("GET returns 405 with method not allowed error", () => {
      const handlers = createMcpHandlers(createMockMcpServer)
      const req = createMockRequest()
      const res = createMockResponse()

      handlers.get(req, res)

      const calls = getResponseCalls(res)
      expect(calls.status).toContainEqual([405])
      expect(calls.json).toContainEqual([
        expect.objectContaining({
          error: expect.objectContaining({ message: expect.stringContaining("Method not allowed") })
        })
      ])
    })

    // test-revizorro: approved
    it("DELETE returns 405 with method not allowed error", () => {
      const handlers = createMcpHandlers(createMockMcpServer)
      const req = createMockRequest()
      const res = createMockResponse()

      handlers.delete(req, res)

      const calls = getResponseCalls(res)
      expect(calls.status).toContainEqual([405])
      expect(calls.json).toContainEqual([
        expect.objectContaining({
          error: expect.objectContaining({ message: expect.stringContaining("Method not allowed") })
        })
      ])
    })
  })
})
