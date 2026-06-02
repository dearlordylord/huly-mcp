/**
 * Tests for HTTP transport module.
 *
 * Uses DI to mock HTTP server - no actual network calls.
 *
 * @module
 */
/* eslint-disable functional/no-mixed-types -- local test probes intentionally combine call data with callable functions */
import type http from "node:http"

import type { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { McpError } from "@modelcontextprotocol/sdk/types.js"
import { Effect, Exit, Layer } from "effect"
import type { Express, Request, Response } from "express"
import { describe, expect, it } from "vitest"

import {
  createMcpHandlers,
  type HttpServerFactory,
  HttpServerFactoryService,
  type HttpTransportDependencies,
  HttpTransportError,
  startHttpTransport
} from "../../src/mcp/http-transport.js"
import type { McpProtocolHandlers } from "../../src/mcp/protocol-handlers.js"

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

const createMockTransportDependencies = (): {
  readonly dependencies: HttpTransportDependencies
  readonly calls: {
    readonly handleRequest: Array<[Request, Response, unknown]>
    readonly close: Array<[]>
  }
} => {
  const handleRequest = createProbe<[Request, Response, unknown], Promise<void>>(() => Promise.resolve())
  const close = createProbe<[], Promise<void>>(() => Promise.resolve())

  return {
    dependencies: {
      createTransport: () =>
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- test fake implements transport methods used by createMcpHandlers
        ({
          close: close.fn,
          handleRequest: handleRequest.fn
        }) as never,
      writeError: createVoidProbe<[string]>().fn
    },
    calls: {
      handleRequest: handleRequest.calls,
      close: close.calls
    }
  }
}

// Mock Express app for testing
const createMockExpressApp = () => {
  const routes: Record<string, Record<string, (req: Request, res: Response) => Promise<void>>> = {
    get: {},
    post: {},
    delete: {}
  }

  const get = createProbe<[string, (req: Request, res: Response) => Promise<void>], void>((path, handler) => {
    routes.get[path] = handler
  })
  const post = createProbe<[string, (req: Request, res: Response) => Promise<void>], void>((path, handler) => {
    routes.post[path] = handler
  })
  const del = createProbe<[string, (req: Request, res: Response) => Promise<void>], void>((path, handler) => {
    routes.delete[path] = handler
  })

  const app = mock<Express>({
    get: get.fn,
    post: post.fn,
    delete: del.fn,
    listen: createVoidProbe<[number, string, (error?: Error) => void]>().fn
  })

  return { app, routes, calls: { get: get.calls, post: post.calls, delete: del.calls } }
}

// Mock MCP Server for testing
const createMockMcpServer = (): Server => {
  const connect = createProbe<[], Promise<void>>(() => Promise.resolve())
  const close = createProbe<[], Promise<void>>(() => Promise.resolve())
  return mock<Server>({
    connect: connect.fn,
    close: close.fn,
    setRequestHandler: createVoidProbe<[unknown, (...args: Array<unknown>) => unknown]>().fn,
    __calls: { connect: connect.calls, close: close.calls }
  })
}

const getServerCalls = (server: Server): { connect: Array<[]>; close: Array<[]> } =>
  // eslint-disable-next-line no-restricted-syntax -- test probe metadata is attached to a structural fake
  (server as unknown as { __calls: { connect: Array<[]>; close: Array<[]> } }).__calls

// Mock HTTP response
const createMockResponse = () => {
  const statusCalls: Array<[number]> = []
  const jsonCalls: Array<[unknown]> = []
  const setHeaderCalls: Array<[string, string]> = []
  const on = createVoidProbe<[string, (...args: Array<unknown>) => void]>()
  const response = mock<Response>({
    status(code: number) {
      statusCalls.push([code])
      return this
    },
    json(body: unknown) {
      jsonCalls.push([body])
      return this
    },
    setHeader(name: string, value: string) {
      setHeaderCalls.push([name, value])
      return this
    },
    headersSent: false,
    on: on.fn,
    __calls: { status: statusCalls, json: jsonCalls, setHeader: setHeaderCalls, on: on.calls }
  })
  return response
}

const getResponseCalls = (response: Response): {
  status: Array<[number]>
  json: Array<[unknown]>
  setHeader: Array<[string, string]>
  on: Array<[string, (...args: Array<unknown>) => void]>
} =>
  // eslint-disable-next-line no-restricted-syntax -- test probe metadata is attached to a structural fake
  (response as unknown as {
    __calls: {
      status: Array<[number]>
      json: Array<[unknown]>
      setHeader: Array<[string, string]>
      on: Array<[string, (...args: Array<unknown>) => void]>
    }
  }).__calls

const createMockRequest = (
  body: unknown = {},
  headers: Request["headers"] = {}
): Request => {
  const on = createVoidProbe<[string, (...args: Array<unknown>) => void]>()
  return mock<Request>({
    body,
    headers,
    on: on.fn,
    __calls: { on: on.calls }
  })
}

const modernMeta = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientInfo": { name: "test", version: "1.0.0" },
  "io.modelcontextprotocol/clientCapabilities": {}
}

const modernHeaders = (method: string, name?: string): Request["headers"] => ({
  accept: "application/json, text/event-stream",
  "mcp-protocol-version": "2026-07-28",
  "mcp-method": method,
  ...(name === undefined ? {} : { "mcp-name": name })
})

const createMockProtocolHandlers = (): McpProtocolHandlers => ({
  listTools: () => Promise.resolve({ tools: [] }),
  callTool: () =>
    Promise.resolve({
      content: [{ type: "text", text: "ok" }]
    }),
  listResources: () => Promise.resolve({ resources: [] }),
  listResourceTemplates: () => ({ resourceTemplates: [] }),
  readResource: (request) =>
    Promise.resolve({
      contents: [{
        uri: request.params.uri,
        mimeType: "application/json",
        text: "{}"
      }]
    }),
  serverDiscover: () => ({
    resultType: "complete",
    supportedVersions: ["2026-07-28"],
    capabilities: { tools: {}, resources: {} },
    serverInfo: { name: "huly-mcp", version: "0.0.0-test" }
  }),
  drainInflight: () => Promise.resolve()
})

const modernHandlerFactory = createMockProtocolHandlers

const expectUnauthorizedResponse = (response: Response): void => {
  const calls = getResponseCalls(response)
  expect(calls.status).toEqual([[401]])
  expect(calls.setHeader).toEqual([["WWW-Authenticate", "Bearer"]])
  expect(calls.json).toEqual([[
    {
      jsonrpc: "2.0",
      error: { code: -32000, message: "Unauthorized" },
      id: null
    }
  ]])
}

describe("HTTP Transport", () => {
  describe("createMcpHandlers", () => {
    it("should handle tool calls in stateless mode (connect server and delegate to transport)", async () => {
      const mockServer = createMockMcpServer()
      const transport = createMockTransportDependencies()
      const handlers = createMcpHandlers(() => mockServer, transport.dependencies)

      const req = createMockRequest({ jsonrpc: "2.0", method: "tools/list", id: 1 })

      const res = createMockResponse()

      await handlers.post(req, res)

      expect(getServerCalls(mockServer).connect).toHaveLength(1)
      expect(transport.calls.handleRequest).toEqual([[req, res, req.body]])
    })

    it("should handle initialize requests in stateless mode", async () => {
      const mockServer = createMockMcpServer()
      const transport = createMockTransportDependencies()
      const handlers = createMcpHandlers(() => mockServer, transport.dependencies)

      const req = createMockRequest({
        jsonrpc: "2.0",
        method: "initialize",
        id: 1,
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "test", version: "1.0" }
        }
      })

      const res = createMockResponse()

      await handlers.post(req, res)

      expect(getServerCalls(mockServer).connect).toHaveLength(1)
      expect(transport.calls.handleRequest).toEqual([[req, res, req.body]])
    })

    it("dispatches server/discover on the 2026 path without initialize", async () => {
      const transport = createMockTransportDependencies()
      const handlers = createMcpHandlers(createMockMcpServer, transport.dependencies, undefined, modernHandlerFactory)
      const req = createMockRequest(
        { jsonrpc: "2.0", method: "server/discover", id: "discover", params: { _meta: modernMeta } },
        modernHeaders("server/discover")
      )
      const res = createMockResponse()

      await handlers.post(req, res)

      const calls = getResponseCalls(res)
      expect(transport.calls.handleRequest).toHaveLength(0)
      expect(calls.status).toEqual([[200]])
      expect(calls.json).toEqual([[
        {
          jsonrpc: "2.0",
          id: "discover",
          result: {
            resultType: "complete",
            supportedVersions: ["2026-07-28"],
            capabilities: { tools: {}, resources: {} },
            serverInfo: { name: "huly-mcp", version: "0.0.0-test" }
          }
        }
      ]])
    })

    it("adds resultType and public cache hints to 2026 tools/list", async () => {
      const handlers = createMcpHandlers(createMockMcpServer, undefined, undefined, modernHandlerFactory)
      const res = createMockResponse()

      await handlers.post(
        createMockRequest(
          { jsonrpc: "2.0", method: "tools/list", id: 1, params: { _meta: modernMeta } },
          modernHeaders("tools/list")
        ),
        res
      )

      expect(getResponseCalls(res).json).toEqual([[
        {
          jsonrpc: "2.0",
          id: 1,
          result: { tools: [], resultType: "complete", ttlMs: 300000, cacheScope: "public" }
        }
      ]])
    })

    it("adds resultType to 2026 tools/call", async () => {
      const handlers = createMcpHandlers(createMockMcpServer, undefined, undefined, modernHandlerFactory)
      const res = createMockResponse()

      await handlers.post(
        createMockRequest(
          {
            jsonrpc: "2.0",
            method: "tools/call",
            id: 2,
            params: { name: "get_huly_context", arguments: {}, _meta: modernMeta }
          },
          modernHeaders("tools/call", "get_huly_context")
        ),
        res
      )

      expect(getResponseCalls(res).json).toEqual([[
        {
          jsonrpc: "2.0",
          id: 2,
          result: { content: [{ type: "text", text: "ok" }], resultType: "complete" }
        }
      ]])
    })

    it("adds resultType and cache hints to 2026 resource list, template list, and read results", async () => {
      const handlers = createMcpHandlers(createMockMcpServer, undefined, undefined, modernHandlerFactory)
      const listRes = createMockResponse()
      const templatesRes = createMockResponse()
      const readRes = createMockResponse()

      await handlers.post(
        createMockRequest(
          { jsonrpc: "2.0", method: "resources/list", id: 3, params: { _meta: modernMeta } },
          modernHeaders("resources/list")
        ),
        listRes
      )
      await handlers.post(
        createMockRequest(
          { jsonrpc: "2.0", method: "resources/templates/list", id: 4, params: { _meta: modernMeta } },
          modernHeaders("resources/templates/list")
        ),
        templatesRes
      )
      await handlers.post(
        createMockRequest(
          {
            jsonrpc: "2.0",
            method: "resources/read",
            id: 5,
            params: { uri: "huly://projects/HULY", _meta: modernMeta }
          },
          modernHeaders("resources/read", "huly://projects/HULY")
        ),
        readRes
      )

      expect(getResponseCalls(listRes).json).toEqual([[
        {
          jsonrpc: "2.0",
          id: 3,
          result: { resources: [], resultType: "complete", ttlMs: 60000, cacheScope: "private" }
        }
      ]])
      expect(getResponseCalls(templatesRes).json).toEqual([[
        {
          jsonrpc: "2.0",
          id: 4,
          result: { resourceTemplates: [], resultType: "complete", ttlMs: 300000, cacheScope: "public" }
        }
      ]])
      expect(getResponseCalls(readRes).json).toEqual([[
        {
          jsonrpc: "2.0",
          id: 5,
          result: {
            contents: [{ uri: "huly://projects/HULY", mimeType: "application/json", text: "{}" }],
            resultType: "complete",
            ttlMs: 60000,
            cacheScope: "private"
          }
        }
      ]])
    })

    it("returns modern header validation errors for missing and mismatched 2026 headers", async () => {
      const handlers = createMcpHandlers(createMockMcpServer, undefined, undefined, modernHandlerFactory)
      const missingMethod = createMockResponse()
      const missingName = createMockResponse()
      const mismatchedName = createMockResponse()

      await handlers.post(
        createMockRequest(
          { jsonrpc: "2.0", method: "tools/list", id: 6, params: { _meta: modernMeta } },
          {
            accept: "application/json, text/event-stream",
            "mcp-protocol-version": "2026-07-28"
          }
        ),
        missingMethod
      )
      await handlers.post(
        createMockRequest(
          {
            jsonrpc: "2.0",
            method: "tools/call",
            id: 7,
            params: { name: "get_huly_context", arguments: {}, _meta: modernMeta }
          },
          {
            accept: "application/json, text/event-stream",
            "mcp-protocol-version": "2026-07-28",
            "mcp-method": "tools/call"
          }
        ),
        missingName
      )
      await handlers.post(
        createMockRequest(
          {
            jsonrpc: "2.0",
            method: "resources/read",
            id: 8,
            params: { uri: "huly://projects/HULY", _meta: modernMeta }
          },
          modernHeaders("resources/read", "huly://projects/OTHER")
        ),
        mismatchedName
      )

      expect(getResponseCalls(missingMethod).status).toEqual([[400]])
      expect(getResponseCalls(missingMethod).json[0]?.[0]).toMatchObject({
        error: { code: -32001, message: expect.stringContaining("Mcp-Method") }
      })
      expect(getResponseCalls(missingName).status).toEqual([[400]])
      expect(getResponseCalls(missingName).json[0]?.[0]).toMatchObject({
        error: { code: -32001, message: expect.stringContaining("Mcp-Name") }
      })
      expect(getResponseCalls(mismatchedName).status).toEqual([[400]])
      expect(getResponseCalls(mismatchedName).json[0]?.[0]).toMatchObject({
        error: { code: -32001, message: expect.stringContaining("does not match") }
      })
    })

    it("returns modern errors for missing _meta, unsupported protocol, invalid body, and unknown methods", async () => {
      const handlers = createMcpHandlers(createMockMcpServer, undefined, undefined, modernHandlerFactory)
      const missingMeta = createMockResponse()
      const unsupported = createMockResponse()
      const invalidBody = createMockResponse()
      const unknownMethod = createMockResponse()

      await handlers.post(
        createMockRequest(
          { jsonrpc: "2.0", method: "tools/list", id: 9, params: {} },
          modernHeaders("tools/list")
        ),
        missingMeta
      )
      await handlers.post(
        createMockRequest(
          {
            jsonrpc: "2.0",
            method: "server/discover",
            id: 10,
            params: {
              _meta: {
                ...modernMeta,
                "io.modelcontextprotocol/protocolVersion": "1900-01-01"
              }
            }
          },
          {
            ...modernHeaders("server/discover"),
            "mcp-protocol-version": "1900-01-01"
          }
        ),
        unsupported
      )
      await handlers.post(
        createMockRequest(
          [{ jsonrpc: "2.0", method: "tools/list", id: 11 }],
          modernHeaders("tools/list")
        ),
        invalidBody
      )
      await handlers.post(
        createMockRequest(
          { jsonrpc: "2.0", method: "unknown/method", id: 12, params: { _meta: modernMeta } },
          modernHeaders("unknown/method")
        ),
        unknownMethod
      )

      expect(getResponseCalls(missingMeta).json[0]?.[0]).toMatchObject({ error: { code: -32001 } })
      expect(getResponseCalls(unsupported).json[0]?.[0]).toMatchObject({
        error: { code: -32004, data: { supported: ["2026-07-28"], requested: "1900-01-01" } }
      })
      expect(getResponseCalls(invalidBody).json[0]?.[0]).toMatchObject({ error: { code: -32600 } })
      expect(getResponseCalls(unknownMethod).status).toEqual([[404]])
      expect(getResponseCalls(unknownMethod).json[0]?.[0]).toMatchObject({ error: { code: -32601 } })
    })

    it("maps 2026 resource-not-found failures to invalid params", async () => {
      const handlers = createMcpHandlers(
        createMockMcpServer,
        undefined,
        undefined,
        () => ({
          ...createMockProtocolHandlers(),
          readResource: () =>
            Promise.reject(new McpError(-32002, "Resource not found", { uri: "huly://projects/NOPE" }))
        })
      )
      const res = createMockResponse()

      await handlers.post(
        createMockRequest(
          {
            jsonrpc: "2.0",
            method: "resources/read",
            id: 14,
            params: { uri: "huly://projects/NOPE", _meta: modernMeta }
          },
          modernHeaders("resources/read", "huly://projects/NOPE")
        ),
        res
      )

      expect(getResponseCalls(res).status).toEqual([[400]])
      expect(getResponseCalls(res).json[0]?.[0]).toMatchObject({
        error: { code: -32602, message: "Resource not found", data: { uri: "huly://projects/NOPE" } }
      })
    })

    it("delegates legacy HTTP requests to the SDK transport even when a 2026 handler factory exists", async () => {
      const mockServer = createMockMcpServer()
      const transport = createMockTransportDependencies()
      const createProtocolHandlers = createProbe<[Request], McpProtocolHandlers>(modernHandlerFactory)
      const handlers = createMcpHandlers(
        () => mockServer,
        transport.dependencies,
        undefined,
        createProtocolHandlers.fn
      )
      const req = createMockRequest({ jsonrpc: "2.0", method: "tools/list", id: 13 })
      const res = createMockResponse()

      await handlers.post(req, res)

      expect(createProtocolHandlers.calls).toHaveLength(0)
      expect(getServerCalls(mockServer).connect).toHaveLength(1)
      expect(transport.calls.handleRequest).toEqual([[req, res, req.body]])
    })

    it("should create fresh server for each request in stateless mode", async () => {
      const serverInstances: Array<Server> = []
      const transport = createMockTransportDependencies()
      const handlers = createMcpHandlers(() => {
        const server = createMockMcpServer()
        serverInstances.push(server)
        return server
      }, transport.dependencies)

      const res1 = createMockResponse()
      const res2 = createMockResponse()

      await handlers.post(createMockRequest({ jsonrpc: "2.0", method: "tools/list", id: 1 }), res1)

      await handlers.post(
        createMockRequest({
          jsonrpc: "2.0",
          method: "tools/call",
          id: 2,
          params: { name: "test_tool", arguments: {} }
        }),
        res2
      )

      expect(serverInstances).toHaveLength(2)
      expect(serverInstances[0]).not.toBe(serverInstances[1])
      expect(getServerCalls(serverInstances[0]).connect).toHaveLength(1)
      expect(getServerCalls(serverInstances[1]).connect).toHaveLength(1)
      expect(transport.calls.handleRequest).toHaveLength(2)
    })

    it("passes request headers to the per-request server factory", async () => {
      const headers = {
        authorization: "Bearer mcp-endpoint-secret",
        "x-huly-url": "https://huly.one",
        "x-huly-workspace": "workspace-one",
        "x-huly-token": "token-one"
      }
      const capturedHeaders: Array<Request["headers"]> = []
      const transport = createMockTransportDependencies()
      const handlers = createMcpHandlers(
        (req) => {
          capturedHeaders.push(req.headers)
          return createMockMcpServer()
        },
        transport.dependencies,
        "mcp-endpoint-secret"
      )

      await handlers.post(
        createMockRequest({ jsonrpc: "2.0", method: "tools/list", id: 1 }, headers),
        createMockResponse()
      )

      expect(capturedHeaders).toEqual([headers])
    })

    it("allows POST without Authorization when MCP auth is disabled", async () => {
      let createServerCalls = 0
      const transport = createMockTransportDependencies()
      const handlers = createMcpHandlers(() => {
        createServerCalls++
        return createMockMcpServer()
      }, transport.dependencies)

      const req = createMockRequest({ jsonrpc: "2.0", method: "tools/list", id: 1 })
      const res = createMockResponse()

      await handlers.post(req, res)

      expect(createServerCalls).toBe(1)
      expect(transport.calls.handleRequest).toEqual([[req, res, req.body]])
    })

    it("treats empty MCP auth config as disabled", async () => {
      let createServerCalls = 0
      const transport = createMockTransportDependencies()
      const handlers = createMcpHandlers(
        () => {
          createServerCalls++
          return createMockMcpServer()
        },
        transport.dependencies,
        "   "
      )

      const req = createMockRequest({ jsonrpc: "2.0", method: "tools/list", id: 1 })
      const res = createMockResponse()

      await handlers.post(req, res)

      expect(createServerCalls).toBe(1)
      expect(transport.calls.handleRequest).toEqual([[req, res, req.body]])
    })

    it("returns 401 before creating a server when MCP auth header is missing", async () => {
      let createServerCalls = 0
      const transport = createMockTransportDependencies()
      const handlers = createMcpHandlers(
        () => {
          createServerCalls++
          return createMockMcpServer()
        },
        transport.dependencies,
        "server-secret"
      )

      const res = createMockResponse()

      await handlers.post(createMockRequest({ jsonrpc: "2.0", method: "tools/list", id: 1 }), res)

      expectUnauthorizedResponse(res)
      expect(createServerCalls).toBe(0)
      expect(transport.calls.handleRequest).toHaveLength(0)
    })

    it("returns 401 for non-bearer MCP auth scheme", async () => {
      const transport = createMockTransportDependencies()
      const handlers = createMcpHandlers(createMockMcpServer, transport.dependencies, "server-secret")
      const res = createMockResponse()

      await handlers.post(
        createMockRequest({ jsonrpc: "2.0", method: "tools/list", id: 1 }, { authorization: "Basic server-secret" }),
        res
      )

      expectUnauthorizedResponse(res)
      expect(transport.calls.handleRequest).toHaveLength(0)
    })

    it("returns 401 for wrong bearer token without leaking secrets", async () => {
      const transport = createMockTransportDependencies()
      const handlers = createMcpHandlers(createMockMcpServer, transport.dependencies, "server-secret")
      const res = createMockResponse()

      await handlers.post(
        createMockRequest({ jsonrpc: "2.0", method: "tools/list", id: 1 }, { authorization: "Bearer wrong-secret" }),
        res
      )

      expectUnauthorizedResponse(res)
      expect(JSON.stringify(getResponseCalls(res).json)).not.toContain("server-secret")
      expect(JSON.stringify(getResponseCalls(res).json)).not.toContain("wrong-secret")
      expect(transport.calls.handleRequest).toHaveLength(0)
    })

    it("allows POST with correct MCP bearer token", async () => {
      const transport = createMockTransportDependencies()
      const handlers = createMcpHandlers(createMockMcpServer, transport.dependencies, "server-secret")
      const req = createMockRequest(
        { jsonrpc: "2.0", method: "tools/list", id: 1 },
        { authorization: "Bearer server-secret" }
      )
      const res = createMockResponse()

      await handlers.post(req, res)

      expect(transport.calls.handleRequest).toEqual([[req, res, req.body]])
      expect(getResponseCalls(res).status).toHaveLength(0)
    })

    it("ignores query-string tokens for MCP auth", async () => {
      const transport = createMockTransportDependencies()
      const handlers = createMcpHandlers(createMockMcpServer, transport.dependencies, "server-secret")
      const req = mock<Request>({
        body: { jsonrpc: "2.0", method: "tools/list", id: 1 },
        headers: {},
        query: { token: "server-secret" },
        on: createVoidProbe<[string, (...args: Array<unknown>) => void]>().fn
      })
      const res = createMockResponse()

      await handlers.post(req, res)

      expectUnauthorizedResponse(res)
      expect(transport.calls.handleRequest).toHaveLength(0)
    })

    it("returns 401 for GET and DELETE before existing 405 behavior when MCP auth is invalid", () => {
      const handlers = createMcpHandlers(createMockMcpServer, undefined, "server-secret")
      const getRes = createMockResponse()
      const deleteRes = createMockResponse()

      handlers.get(createMockRequest(undefined, { authorization: "Bearer wrong-secret" }), getRes)
      handlers.delete(createMockRequest(), deleteRes)

      expectUnauthorizedResponse(getRes)
      expectUnauthorizedResponse(deleteRes)
    })

    it("keeps existing GET and DELETE 405 behavior when MCP auth succeeds", () => {
      const handlers = createMcpHandlers(createMockMcpServer, undefined, "server-secret")
      const getRes = createMockResponse()
      const deleteRes = createMockResponse()

      handlers.get(createMockRequest(undefined, { authorization: "Bearer server-secret" }), getRes)
      handlers.delete(createMockRequest(undefined, { authorization: "Bearer server-secret" }), deleteRes)

      expect(getResponseCalls(getRes).status).toEqual([[405]])
      expect(getResponseCalls(deleteRes).status).toEqual([[405]])
    })

    it("should reject GET requests in stateless mode", async () => {
      const mockServer = createMockMcpServer()
      const handlers = createMcpHandlers(() => mockServer)

      const req = createMockRequest()
      const res = createMockResponse()

      await handlers.get(req, res)

      const calls = getResponseCalls(res)
      expect(calls.status).toContainEqual([405])
      expect(calls.json).toContainEqual([
        expect.objectContaining({
          jsonrpc: "2.0",
          error: expect.objectContaining({
            code: -32000,
            message: expect.stringContaining("Method not allowed")
          })
        })
      ])
    })

    it("should reject DELETE requests in stateless mode", async () => {
      const mockServer = createMockMcpServer()
      const handlers = createMcpHandlers(() => mockServer)

      const req = createMockRequest()
      const res = createMockResponse()

      await handlers.delete(req, res)

      const calls = getResponseCalls(res)
      expect(calls.status).toContainEqual([405])
      expect(calls.json).toContainEqual([
        expect.objectContaining({
          jsonrpc: "2.0",
          error: expect.objectContaining({
            code: -32000,
            message: expect.stringContaining("Method not allowed")
          })
        })
      ])
    })

    it("should not send 500 when server factory throws and headers already sent", async () => {
      const handlers = createMcpHandlers(() => {
        throw new Error("Factory error")
      })

      const req = createMockRequest({ jsonrpc: "2.0", method: "tools/list", id: 1 })

      const res = createMockResponse()
      // Simulate headers already sent before the handler runs
      Object.defineProperty(res, "headersSent", { value: true })

      // Should not throw even though factory errors and headers are already sent
      await handlers.post(req, res)

      // When headersSent is true, the catch block should skip sending error response
      const calls = getResponseCalls(res)
      expect(calls.status).toHaveLength(0)
      expect(calls.json).toHaveLength(0)
    })

    it("should return 500 when server factory throws", async () => {
      const handlers = createMcpHandlers(() => {
        throw new Error("Factory error")
      })

      // Any valid JSON-RPC request (tools/list in this case)
      const req = createMockRequest({
        jsonrpc: "2.0",
        method: "tools/list",
        id: 1,
        params: {}
      })

      const res = createMockResponse()

      await handlers.post(req, res)

      const calls = getResponseCalls(res)
      expect(calls.status).toContainEqual([500])
      expect(calls.json).toContainEqual([
        expect.objectContaining({
          jsonrpc: "2.0",
          error: expect.objectContaining({
            code: -32603,
            message: expect.stringContaining("Internal server error")
          })
        })
      ])
    })
  })

  describe("startHttpTransport", () => {
    it("should register POST, GET, DELETE handlers on /mcp", async () => {
      const { app, calls: appCalls } = createMockExpressApp()
      const closeProbe = createProbe<[((err?: Error) => void)?], void>((cb) => cb?.())
      const mockHttp = mock<http.Server>({
        close: closeProbe.fn
      })
      const createAppProbe = createProbe<[string], Express>(() => app)
      const listenProbe = createProbe<[Express, number, string], Effect.Effect<http.Server, HttpTransportError>>(
        () => Effect.succeed(mockHttp)
      )

      const mockFactory: HttpServerFactory = {
        createApp: createAppProbe.fn,
        listen: listenProbe.fn
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

      expect(createAppProbe.calls).toContainEqual(["127.0.0.1"])
      expect(listenProbe.calls).toContainEqual([app, 3000, "127.0.0.1"])
      expect(appCalls.post).toEqual([["/mcp", expect.any(Function)]])
      expect(appCalls.get).toEqual([["/mcp", expect.any(Function)]])
      expect(appCalls.delete).toEqual([["/mcp", expect.any(Function)]])
    })

    it("passes MCP auth token to registered route handlers", async () => {
      const { app, routes } = createMockExpressApp()
      const mockHttp = mock<http.Server>({
        close: createProbe<[((err?: Error) => void)?], void>((cb) => cb?.()).fn
      })
      const mockFactory: HttpServerFactory = {
        createApp: () => app,
        listen: () => Effect.succeed(mockHttp)
      }

      const program = startHttpTransport(
        { port: 3000, host: "127.0.0.1", authToken: "server-secret" },
        createMockMcpServer,
        { writeError: () => {} }
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

      const unauthorizedRes = createMockResponse()
      await routes.get["/mcp"](createMockRequest(), unauthorizedRes)
      expectUnauthorizedResponse(unauthorizedRes)

      const authorizedRes = createMockResponse()
      await routes.get["/mcp"](
        createMockRequest(undefined, { authorization: "Bearer server-secret" }),
        authorizedRes
      )
      expect(getResponseCalls(authorizedRes).status).toEqual([[405]])
    })

    it("should close server when scope closes", async () => {
      const { app } = createMockExpressApp()
      const closeProbe = createProbe<[((err?: Error) => void)?], void>((cb) => cb?.())
      const mockHttp = mock<http.Server>({
        close: closeProbe.fn
      })
      const createAppProbe = createProbe<[string], Express>(() => app)
      const listenProbe = createProbe<[Express, number, string], Effect.Effect<http.Server, HttpTransportError>>(
        () => Effect.succeed(mockHttp)
      )

      const mockFactory: HttpServerFactory = {
        createApp: createAppProbe.fn,
        listen: listenProbe.fn
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
      expect(closeProbe.calls).toHaveLength(1)
    })

    it("should fail if listen fails", async () => {
      const { app } = createMockExpressApp()
      const createAppProbe = createProbe<[string], Express>(() => app)
      const listenProbe = createProbe<[Express, number, string], Effect.Effect<http.Server, HttpTransportError>>(
        () =>
          Effect.fail(
            new HttpTransportError({
              message: "Port already in use"
            })
          )
      )

      const mockFactory: HttpServerFactory = {
        createApp: createAppProbe.fn,
        listen: listenProbe.fn
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

    it("should log to stderr and continue when server close fails during release", async () => {
      const { app } = createMockExpressApp()
      const closeProbe = createProbe<[((err?: Error) => void)?], void>((cb) => cb?.(new Error("close failed")))
      const mockHttp = mock<http.Server>({
        close: closeProbe.fn
      })
      const writeError = createProbe<[string], void>(() => undefined)
      const createAppProbe = createProbe<[string], Express>(() => app)
      const listenProbe = createProbe<[Express, number, string], Effect.Effect<http.Server, HttpTransportError>>(
        () => Effect.succeed(mockHttp)
      )

      const mockFactory: HttpServerFactory = {
        createApp: createAppProbe.fn,
        listen: listenProbe.fn,
        writeError: writeError.fn
      }

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

      expect(closeProbe.calls).toHaveLength(1)
      const closeErrorCall = writeError.calls.find(
        (call) => call[0].includes("Server close error")
      )
      expect(closeErrorCall).toBeDefined()
    })

    it("should shut down when SIGINT is received", async () => {
      const { app } = createMockExpressApp()
      const closeProbe = createProbe<[((err?: Error) => void)?], void>((cb) => cb?.())
      const mockHttp = mock<http.Server>({
        close: closeProbe.fn
      })
      const createAppProbe = createProbe<[string], Express>(() => app)
      const listenProbe = createProbe<[Express, number, string], Effect.Effect<http.Server, HttpTransportError>>(
        () => Effect.succeed(mockHttp)
      )

      const mockFactory: HttpServerFactory = {
        createApp: createAppProbe.fn,
        listen: listenProbe.fn,
        writeError: createVoidProbe<[string]>().fn
      }

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

      expect(Exit.isSuccess(result)).toBe(true)
      // Server should be closed during scope release after SIGINT
      expect(closeProbe.calls).toHaveLength(1)
    })
  })

  describe("createMcpHandlers - close cleanup", () => {
    it("should register close handler and call cleanup on close", async () => {
      const mockServer = createMockMcpServer()
      const handlers = createMcpHandlers(() => mockServer)

      const closeHandlers: Array<() => void> = []
      const reqOn = createProbe<[string, () => void], void>((event, handler) => {
        if (event === "close") closeHandlers.push(handler)
      })
      const res = mock<Response>({
        status() {
          return this
        },
        json() {
          return this
        },
        headersSent: false,
        writeHead: createVoidProbe<Array<unknown>>().fn,
        write: createProbe<Array<unknown>, boolean>(() => true).fn,
        end: createVoidProbe<Array<unknown>>().fn,
        setHeader: createVoidProbe<Array<unknown>>().fn,
        getHeader: createProbe<Array<unknown>, undefined>(() => undefined).fn,
        flushHeaders: createVoidProbe<Array<unknown>>().fn,
        on: createVoidProbe<[string, () => void]>().fn
      })

      const req = mock<Request>({
        body: { jsonrpc: "2.0", method: "tools/list", id: 1 },
        on: reqOn.fn
      })

      await handlers.post(req, res)

      expect(closeHandlers).toHaveLength(1)
      closeHandlers[0]()

      // Allow microtasks (transport.close() and server.close() are async)
      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(reqOn.calls).toEqual([["close", expect.any(Function)]])
      expect(getServerCalls(mockServer).close).toHaveLength(1)
    })

    it("should log to stderr when transport.close rejects during cleanup", async () => {
      const writeError = createProbe<[string], void>(() => undefined)
      const transportClose = createProbe<[], Promise<void>>(() => Promise.reject(new Error("transport close boom")))
      const handleRequest = createProbe<[Request, Response, unknown], Promise<void>>(() => Promise.resolve())
      const transport = {
        close: transportClose.fn,
        handleRequest: handleRequest.fn
      }
      const mockServer = createMockMcpServer()
      const handlers = createMcpHandlers(() => mockServer, {
        createTransport: () => {
          return transport as never
        },
        writeError: writeError.fn
      })

      const closeHandlers: Array<() => void> = []
      const reqOn = createProbe<[string, () => void], void>((event, handler) => {
        if (event === "close") closeHandlers.push(handler)
      })
      const res = mock<Response>({
        status() {
          return this
        },
        json() {
          return this
        },
        headersSent: false,
        writeHead: createVoidProbe<Array<unknown>>().fn,
        write: createProbe<Array<unknown>, boolean>(() => true).fn,
        end: createVoidProbe<Array<unknown>>().fn,
        setHeader: createVoidProbe<Array<unknown>>().fn,
        getHeader: createProbe<Array<unknown>, undefined>(() => undefined).fn,
        flushHeaders: createVoidProbe<Array<unknown>>().fn,
        on: createVoidProbe<[string, () => void]>().fn
      })

      const req = mock<Request>({
        body: { jsonrpc: "2.0", method: "tools/list", id: 1 },
        on: reqOn.fn
      })
      await handlers.post(req, res)

      closeHandlers[0]()
      await new Promise((resolve) => setTimeout(resolve, 10))

      const transportCleanupCall = writeError.calls.find(
        (call) => call[0].includes("Transport cleanup error")
      )
      expect(transportCleanupCall).toBeDefined()
    })

    it("should log to stderr when server.close rejects during cleanup", async () => {
      const connect = createProbe<[], Promise<void>>(() => Promise.resolve())
      const close = createProbe<[], Promise<void>>(() => Promise.reject(new Error("server close failed")))
      const mcpServer = mock<Server>({
        connect: connect.fn,
        close: close.fn,
        setRequestHandler: createVoidProbe<[unknown, (...args: Array<unknown>) => unknown]>().fn
      })

      const writeError = createProbe<[string], void>(() => undefined)
      const handlers = createMcpHandlers(() => mcpServer, {
        createTransport: () => {
          // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- test fake implements only methods used by handler
          return {
            close: createProbe<[], Promise<void>>(() => Promise.resolve()).fn,
            handleRequest: createProbe<[Request, Response, unknown], Promise<void>>(() => Promise.resolve()).fn
          } as never
        },
        writeError: writeError.fn
      })

      const closeHandlers: Array<() => void> = []
      const reqOn = createProbe<[string, () => void], void>((event, handler) => {
        if (event === "close") closeHandlers.push(handler)
      })
      const res = mock<Response>({
        status() {
          return this
        },
        json() {
          return this
        },
        headersSent: false,
        writeHead: createVoidProbe<Array<unknown>>().fn,
        write: createProbe<Array<unknown>, boolean>(() => true).fn,
        end: createVoidProbe<Array<unknown>>().fn,
        setHeader: createVoidProbe<Array<unknown>>().fn,
        getHeader: createProbe<Array<unknown>, undefined>(() => undefined).fn,
        flushHeaders: createVoidProbe<Array<unknown>>().fn,
        on: createVoidProbe<[string, () => void]>().fn
      })

      const req = mock<Request>({
        body: { jsonrpc: "2.0", method: "tools/list", id: 1 },
        on: reqOn.fn
      })
      await handlers.post(req, res)

      closeHandlers[0]()
      await new Promise((resolve) => setTimeout(resolve, 10))

      const serverCleanupCall = writeError.calls.find(
        (call) => call[0].includes("Server cleanup error")
      )
      expect(serverCleanupCall).toBeDefined()
    })
  })

  describe("defaultHttpServerFactory via defaultLayer", () => {
    it("should succeed when app.listen calls back without error", async () => {
      const fakeHttp = mock<http.Server>({ close: createVoidProbe<[((err?: Error) => void)?]>().fn })
      const mockApp = mock<Express>({
        get: createVoidProbe<Array<unknown>>().fn,
        post: createVoidProbe<Array<unknown>>().fn,
        delete: createVoidProbe<Array<unknown>>().fn,
        listen: createProbe<[number, string, (error?: Error) => void], http.Server>((_port, _host, cb) => {
          // Callback must fire asynchronously so that `const server = app.listen(...)` completes first
          setTimeout(() => cb(), 0)
          return fakeHttp
        }).fn
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

    it("should fail with HttpTransportError when app.listen calls back with error", async () => {
      const mockApp = mock<Express>({
        get: createVoidProbe<Array<unknown>>().fn,
        post: createVoidProbe<Array<unknown>>().fn,
        delete: createVoidProbe<Array<unknown>>().fn,
        listen: createProbe<[number, string, (error?: Error) => void], http.Server>((_port, _host, cb) => {
          setTimeout(() => cb(new Error("EADDRINUSE")), 0)
          return mock<http.Server>({ close: createVoidProbe<[((err?: Error) => void)?]>().fn })
        }).fn
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

    it("should call createMcpExpressApp via createApp", async () => {
      const program = Effect.gen(function*() {
        const factory = yield* HttpServerFactoryService
        return factory.createApp("127.0.0.1")
      })

      const result = await Effect.runPromise(
        program.pipe(Effect.provide(HttpServerFactoryService.defaultLayer))
      )

      expect(result).toBeDefined()
      // Verify the returned object has Express-like route registration methods
      expect(typeof result.get).toBe("function")
      expect(typeof result.post).toBe("function")
      expect(typeof result.delete).toBe("function")
      expect(typeof result.listen).toBe("function")
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
