import { Deferred, Effect, Fiber, Layer } from "effect"
import { it } from "@effect/vitest"
import { describe, expect } from "vitest"

import { HulyClient } from "../../src/huly/client.js"
import { HulyUnavailableError } from "../../src/huly/errors.js"
import { HulyStorageClient } from "../../src/huly/storage.js"
import { normalizeHulyOrigin } from "../../src/huly/unavailable-diagnostics.js"
import { WorkspaceClient } from "../../src/huly/workspace-client.js"
import { buildScopedClientBundle, createClientResolver } from "../../src/runtime/huly-clients.js"

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
      await scoped.close()
      await scoped.close()
    }
  })

  it("memoizes resolver construction and supports primed bundles", async () => {
    const [resolve, , close] = createClientResolver(clientLayer)

    const first = await resolve()
    const second = await resolve()

    expect(second).toBe(first)
    await close()

    const primed = await Effect.runPromise(buildScopedClientBundle(clientLayer))
    const [resolvePrimed, prime, closePrimed] = createClientResolver(clientLayer)
    prime(primed)

    await expect(resolvePrimed()).resolves.toBe(primed.bundle)
    await closePrimed()
  })

  it("evicts an unavailable acquisition so a later call can recover", async () => {
    let available = false
    const unavailable = new HulyUnavailableError({
      endpointOrigin: normalizeHulyOrigin("https://huly.app"),
      failureKind: "refused"
    })
    const recoverableLayer = Layer.suspend(() =>
      available ? clientLayer : Layer.merge(Layer.fail(unavailable), clientLayer)
    )
    const [resolve, , close] = createClientResolver(recoverableLayer)

    await expect(resolve()).rejects.toBeDefined()
    available = true
    await expect(resolve()).resolves.toBeDefined()
    await close()
  })

  it("does not evict a newer primed bundle after an unavailable acquisition fails", async () => {
    const unavailable = new HulyUnavailableError({
      endpointOrigin: normalizeHulyOrigin("https://huly.app"),
      failureKind: "refused"
    })
    const failingLayer = Layer.merge(Layer.fail(unavailable), clientLayer)
    const [resolve, prime, close] = createClientResolver(failingLayer)
    const primed = await Effect.runPromise(buildScopedClientBundle(clientLayer))
    const failedAcquisition = resolve()
    prime(primed)

    await expect(failedAcquisition).rejects.toBeDefined()
    await expect(resolve()).resolves.toBe(primed.bundle)
    await close()
  })

  it("closes an acquired process-scoped client exactly once", async () => {
    let releases = 0
    const trackedLayer = Layer.merge(
      clientLayer,
      Layer.scopedDiscard(
        Effect.acquireRelease(Effect.void, () =>
          Effect.sync(() => {
            releases++
          })
        )
      )
    )
    const [resolve, , close] = createClientResolver(trackedLayer)

    await resolve()
    await Promise.all([close(), close()])

    expect(releases).toBe(1)
    await expect(resolve()).rejects.toThrow("Process-scoped Huly clients are closed")
  })

  it("rejects priming after process-scoped clients close", async () => {
    const scoped = await Effect.runPromise(buildScopedClientBundle(clientLayer))
    const [, prime, close] = createClientResolver(clientLayer)

    await close()

    expect(() => prime(scoped)).toThrow("Cannot prime closed process-scoped Huly clients")
    await scoped.close()
  })

  it.effect("releases an acquired scope when startup is interrupted", () =>
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>()
      const released = yield* Deferred.make<void>()
      const continueStartup = yield* Deferred.make<void>()
      const startupLayer = Layer.merge(
        clientLayer,
        Layer.scopedDiscard(
          Effect.acquireRelease(Effect.void, () => Deferred.succeed(released, undefined)).pipe(
            Effect.zipRight(Deferred.succeed(started, undefined)),
            Effect.zipRight(Deferred.await(continueStartup))
          )
        )
      )
      const acquisition = yield* buildScopedClientBundle(startupLayer).pipe(Effect.fork)

      yield* Deferred.await(started)
      yield* Fiber.interrupt(acquisition)

      expect(yield* Deferred.isDone(released)).toBe(true)
    })
  )

  it.effect("interrupts a process-scoped acquisition when the resolver closes", () =>
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>()
      const released = yield* Deferred.make<void>()
      const continueStartup = yield* Deferred.make<void>()
      const startupLayer = Layer.merge(
        clientLayer,
        Layer.scopedDiscard(
          Effect.acquireRelease(Effect.void, () => Deferred.succeed(released, undefined)).pipe(
            Effect.zipRight(Deferred.succeed(started, undefined)),
            Effect.zipRight(Deferred.await(continueStartup))
          )
        )
      )
      const [resolve, , close] = createClientResolver(startupLayer)
      const acquisition = resolve()

      yield* Deferred.await(started)
      yield* Effect.promise(close)

      yield* Effect.promise(() =>
        acquisition.then(
          () => Promise.reject(new Error("Interrupted acquisition unexpectedly completed")),
          () => Promise.resolve()
        )
      )
      expect(yield* Deferred.isDone(released)).toBe(true)
    })
  )
})
