import { it } from "@effect/vitest"
import { Cause, Deferred, Effect, Exit, Fiber, Layer } from "effect"
import { describe, expect } from "vitest"

import { HulyClient } from "../../src/huly/client.js"
import { HulyConnectionError, HulyUnavailableError } from "../../src/huly/errors-base.js"
import { HulyStorageClient } from "../../src/huly/storage.js"
import { normalizeHulyOrigin } from "../../src/huly/unavailable-diagnostics.js"
import { WorkspaceClient } from "../../src/huly/workspace-client.js"
import { buildScopedClientBundle, createClientResolver } from "../../src/runtime/huly-clients.js"

const clientLayer = Layer.merge(
  Layer.merge(HulyClient.testLayer({}), HulyStorageClient.testLayer({})),
  WorkspaceClient.testLayer({})
)

describe("shared Huly client runtime", () => {
  it("builds scoped client bundles and closes them exactly once", async () => {
    let releases = 0
    const trackedLayer = clientLayer.pipe(Layer.tap(() => Effect.addFinalizer(() => Effect.sync(() => releases++))))
    const scoped = await Effect.runPromise(buildScopedClientBundle(trackedLayer))

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

    await Promise.all([scoped.close(), scoped.close()])
    expect(releases).toBe(1)
  })

  it("memoizes one acquisition and closes its owned scope exactly once", async () => {
    let acquisitions = 0
    let releases = 0
    const trackedLayer = Layer.suspend(() => {
      acquisitions += 1
      return clientLayer.pipe(Layer.tap(() => Effect.addFinalizer(() => Effect.sync(() => releases++))))
    })
    const { close, resolve } = createClientResolver(trackedLayer)

    const first = await resolve()
    const second = await resolve()

    expect(second).toBe(first)
    expect(Exit.isSuccess(first)).toBe(true)
    expect(acquisitions).toBe(1)

    await Promise.all([close(), close()])
    expect(releases).toBe(1)
    expect(Exit.isFailure(await resolve())).toBe(true)
  })

  it("evicts a mixed acquisition containing unavailability so a later call can recover", async () => {
    let available = false
    const unavailable = new HulyUnavailableError({
      endpointOrigin: normalizeHulyOrigin("https://huly.app"),
      failureKind: "refused"
    })
    const recoverableLayer = Layer.suspend(() =>
      available
        ? clientLayer
        : clientLayer.pipe(
            Layer.tap(() =>
              Effect.failCause(
                Cause.combine(Cause.fail(new HulyConnectionError({ message: "connection" })), Cause.fail(unavailable))
              )
            )
          )
    )
    const { close, resolve } = createClientResolver(recoverableLayer)

    try {
      expect(Exit.isFailure(await resolve())).toBe(true)
      available = true
      expect(Exit.isSuccess(await resolve())).toBe(true)
    } finally {
      await close()
    }
  })

  it("keeps non-unavailable failures cached", async () => {
    let acquisitions = 0
    const failingLayer = Layer.suspend(() => {
      acquisitions += 1
      return clientLayer.pipe(Layer.tap(() => Effect.fail(new HulyConnectionError({ message: "stable failure" }))))
    })
    const { close, resolve } = createClientResolver(failingLayer)

    const first = await resolve()
    const second = await resolve()

    expect(Exit.isFailure(first)).toBe(true)
    expect(second).toBe(first)
    expect(acquisitions).toBe(1)
    await close()
  })

  it("does not evict an unavailable failure mixed with a defect", async () => {
    let acquisitions = 0
    const unavailable = new HulyUnavailableError({
      endpointOrigin: normalizeHulyOrigin("https://huly.app"),
      failureKind: "refused"
    })
    const failingLayer = Layer.suspend(() => {
      acquisitions += 1
      return clientLayer.pipe(
        Layer.tap(() => Effect.failCause(Cause.combine(Cause.fail(unavailable), Cause.die("token=secret"))))
      )
    })
    const { close, resolve } = createClientResolver(failingLayer)

    const first = await resolve()
    const second = await resolve()

    expect(Exit.isFailure(first)).toBe(true)
    expect(second).toBe(first)
    expect(acquisitions).toBe(1)
    await close()
  })

  it("interrupts and awaits a pending acquisition when closed", async () => {
    const started = await Effect.runPromise(Deferred.make<void>())
    const interrupted = await Effect.runPromise(Deferred.make<void>())
    const pendingLayer = clientLayer.pipe(
      Layer.tap(() =>
        Deferred.succeed(started, undefined).pipe(
          Effect.andThen(Effect.never),
          Effect.onInterrupt(() => Deferred.succeed(interrupted, undefined))
        )
      )
    )
    const { close, resolve } = createClientResolver(pendingLayer)
    const pendingResolution = resolve()

    await Effect.runPromise(Deferred.await(started))
    await close()

    expect(await Effect.runPromise(Deferred.await(interrupted))).toBeUndefined()
    expect(Exit.isFailure(await pendingResolution)).toBe(true)
  })

  it.effect("releases an acquired scope when startup is interrupted", () =>
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>()
      const released = yield* Deferred.make<void>()
      const continueStartup = yield* Deferred.make<void>()
      const startupLayer = Layer.merge(
        clientLayer,
        Layer.effectDiscard(
          Effect.acquireRelease(Effect.void, () => Deferred.succeed(released, undefined)).pipe(
            Effect.andThen(Deferred.succeed(started, undefined)),
            Effect.andThen(Deferred.await(continueStartup))
          )
        )
      )
      const acquisition = yield* buildScopedClientBundle(startupLayer).pipe(
        Effect.forkChild({ startImmediately: true })
      )

      yield* Deferred.await(started)
      yield* Fiber.interrupt(acquisition)

      expect(yield* Deferred.isDone(released)).toBe(true)
    })
  )
})
