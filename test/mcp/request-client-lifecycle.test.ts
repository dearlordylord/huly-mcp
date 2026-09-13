import { createMcpHandler, Server, type ServerContext, type Transport } from "@modelcontextprotocol/server"
import { describe, expect, it } from "vitest"

import {
  attachRequestClientLifecycle,
  createRequestClientLifecycle,
  type RequestClientLifecycle,
  type RequestClientLease
} from "../../src/mcp/request-client-lifecycle.js"
import { createRequestAdmission } from "../../src/mcp/request-admission.js"

const protocolVersion = "2026-07-28"
const placeholderBundle = Symbol("request-client-bundle")

const modernRequest = (
  method: string,
  params: Record<string, unknown>,
  options: { readonly name?: string; readonly signal?: AbortSignal } = {}
): Request => {
  const headers = new Headers({
    accept: "application/json, text/event-stream",
    "content-type": "application/json",
    "mcp-protocol-version": protocolVersion,
    "mcp-method": method
  })
  if (options.name !== undefined) headers.set("mcp-name", options.name)
  return new Request("http://localhost/mcp", {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params: {
        ...params,
        _meta: {
          "io.modelcontextprotocol/protocolVersion": protocolVersion,
          "io.modelcontextprotocol/clientCapabilities": {},
          "io.modelcontextprotocol/clientInfo": { name: "lifecycle-test", version: "1.0.0" }
        }
      }
    }),
    ...(options.signal === undefined ? {} : { signal: options.signal })
  })
}

const legacyRequest = (method: string, params: Record<string, unknown>): Request =>
  new Request("http://localhost/mcp", {
    method: "POST",
    headers: { accept: "application/json, text/event-stream", "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })
  })

const consume = async (response: Response): Promise<void> => {
  await response.text()
  await Promise.resolve()
}

const waitForCleanup = async (): Promise<void> => {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0)
  })
}

const deferred = <A>(): { readonly promise: Promise<A>; readonly resolve: (value: A) => void } => {
  let resolvePromise: ((value: A) => void) | undefined
  const promise = new Promise<A>((resolve) => {
    resolvePromise = resolve
  })
  return {
    promise,
    resolve: (value) => {
      resolvePromise?.(value)
    }
  }
}

interface LifecycleProbe {
  readonly acquireCount: () => number
  readonly closeCount: () => number
  readonly acquire: () => Promise<RequestClientLease<symbol>>
}

class DeferredCloseTransport implements Transport {
  onclose?: () => void
  onerror?: (error: Error) => void
  onmessage?: Transport["onmessage"]

  constructor(private readonly release: Promise<void>) {}

  async start(): Promise<void> {}

  async send(_message: Parameters<Transport["send"]>[0]): Promise<void> {}

  async close(): Promise<void> {
    this.onclose?.()
    await this.release
  }
}

const createLifecycleProbe = (release: () => void | Promise<void> = () => {}): LifecycleProbe => {
  let acquired = 0
  let closed = 0
  return {
    acquireCount: () => acquired,
    closeCount: () => closed,
    acquire: async () => {
      acquired++
      return {
        bundle: placeholderBundle,
        close: async () => {
          closed++
          await release()
        }
      }
    }
  }
}

const createLifecycleServer = (
  probe: LifecycleProbe,
  callTool: (lifecycle: RequestClientLifecycle<symbol>, context: ServerContext) => Promise<void>,
  onCleanupError: (error: Error) => void = () => {}
): Server => {
  const lifecycle = createRequestClientLifecycle(probe.acquire)
  const admission = createRequestAdmission()
  const server = new Server({ name: "lifecycle-test", version: "1.0.0" }, { capabilities: { tools: {} } })
  attachRequestClientLifecycle(server, lifecycle, onCleanupError, admission.quiesce)
  server.setRequestHandler("tools/list", async () => ({ tools: [] }))
  server.setRequestHandler("tools/call", async (_request, context) => {
    const lease = admission.enter()
    if (lease === null) throw new Error("Request admission is closed")
    try {
      await callTool(lifecycle, context)
      return { content: [{ type: "text", text: "done" }] }
    } finally {
      lease.release()
    }
  })
  return server
}

describe("request-scoped Huly client lifecycle", () => {
  it.each(["abort", "shutdown"])("keeps clients open while an %s tool body finishes", async (trigger) => {
    const released = deferred<void>()
    const probe = createLifecycleProbe(() => released.resolve())
    const started = deferred<void>()
    const finish = deferred<void>()
    const controller = new AbortController()
    const handler = createMcpHandler(
      () =>
        createLifecycleServer(probe, async (lifecycle) => {
          await lifecycle.resolve()
          started.resolve()
          await finish.promise
          expect(probe.closeCount()).toBe(0)
          await lifecycle.resolve()
        }),
      { legacy: "reject" }
    )
    const response = handler.fetch(
      modernRequest("tools/call", { name: "work", arguments: {} }, { name: "work", signal: controller.signal })
    )
    await started.promise
    if (trigger === "abort") controller.abort()
    const closing = trigger === "abort" ? Promise.resolve() : handler.close()
    expect((await response).status).toBe(499)
    expect(probe.closeCount()).toBe(0)
    finish.resolve()
    await closing
    await handler.close()
    await released.promise
    expect(probe.closeCount()).toBe(1)
  })
  it("releases an acquired lease exactly once after a successful tool call", async () => {
    const probe = createLifecycleProbe()
    const handler = createMcpHandler(
      () =>
        createLifecycleServer(probe, async (lifecycle) => {
          await lifecycle.resolve()
          await lifecycle.resolve()
        }),
      { legacy: "reject" }
    )

    await consume(await handler.fetch(modernRequest("tools/call", { name: "work", arguments: {} }, { name: "work" })))
    await waitForCleanup()

    expect(probe.acquireCount()).toBe(1)
    expect(probe.closeCount()).toBe(1)
    await handler.close()
  })

  it("releases an acquired lease after a legacy stateless tool call", async () => {
    const probe = createLifecycleProbe()
    const handler = createMcpHandler(
      () =>
        createLifecycleServer(probe, async (lifecycle) => {
          await lifecycle.resolve()
        }),
      { legacy: "stateless" }
    )

    await consume(await handler.fetch(legacyRequest("tools/call", { name: "work", arguments: {} })))
    await waitForCleanup()

    expect(probe.acquireCount()).toBe(1)
    expect(probe.closeCount()).toBe(1)
    await handler.close()
  })

  it("releases an acquired lease exactly once when a tool handler fails", async () => {
    const probe = createLifecycleProbe()
    const handler = createMcpHandler(
      () =>
        createLifecycleServer(probe, async (lifecycle) => {
          await lifecycle.resolve()
          throw new Error("tool failed")
        }),
      { legacy: "reject" }
    )

    await consume(await handler.fetch(modernRequest("tools/call", { name: "work", arguments: {} }, { name: "work" })))
    await waitForCleanup()

    expect(probe.acquireCount()).toBe(1)
    expect(probe.closeCount()).toBe(1)
    await handler.close()
  })

  it("releases an acquired lease exactly once when the client aborts", async () => {
    const probe = createLifecycleProbe()
    const started = deferred<void>()
    const controller = new AbortController()
    const handler = createMcpHandler(
      () =>
        createLifecycleServer(probe, async (lifecycle, context) => {
          await lifecycle.resolve()
          started.resolve()
          await new Promise<void>((resolve) => {
            context.mcpReq.signal.addEventListener("abort", () => resolve(), { once: true })
          })
        }),
      { legacy: "reject" }
    )

    const responsePromise = handler.fetch(
      modernRequest("tools/call", { name: "work", arguments: {} }, { name: "work", signal: controller.signal })
    )
    await started.promise
    controller.abort()
    await consume(await responsePromise)
    await waitForCleanup()

    expect(probe.acquireCount()).toBe(1)
    expect(probe.closeCount()).toBe(1)
    await handler.close()
  })

  it("releases an acquired lease exactly once when the handler closes with work in flight", async () => {
    const released = deferred<void>()
    const probe = createLifecycleProbe(() => released.promise)
    const started = deferred<void>()
    const handler = createMcpHandler(
      () =>
        createLifecycleServer(probe, async (lifecycle, context) => {
          await lifecycle.resolve()
          started.resolve()
          await new Promise<void>((resolve) => {
            context.mcpReq.signal.addEventListener("abort", () => resolve(), { once: true })
          })
        }),
      { legacy: "reject" }
    )

    const responsePromise = handler.fetch(
      modernRequest("tools/call", { name: "work", arguments: {} }, { name: "work" })
    )
    await started.promise
    let handlerClosed = false
    const closing = handler.close().then(() => {
      handlerClosed = true
    })
    await waitForCleanup()

    expect(handlerClosed).toBe(false)
    expect(probe.acquireCount()).toBe(1)
    expect(probe.closeCount()).toBe(1)

    released.resolve()
    await closing
    await consume(await responsePromise)
    await handler.close()

    expect(probe.closeCount()).toBe(1)
  })

  it("reports lease cleanup rejection from the SDK handler close trigger", async () => {
    const probe = createLifecycleProbe(() => Promise.reject(new Error("handler release rejected")))
    const started = deferred<void>()
    const reported: Array<string> = []
    const handler = createMcpHandler(
      () =>
        createLifecycleServer(
          probe,
          async (lifecycle, context) => {
            await lifecycle.resolve()
            started.resolve()
            await new Promise<void>((resolve) => {
              context.mcpReq.signal.addEventListener("abort", () => resolve(), { once: true })
            })
          },
          (error) => reported.push(error.message)
        ),
      { legacy: "reject" }
    )

    const responsePromise = handler.fetch(
      modernRequest("tools/call", { name: "work", arguments: {} }, { name: "work" })
    )
    await started.promise
    await handler.close()
    await consume(await responsePromise)
    await waitForCleanup()

    expect(reported).toEqual(["handler release rejected"])
    expect(probe.closeCount()).toBe(1)
  })

  it("does not acquire or release Huly clients for catalog and discovery requests", async () => {
    const probe = createLifecycleProbe()
    const handler = createMcpHandler(() => createLifecycleServer(probe, async () => {}), { legacy: "reject" })

    await consume(await handler.fetch(modernRequest("server/discover", {})))
    await consume(await handler.fetch(modernRequest("tools/list", {})))
    await handler.close()

    expect(probe.acquireCount()).toBe(0)
    expect(probe.closeCount()).toBe(0)
  })

  it("rejects resolution after close and keeps repeated close idempotent", async () => {
    const probe = createLifecycleProbe()
    const lifecycle = createRequestClientLifecycle(probe.acquire)

    await lifecycle.close()
    await lifecycle.close()

    await expect(lifecycle.resolve()).rejects.toThrow("already closed")
    expect(probe.acquireCount()).toBe(0)
  })

  it("does not attempt release when acquisition fails before close", async () => {
    const lifecycle = createRequestClientLifecycle<symbol>(() => Promise.reject(new Error("acquisition failed")))

    await expect(lifecycle.resolve()).rejects.toThrow("acquisition failed")
    await lifecycle.close()

    await expect(lifecycle.close()).resolves.toBeUndefined()
  })

  it("does not return a bundle when close wins a pending acquisition", async () => {
    const acquired = deferred<RequestClientLease<symbol>>()
    let releases = 0
    const lifecycle = createRequestClientLifecycle(() => acquired.promise)
    const resolution = lifecycle.resolve()
    const closing = lifecycle.close()

    acquired.resolve({
      bundle: placeholderBundle,
      close: () => {
        releases++
      }
    })

    await expect(resolution).rejects.toThrow("closed during acquisition")
    await expect(closing).resolves.toBeUndefined()
    expect(releases).toBe(1)
  })

  it("surfaces lease cleanup failures to awaitable lifecycle callers", async () => {
    const lifecycle = createRequestClientLifecycle(async () => ({
      bundle: placeholderBundle,
      close: () => {
        throw new Error("cleanup failed")
      }
    }))

    await lifecycle.resolve()
    await expect(lifecycle.close()).rejects.toThrow("cleanup failed")
  })

  it("keeps SDK server.close pending until asynchronous lease cleanup completes", async () => {
    const release = deferred<void>()
    const lifecycle = createRequestClientLifecycle(async () => ({
      bundle: placeholderBundle,
      close: () => release.promise
    }))
    const server = new Server({ name: "close-test", version: "1.0.0" }, { capabilities: {} })
    attachRequestClientLifecycle(server, lifecycle, () => {})
    await lifecycle.resolve()

    let settled = false
    const firstClose = server.close()
    const repeatedClose = server.close()
    expect(repeatedClose).toBe(firstClose)
    const closing = firstClose.then(() => {
      settled = true
    })
    await Promise.resolve()

    expect(settled).toBe(false)
    release.resolve()
    await closing
    expect(settled).toBe(true)
  })

  it("waits for connected transport close to settle before releasing the lease", async () => {
    const transportRelease = deferred<void>()
    const probe = createLifecycleProbe()
    const lifecycle = createRequestClientLifecycle(probe.acquire)
    const server = new Server({ name: "close-test", version: "1.0.0" }, { capabilities: {} })
    attachRequestClientLifecycle(server, lifecycle, () => {})
    await server.connect(new DeferredCloseTransport(transportRelease.promise))
    await lifecycle.resolve()

    const closing = server.close()
    await Promise.resolve()

    expect(probe.closeCount()).toBe(0)
    transportRelease.resolve()
    await closing
    expect(probe.closeCount()).toBe(1)
  })

  it("releases an acquired lease when the underlying SDK server close rejects", async () => {
    const probe = createLifecycleProbe()
    const lifecycle = createRequestClientLifecycle(probe.acquire)
    const server = new Server({ name: "close-test", version: "1.0.0" }, { capabilities: {} })
    server.close = () => Promise.reject(new Error("transport close failed"))
    attachRequestClientLifecycle(server, lifecycle, () => {})
    await lifecycle.resolve()

    await expect(server.close()).rejects.toThrow("transport close failed")
    expect(probe.closeCount()).toBe(1)
  })

  it("preserves both underlying-close and lease-cleanup failures", async () => {
    const lifecycle = createRequestClientLifecycle(async () => ({
      bundle: placeholderBundle,
      close: () => Promise.reject(new Error("lease close failed"))
    }))
    const server = new Server({ name: "close-test", version: "1.0.0" }, { capabilities: {} })
    server.close = () => Promise.reject(new Error("transport close failed"))
    attachRequestClientLifecycle(server, lifecycle, () => {})
    await lifecycle.resolve()

    const failure = await server.close().catch((error: unknown) => error)
    if (!(failure instanceof AggregateError)) throw new Error("Expected an AggregateError")

    expect(failure.errors).toEqual([
      expect.objectContaining({ message: "transport close failed" }),
      expect.objectContaining({ message: "lease close failed" })
    ])
  })

  it("propagates SDK server.close cleanup failures and reports transport-triggered failures", async () => {
    const reported: Array<string> = []
    const lifecycle = createRequestClientLifecycle(async () => ({
      bundle: placeholderBundle,
      close: () => Promise.reject(new Error("release rejected"))
    }))
    const server = new Server({ name: "close-test", version: "1.0.0" }, { capabilities: {} })
    attachRequestClientLifecycle(server, lifecycle, (error) => reported.push(error.message))
    await lifecycle.resolve()

    await expect(server.close()).rejects.toThrow("release rejected")
    server.onclose?.()
    await waitForCleanup()

    expect(reported).toEqual(["release rejected"])
  })

  it("normalizes non-Error cleanup rejection before reporting it", async () => {
    const reported: Array<string> = []
    const lifecycle = createRequestClientLifecycle(async () => ({
      bundle: placeholderBundle,
      close: () => Promise.reject("non-error rejection")
    }))
    const server = new Server({ name: "close-test", version: "1.0.0" }, { capabilities: {} })
    attachRequestClientLifecycle(server, lifecycle, (error) => reported.push(error.message))
    await lifecycle.resolve()

    server.onclose?.()
    await waitForCleanup()

    expect(reported).toEqual(["non-error rejection"])
  })
})
