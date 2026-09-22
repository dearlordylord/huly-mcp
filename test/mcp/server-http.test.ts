import type http from "node:http"

import { toFindResult } from "@hcengineering/core"
import { ConfigProvider, Context, Effect, Exit, Fiber, Layer, Redacted, Schema } from "effect"
import { describe, expect, it } from "vitest"

import { ConfigValidationError, sanitizeHulyRuntimeConfigFromEnv } from "../../src/config/config.js"
import { HulyClient, type HulyClientOperations } from "../../src/huly/client.js"
import { HulyConnectionError } from "../../src/huly/errors-base.js"
import { HulyStorageClient } from "../../src/huly/storage.js"
import { WorkspaceClient } from "../../src/huly/workspace-client.js"
import { HttpServerFactoryService } from "../../src/mcp/http-transport.js"
import { PROXY_TOOL_NAMES } from "../../src/mcp/proxy-tools.js"
import type { ClientBundle } from "../../src/mcp/server.js"
import { McpServerService } from "../../src/mcp/server.js"
import type { HulyClientBundleError } from "../../src/runtime/client-resolver.js"
import { TelemetryService } from "../../src/telemetry/telemetry.js"
import { makeTestHttpServerFactory } from "./http-test-support.js"

const modernProtocol = "2026-07-28"
const runtimeEnv = { HULY_URL: "https://huly.example.com", HULY_WORKSPACE: "workspace", HULY_TOKEN: "test-token" }
const JsonRpcResponse = Schema.Struct({
  jsonrpc: Schema.Literal("2.0"),
  id: Schema.NullOr(Schema.Union([Schema.String, Schema.Number])),
  result: Schema.optionalKey(Schema.Record(Schema.String, Schema.Unknown)),
  error: Schema.optionalKey(
    Schema.Struct({ code: Schema.Number, message: Schema.String, data: Schema.optionalKey(Schema.Unknown) })
  )
})

const deferred = <A>(): { readonly promise: Promise<A>; readonly resolve: (value: A) => void } => {
  let resolvePromise: ((value: A) => void) | undefined
  const promise = new Promise<A>((resolve) => {
    resolvePromise = resolve
  })
  return { promise, resolve: (value) => resolvePromise?.(value) }
}

const clientBundle = async (operations: Partial<HulyClientOperations> = {}): Promise<ClientBundle> => {
  const services = await Effect.runPromise(
    Layer.build(
      Layer.mergeAll(HulyClient.testLayer(operations), HulyStorageClient.testLayer({}), WorkspaceClient.testLayer({}))
    ).pipe(Effect.scoped)
  )
  return {
    hulyClient: Context.get(services, HulyClient),
    storageClient: Context.get(services, HulyStorageClient),
    workspaceClient: Context.get(services, WorkspaceClient)
  }
}

const modernRequest = (
  method: string,
  params: Record<string, unknown>,
  clientName: string,
  token?: string,
  extraHeaders: Record<string, string> = {}
): RequestInit => ({
  method: "POST",
  headers: {
    accept: "application/json, text/event-stream",
    "content-type": "application/json",
    "mcp-protocol-version": modernProtocol,
    "mcp-method": method,
    ...(method === "tools/call" && typeof params.name === "string" ? { "mcp-name": params.name } : {}),
    ...(method === "resources/read" && typeof params.uri === "string" ? { "mcp-name": params.uri } : {}),
    ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
    ...extraHeaders
  },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method,
    params: {
      ...params,
      _meta: {
        "io.modelcontextprotocol/protocolVersion": modernProtocol,
        "io.modelcontextprotocol/clientCapabilities": {},
        "io.modelcontextprotocol/clientInfo": { name: clientName, version: "1.0.0" }
      }
    }
  })
})

const legacyInitialize = (token?: string): RequestInit => ({
  method: "POST",
  headers: {
    accept: "application/json, text/event-stream",
    "content-type": "application/json",
    ...(token === undefined ? {} : { authorization: `Bearer ${token}` })
  },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "legacy-certification", version: "1.0.0" }
    }
  })
})

const bareLegacyRequest = (method: string, params: Record<string, unknown>, id?: number): RequestInit => ({
  method: "POST",
  headers: { accept: "application/json, text/event-stream", "content-type": "application/json" },
  body: JSON.stringify({ jsonrpc: "2.0", ...(id === undefined ? {} : { id }), method, params })
})

const toolNames = (response: Schema.Schema.Type<typeof JsonRpcResponse>): ReadonlyArray<string> => {
  const tools = response.result?.tools
  if (!Array.isArray(tools)) return []
  return tools.flatMap((tool) =>
    typeof tool === "object" && tool !== null && "name" in tool && typeof tool.name === "string" ? [tool.name] : []
  )
}

const startServer = async (options?: {
  readonly configValues?: Readonly<Record<string, unknown>>
  readonly token?: string
  readonly closeClients?: () => Promise<void>
  readonly shutdownTelemetry?: () => Promise<void>
  readonly writeError?: (message: string) => void
  readonly resolveLease?: (
    request: Request,
    signal: AbortSignal
  ) => Promise<{
    readonly bundle: Exit.Exit<ClientBundle, HulyClientBundleError>
    readonly close: () => void | Promise<void>
  }>
}) => {
  const listening = deferred<http.Server>()
  const bundle = await clientBundle()
  const layer = McpServerService.layer({
    transport: "http",
    httpPort: 0,
    httpHost: "127.0.0.1",
    resolveClients: async () => Exit.succeed(bundle),
    ...(options?.token === undefined ? {} : { mcpAuthToken: Redacted.make(options.token) }),
    ...(options?.closeClients === undefined ? {} : { closeClients: options.closeClients }),
    ...(options?.writeError === undefined ? {} : { writeError: options.writeError }),
    ...(options?.resolveLease === undefined ? {} : { resolveClientLeaseForHttpRequest: options.resolveLease }),
    getRuntimeConfigContext: () => sanitizeHulyRuntimeConfigFromEnv(runtimeEnv)
  }).pipe(
    Layer.provide(
      TelemetryService.testLayer(
        options?.shutdownTelemetry === undefined ? {} : { shutdown: options.shutdownTelemetry }
      )
    )
  )
  const context = await Effect.runPromise(
    Layer.build(layer).pipe(
      Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown(options?.configValues ?? {}))),
      Effect.scoped
    )
  )
  const operations = Context.get(context, McpServerService)
  const factory = makeTestHttpServerFactory(listening.resolve, () => {})
  const fiber = Effect.runFork(operations.run().pipe(Effect.provideService(HttpServerFactoryService, factory)))
  await Effect.runPromise(operations.awaitReady())
  const rawServer = await listening.promise
  const address = rawServer.address()
  if (address === null || typeof address === "string") throw new Error("Expected a TCP address")
  return {
    endpoint: `http://127.0.0.1:${String(address.port)}/mcp`,
    rawServer,
    stop: async () => {
      await Effect.runPromise(operations.stop())
      await Effect.runPromise(Fiber.join(fiber))
    }
  }
}

describe("McpServerService Effect HTTP integration", () => {
  it("serves modern discovery and the preserved legacy initialize protocol", async () => {
    const server = await startServer()
    try {
      const discovery = await fetch(server.endpoint, modernRequest("server/discover", {}, "certification-client"))
      const discoveryBody = Schema.decodeUnknownSync(JsonRpcResponse)(await discovery.json())
      expect(discovery.status).toBe(200)
      expect(discoveryBody.result?.supportedVersions).toEqual([modernProtocol, "2025-06-18"])

      const legacy = await fetch(server.endpoint, legacyInitialize())
      const legacyBody = Schema.decodeUnknownSync(JsonRpcResponse)(await legacy.json())
      expect(legacy.status).toBe(200)
      expect(legacyBody.result?.protocolVersion).toBe("2025-06-18")
    } finally {
      await server.stop()
    }
  })

  it("accepts default tools/list params and omitted arguments for a parameterless tool", async () => {
    const server = await startServer()
    try {
      const listed = await fetch(server.endpoint, {
        method: "POST",
        headers: { accept: "application/json, text/event-stream", "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" })
      })
      const listedBody = Schema.decodeUnknownSync(JsonRpcResponse)(await listed.json())
      expect(listed.status).toBe(200)
      expect(listedBody.error).toBeUndefined()
      expect(Array.isArray(listedBody.result?.tools)).toBe(true)

      const context = await fetch(
        server.endpoint,
        modernRequest("tools/call", { name: "get_huly_context" }, "certification-client")
      )
      const contextBody = Schema.decodeUnknownSync(JsonRpcResponse)(await context.json())
      expect(context.status).toBe(200)
      expect(contextBody.error).toBeUndefined()
    } finally {
      await server.stop()
    }
  })

  it("returns the JSON-RPC parse error for malformed request JSON", async () => {
    const server = await startServer()
    try {
      const malformed = await fetch(server.endpoint, {
        method: "POST",
        headers: {
          accept: "application/json, text/event-stream",
          "content-type": "application/json",
          "mcp-method": "server/discover",
          "mcp-protocol-version": modernProtocol
        },
        body: "{not-json"
      })
      const body = Schema.decodeUnknownSync(JsonRpcResponse)(await malformed.json())
      expect(malformed.status).toBe(400)
      expect(body.error?.code).toBe(-32700)
    } finally {
      await server.stop()
    }
  })

  it("rejects mismatched routing headers and unsupported modern versions before resolving clients", async () => {
    let resolutions = 0
    const bundle = await clientBundle()
    const server = await startServer({
      resolveLease: async () => {
        resolutions++
        return { bundle: Exit.succeed(bundle), close: () => {} }
      }
    })
    try {
      const mismatchedRequest = modernRequest("tools/list", {}, "certification-client")
      const mismatchedHeaders = new Headers(mismatchedRequest.headers)
      mismatchedHeaders.set("mcp-method", "tools/call")
      const mismatched = await fetch(server.endpoint, { ...mismatchedRequest, headers: mismatchedHeaders })
      const mismatchBody = Schema.decodeUnknownSync(JsonRpcResponse)(await mismatched.json())
      expect(mismatched.status).toBe(400)
      expect(mismatchBody.error?.code).toBe(-32020)
      expect(mismatchBody.error?.message).toContain("Mcp-Method header does not match")

      const unsupportedVersion = "2099-01-01"
      const unsupported = await fetch(server.endpoint, {
        method: "POST",
        headers: {
          accept: "application/json, text/event-stream",
          "content-type": "application/json",
          "mcp-method": "tools/list",
          "mcp-protocol-version": unsupportedVersion
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
          params: {
            _meta: {
              "io.modelcontextprotocol/protocolVersion": unsupportedVersion,
              "io.modelcontextprotocol/clientCapabilities": {}
            }
          }
        })
      })
      const unsupportedBody = Schema.decodeUnknownSync(JsonRpcResponse)(await unsupported.json())
      expect(unsupported.status).toBe(400)
      expect(unsupportedBody.error?.code).toBe(-32022)
      expect(resolutions).toBe(0)
    } finally {
      await server.stop()
    }
  })

  it("preserves a bare legacy stateless tool call and releases its request lease", async () => {
    const bundle = await clientBundle()
    let releases = 0
    const server = await startServer({
      resolveLease: async () => ({
        bundle: Exit.succeed(bundle),
        close: () => {
          releases++
        }
      })
    })
    try {
      const response = await fetch(server.endpoint, {
        ...bareLegacyRequest("tools/call", { name: "list_projects", arguments: {} }, 7)
      })
      const responseText = await response.text()

      expect({ status: response.status, text: responseText }).toMatchObject({ status: 200 })
      const body = Schema.decodeUnknownSync(Schema.fromJsonString(JsonRpcResponse))(responseText)
      expect(body.id).toBe(7)
      expect(body.error).toBeUndefined()
      expect(releases).toBe(1)
    } finally {
      await server.stop()
    }
  })

  it("isolates same-id cancellation across ephemeral legacy HTTP callers and releases each binding", async () => {
    const started = deferred<void>()
    const finish = deferred<void>()
    let releases = 0
    let calls = 0
    const bundle = await clientBundle({
      findAll: () =>
        Effect.promise(async () => {
          calls++
          if (calls === 1) {
            started.resolve()
            await finish.promise
          }
          return toFindResult([])
        })
    })
    const server = await startServer({
      resolveLease: async () => ({
        bundle: Exit.succeed(bundle),
        close: () => {
          releases++
        }
      })
    })
    try {
      let firstSettled = false
      const first = fetch(
        server.endpoint,
        bareLegacyRequest("tools/call", { name: "list_projects", arguments: {} }, 1)
      ).then(async (response) => {
        const body = await response.text()
        firstSettled = true
        return { body, status: response.status }
      })
      await started.promise

      const cancellation = await fetch(
        server.endpoint,
        bareLegacyRequest("notifications/cancelled", { requestId: 1, reason: "other caller" })
      )
      expect([200, 202]).toContain(cancellation.status)
      await Promise.resolve()
      expect(firstSettled).toBe(false)

      finish.resolve()
      expect((await first).status).toBe(200)
      const second = await fetch(
        server.endpoint,
        bareLegacyRequest("tools/call", { name: "list_projects", arguments: {} }, 1)
      )
      await second.text()
      expect(second.status).toBe(200)
      expect(calls).toBe(2)
      expect(releases).toBe(2)
    } finally {
      finish.resolve()
      await server.stop()
    }
  })

  it("isolates concurrent modern client identities for auto tool exposure", async () => {
    const server = await startServer()
    try {
      const [proxy, native] = await Promise.all([
        fetch(server.endpoint, modernRequest("tools/list", {}, "claude-ai")),
        fetch(server.endpoint, modernRequest("tools/list", {}, "claude-code"))
      ])
      const proxyNames = toolNames(Schema.decodeUnknownSync(JsonRpcResponse)(await proxy.json()))
      const nativeNames = toolNames(Schema.decodeUnknownSync(JsonRpcResponse)(await native.json()))

      expect(proxyNames).toEqual(expect.arrayContaining([...PROXY_TOOL_NAMES]))
      expect(proxyNames).not.toContain("list_projects")
      expect(nativeNames).toContain("list_projects")
      expect(nativeNames).not.toEqual(expect.arrayContaining([...PROXY_TOOL_NAMES]))
    } finally {
      await server.stop()
    }
  })

  it("returns a tool error result when a native-mode caller invokes an unlisted proxy tool", async () => {
    const server = await startServer()
    try {
      const response = await fetch(
        server.endpoint,
        modernRequest("tools/call", { name: "search_tools", arguments: { query: "list projects" } }, "claude-code")
      )
      const body = Schema.decodeUnknownSync(JsonRpcResponse)(await response.json())

      expect(response.status).toBe(200)
      expect(body.error).toBeUndefined()
      expect(body.result?.isError).toBe(true)
    } finally {
      await server.stop()
    }
  })

  it("returns a tool error for a strict proxy-scope native call without resolving clients", async () => {
    let resolutions = 0
    const server = await startServer({
      configValues: { HULY_TOOL_MODE: "proxy", PROXY_OUTPUT_STRICT: "true", TOOLSETS: "projects" },
      resolveLease: async () => {
        resolutions++
        return { bundle: Exit.fail(new HulyConnectionError({ message: "must not resolve" })), close: () => {} }
      }
    })
    try {
      const response = await fetch(
        server.endpoint,
        modernRequest("tools/call", { name: "list_teamspaces", arguments: {} }, "claude-ai")
      )
      const body = Schema.decodeUnknownSync(JsonRpcResponse)(await response.json())

      expect(response.status).toBe(200)
      expect(body.error).toBeUndefined()
      expect(body.result?.isError).toBe(true)
      expect(resolutions).toBe(0)
    } finally {
      await server.stop()
    }
  })

  it("returns tool error results for unknown modern and bare legacy calls without resolving clients", async () => {
    let resolutions = 0
    const server = await startServer({
      resolveLease: async () => {
        resolutions++
        return { bundle: Exit.fail(new HulyConnectionError({ message: "must not resolve" })), close: () => {} }
      }
    })
    try {
      const [modern, legacy] = await Promise.all([
        fetch(
          server.endpoint,
          modernRequest("tools/call", { name: "unknown_huly_tool", arguments: {} }, "claude-code")
        ),
        fetch(server.endpoint, bareLegacyRequest("tools/call", { name: "unknown_huly_tool", arguments: {} }, 9))
      ])
      const modernBody = Schema.decodeUnknownSync(JsonRpcResponse)(await modern.json())
      const legacyBody = Schema.decodeUnknownSync(JsonRpcResponse)(await legacy.json())

      expect(modern.status).toBe(200)
      expect(legacy.status).toBe(200)
      expect(modernBody.error).toBeUndefined()
      expect(legacyBody.error).toBeUndefined()
      expect(modernBody.result?.isError).toBe(true)
      expect(legacyBody.result?.isError).toBe(true)
      expect(resolutions).toBe(0)
    } finally {
      await server.stop()
    }
  })

  it("allows a proxy-mode caller to invoke a native tool directly even when it is unlisted", async () => {
    const server = await startServer()
    try {
      const response = await fetch(
        server.endpoint,
        modernRequest("tools/call", { name: "list_projects", arguments: {} }, "claude-ai")
      )
      const body = Schema.decodeUnknownSync(JsonRpcResponse)(await response.json())

      expect(response.status).toBe(200)
      expect(body.error).toBeUndefined()
    } finally {
      await server.stop()
    }
  })

  it("interrupts a held proxy target before releasing its request-scoped client lease", async () => {
    const started = deferred<void>()
    const leaseClosed = deferred<void>()
    let interrupted = false
    let closes = 0
    let closedBeforeInnerFinalized = false
    const bundle = await clientBundle({
      findAll: () =>
        Effect.sync(() => started.resolve()).pipe(
          Effect.andThen(Effect.never),
          Effect.onInterrupt(() =>
            Effect.sync(() => {
              interrupted = true
            })
          )
        )
    })
    const server = await startServer({
      resolveLease: async () => ({
        bundle: Exit.succeed(bundle),
        close: () => {
          closes++
          closedBeforeInnerFinalized = !interrupted
          leaseClosed.resolve()
        }
      })
    })
    try {
      const controller = new AbortController()
      const request = fetch(server.endpoint, {
        ...modernRequest(
          "tools/call",
          { name: "invoke_tool", arguments: { toolName: "list_projects", arguments: {} } },
          "claude-ai"
        ),
        signal: controller.signal
      })
        .then((response) => response.text())
        .catch(() => undefined)

      await started.promise
      controller.abort()
      await request
      await leaseClosed.promise

      expect(interrupted).toBe(true)
      expect(closedBeforeInnerFinalized).toBe(false)
      expect(closes).toBe(1)
    } finally {
      await server.stop()
    }
  })

  it("lists resources from each request-scoped workspace instead of a startup snapshot", async () => {
    let alphaLists = 0
    let betaLists = 0
    let releases = 0
    const alpha = await clientBundle({
      findAll: () => {
        alphaLists++
        return Effect.succeed(toFindResult([]))
      }
    })
    const beta = await clientBundle({
      findAll: () => {
        betaLists++
        return Effect.succeed(toFindResult([]))
      }
    })
    const server = await startServer({
      resolveLease: async (request) => ({
        bundle: Exit.succeed(request.headers.get("x-test-workspace") === "alpha" ? alpha : beta),
        close: () => {
          releases++
        }
      })
    })
    try {
      const [alphaResponse, betaResponse] = await Promise.all([
        fetch(
          server.endpoint,
          modernRequest("resources/list", {}, "claude-ai", undefined, { "x-test-workspace": "alpha" })
        ),
        fetch(
          server.endpoint,
          modernRequest("resources/list", {}, "claude-ai", undefined, { "x-test-workspace": "beta" })
        )
      ])
      expect(alphaResponse.status).toBe(200)
      expect(betaResponse.status).toBe(200)
      expect(alphaLists).toBe(1)
      expect(betaLists).toBe(1)
      expect(releases).toBe(2)
    } finally {
      await server.stop()
    }
  })

  it("surfaces request-scoped resource listing failures", async () => {
    const failed = await clientBundle({
      findAll: () => Effect.fail(new HulyConnectionError({ message: "resource listing unavailable" }))
    })
    const server = await startServer({ resolveLease: async () => ({ bundle: Exit.succeed(failed), close: () => {} }) })
    try {
      const response = await fetch(server.endpoint, modernRequest("resources/list", {}, "claude-ai"))
      const body = Schema.decodeUnknownSync(JsonRpcResponse)(await response.json())
      expect(response.status).toBe(200)
      expect(body.error?.code).toBe(-32603)
    } finally {
      await server.stop()
    }
  })

  it("surfaces request-scoped resource client resolution failures", async () => {
    const server = await startServer({
      resolveLease: async () => ({
        bundle: Exit.fail(new HulyConnectionError({ message: "resource client unavailable" })),
        close: () => {}
      })
    })
    try {
      const response = await fetch(server.endpoint, modernRequest("resources/list", {}, "claude-ai"))
      const body = Schema.decodeUnknownSync(JsonRpcResponse)(await response.json())
      expect(response.status).toBe(200)
      expect(body.error?.code).toBe(-32603)
      expect(body.error?.message).toContain("Unable to list Huly resources")
    } finally {
      await server.stop()
    }
  })

  it("returns an empty resource catalog when request credentials are incomplete", async () => {
    const server = await startServer({
      resolveLease: async () => ({
        bundle: Exit.fail(new ConfigValidationError({ message: "Missing Huly credentials", field: "HULY_TOKEN" })),
        close: () => {}
      })
    })
    try {
      const response = await fetch(server.endpoint, modernRequest("resources/list", {}, "claude-ai"))
      const body = Schema.decodeUnknownSync(JsonRpcResponse)(await response.json())
      expect(response.status).toBe(200)
      expect(body.error).toBeUndefined()
      expect(body.result?.resources).toEqual([])
    } finally {
      await server.stop()
    }
  })

  it("preserves InvalidParams and the requested URI for a missing resource", async () => {
    const server = await startServer()
    try {
      const response = await fetch(
        server.endpoint,
        modernRequest("resources/read", { uri: "huly://projects/MISSING" }, "claude-ai")
      )
      const body = Schema.decodeUnknownSync(JsonRpcResponse)(await response.json())
      expect(response.status).toBe(200)
      expect(body.error?.code).toBe(-32602)
      expect(body.error?.data).toMatchObject({ uri: "huly://projects/MISSING" })
    } finally {
      await server.stop()
    }
  })

  it("enforces server auth before protocol dispatch", async () => {
    const server = await startServer({ token: "server-secret" })
    try {
      expect((await fetch(server.endpoint, modernRequest("server/discover", {}, "client"))).status).toBe(401)
      expect(
        (await fetch(server.endpoint, modernRequest("server/discover", {}, "client", "server-secret"))).status
      ).toBe(200)
    } finally {
      await server.stop()
    }
  })

  it("keeps HTTP alive on stdin EOF and closes its listener on owner shutdown", async () => {
    const server = await startServer()
    process.stdin.emit("end")
    await Promise.resolve()
    expect(server.rawServer.listening).toBe(true)
    await server.stop()
    expect(server.rawServer.listening).toBe(false)
  })

  it("shuts down clients after telemetry cleanup fails when the HTTP owner stops", async () => {
    const shutdownOrder: Array<string> = []
    const errors: Array<string> = []
    const server = await startServer({
      shutdownTelemetry: async () => {
        shutdownOrder.push("telemetry")
        throw new Error("telemetry unavailable")
      },
      closeClients: async () => {
        shutdownOrder.push("clients")
      },
      writeError: (message) => errors.push(message)
    })
    errors.length = 0

    await server.stop()

    expect(shutdownOrder).toEqual(["telemetry", "clients"])
    expect(errors).toEqual(["MCP HTTP server drain failed: telemetry close failed\n"])
  })

  it("reports client cleanup failure after telemetry shuts down", async () => {
    const shutdownOrder: Array<string> = []
    const errors: Array<string> = []
    const server = await startServer({
      shutdownTelemetry: async () => {
        shutdownOrder.push("telemetry")
      },
      closeClients: async () => {
        shutdownOrder.push("clients")
        throw new Error("clients unavailable")
      },
      writeError: (message) => errors.push(message)
    })
    errors.length = 0

    await server.stop()

    expect(shutdownOrder).toEqual(["telemetry", "clients"])
    expect(errors).toEqual(["MCP HTTP server drain failed: client cleanup failed\n"])
  })
})
