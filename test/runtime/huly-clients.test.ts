import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"

import { HulyClient } from "../../src/huly/client.js"
import { HulyStorageClient } from "../../src/huly/storage.js"
import { WorkspaceClient } from "../../src/huly/workspace-client.js"
import { buildClientBundle, buildScopedClientBundle, createClientResolver } from "../../src/runtime/huly-clients.js"

const clientLayer = Layer.merge(
  Layer.merge(HulyClient.testLayer({}), HulyStorageClient.testLayer({})),
  WorkspaceClient.testLayer({})
)

describe("shared Huly client runtime", () => {
  it("builds scoped client bundles from supplied layers", async () => {
    const scoped = await Effect.runPromise(buildScopedClientBundle(clientLayer))

    try {
      expect(scoped.bundle.storageClient.getFileUrl("blob-1")).toContain("blob-1")
      if (scoped.bundle.workspaceClient === undefined) {
        throw new Error("Expected workspace client in scoped bundle")
      }
      if (scoped.bundle.storageClient.downloadFile === undefined) {
        throw new Error("Expected storage client download support")
      }
      expect(await Effect.runPromise(scoped.bundle.storageClient.downloadFile("blob-1"))).toEqual(
        Buffer.from("test file blob-1")
      )
      expect(await Effect.runPromise(scoped.bundle.workspaceClient.getUserWorkspaces())).toEqual([])
    } finally {
      scoped.close()
    }
  })

  it("memoizes resolver construction and supports primed bundles", async () => {
    const [resolve] = createClientResolver(clientLayer)

    const first = await resolve()
    const second = await resolve()

    expect(second).toBe(first)

    const primedBundle = await Effect.runPromise(buildClientBundle(clientLayer))
    const [resolvePrimed, prime] = createClientResolver(clientLayer)
    prime(primedBundle)

    await expect(resolvePrimed()).resolves.toBe(primedBundle)
  })
})
