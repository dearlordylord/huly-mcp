import { Effect, Exit, Layer, Redacted } from "effect"
import { describe, expect, it } from "vitest"

import { HulyConfigService } from "../../src/config/config.js"
import { HulyClient } from "../../src/huly/client.js"
import { HulyConnectionError } from "../../src/huly/errors.js"
import { HulyStorageClient } from "../../src/huly/storage.js"
import { WorkspaceClient } from "../../src/huly/workspace-client.js"
import { buildScopedClientBundle } from "../../src/runtime/huly-clients.js"
import { createHttpClientLeaseResolver } from "../../src/runtime/http-client-leases.js"

const baseClientLayer = Layer.merge(
  Layer.merge(HulyClient.testLayer({}), HulyStorageClient.testLayer({})),
  WorkspaceClient.testLayer({})
)

const requestWithConfig = (workspace: string, token: string): Request =>
  new Request("http://localhost/mcp", {
    headers: { "x-huly-url": "https://huly.app", "x-huly-workspace": workspace, "x-huly-token": token }
  })

describe("HTTP client lease resolution", () => {
  it("isolates header configuration and releases each request-owned bundle", async () => {
    const acquisitions: Array<{ readonly workspace: string; readonly expectedToken: boolean }> = []
    let releases = 0
    let envResolutions = 0
    const trackedLayer = baseClientLayer.pipe(
      Layer.tap(() =>
        Effect.gen(function* () {
          const config = yield* HulyConfigService
          acquisitions.push({
            workspace: config.workspace,
            expectedToken:
              config.auth._tag === "token" &&
              Redacted.value(config.auth.token) === `token-${config.workspace.slice(-1)}`
          })
          yield* Effect.addFinalizer(() => Effect.sync(() => releases++))
        })
      ),
      Layer.provide(HulyConfigService.layer)
    )
    const resolveEnvClients = async () => {
      envResolutions++
      return Exit.die(new Error("env resolver must not serve header-configured requests"))
    }
    const resolveLease = createHttpClientLeaseResolver(trackedLayer, resolveEnvClients)

    const first = await resolveLease(requestWithConfig("workspace-a", "token-a"))
    const second = await resolveLease(requestWithConfig("workspace-b", "token-b"))

    expect(Exit.isSuccess(first.bundle)).toBe(true)
    expect(Exit.isSuccess(second.bundle)).toBe(true)
    expect(acquisitions).toEqual([
      { workspace: "workspace-a", expectedToken: true },
      { workspace: "workspace-b", expectedToken: true }
    ])
    expect(envResolutions).toBe(0)
    expect(releases).toBe(0)

    await first.close()
    await second.close()
    expect(releases).toBe(2)
  })

  it("builds and releases an own bundle for every request carrying identical headers", async () => {
    let acquisitions = 0
    let releases = 0
    const trackedLayer = baseClientLayer.pipe(
      Layer.tap(() =>
        Effect.gen(function* () {
          yield* HulyConfigService
          acquisitions++
          yield* Effect.addFinalizer(() => Effect.sync(() => releases++))
        })
      ),
      Layer.provide(HulyConfigService.layer)
    )
    const resolveLease = createHttpClientLeaseResolver(trackedLayer, async () =>
      Exit.die(new Error("env resolver must not serve header-configured requests"))
    )

    const first = await resolveLease(requestWithConfig("workspace-a", "token-a"))
    expect(acquisitions).toBe(1)
    await first.close()
    expect(releases).toBe(1)

    const second = await resolveLease(requestWithConfig("workspace-a", "token-a"))
    expect(acquisitions).toBe(2)
    await second.close()
    expect(releases).toBe(2)

    expect(Exit.isSuccess(first.bundle)).toBe(true)
    expect(Exit.isSuccess(second.bundle)).toBe(true)
  })

  it("reuses the shared process bundle for header-less requests and never releases it", async () => {
    let sharedReleases = 0
    const sharedLayer = baseClientLayer.pipe(
      Layer.tap(() => Effect.addFinalizer(() => Effect.sync(() => sharedReleases++)))
    )
    const scoped = await Effect.runPromise(buildScopedClientBundle(sharedLayer))
    const resolveEnvClients = async () => Exit.succeed(scoped.bundle)
    const resolveLease = createHttpClientLeaseResolver(sharedLayer, resolveEnvClients)

    try {
      const first = await resolveLease(new Request("http://localhost/mcp"))
      const second = await resolveLease(new Request("http://localhost/mcp"))

      expect(Exit.isSuccess(first.bundle) && first.bundle.value).toBe(scoped.bundle)
      expect(Exit.isSuccess(second.bundle) && second.bundle.value).toBe(scoped.bundle)

      await first.close()
      await second.close()
      // The env lease close is a no-op: a request holds no claim on the shared client.
      expect(sharedReleases).toBe(0)
    } finally {
      await scoped.close()
    }
    expect(sharedReleases).toBe(1)
  })

  it.each([
    { label: "without Huly headers", headers: {} },
    { label: "carrying only unrecognized x-huly headers", headers: { "x-huly-trace-id": "proxy-trace-123" } }
  ])("delegates requests $label to the process resolver", async ({ headers }) => {
    const scoped = await Effect.runPromise(buildScopedClientBundle(baseClientLayer))
    let envResolutions = 0
    const resolveLease = createHttpClientLeaseResolver(baseClientLayer, async () => {
      envResolutions++
      return Exit.succeed(scoped.bundle)
    })

    try {
      const lease = await resolveLease(new Request("http://localhost/mcp", { headers }))

      expect(Exit.isSuccess(lease.bundle) && lease.bundle.value).toBe(scoped.bundle)
      expect(envResolutions).toBe(1)
      await lease.close()
    } finally {
      await scoped.close()
    }
  })

  it("returns typed failures for invalid headers and scoped client acquisition", async () => {
    const resolveEnvClients = async () => Exit.die(new Error("env resolver must not run"))
    const invalidHeaders = createHttpClientLeaseResolver(baseClientLayer, resolveEnvClients)
    const invalid = await invalidHeaders(
      new Request("http://localhost/mcp", { headers: { "x-huly-url": "not-a-url" } })
    )
    const failedClientLayer = Layer.merge(
      Layer.merge(
        Layer.effect(HulyClient, Effect.fail(new HulyConnectionError({ message: "client failed" }))),
        HulyStorageClient.testLayer({})
      ),
      WorkspaceClient.testLayer({})
    )
    const failedClient = await createHttpClientLeaseResolver(
      failedClientLayer,
      resolveEnvClients
    )(requestWithConfig("workspace-a", "token-a"))

    expect(Exit.isFailure(invalid.bundle)).toBe(true)
    expect(Exit.isFailure(failedClient.bundle)).toBe(true)
    await invalid.close()
    await failedClient.close()
  })
})
